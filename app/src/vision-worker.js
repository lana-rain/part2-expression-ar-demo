import { FaceLandmarker, HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

// Main -> worker: INIT { id, wasmRoot, modelAssetPath, handModelAssetPath }, DETECT { id, bitmap,
// mode: 'IMAGE' | 'VIDEO', timestampMs }. Every request receives READY, RESULT,
// or ERROR with the same id. DETECT transfers ownership of its ImageBitmap.
let landmarker = null;
let handLandmarker = null;
let runningMode = 'IMAGE';
let lastVideoTimestamp = -1;
let lastHandAttemptAt = -Infinity;
let lastHandResult = null;
let lastHandTimestampMs = null;
let warnedHandFailure = false;
let work = Promise.resolve();

function warnAndDisableHand(error) {
  handLandmarker = null;
  lastHandResult = null;
  lastHandTimestampMs = null;
  if (!warnedHandFailure) {
    warnedHandFailure = true;
    console.warn('Hand recognition unavailable; face recognition continues:', error);
  }
}

async function initializeHand(vision, modelAssetPath) {
  try {
    const response = await fetch(modelAssetPath);
    if (!response.ok) throw new Error(`Hand model request failed: HTTP ${response.status}`);
    const modelAssetBuffer = new Uint8Array(await response.arrayBuffer());
    // tasks-vision clears self.ModuleFactory after creating each task. Module
    // Workers load the WASM factory via dynamic import(), which caches the
    // face task's loader URL; a distinct URL reruns it for this second task.
    const handLoaderUrl = new URL(vision.wasmLoaderPath, self.location.href);
    handLoaderUrl.searchParams.set('task', 'hand-landmarker');
    const handVision = { ...vision, wasmLoaderPath: handLoaderUrl.href };
    const candidate = await HandLandmarker.createFromOptions(handVision, {
      baseOptions: { modelAssetBuffer, delegate: 'CPU' },
      runningMode: 'IMAGE',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    // Face inference may already have switched modes while the second model
    // loaded. Publish the hand model only after it matches the active mode.
    let candidateMode = 'IMAGE';
    while (candidateMode !== runningMode) {
      candidateMode = runningMode;
      await candidate.setOptions({ runningMode: candidateMode });
    }
    handLandmarker = candidate;
  } catch (error) {
    warnAndDisableHand(error);
  }
}

async function handle({ id, type, ...message }) {
  if (type === 'INIT') {
    if (landmarker) throw new Error('Face Landmarker is already initialized');
    const wasmRoot = message.wasmRoot ?? new URL('../wasm', self.location.href).href;
    const modelAssetPath = message.modelAssetPath ?? new URL('../models/face_landmarker.task', self.location.href).href;
    const response = await fetch(modelAssetPath);
    if (!response.ok) throw new Error(`Model request failed: HTTP ${response.status}`);
    const modelAssetBuffer = new Uint8Array(await response.arrayBuffer());

    // The module WASM loader is required inside a module Worker. The package's
    // ordinary loader is a classic script and cannot be imported here.
    const vision = await FilesetResolver.forVisionTasks(wasmRoot, true);
    landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetBuffer, delegate: 'CPU' },
      runningMode,
      numFaces: 1,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputFaceBlendshapes: true,
    });
    self.postMessage({ id, type: 'READY' });
    // A slow or unavailable hand model must not delay the existing face stream.
    void initializeHand(vision, message.handModelAssetPath
      ?? new URL('../models/hand_landmarker.task', self.location.href).href);
    return;
  }

  if (type !== 'DETECT') throw new Error(`Unknown worker request: ${type}`);
  const { bitmap, mode, timestampMs } = message;
  try {
    if (!landmarker) throw new Error('Face Landmarker is not initialized');
    if (!(bitmap instanceof ImageBitmap)) throw new TypeError('DETECT requires a transferred ImageBitmap');
    if (mode !== 'IMAGE' && mode !== 'VIDEO') throw new TypeError('DETECT mode must be IMAGE or VIDEO');
    if (mode !== runningMode) {
      await landmarker.setOptions({ runningMode: mode });
      runningMode = mode;
      if (mode === 'VIDEO') lastVideoTimestamp = -1;
      lastHandAttemptAt = -Infinity;
      lastHandResult = null;
      lastHandTimestampMs = null;
      if (handLandmarker) {
        try {
          await handLandmarker.setOptions({ runningMode: mode });
        } catch (error) {
          warnAndDisableHand(error);
        }
      }
    }

    const started = performance.now();
    let result;
    let usedTimestampMs = null;
    if (mode === 'IMAGE') {
      result = landmarker.detect(bitmap);
    } else {
      if (!Number.isFinite(timestampMs)) throw new TypeError('VIDEO requires a finite timestampMs');
      usedTimestampMs = Math.max(timestampMs, lastVideoTimestamp + 1);
      result = landmarker.detectForVideo(bitmap, usedTimestampMs);
      lastVideoTimestamp = usedTimestampMs;
    }
    const sourceTimestampMs = Number.isFinite(timestampMs) ? timestampMs : performance.now();
    let handRanThisFrame = false;
    if (handLandmarker && (sourceTimestampMs - lastHandAttemptAt >= 200
      || sourceTimestampMs < lastHandAttemptAt)) {
      lastHandAttemptAt = sourceTimestampMs;
      try {
        const detected = mode === 'IMAGE'
          ? handLandmarker.detect(bitmap)
          : handLandmarker.detectForVideo(bitmap, usedTimestampMs);
        lastHandResult = { landmarks: detected.landmarks ?? [] };
        lastHandTimestampMs = sourceTimestampMs;
        handRanThisFrame = true;
      } catch (error) {
        warnAndDisableHand(error);
      }
    }
    // Cached video landmarks bridge the skipped hand frames, but never survive
    // long enough to describe a new gesture or a different validation image.
    const handIsFresh = mode === 'VIDEO' && lastHandTimestampMs != null
      && sourceTimestampMs >= lastHandTimestampMs
      && sourceTimestampMs - lastHandTimestampMs <= 250;
    const handResult = handRanThisFrame || handIsFresh
      ? lastHandResult : null;
    self.postMessage({
      id,
      type: 'RESULT',
      mode,
      result,
      handResult,
      handTimestampMs: handResult ? lastHandTimestampMs : null,
      inferenceMs: performance.now() - started,
      timestampMs: usedTimestampMs,
      width: bitmap.width,
      height: bitmap.height,
    });
  } finally {
    bitmap?.close?.();
  }
}

// Serialize all messages so a mode switch cannot race with a pending frame.
self.onmessage = ({ data }) => {
  work = work.then(() => handle(data)).catch((error) => {
    self.postMessage({ id: data?.id, type: 'ERROR', error: error?.message ?? String(error) });
  });
};
