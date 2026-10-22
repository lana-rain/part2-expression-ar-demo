import { handCoversMouth } from './hand-mouth.js';

export const DEFAULT_THRESHOLDS = Object.freeze({
  smileEnter: 0.29,
  smileExit: 0.18,
  smileStrongSide: 0.34,
  smileWeakSide: 0.12,
  jawOpen: 0.18,
  jawClosed: 0.1,
  mouthGapOpen: 0.19,
  mouthGapRise: 0.12,
  // An open-mouth laugh must also carry joy in both eyes; mouth motion alone
  // can be speech or surprise.
  laughSmileEnter: 0.13,
  laughSmileStrongSide: 0.18,
  laughSmileWeakSide: 0.06,
  laughCheekMinSmile: 0.08,
  laughCheekSmileSide: 0.12,
  laughCheekEnter: 0.25,
  laughCheekWeakSide: 0.14,
  laughJawOpen: 0.12,
  laughMouthGapOpen: 0.13,
  laughMouthGapRise: 0.08,
  // Static validation: smile.jpg has eyeSquint .411/.372 while laugh.jpg
  // reaches .508/.430. Keep the laugh eye gate above an ordinary smile.
  laughEyeEnter: 0.44,
  laughEyeWeakSide: 0.4,
  laughEyeRise: 0.15,
  laughEyeRiseFloor: 0.31,
  laughEyeRiseWeakSide: 0.24,
  smileEyeAssistedEnter: 0.15,
  smileEyeAssistedWeakSide: 0.06,
  smileEyeAssistedEyeEnter: 0.32,
  smileEyeAssistedEyeWeakSide: 0.22,
  smileHoldMs: 250,
  smileReleaseMs: 380,
  laughHoldMs: 300,
  laughPositiveFrames: 3,
  laughWindowFrames: 5,
  laughDropoutMs: 240,
  // A hand and narrowed eyes are not laughter. Require bilateral cheek lift;
  // visible upward mouth-corner activation can support a milder eye smile,
  // while fully hidden corners need a stronger bilateral eye cue.
  coveredCheekEnter: 0.34,
  coveredCheekWeakSide: 0.22,
  coveredEyeEnter: 0.28,
  coveredEyeWeakSide: 0.2,
  coveredSmileEnter: 0.12,
  coveredSmileStrongSide: 0.15,
  coveredSmileWeakSide: 0.04,
  coveredStrongEyeEnter: 0.4,
  coveredStrongEyeWeakSide: 0.34,
  coveredLaughHoldMs: 450,
  coveredLaughPositiveFrames: 3,
  coveredLaughWindowFrames: 6,
  coveredLaughDropoutMs: 320,
  coveredHandMaxAgeMs: 280,
  cooldownMs: 2200,
  faceLostMs: 900,
  maxValidFrameGapMs: 650,
});

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// Current face evidence takes precedence over the recognizer's pulse label.
// Legacy synthetic snapshots in tests can still use state + rainIntensity.
export function hasCurrentSmile(snapshot) {
  if (!snapshot || snapshot.hasFace === false) return false;
  if (typeof snapshot.smileActive === 'boolean') return snapshot.smileActive;
  return (snapshot.state === 'smile' || snapshot.state === 'cooldown')
    && snapshot.rainIntensity > 0.25;
}

// The opening between inner lips 13/14 is normalized by mouth width 61/291.
// Pixel aspect matters because landmarks are separately normalized on x and y.
function mouthGapFromLandmarks(points, sourceWidth, sourceHeight) {
  if (!points?.[13] || !points?.[14] || !points?.[61] || !points?.[291]
    || !(sourceWidth > 0) || !(sourceHeight > 0)) return null;
  const upper = points[13];
  const lower = points[14];
  const left = points[61];
  const right = points[291];
  if (![upper.x, upper.y, lower.x, lower.y, left.x, left.y, right.x, right.y]
    .every(Number.isFinite)) return null;
  const width = Math.hypot((right.x - left.x) * sourceWidth, (right.y - left.y) * sourceHeight);
  if (!Number.isFinite(width) || width < 2) return null;
  return clamp(Math.hypot((lower.x - upper.x) * sourceWidth,
    (lower.y - upper.y) * sourceHeight) / width, 0, 2);
}

export function signalsFromResult(result, sourceWidth, sourceHeight, handResult = null, handTimestampMs = null) {
  const categories = result?.faceBlendshapes?.[0]?.categories ?? [];
  const scores = new Map(categories.map(({ categoryName, score }) => [categoryName, score]));
  const handEvidenceAt = handResult && Number.isFinite(handTimestampMs) ? handTimestampMs : null;
  return {
    smileLeft: scores.get('mouthSmileLeft') ?? 0,
    smileRight: scores.get('mouthSmileRight') ?? 0,
    jawOpen: scores.get('jawOpen') ?? 0,
    cheekLeft: scores.get('cheekSquintLeft') ?? 0,
    cheekRight: scores.get('cheekSquintRight') ?? 0,
    eyeSquintLeft: scores.get('eyeSquintLeft') ?? 0,
    eyeSquintRight: scores.get('eyeSquintRight') ?? 0,
    eyeBlinkLeft: scores.get('eyeBlinkLeft') ?? 0,
    eyeBlinkRight: scores.get('eyeBlinkRight') ?? 0,
    browDownLeft: scores.get('browDownLeft') ?? 0,
    browDownRight: scores.get('browDownRight') ?? 0,
    browInnerUp: scores.get('browInnerUp') ?? 0,
    browOuterUpLeft: scores.get('browOuterUpLeft') ?? 0,
    browOuterUpRight: scores.get('browOuterUpRight') ?? 0,
    mouthGap: mouthGapFromLandmarks(result?.faceLandmarks?.[0], sourceWidth, sourceHeight),
    mouthCovered: handCoversMouth(result?.faceLandmarks?.[0], handResult?.landmarks,
      sourceWidth, sourceHeight),
    handEvidenceAt,
  };
}

export class ExpressionController {
  constructor(thresholds = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
    this.reset();
  }

  reset() {
    this.smoothed = { smileLeft: 0, smileRight: 0, jawOpen: 0, cheekLeft: 0, cheekRight: 0, mouthGap: 0 };
    this.state = 'neutral';
    this.lastAt = null;
    this.lastFaceAt = null;
    this.lastValidAt = null;
    this.smileSince = null;
    this.smileFrames = 0;
    this.smileReleaseSince = null;
    this.smileLatched = false;
    this.smileActive = false;
    this.laughFrames = [];
    this.laughSince = null;
    this.lastLaughPositiveAt = null;
    this.laughConfirmed = false;
    this.coveredLaughCandidate = false;
    this.coveredLaughConfirmed = false;
    this.coveredLaughSince = null;
    this.lastCoveredPositiveAt = null;
    this.lastCoveredHandAt = null;
    this.coveredFrames = [];
    this.cooldownUntil = 0;
    this.fireworkUntil = 0;
    this.armed = true;
    this.hasFace = false;
    this.neutralMouthGap = null;
    this.neutralEyeNarrow = null;
  }

  update(raw, at, faceDetected = true) {
    const t = this.thresholds;
    this.lastAt = at;
    this.hasFace = this.lastFaceAt != null && at - this.lastFaceAt <= t.faceLostMs;
    if (!faceDetected) {
      this.coveredLaughCandidate = false;
      this.coveredLaughConfirmed = false;
      this.coveredLaughSince = null;
      this.lastCoveredPositiveAt = null;
      this.lastCoveredHandAt = null;
      this.coveredFrames = [];
      if (this.hasFace) return this.snapshot(false, 0);
      this.state = 'lost';
      this.smoothed = { smileLeft: 0, smileRight: 0, jawOpen: 0, cheekLeft: 0, cheekRight: 0, mouthGap: 0 };
      this.smileSince = null;
      this.smileFrames = 0;
      this.smileReleaseSince = null;
      this.smileLatched = false;
      this.smileActive = false;
      this.laughFrames = [];
      this.laughSince = null;
      this.lastLaughPositiveAt = null;
      this.laughConfirmed = false;
      this.lastValidAt = null;
      this.neutralMouthGap = null;
      this.neutralEyeNarrow = null;
      this.fireworkUntil = 0;
      return this.snapshot(false, 0);
    }

    const gap = this.lastValidAt == null ? 16 : at - this.lastValidAt;
    // A single surviving frame must not finish a dwell timer after an inference
    // stall. Short delays keep their progress and never count as new evidence.
    if (gap > t.maxValidFrameGapMs || gap < 0) {
      this.smileSince = null;
      this.smileFrames = 0;
      this.laughFrames = [];
      this.laughSince = null;
      this.lastLaughPositiveAt = null;
      this.laughConfirmed = false;
      this.coveredLaughCandidate = false;
      this.coveredLaughConfirmed = false;
      this.coveredLaughSince = null;
      this.lastCoveredPositiveAt = null;
      this.lastCoveredHandAt = null;
      this.coveredFrames = [];
      if (gap > t.faceLostMs) {
        this.smileLatched = false;
        this.smileReleaseSince = null;
        this.fireworkUntil = 0;
        this.neutralEyeNarrow = null;
      }
    }
    const dt = clamp(gap, 1, 200);
    this.lastValidAt = at;
    this.lastFaceAt = at;
    this.hasFace = true;
    const alpha = 1 - Math.exp(-dt / 105);
    for (const key of Object.keys(this.smoothed)) {
      const value = Number.isFinite(raw?.[key]) ? raw[key] : key === 'mouthGap' ? this.smoothed[key] : 0;
      this.smoothed[key] += (value - this.smoothed[key]) * alpha;
    }

    const left = this.smoothed.smileLeft;
    const right = this.smoothed.smileRight;
    const smile = (left + right) / 2;
    const eyeLeft = clamp(Number.isFinite(raw?.eyeSquintLeft) ? raw.eyeSquintLeft : 0, 0, 1);
    const eyeRight = clamp(Number.isFinite(raw?.eyeSquintRight) ? raw.eyeSquintRight : 0, 0, 1);
    // When laughing eyes nearly close, Face Landmarker may call that a blink.
    // The weaker blink contribution still requires a held, bilateral eye cue.
    const eyeNarrowLeft = Math.max(eyeLeft,
      clamp(Number.isFinite(raw?.eyeBlinkLeft) ? raw.eyeBlinkLeft : 0, 0, 1) * 0.58);
    const eyeNarrowRight = Math.max(eyeRight,
      clamp(Number.isFinite(raw?.eyeBlinkRight) ? raw.eyeBlinkRight : 0, 0, 1) * 0.58);
    const eyeNarrowAvg = (eyeNarrowLeft + eyeNarrowRight) / 2;
    // Fit each host's resting eye aperture only on clearly neutral frames.
    // A smile-to-laugh rise is more portable than a fixed score across faces;
    // the absolute branch still works when a stream starts mid-laugh.
    if (smile < 0.09 && this.smoothed.jawOpen < 0.08
      && (!Number.isFinite(raw?.mouthGap) || raw.mouthGap < 0.1)
      && raw?.mouthCovered !== true
      && (raw?.eyeBlinkLeft ?? 0) < 0.18 && (raw?.eyeBlinkRight ?? 0) < 0.18) {
      if (this.neutralEyeNarrow == null) {
        this.neutralEyeNarrow = { left: eyeNarrowLeft, right: eyeNarrowRight };
      } else {
        this.neutralEyeNarrow.left += (eyeNarrowLeft - this.neutralEyeNarrow.left) * 0.05;
        this.neutralEyeNarrow.right += (eyeNarrowRight - this.neutralEyeNarrow.right) * 0.05;
      }
    }
    const absoluteEyeJoy = eyeNarrowAvg >= t.laughEyeEnter
      && Math.min(eyeNarrowLeft, eyeNarrowRight) >= t.laughEyeWeakSide;
    const relativeEyeJoy = this.neutralEyeNarrow != null
      && eyeNarrowAvg >= t.laughEyeRiseFloor
      && Math.min(eyeNarrowLeft, eyeNarrowRight) >= t.laughEyeRiseWeakSide
      && eyeNarrowLeft - this.neutralEyeNarrow.left >= t.laughEyeRise
      && eyeNarrowRight - this.neutralEyeNarrow.right >= t.laughEyeRise;
    const bilateralEyeJoy = absoluteEyeJoy || relativeEyeJoy;
    const visibleSmile = smile >= t.smileEnter
      && Math.max(left, right) >= t.smileStrongSide
      && Math.min(left, right) >= t.smileWeakSide;
    // Narrowed eyes with a slight closed-mouth smile are still a smile: rain,
    // never fireworks. This also avoids calling the same face neutral just
    // because its mouthSmile blendshapes are gentler than the default gate.
    const eyeAssistedSmile = eyeNarrowAvg >= t.smileEyeAssistedEyeEnter
      && Math.min(eyeNarrowLeft, eyeNarrowRight) >= t.smileEyeAssistedEyeWeakSide
      && smile >= t.smileEyeAssistedEnter
      && Math.min(left, right) >= t.smileEyeAssistedWeakSide
      && this.smoothed.jawOpen < t.jawClosed
      && (!Number.isFinite(raw?.mouthGap) || raw.mouthGap < t.laughMouthGapOpen);
    const smileCandidate = visibleSmile || eyeAssistedSmile;
    if (smileCandidate) {
      if (this.smileSince == null) {
        this.smileSince = at;
        this.smileFrames = 1;
      } else {
        this.smileFrames++;
      }
      this.smileReleaseSince = null;
      if (this.smileFrames >= 2 && at - this.smileSince >= t.smileHoldMs) {
        this.smileLatched = true;
      }
    } else {
      this.smileSince = null;
      this.smileFrames = 0;
      if (smile < t.smileExit) this.smileReleaseSince ??= at;
      else this.smileReleaseSince = null;
      if (this.smileReleaseSince != null && at - this.smileReleaseSince >= t.smileReleaseMs) {
        this.smileLatched = false;
      }
    }

    if (!this.smileLatched && !smileCandidate && this.smoothed.jawOpen < t.jawClosed
      && Number.isFinite(raw?.mouthGap) && raw.mouthGap < t.mouthGapOpen) {
      this.neutralMouthGap = this.neutralMouthGap == null
        ? this.smoothed.mouthGap
        : this.neutralMouthGap * 0.95 + this.smoothed.mouthGap * 0.05;
    }
    const mouthGapThreshold = Math.max(t.mouthGapOpen,
      (this.neutralMouthGap ?? 0) + t.mouthGapRise);
    const hasGeometry = Number.isFinite(raw?.mouthGap);
    // Use evidence from this frame: a smile remembered from before the mouth
    // opened must not turn a later surprised expression into a laugh. Cheek
    // activation can support a subtler open-mouth smile when mouthSmile scores
    // dip as the jaw opens, but an open mouth alone never suffices.
    const rawLeft = clamp(Number.isFinite(raw?.smileLeft) ? raw.smileLeft : 0, 0, 1);
    const rawRight = clamp(Number.isFinite(raw?.smileRight) ? raw.smileRight : 0, 0, 1);
    const rawSmile = (rawLeft + rawRight) / 2;
    const directSmile = rawSmile >= t.laughSmileEnter
      && Math.max(rawLeft, rawRight) >= t.laughSmileStrongSide
      && Math.min(rawLeft, rawRight) >= t.laughSmileWeakSide;
    const rawCheekLeft = clamp(Number.isFinite(raw?.cheekLeft) ? raw.cheekLeft : 0, 0, 1);
    const rawCheekRight = clamp(Number.isFinite(raw?.cheekRight) ? raw.cheekRight : 0, 0, 1);
    const cheekSmile = rawSmile >= t.laughCheekMinSmile
      && Math.max(rawLeft, rawRight) >= t.laughCheekSmileSide
      && (rawCheekLeft + rawCheekRight) / 2 >= t.laughCheekEnter
      && Math.min(rawCheekLeft, rawCheekRight) >= t.laughCheekWeakSide;
    const currentSmile = directSmile || cheekSmile;
    const laughGapThreshold = Math.max(t.laughMouthGapOpen,
      (this.neutralMouthGap ?? 0) + t.laughMouthGapRise);
    const mouthOpen = this.smoothed.jawOpen >= t.jawOpen
      || (hasGeometry && this.smoothed.mouthGap >= mouthGapThreshold)
      || (currentSmile && (this.smoothed.jawOpen >= t.laughJawOpen
        || (hasGeometry && this.smoothed.mouthGap >= laughGapThreshold)));
    // A still-high smoothed jaw alone is not evidence that the lips remain
    // apart on this frame; closing the mouth should cancel the candidate now.
    const currentOpening = (Number.isFinite(raw?.jawOpen)
      && raw.jawOpen >= t.laughJawOpen - 0.02)
      || (hasGeometry && raw.mouthGap >= laughGapThreshold - 0.02);
    // Mouth landmarks/blendshapes are unreliable behind a hand. A covered
    // frame must use the stricter cheek-and-eye path below, even if the model
    // hallucinates an open smiling mouth through the occlusion.
    const laughCandidate = raw?.mouthCovered !== true
      && mouthOpen && currentOpening && currentSmile && bilateralEyeJoy;
    this.laughFrames.push({ at, positive: laughCandidate });
    this.laughFrames = this.laughFrames.slice(-t.laughWindowFrames);
    // The short window checks stability; it must not be the dwell clock. At
    // 60 fps five frames cover only about 67 ms, regardless of how long the
    // person has held the expression.
    if (laughCandidate) {
      this.laughSince ??= at;
      this.lastLaughPositiveAt = at;
    } else if (this.lastLaughPositiveAt == null
      || at - this.lastLaughPositiveAt > t.laughDropoutMs) {
      this.laughSince = null;
    }
    const positiveFrames = this.laughFrames.filter((frame) => frame.positive);
    const openLaughConfirmed = laughCandidate && positiveFrames.length >= t.laughPositiveFrames
      && this.laughSince != null && at - this.laughSince >= t.laughHoldMs;

    // Occluded lips cannot prove an open-mouth laugh. Mouth coverage must be
    // accompanied by raised apples of both cheeks, plus smiling eyes. A hand
    // pressing the mouth can also narrow the eyes, so eyes alone never count.
    const cheekLift = (rawCheekLeft + rawCheekRight) / 2 >= t.coveredCheekEnter
      && Math.min(rawCheekLeft, rawCheekRight) >= t.coveredCheekWeakSide;
    // Unlike an open-mouth laugh, covered-mouth evidence must come from eye
    // squint itself: a blink/closed eyes plus a hand can mimic laughter.
    const coveredEyeSquint = (eyeLeft + eyeRight) / 2;
    const smilingEyes = coveredEyeSquint >= t.coveredEyeEnter
      && Math.min(eyeLeft, eyeRight) >= t.coveredEyeWeakSide;
    const smileCurve = rawSmile >= t.coveredSmileEnter
      && Math.max(rawLeft, rawRight) >= t.coveredSmileStrongSide
      && Math.min(rawLeft, rawRight) >= t.coveredSmileWeakSide;
    const strongSmilingEyes = coveredEyeSquint >= t.coveredStrongEyeEnter
      && Math.min(eyeLeft, eyeRight) >= t.coveredStrongEyeWeakSide;
    const handAt = raw?.handEvidenceAt;
    const currentHand = Number.isFinite(handAt) && handAt <= at
      && at - handAt <= t.coveredHandMaxAgeMs
      && (this.lastCoveredHandAt == null || handAt >= this.lastCoveredHandAt);
    this.coveredLaughCandidate = raw?.mouthCovered === true && currentHand
      && cheekLift && smilingEyes && (smileCurve || strongSmilingEyes);
    const newHandFrame = currentHand && (this.lastCoveredHandAt == null || handAt > this.lastCoveredHandAt);
    if (newHandFrame) {
      if (this.coveredLaughCandidate && (this.lastCoveredPositiveAt == null
        || handAt - this.lastCoveredPositiveAt > t.coveredLaughDropoutMs)) {
        this.coveredFrames = [];
        this.coveredLaughSince = handAt;
      }
      this.lastCoveredHandAt = handAt;
      this.coveredFrames.push({ at: handAt, positive: this.coveredLaughCandidate });
      this.coveredFrames = this.coveredFrames.slice(-t.coveredLaughWindowFrames);
      if (this.coveredLaughCandidate) {
        this.lastCoveredPositiveAt = handAt;
      }
    }
    if (this.lastCoveredPositiveAt == null
      || at - this.lastCoveredPositiveAt > t.coveredLaughDropoutMs) {
      this.coveredLaughSince = null;
      this.coveredFrames = [];
    }
    const coveredPositiveFrames = this.coveredFrames.filter((frame) => frame.positive);
    this.coveredLaughConfirmed = this.coveredLaughCandidate
      && this.coveredLaughSince != null
      && coveredPositiveFrames.length >= t.coveredLaughPositiveFrames
      && handAt - this.coveredLaughSince >= t.coveredLaughHoldMs;
    this.laughConfirmed = openLaughConfirmed || this.coveredLaughConfirmed;
    // Current smile evidence is separate from the recognizer's short-lived
    // firework/cooldown labels. Closing an open-mouth laugh back into a smile
    // can therefore switch scenes without waiting for those labels to expire.
    this.smileActive = smileCandidate && !this.laughConfirmed
      && this.smoothed.jawOpen < t.jawClosed
      && (!hasGeometry || this.smoothed.mouthGap < t.laughMouthGapOpen);

    // The pulse is debounced for this recognizer's own consumers. It can arm
    // again while the expression is held; the effect gate below owns the
    // actual scene end and post-scene cooldown.
    if (!this.armed && at >= this.cooldownUntil) this.armed = true;

    let firework = false;
    if (this.armed && at >= this.cooldownUntil && this.laughConfirmed) {
      firework = true;
      this.armed = false;
      this.cooldownUntil = at + t.cooldownMs;
      this.fireworkUntil = at + 1150;
    }

    if (at < this.fireworkUntil) this.state = 'firework';
    else if (!this.armed && at < this.cooldownUntil) this.state = 'cooldown';
    else if (this.laughConfirmed) this.state = 'laugh';
    else if (this.smileLatched) this.state = 'smile';
    else this.state = 'neutral';

    let rainIntensity = 0;
    if (this.state === 'firework' || this.state === 'laugh') {
      rainIntensity = 0.12;
    } else if (this.smileLatched && (this.state === 'smile' || this.state === 'cooldown')) {
      rainIntensity = mouthOpen && this.state === 'cooldown'
        ? 0.12
        : clamp(0.34 + (smile - t.smileEnter) * 1.45, 0.32, 0.95);
    }
    return this.snapshot(firework, rainIntensity);
  }

  snapshot(firework, rainIntensity) {
    const positive = this.laughFrames.filter((frame) => frame.positive);
    const elapsed = this.laughSince == null ? 0 : (this.lastValidAt ?? 0) - this.laughSince;
    const coveredPositive = this.coveredFrames.filter((frame) => frame.positive);
    const coveredElapsed = this.coveredLaughSince == null || this.lastCoveredHandAt == null
      ? 0 : this.lastCoveredHandAt - this.coveredLaughSince;
    return {
      state: this.state,
      firework,
      rainIntensity,
      smileActive: this.hasFace && this.smileActive,
      armed: this.armed,
      hasFace: this.hasFace,
      laughConfirmed: this.hasFace && this.laughConfirmed,
      coveredLaughCandidate: this.hasFace && this.coveredLaughCandidate,
      coveredLaughConfirmed: this.hasFace && this.coveredLaughConfirmed,
      laughProgress: clamp(Math.max(
        Math.min(positive.length / this.thresholds.laughPositiveFrames,
          elapsed / this.thresholds.laughHoldMs),
        this.coveredLaughCandidate ? Math.min(
          coveredPositive.length / this.thresholds.coveredLaughPositiveFrames,
          coveredElapsed / this.thresholds.coveredLaughHoldMs) : 0,
      ), 0, 1),
      smile: (this.smoothed.smileLeft + this.smoothed.smileRight) / 2,
      smileLeft: this.smoothed.smileLeft,
      smileRight: this.smoothed.smileRight,
      jawOpen: this.smoothed.jawOpen,
      mouthGap: clamp(this.smoothed.mouthGap, 0, 1),
    };
  }
}

// The recognizer keeps measuring the face, but a live room presents just one
// authored effect at a time. An expression sustains its effect; only a stable
// expression change, face loss, or stale recognition starts the outro.
export class ExpressionEffectGate {
  constructor({ cooldownMs = 2000, rainDecisionMs = 450,
    maxEvidenceGapMs = 650, coveredRainDeferralMs = 700,
    releaseMs = 900, neutralHoldMs = 500, switchHoldMs = 180,
    staleFrameMs = 950 } = {}) {
    this.cooldownMs = cooldownMs;
    this.rainDecisionMs = rainDecisionMs;
    this.maxEvidenceGapMs = maxEvidenceGapMs;
    this.coveredRainDeferralMs = coveredRainDeferralMs;
    this.releaseMs = releaseMs;
    this.neutralHoldMs = neutralHoldMs;
    this.switchHoldMs = switchHoldMs;
    this.staleFrameMs = staleFrameMs;
    this.reset();
  }

  reset() {
    this.phase = 'ready';
    this.effect = null;
    this.startedAt = -Infinity;
    this.endsAt = -Infinity;
    this.cooldownUntil = -Infinity;
    this.smileCandidateSince = null;
    this.lastSmileEvidenceAt = null;
    this.coveredDecisionSince = null;
    this.lastFreshAt = null;
    this.mismatchSince = null;
    this.mismatchKind = null;
  }

  begin(effect, startedAt) {
    if (this.phase !== 'ready') return false;
    if (!['rain', 'firework'].includes(effect) || !Number.isFinite(startedAt)) {
      throw new RangeError('Effect gate requires a named effect and start time');
    }
    this.effect = effect;
    this.startedAt = startedAt;
    this.endsAt = Infinity;
    this.cooldownUntil = Infinity;
    this.smileCandidateSince = null;
    this.lastSmileEvidenceAt = null;
    this.coveredDecisionSince = null;
    this.lastFreshAt = startedAt;
    this.mismatchSince = null;
    this.mismatchKind = null;
    this.phase = 'playing';
    return true;
  }

  release(now, switching = false) {
    if (this.phase !== 'playing') return false;
    this.phase = 'releasing';
    this.endsAt = now + this.releaseMs;
    this.cooldownUntil = this.endsAt + (switching ? 0 : this.cooldownMs);
    this.mismatchSince = null;
    this.mismatchKind = null;
    return true;
  }

  update(snapshot, now, freshFrame = false) {
    if (!this.effect) return this.status(now);
    if (this.phase === 'playing') {
      if (!freshFrame) {
        // A frozen camera frame cannot keep rain or fireworks alive forever.
        if (this.lastFreshAt != null && now - this.lastFreshAt > this.staleFrameMs) {
          this.release(now);
        }
      } else {
        this.lastFreshAt = now;
        if (snapshot?.hasFace !== true) {
          this.release(now);
        } else {
          const laughing = snapshot.laughConfirmed === true;
          // The recognizer briefly labels a newly closed laugh as "cooldown"
          // even when its current face evidence already supports a smile.
          // The visible scene follows that evidence, not the old pulse latch.
          const smiling = hasCurrentSmile(snapshot);
          const supportsCurrent = this.effect === 'rain' ? smiling && !laughing : laughing;
          if (supportsCurrent) {
            this.mismatchSince = null;
            this.mismatchKind = null;
          } else {
            const opposite = this.effect === 'rain' ? laughing : smiling;
            const kind = opposite ? 'switch' : 'neutral';
            if (this.mismatchKind !== kind || this.mismatchSince == null) {
              this.mismatchSince = now;
              this.mismatchKind = kind;
            }
            if (now - this.mismatchSince >= (opposite ? this.switchHoldMs : this.neutralHoldMs)) {
              this.release(now, opposite);
            }
          }
        }
      }
    }
    if (this.phase === 'releasing' && now >= this.endsAt) {
      this.phase = now < this.cooldownUntil ? 'cooldown' : 'ready';
    } else if (this.phase === 'cooldown' && now >= this.cooldownUntil) {
      this.phase = 'ready';
    }
    if (this.phase === 'ready') {
      // The next cue may use the current expression without a neutral pose,
      // but decide() still requires a new recognized face frame.
      this.effect = null;
      this.smileCandidateSince = null;
      this.lastSmileEvidenceAt = null;
      this.coveredDecisionSince = null;
    }
    return this.status(now);
  }

  decide(snapshot, now, freshFrame = false) {
    const status = this.update(snapshot, now, freshFrame);
    if (status.blocked || !freshFrame || snapshot?.hasFace !== true) {
      if (status.blocked || snapshot?.hasFace !== true) {
        this.smileCandidateSince = null;
        this.lastSmileEvidenceAt = null;
        this.coveredDecisionSince = null;
      }
      return { ...status, trigger: null };
    }
    // A laugh normally passes through a smile first. Give the recognizer a
    // short decision window so a new laugh reaches its firework confirmation
    // before the smile cue claims the room.
    if (snapshot.firework === true || snapshot.laughConfirmed === true) {
      this.smileCandidateSince = null;
      this.lastSmileEvidenceAt = null;
      this.coveredDecisionSince = null;
      return { ...status, trigger: 'firework' };
    }
    if (snapshot.coveredLaughCandidate === true) {
      this.coveredDecisionSince ??= now;
    } else {
      this.coveredDecisionSince = null;
    }
    if (!hasCurrentSmile(snapshot)) {
      this.smileCandidateSince = null;
      this.lastSmileEvidenceAt = null;
      return { ...status, trigger: null };
    }
    if (this.smileCandidateSince == null || this.lastSmileEvidenceAt == null
      || now < this.lastSmileEvidenceAt
      || now - this.lastSmileEvidenceAt > this.maxEvidenceGapMs) {
      this.smileCandidateSince = now;
    }
    this.lastSmileEvidenceAt = now;
    if (now - this.smileCandidateSince >= this.rainDecisionMs) {
      // A hand moving over a laughing mouth may hide the opening before the
      // slower hand recognizer confirms it. Give that cue a bounded head start.
      if (this.coveredDecisionSince != null
        && now - this.coveredDecisionSince < this.coveredRainDeferralMs) {
        return { ...status, trigger: null };
      }
      this.smileCandidateSince = null;
      this.lastSmileEvidenceAt = null;
      this.coveredDecisionSince = null;
      return { ...status, trigger: 'rain' };
    }
    return { ...status, trigger: null };
  }

  status(now) {
    return {
      phase: this.phase,
      blocked: this.phase !== 'ready',
      effect: this.effect,
      cooldownRemainingMs: this.phase === 'cooldown'
        ? Math.max(0, this.cooldownUntil - now) : 0,
      releaseRemainingMs: this.phase === 'releasing'
        ? Math.max(0, this.endsAt - now) : 0,
    };
  }
}
