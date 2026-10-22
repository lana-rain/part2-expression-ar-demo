// Optional client for face and hand landmarks off the UI thread.
// `await client.ready` once; `detectImage(source)` returns a result packet;
// `detectVideo(source, timestampMs)` drops a frame (returns null) if busy.
// Sources may be an <img>, <video>, canvas, or ImageBitmap. createImageBitmap
// copies a frame before transfer; the worker closes its copy after inference.
import { publicAssetUrl } from './asset-url.js';

export class WorkerFaceVision {
  constructor({ wasmRoot = publicAssetUrl('wasm'), modelAssetPath = publicAssetUrl('models/face_landmarker.task'),
    handModelAssetPath = publicAssetUrl('models/hand_landmarker.task') } = {}) {
    this.worker = new Worker(new URL('./vision-worker.js', import.meta.url), { type: 'module' });
    this.pending = new Map();
    this.nextId = 1;
    this.videoBusy = false;
    this.disposed = false;

    this.worker.onmessage = ({ data }) => {
      const pending = this.pending.get(data?.id);
      if (!pending) return;
      this.pending.delete(data.id);
      if (data.type === 'ERROR') pending.reject(new Error(data.error ?? 'Worker inference failed'));
      else pending.resolve(data);
    };
    this.worker.onerror = (event) => {
      this.#rejectAll(new Error(event.message || 'Face vision Worker failed'));
    };
    this.ready = this.#request('INIT', { wasmRoot, modelAssetPath, handModelAssetPath });
  }

  #request(type, payload = {}, transfer = []) {
    if (this.disposed) return Promise.reject(new Error('Face vision Worker is closed'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.worker.postMessage({ id, type, ...payload }, transfer);
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  async detectImage(source, timestampMs = performance.now()) {
    await this.ready;
    const bitmap = await createImageBitmap(source);
    try {
      return await this.#request('DETECT', { mode: 'IMAGE', timestampMs, bitmap }, [bitmap]);
    } catch (error) {
      bitmap.close();
      throw error;
    }
  }

  async detectVideo(source, timestampMs = performance.now()) {
    if (this.videoBusy) return null;
    this.videoBusy = true;
    try {
      await this.ready;
      const bitmap = await createImageBitmap(source);
      try {
        return await this.#request('DETECT', { mode: 'VIDEO', timestampMs, bitmap }, [bitmap]);
      } catch (error) {
        bitmap.close();
        throw error;
      }
    } finally {
      this.videoBusy = false;
    }
  }

  #rejectAll(error) {
    for (const { reject } of this.pending.values()) reject(error);
    this.pending.clear();
  }

  close() {
    if (this.disposed) return;
    this.disposed = true;
    this.worker.terminate();
    this.#rejectAll(new Error('Face vision Worker closed'));
  }
}
