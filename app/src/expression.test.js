import test from 'node:test';
import assert from 'node:assert/strict';
import { ExpressionController, ExpressionEffectGate, signalsFromResult } from './expression.js';

const strongLaugh = { smileLeft: 1, smileRight: 1, jawOpen: 1,
  eyeSquintLeft: 0.51, eyeSquintRight: 0.43 };
const joyfulEyes = { eyeSquintLeft: 0.51, eyeSquintRight: 0.43 };
const coveredJoy = { mouthCovered: true, smileLeft: 0, smileRight: 0,
  jawOpen: 0, mouthGap: null, cheekLeft: 0.54, cheekRight: 0.51,
  eyeSquintLeft: 0.45, eyeSquintRight: 0.47 };
const eyeSmile = { smileLeft: 0.21, smileRight: 0.17, jawOpen: 0.02,
  mouthGap: 0.04, cheekLeft: 0.32, cheekRight: 0.3,
  eyeSquintLeft: 0.58, eyeSquintRight: 0.55 };

test('closed-mouth slight smile with narrowed eyes stays a smile and starts rain', () => {
  const controller = new ExpressionController();
  const gate = new ExpressionEffectGate();
  const events = [];
  for (let at = 0; at <= 1200; at += 100) {
    const snapshot = controller.update(eyeSmile, at, true);
    const decision = gate.decide(snapshot, at, true);
    if (decision.trigger) {
      events.push({ at, effect: decision.trigger });
      gate.begin(decision.trigger, at, at + 7000);
    }
    assert.equal(snapshot.firework, false);
    assert.equal(snapshot.laughConfirmed, false);
  }
  assert.deepEqual(events.map(({ effect }) => effect), ['rain']);
});

test('squinted eyes or raised eyebrows without an opening or hand never fire', () => {
  const controller = new ExpressionController();
  for (let at = 0; at <= 1000; at += 100) {
    const snapshot = controller.update({ ...eyeSmile,
      eyeSquintLeft: 0.85, eyeSquintRight: 0.82,
      browOuterUpLeft: 0.8, browOuterUpRight: 0.8,
      cheekLeft: 0.7, cheekRight: 0.68 }, at, true);
    assert.equal(snapshot.firework, false);
    assert.equal(snapshot.laughConfirmed, false);
  }
});

test('open-mouth smiling eyes fire while open-mouth talking does not', () => {
  const controller = new ExpressionController();
  const events = [];
  for (let at = 0; at <= 1000; at += 100) {
    const snapshot = controller.update({ ...eyeSmile, jawOpen: 0.42, mouthGap: 0.3 }, at, true);
    if (snapshot.firework) events.push(at);
  }
  assert.deepEqual(events, [400]);
  const talking = new ExpressionController();
  for (let at = 0; at <= 1000; at += 100) {
    const snapshot = talking.update({ ...eyeSmile, jawOpen: 0.42,
      mouthGap: 0.3, eyeSquintLeft: 0.02, eyeSquintRight: 0.03 }, at, true);
    assert.equal(snapshot.firework, false);
  }
});

test('open mouth with strong eyebrow movement but no smiling eyes is not laughter', () => {
  const controller = new ExpressionController();
  for (let at = 0; at <= 1200; at += 100) {
    const snapshot = controller.update({ ...strongLaugh,
      eyeSquintLeft: 0.03, eyeSquintRight: 0.02,
      browOuterUpLeft: 0.88, browOuterUpRight: 0.85 }, at, true);
    assert.equal(snapshot.firework, false);
    assert.equal(snapshot.laughConfirmed, false);
  }
});

test('a single blink during an open-mouth smile cannot complete laugh dwell', () => {
  const controller = new ExpressionController();
  for (let at = 0; at <= 1200; at += 50) {
    const blink = at >= 400 && at <= 500;
    const snapshot = controller.update({ ...strongLaugh,
      eyeSquintLeft: 0.03, eyeSquintRight: 0.02,
      eyeBlinkLeft: blink ? 0.93 : 0.02,
      eyeBlinkRight: blink ? 0.92 : 0.03 }, at, true);
    assert.equal(snapshot.firework, false);
  }
});

test('measured neutral, smile, squint, and laugh samples keep their intended effect classes', () => {
  const samples = [
    { name: 'neutral', raw: { smileLeft: 0, smileRight: 0, jawOpen: 0.007,
      mouthGap: 0.001, eyeSquintLeft: 0.314, eyeSquintRight: 0.191 }, effect: null },
    { name: 'ordinary smile', raw: { smileLeft: 0.36, smileRight: 0.374,
      jawOpen: 0.002, mouthGap: 0.004,
      eyeSquintLeft: 0.411, eyeSquintRight: 0.372 }, effect: 'rain' },
    { name: 'closed-mouth eye smile', raw: { smileLeft: 0.805, smileRight: 0.805,
      jawOpen: 0.001, mouthGap: 0.002,
      eyeSquintLeft: 0.726, eyeSquintRight: 0.635 }, effect: 'rain' },
    { name: 'unsmiling squint', raw: { smileLeft: 0, smileRight: 0,
      jawOpen: 0.014, mouthGap: 0.001,
      eyeSquintLeft: 0.69, eyeSquintRight: 0.577 }, effect: null },
    { name: 'open-mouth laugh', raw: { smileLeft: 0.841, smileRight: 0.86,
      jawOpen: 0.295, mouthGap: 0.249,
      eyeSquintLeft: 0.508, eyeSquintRight: 0.43 }, effect: 'firework' },
    { name: 'open-mouth eye laugh', raw: { smileLeft: 0.913, smileRight: 0.933,
      jawOpen: 0.328, mouthGap: 0.318,
      eyeSquintLeft: 0.757, eyeSquintRight: 0.718,
      browDownLeft: 0.293, browDownRight: 0.285 }, effect: 'firework' },
    { name: 'speaking', raw: { smileLeft: 0, smileRight: 0,
      jawOpen: 0.456, mouthGap: 0.363,
      eyeSquintLeft: 0.239, eyeSquintRight: 0.124 }, effect: null },
  ];
  for (const { name, raw, effect } of samples) {
    const controller = new ExpressionController();
    const gate = new ExpressionEffectGate();
    const seen = [];
    for (let at = 0; at <= 1100; at += 100) {
      const snapshot = controller.update(raw, at, true);
      const decision = gate.decide(snapshot, at, true);
      if (decision.trigger) {
        seen.push(decision.trigger);
        gate.begin(decision.trigger, at, at + 7000);
      }
    }
    assert.deepEqual(seen, effect ? [effect] : [], name);
  }
});

test('an individual neutral-eye baseline admits laughter below the absolute eye threshold', () => {
  const controller = new ExpressionController();
  for (let at = 0; at <= 700; at += 100) {
    controller.update({ smileLeft: 0, smileRight: 0, jawOpen: 0,
      mouthGap: 0.02, eyeSquintLeft: 0.16, eyeSquintRight: 0.11 }, at, true);
  }
  const events = [];
  for (let at = 800; at <= 1800; at += 100) {
    const snapshot = controller.update({ smileLeft: 0.68, smileRight: 0.65,
      jawOpen: 0.35, mouthGap: 0.25,
      eyeSquintLeft: 0.35, eyeSquintRight: 0.3 }, at, true);
    if (snapshot.firework) events.push(at);
  }
  assert.equal(events.length, 1);
});

test('ordinary smiling eyes do not become laughter merely by opening the mouth', () => {
  const controller = new ExpressionController();
  for (let at = 0; at <= 700; at += 100) {
    controller.update({ smileLeft: 0, smileRight: 0, jawOpen: 0,
      mouthGap: 0.002, eyeSquintLeft: 0.314, eyeSquintRight: 0.191 }, at, true);
  }
  for (let at = 800; at <= 1800; at += 100) {
    const snapshot = controller.update({ smileLeft: 0.36, smileRight: 0.374,
      jawOpen: 0.3, mouthGap: 0.25,
      eyeSquintLeft: 0.411, eyeSquintRight: 0.372 }, at, true);
    assert.equal(snapshot.firework, false);
    assert.equal(snapshot.laughConfirmed, false);
  }
});

test('cheeks alone cannot make a covered mouth a laugh without smiling eyes', () => {
  const controller = new ExpressionController();
  for (let at = 0; at <= 1000; at += 100) {
    const snapshot = controller.update({ ...coveredJoy,
      eyeSquintLeft: 0.02, eyeSquintRight: 0.03,
      cheekLeft: 0.75, cheekRight: 0.72, handEvidenceAt: at }, at, true);
    assert.equal(snapshot.coveredLaughCandidate, false);
    assert.equal(snapshot.firework, false);
  }
});

test('covered-mouth cheeks with an ordinary weak eye squint do not count as laughter', () => {
  const controller = new ExpressionController();
  for (let at = 0; at <= 1200; at += 100) {
    const snapshot = controller.update({ ...coveredJoy,
      eyeSquintLeft: 0.17, eyeSquintRight: 0.13,
      cheekLeft: 0.55, cheekRight: 0.52, handEvidenceAt: at }, at, true);
    assert.equal(snapshot.coveredLaughCandidate, false);
    assert.equal(snapshot.firework, false);
  }
});

test('the old covered image eye scores cannot compensate for cheek scores of zero', () => {
  const controller = new ExpressionController();
  for (let at = 0; at <= 900; at += 150) {
    const snapshot = controller.update({ ...coveredJoy,
      cheekLeft: 0, cheekRight: 0, smileLeft: 0.04, smileRight: 0.03,
      eyeSquintLeft: 0.45, eyeSquintRight: 0.47, handEvidenceAt: at }, at, true);
    assert.equal(snapshot.coveredLaughCandidate, false);
    assert.equal(snapshot.firework, false);
  }
});

test('hallucinated smiling open-mouth scores behind a hand do not bypass the cheek gate', () => {
  const controller = new ExpressionController();
  for (let at = 0; at <= 1200; at += 100) {
    const snapshot = controller.update({ ...strongLaugh,
      mouthCovered: true, handEvidenceAt: at,
      cheekLeft: 0.03, cheekRight: 0.02 }, at, true);
    assert.equal(snapshot.coveredLaughCandidate, false);
    assert.equal(snapshot.laughConfirmed, false);
    assert.equal(snapshot.firework, false);
  }
});

test('closing or blinking both eyes behind a hand is not smiling eye evidence', () => {
  const controller = new ExpressionController();
  for (let at = 0; at <= 1000; at += 100) {
    const snapshot = controller.update({ ...coveredJoy,
      eyeSquintLeft: 0.04, eyeSquintRight: 0.03,
      eyeBlinkLeft: 0.95, eyeBlinkRight: 0.94,
      handEvidenceAt: at }, at, true);
    assert.equal(snapshot.coveredLaughCandidate, false);
    assert.equal(snapshot.firework, false);
  }
});

test('visible upward smile curve can support milder laughing eyes only with both cheeks lifted', () => {
  const controller = new ExpressionController();
  const events = [];
  for (let at = 0; at <= 900; at += 150) {
    const snapshot = controller.update({ ...coveredJoy,
      smileLeft: 0.2, smileRight: 0.16,
      eyeSquintLeft: 0.33, eyeSquintRight: 0.3, handEvidenceAt: at }, at, true);
    if (snapshot.firework) events.push(at);
  }
  assert.deepEqual(events, [450]);
});

test('one lifted cheek or a brief bilateral cheek spike cannot confirm a covered laugh', () => {
  for (const oneSide of [{ cheekLeft: 0.7, cheekRight: 0.05 },
    { cheekLeft: 0.05, cheekRight: 0.7 }]) {
    const controller = new ExpressionController();
    for (let at = 0; at <= 900; at += 150) {
      const snapshot = controller.update({ ...coveredJoy, ...oneSide, handEvidenceAt: at }, at, true);
      assert.equal(snapshot.coveredLaughCandidate, false);
      assert.equal(snapshot.firework, false);
    }
  }
  const transient = new ExpressionController();
  for (let at = 0; at <= 1000; at += 100) {
    const lifted = at >= 300 && at <= 400;
    const snapshot = transient.update({ ...coveredJoy,
      cheekLeft: lifted ? 0.54 : 0.05,
      cheekRight: lifted ? 0.51 : 0.04,
      handEvidenceAt: at }, at, true);
    assert.equal(snapshot.firework, false);
  }
});

test('a prior smile cannot make a newly covered relaxed face count as laughter', () => {
  const controller = new ExpressionController();
  for (let at = 0; at <= 700; at += 100) {
    controller.update({ smileLeft: 0.8, smileRight: 0.8,
      cheekLeft: 0.65, cheekRight: 0.62,
      eyeSquintLeft: 0.52, eyeSquintRight: 0.5 }, at, true);
  }
  for (let at = 800; at <= 1800; at += 100) {
    const snapshot = controller.update({ mouthCovered: true,
      smileLeft: 0, smileRight: 0,
      cheekLeft: 0.05, cheekRight: 0.04,
      eyeSquintLeft: 0.48, eyeSquintRight: 0.46,
      handEvidenceAt: at }, at, true);
    assert.equal(snapshot.coveredLaughCandidate, false);
    assert.equal(snapshot.firework, false);
  }
});

test('neutral covered eyes and one-sided squint do not count as laughter', () => {
  for (const eyes of [[0.17, 0.13], [0.6, 0.12]]) {
    const controller = new ExpressionController();
    for (let at = 0; at <= 1200; at += 150) {
      const snapshot = controller.update({ ...coveredJoy, cheekLeft: 0, cheekRight: 0,
        eyeSquintLeft: eyes[0], eyeSquintRight: eyes[1], handEvidenceAt: at }, at, true);
      assert.equal(snapshot.coveredLaughCandidate, false);
      assert.equal(snapshot.firework, false);
    }
  }
});

test('a sustained hand-covered laugh fires without visible mouth or smile scores', () => {
  const controller = new ExpressionController();
  const events = [];
  for (let at = 0; at <= 900; at += 50) {
    const handEvidenceAt = Math.floor(at / 150) * 150;
    const snapshot = controller.update({ ...coveredJoy, handEvidenceAt }, at, true);
    if (snapshot.firework) events.push(at);
  }
  assert.deepEqual(events, [450]);
  assert.equal(controller.snapshot(false, 0).coveredLaughConfirmed, true);
});

test('covering the mouth without smiling eyes and cheeks never fires', () => {
  const controller = new ExpressionController();
  for (let at = 0; at <= 1200; at += 100) {
    const snapshot = controller.update({ ...coveredJoy, cheekLeft: 0.03,
      cheekRight: 0.02, eyeSquintLeft: 0.02, eyeSquintRight: 0.02,
      handEvidenceAt: at }, at, true);
    assert.equal(snapshot.coveredLaughCandidate, false);
    assert.equal(snapshot.firework, false);
  }
});

test('a passing hand and repeated stale hand frames cannot complete covered laugh dwell', () => {
  const passing = new ExpressionController();
  for (let at = 0; at <= 1000; at += 100) {
    const snapshot = passing.update({ ...coveredJoy,
      mouthCovered: at <= 200, handEvidenceAt: at }, at, true);
    assert.equal(snapshot.firework, false);
  }
  const stale = new ExpressionController();
  for (let at = 0; at <= 1000; at += 100) {
    const snapshot = stale.update({ ...coveredJoy, handEvidenceAt: 0 }, at, true);
    assert.equal(snapshot.firework, false);
    if (at >= 300) assert.equal(snapshot.coveredLaughCandidate, false);
  }
});

test('losing the face clears partial covered-laugh evidence', () => {
  const controller = new ExpressionController();
  for (const at of [0, 150, 300]) {
    assert.equal(controller.update({ ...coveredJoy, handEvidenceAt: at }, at, true).firework, false);
  }
  const lost = controller.update(null, 350, false);
  assert.equal(lost.coveredLaughConfirmed, false);
  const events = [];
  for (let at = 400; at <= 1000; at += 150) {
    if (controller.update({ ...coveredJoy, handEvidenceAt: at }, at, true).firework) events.push(at);
  }
  assert.deepEqual(events, [850]);
});

test('face blendshapes and hand evidence are exposed without inventing a covered mouth', () => {
  const result = { faceBlendshapes: [{ categories: [
    { categoryName: 'eyeSquintLeft', score: 0.36 },
    { categoryName: 'eyeSquintRight', score: 0.31 },
    { categoryName: 'browOuterUpLeft', score: 0.24 },
    { categoryName: 'browDownRight', score: 0.12 },
  ] }], faceLandmarks: [[{}]] };
  const signals = signalsFromResult(result, 1000, 1000, { landmarks: [] }, 325);
  assert.equal(signals.eyeSquintLeft, 0.36);
  assert.equal(signals.eyeSquintRight, 0.31);
  assert.equal(signals.browOuterUpLeft, 0.24);
  assert.equal(signals.browDownRight, 0.12);
  assert.equal(signals.mouthCovered, false);
  assert.equal(signals.handEvidenceAt, 325);
  assert.equal(signalsFromResult(result, 1000, 1000).handEvidenceAt, null);
});

test('a held open-mouth smile can issue another debounced firework cue without closing', () => {
  const controller = new ExpressionController();
  const events = [];
  for (let at = 0; at <= 5200; at += 100) {
    if (controller.update(strongLaugh, at, true).firework) events.push(at);
  }
  assert.ok(events.length >= 2);
  assert.ok(events.every((at, index) => index === 0 || at - events[index - 1] >= 2200));
});

test('an open mouth without bilateral smile cannot fire a firework', () => {
  const controller = new ExpressionController();
  for (let at = 0; at <= 2000; at += 100) {
    const state = controller.update({ smileLeft: 0, smileRight: 0, jawOpen: 1,
      cheekLeft: 0.5, cheekRight: 0.5 }, at, true);
    assert.equal(state.firework, false);
  }
});

test('a modest open-mouth smile directly from neutral fires without a prior closed-mouth smile', () => {
  const controller = new ExpressionController();
  const events = [];
  for (let at = 0; at <= 1200; at += 100) {
    const snapshot = controller.update({ ...joyfulEyes,
      smileLeft: 0.26, smileRight: 0.16, jawOpen: 0.16 }, at, true);
    if (snapshot.firework) events.push(at);
  }
  assert.equal(events.length, 1);
  assert.ok(events[0] >= 300 && events[0] < 900, `unexpected open-smile trigger at ${events[0]} ms`);
});

test('visible lip separation while smiling counts even when jawOpen stays low', () => {
  const controller = new ExpressionController();
  const events = [];
  for (let at = 0; at <= 1200; at += 100) {
    const snapshot = controller.update({ ...joyfulEyes,
      smileLeft: 0.29, smileRight: 0.23,
      jawOpen: 0.04, mouthGap: 0.17 }, at, true);
    if (snapshot.firework) events.push(at);
  }
  assert.equal(events.length, 1);
});

test('raised cheeks support an open smile when mouthSmile scores dip', () => {
  const controller = new ExpressionController();
  const events = [];
  for (let at = 0; at <= 1200; at += 100) {
    const snapshot = controller.update({ ...joyfulEyes,
      smileLeft: 0.16, smileRight: 0.04,
      cheekLeft: 0.45, cheekRight: 0.4, jawOpen: 0.2 }, at, true);
    if (snapshot.firework) events.push(at);
  }
  assert.equal(events.length, 1);
});

test('an earlier smile followed by an unsmiling open mouth is not a laugh', () => {
  const controller = new ExpressionController();
  for (let at = 0; at <= 700; at += 100) {
    controller.update({ smileLeft: 0.75, smileRight: 0.75, jawOpen: 0 }, at, true);
  }
  for (let at = 800; at <= 1700; at += 100) {
    const snapshot = controller.update({ smileLeft: 0, smileRight: 0,
      cheekLeft: 0.4, cheekRight: 0.4, jawOpen: 0.85 }, at, true);
    assert.equal(snapshot.firework, false, `stale smile fired at ${at} ms`);
    assert.equal(snapshot.laughConfirmed, false);
  }
});

test('a fleeting mouth opening during a smile does not confirm a laugh', () => {
  const controller = new ExpressionController();
  for (let at = 0; at <= 700; at += 100) {
    const snapshot = controller.update({ smileLeft: 0.7, smileRight: 0.7,
      jawOpen: at >= 500 && at <= 600 ? 0.5 : 0 }, at, true);
    assert.equal(snapshot.firework, false);
  }
});

test('a stale strong expression must not fire while the face is absent', () => {
  const controller = new ExpressionController();
  for (let at = 0; at <= 400; at += 100) controller.update(strongLaugh, at, true);

  for (let at = 500; at <= 700; at += 100) {
    const state = controller.update(strongLaugh, at, false);
    assert.equal(state.firework, false, `unexpected firework at ${at} ms without a detected face`);
  }
});

test('rain fades when expression returns to neutral during firework cooldown', () => {
  const controller = new ExpressionController();
  let fired = false;
  for (let at = 0; at <= 900; at += 100) {
    fired ||= controller.update(strongLaugh, at, true).firework;
  }
  assert.equal(fired, true);

  let snapshot;
  for (let at = 1000; at <= 2000; at += 100) snapshot = controller.update({}, at, true);
  assert.equal(snapshot.state, 'cooldown');
  assert.equal(snapshot.rainIntensity, 0);
});

test('holding a strong laugh does not restart a full rainstorm during firework cooldown', () => {
  const controller = new ExpressionController();
  let snapshot;
  for (let at = 0; at <= 2300; at += 100) snapshot = controller.update(strongLaugh, at, true);
  assert.equal(snapshot.state, 'cooldown');
  assert.ok(snapshot.rainIntensity <= 0.12);
  assert.equal(snapshot.laughConfirmed, true);
  for (let at = 2400; at <= 4000; at += 100) {
    snapshot = controller.update(strongLaugh, at, true);
    assert.ok(snapshot.rainIntensity <= 0.12, `rain restarted at ${at} ms`);
  }
  assert.equal(snapshot.laughConfirmed, true);
});

test('a brief missing frame preserves the candidate, but true face loss clears it', () => {
  const controller = new ExpressionController();
  for (let at = 0; at <= 1800; at += 100) controller.update(strongLaugh, at, true);
  assert.equal(controller.snapshot(false, 0).laughConfirmed, true);
  let snapshot = controller.update({}, 1900, true);
  for (let at = 2000; at <= 2400; at += 100) snapshot = controller.update({}, at, true);
  assert.equal(snapshot.laughConfirmed, false);
  for (let at = 2500; at <= 3300; at += 100) snapshot = controller.update(strongLaugh, at, true);
  assert.equal(snapshot.laughConfirmed, true);
  snapshot = controller.update(null, 3700, false);
  assert.equal(snapshot.hasFace, true);
  assert.equal(snapshot.firework, false);
  snapshot = controller.update(null, 4300, false);
  assert.equal(snapshot.hasFace, false);
  assert.equal(snapshot.laughConfirmed, false);
});

test('an asymmetric open-mouth smile triggers fireworks without a high score on both sides', () => {
  const controller = new ExpressionController();
  const events = [];
  for (let at = 0; at <= 1800; at += 100) {
    if (controller.update({ ...joyfulEyes,
      smileLeft: 0.70, smileRight: 0.35, jawOpen: 0.40 }, at, true).firework) {
      events.push(at);
    }
  }
  assert.equal(events.length, 1);
});

test('400 ms inference cadence does not erase an otherwise sustained laugh', () => {
  const controller = new ExpressionController();
  const events = [];
  for (let at = 0; at <= 2400; at += 400) {
    if (at) {
      const missing = controller.update(null, at - 50, false);
      assert.equal(missing.firework, false);
    }
    if (controller.update(strongLaugh, at, true).firework) events.push(at);
  }
  assert.equal(events.length, 1);
});

test('a 60 fps sustained laugh reaches the hold time despite the five-frame stability window', () => {
  const controller = new ExpressionController();
  const events = [];
  let snapshot;
  for (let at = 0; at <= 1500; at += 16) {
    snapshot = controller.update(strongLaugh, at, true);
    if (snapshot.firework) events.push(at);
  }
  assert.equal(events.length, 1);
  assert.ok(events[0] >= 300 && events[0] <= 550, `unexpected 60 fps trigger at ${events[0]} ms`);
  assert.equal(snapshot.laughConfirmed, true);
  assert.equal(snapshot.laughProgress, 1);
});

test('opening the mouth after a smile can trigger even when smile scores dip', () => {
  const controller = new ExpressionController();
  for (let at = 0; at <= 600; at += 100) {
    assert.equal(controller.update({ smileLeft: 0.6, smileRight: 0.6, jawOpen: 0.02 }, at, true).firework, false);
  }
  const events = [];
  for (let at = 700; at <= 1500; at += 100) {
    if (controller.update({ ...joyfulEyes,
      smileLeft: 0.2, smileRight: 0.12, jawOpen: 0.6 }, at, true).firework) events.push(at);
  }
  assert.equal(events.length, 1);
});

test('one strong frame after a long stall cannot finish a pending laugh', () => {
  const controller = new ExpressionController();
  for (let at = 0; at <= 200; at += 100) {
    assert.equal(controller.update(strongLaugh, at, true).firework, false);
  }
  controller.update(null, 1000, false);
  assert.equal(controller.update(strongLaugh, 1200, true).firework, false);
  assert.equal(controller.update(null, 2200, false).laughConfirmed, false);
});

test('a closing mouth cannot complete laugh dwell using prior open frames', () => {
  const controller = new ExpressionController({ laughHoldMs: 350 });
  for (let at = 0; at <= 600; at += 100) {
    controller.update({ smileLeft: 0.8, smileRight: 0.8, jawOpen: 0 }, at, true);
  }
  for (let at = 700; at <= 900; at += 100) {
    assert.equal(controller.update(strongLaugh, at, true).firework, false);
  }
  for (let at = 1000; at <= 1200; at += 100) {
    assert.equal(controller.update({ smileLeft: 0.8, smileRight: 0.8, jawOpen: 0 }, at, true).firework, false);
  }
});

test('a true face loss clears the high-frame-rate laugh candidate before reacquisition', () => {
  const controller = new ExpressionController();
  for (let at = 0; at <= 440; at += 16) controller.update(strongLaugh, at, true);
  const lost = controller.update(null, 1400, false);
  assert.equal(lost.state, 'lost');
  assert.equal(lost.laughProgress, 0);
  const reacquired = controller.update(strongLaugh, 1416, true);
  assert.equal(reacquired.firework, false);
  assert.ok(reacquired.laughProgress < 1);
});

test('closing the mouth rearms fireworks while a smile is held', () => {
  const controller = new ExpressionController();
  const events = [];
  for (let at = 0; at <= 1000; at += 100) {
    if (controller.update(strongLaugh, at, true).firework) events.push(at);
  }
  for (let at = 1100; at <= 3200; at += 100) {
    if (controller.update({ smileLeft: 0.8, smileRight: 0.8, jawOpen: 0 }, at, true).firework) events.push(at);
  }
  for (let at = 3300; at <= 4400; at += 100) {
    if (controller.update(strongLaugh, at, true).firework) events.push(at);
  }
  assert.equal(events.length, 2);
});

test('mouth gap uses inner lips and mouth corners with pixel aspect ratio', () => {
  const points = Array.from({ length: 292 }, () => ({ x: 0, y: 0 }));
  points[61] = { x: 0.4, y: 0.6 };
  points[291] = { x: 0.6, y: 0.6 };
  points[13] = { x: 0.5, y: 0.58 };
  points[14] = { x: 0.5, y: 0.66 };
  const result = { faceLandmarks: [points], faceBlendshapes: [{ categories: [
    { categoryName: 'mouthSmileLeft', score: 0.7 },
    { categoryName: 'mouthSmileRight', score: 0.35 },
  ] }] };
  assert.ok(Math.abs(signalsFromResult(result, 1000, 500).mouthGap - 0.2) < 1e-6);
  assert.equal(signalsFromResult(result).mouthGap, null);
  assert.equal(signalsFromResult({ faceLandmarks: [[{}]] }, 1000, 500).mouthGap, null);
  points[13] = {};
  assert.equal(signalsFromResult(result, 1000, 500).mouthGap, null);
});

test('mouth geometry can confirm a laugh when jaw blendshape misses it', () => {
  const controller = new ExpressionController();
  const events = [];
  for (let at = 0; at <= 1800; at += 100) {
    if (controller.update({ ...joyfulEyes,
      smileLeft: 0.7, smileRight: 0.35, jawOpen: 0.04, mouthGap: 0.35 }, at, true).firework) {
      events.push(at);
    }
  }
  assert.equal(events.length, 1);
});

test('an open mouth without a smile cannot pollute the neutral mouth baseline', () => {
  const controller = new ExpressionController();
  for (let at = 0; at <= 1500; at += 100) {
    assert.equal(controller.update({ smileLeft: 0, smileRight: 0, jawOpen: 0.04, mouthGap: 0.35 }, at, true).firework, false);
  }
  const events = [];
  for (let at = 1600; at <= 3000; at += 100) {
    if (controller.update({ ...joyfulEyes,
      smileLeft: 0.7, smileRight: 0.35, jawOpen: 0.04, mouthGap: 0.35 }, at, true).firework) {
      events.push(at);
    }
  }
  assert.equal(events.length, 1);
});

const laughingFace = { hasFace: true, smile: 0.8, jawOpen: 0.7, mouthGap: 0.4, laughConfirmed: true };

test('covered-laugh candidate delays rain briefly so fireworks can win', () => {
  const gate = new ExpressionEffectGate();
  const coveredSmile = { hasFace: true, state: 'smile', rainIntensity: 0.85,
    coveredLaughCandidate: true, coveredLaughConfirmed: false, laughConfirmed: false };
  for (let at = 0; at <= 600; at += 100) {
    assert.equal(gate.decide(coveredSmile, at, true).trigger, null,
      `rain stole the covered-mouth laugh at ${at} ms`);
  }
  assert.equal(gate.decide({ ...coveredSmile, laughConfirmed: true,
    coveredLaughConfirmed: true }, 650, true).trigger, 'firework');
});

test('rain resumes after a bounded delay if covered laugh never confirms', () => {
  const gate = new ExpressionEffectGate();
  const uncertain = { hasFace: true, state: 'smile', rainIntensity: 0.85,
    coveredLaughCandidate: true, coveredLaughConfirmed: false, laughConfirmed: false };
  const triggers = [];
  for (let at = 0; at <= 900; at += 100) {
    const result = gate.decide(uncertain, at, true);
    if (result.trigger) triggers.push({ at, effect: result.trigger });
  }
  assert.deepEqual(triggers[0], { at: 700, effect: 'rain' });
});

test('covered laugh switches a held rainstorm to fireworks without a neutral pose', () => {
  const controller = new ExpressionController();
  const gate = new ExpressionEffectGate();
  gate.begin('rain', 0);
  const events = [];
  for (let at = 0; at <= 7000; at += 100) {
    const snapshot = controller.update({ ...coveredJoy, handEvidenceAt: at }, at, true);
    const decision = gate.decide(snapshot, at, true);
    if (decision.trigger) {
      events.push({ at, effect: decision.trigger });
      gate.begin(decision.trigger, at);
    }
  }
  assert.deepEqual(events.map(({ effect }) => effect), ['firework']);
  assert.ok(events[0].at >= 900 && events[0].at < 3000,
    'a confirmed covered laugh switches after the outro, not a fixed scene timer');
});

test('a held smile keeps one rain scene playing beyond the old seven-second end', () => {
  const gate = new ExpressionEffectGate();
  const smile = { hasFace: true, state: 'smile', rainIntensity: 0.85, laughConfirmed: false };
  let count = 0;
  for (let at = 0; at <= 22000; at += 100) {
    const decision = gate.decide(smile, at, true);
    if (decision.trigger) {
      count++;
      assert.equal(decision.trigger, 'rain');
      gate.begin('rain', at);
    }
  }
  assert.equal(count, 1);
  assert.equal(gate.status(22000).phase, 'playing');
  assert.equal(gate.status(22000).effect, 'rain');
  assert.equal(gate.endsAt, Infinity);
});

test('a held laugh keeps one firework show playing beyond the old nine-second end', () => {
  const gate = new ExpressionEffectGate();
  let count = 0;
  for (let at = 0; at <= 22000; at += 100) {
    const decision = gate.decide(laughingFace, at, true);
    if (decision.trigger) {
      count++;
      assert.equal(decision.trigger, 'firework');
      gate.begin('firework', at);
    }
  }
  assert.equal(count, 1);
  assert.equal(gate.status(22000).phase, 'playing');
  assert.equal(gate.endsAt, Infinity);
});

test('a brief neutral wobble does not stop rain, but a stable neutral fades and cools down', () => {
  const gate = new ExpressionEffectGate();
  const smile = { hasFace: true, state: 'smile', rainIntensity: 0.85, laughConfirmed: false };
  const neutral = { hasFace: true, state: 'neutral', rainIntensity: 0, laughConfirmed: false };
  gate.begin('rain', 0);
  for (let at = 1000; at <= 1400; at += 100) {
    assert.equal(gate.decide(neutral, at, true).phase, 'playing');
  }
  assert.equal(gate.decide(smile, 1500, true).phase, 'playing');
  for (let at = 2000; at < 2500; at += 100) {
    assert.equal(gate.decide(neutral, at, true).phase, 'playing');
  }
  assert.equal(gate.decide(neutral, 2500, true).phase, 'releasing');
  assert.equal(gate.decide(smile, 3399, true).trigger, null);
  assert.equal(gate.decide(smile, 3400, true).phase, 'cooldown');
  assert.equal(gate.decide(smile, 5399, true).trigger, null);
  assert.equal(gate.decide(smile, 5400, false).phase, 'ready');
  assert.equal(gate.decide(smile, 5400, false).trigger, null);
  assert.equal(gate.decide(smile, 5500, true).trigger, null);
  assert.equal(gate.decide(smile, 6000, true).trigger, 'rain');
});

test('a new laugh beats the brief smile phase, while a sustained smile starts rain', () => {
  const laughingController = new ExpressionController();
  const laughingGate = new ExpressionEffectGate();
  const laughTriggers = [];
  for (let at = 0; at <= 1500; at += 100) {
    const snapshot = laughingController.update(strongLaugh, at, true);
    const decision = laughingGate.decide(snapshot, at, true);
    if (decision.trigger) {
      laughTriggers.push(decision.trigger);
      laughingGate.begin(decision.trigger, at, at + 4500);
    }
  }
  assert.deepEqual(laughTriggers, ['firework']);

  const smilingController = new ExpressionController();
  const smilingGate = new ExpressionEffectGate();
  const smileTriggers = [];
  for (let at = 0; at <= 2000; at += 100) {
    const snapshot = smilingController.update({ smileLeft: 0.8, smileRight: 0.8, jawOpen: 0 }, at, true);
    const decision = smilingGate.decide(snapshot, at, true);
    if (decision.trigger) {
      smileTriggers.push(decision.trigger);
      smilingGate.begin(decision.trigger, at, at + 7000);
    }
  }
  assert.deepEqual(smileTriggers, ['rain']);
});

test('a direct open-mouth smile reaches fireworks before rain can claim the room', () => {
  const controller = new ExpressionController();
  const gate = new ExpressionEffectGate();
  const triggers = [];
  for (let at = 0; at <= 1700; at += 100) {
    const snapshot = controller.update({ ...joyfulEyes,
      smileLeft: 0.6, smileRight: 0.6,
      jawOpen: 0.14 }, at, true);
    const decision = gate.decide(snapshot, at, true);
    if (decision.trigger) {
      triggers.push(decision.trigger);
      gate.begin(decision.trigger, at, at + 7000);
    }
  }
  assert.deepEqual(triggers, ['firework']);
});

test('a confirmed open-mouth laugh switches sustained rain to fireworks without neutral', () => {
  const controller = new ExpressionController();
  const gate = new ExpressionEffectGate();
  let rainAt = null;
  const decisions = [];
  for (let at = 0; at <= 13000; at += 100) {
    const raw = at < 1500
      ? { smileLeft: 0.8, smileRight: 0.8, jawOpen: 0 }
      : strongLaugh;
    const snapshot = controller.update(raw, at, true);
    const decision = gate.decide(snapshot, at, true);
    if (decision.trigger) {
      decisions.push({ effect: decision.trigger, at });
      if (decision.trigger === 'rain') {
        rainAt = at;
        gate.begin('rain', at);
      } else {
        gate.begin('firework', at);
      }
    }
  }
  assert.ok(rainAt != null);
  assert.deepEqual(decisions.map(({ effect }) => effect), ['rain', 'firework']);
  assert.ok(decisions[1].at > rainAt + 900);
  assert.ok(decisions[1].at < rainAt + 4500);
});

test('one continuously held open-mouth laugh never restarts its full firework scene', () => {
  const controller = new ExpressionController();
  const gate = new ExpressionEffectGate();
  const decisions = [];
  for (let at = 0; at <= 13500; at += 100) {
    const snapshot = controller.update(strongLaugh, at, true);
    const decision = gate.decide(snapshot, at, true);
    if (decision.trigger) {
      decisions.push({ effect: decision.trigger, at });
      gate.begin(decision.trigger, at);
    }
  }
  assert.deepEqual(decisions.map(({ effect }) => effect), ['firework']);
  assert.equal(gate.status(13500).phase, 'playing');
});

test('one continuously held smile never restarts its cloud entrance', () => {
  const controller = new ExpressionController();
  const gate = new ExpressionEffectGate();
  const decisions = [];
  for (let at = 0; at <= 12000; at += 100) {
    const snapshot = controller.update({ smileLeft: 0.8, smileRight: 0.8, jawOpen: 0 }, at, true);
    const decision = gate.decide(snapshot, at, true);
    if (decision.trigger) {
      decisions.push({ effect: decision.trigger, at });
      gate.begin(decision.trigger, at);
    }
  }
  assert.deepEqual(decisions.map(({ effect }) => effect), ['rain']);
  assert.equal(gate.status(12000).phase, 'playing');
});

test('a closed-mouth smile after fireworks switches to rain after the short outro', () => {
  const controller = new ExpressionController();
  const gate = new ExpressionEffectGate();
  const decisions = [];
  for (let at = 0; at <= 13500; at += 100) {
    const raw = at < 1500 ? strongLaugh : { smileLeft: 0.8, smileRight: 0.8, jawOpen: 0 };
    const snapshot = controller.update(raw, at, true);
    const decision = gate.decide(snapshot, at, true);
    if (decision.trigger) {
      decisions.push({ effect: decision.trigger, at });
      gate.begin(decision.trigger, at);
    }
  }
  assert.deepEqual(decisions.map(({ effect }) => effect), ['firework', 'rain']);
  assert.ok(decisions[1].at > decisions[0].at + 900);
  assert.ok(decisions[1].at < decisions[0].at + 4500);
});

test('neutral after laughter is not mistaken for a smile during the old firework latch', () => {
  const controller = new ExpressionController();
  const gate = new ExpressionEffectGate();
  const triggers = [];
  for (let at = 0; at <= 4500; at += 100) {
    const raw = at < 1500 ? strongLaugh : { smileLeft: 0, smileRight: 0, jawOpen: 0 };
    const snapshot = controller.update(raw, at, true);
    const decision = gate.decide(snapshot, at, true);
    if (decision.trigger) {
      triggers.push(decision.trigger);
      gate.begin(decision.trigger, at);
    }
    if (at === 1800) {
      assert.equal(snapshot.state, 'cooldown');
      assert.ok(snapshot.rainIntensity > 0.25);
      assert.equal(snapshot.smileActive, false,
        'the fading smile score is not fresh current smile evidence');
    }
  }
  assert.deepEqual(triggers, ['firework']);
  assert.equal(gate.status(4500).phase, 'cooldown');
});

test('face loss and stalled recognition end a sustained show; stale frames cannot start another', () => {
  const gate = new ExpressionEffectGate();
  gate.begin('firework', 0);
  assert.equal(gate.decide(laughingFace, 100, true).phase, 'playing');
  assert.equal(gate.decide({ ...laughingFace, hasFace: false }, 200, true).phase, 'releasing');
  assert.equal(gate.decide(laughingFace, 3100, false).phase, 'ready');
  assert.equal(gate.decide(laughingFace, 3100, false).trigger, null);
  assert.equal(gate.decide(laughingFace, 3200, true).trigger, 'firework');
  gate.begin('firework', 3200);
  assert.equal(gate.decide(laughingFace, 4100, false).phase, 'playing');
  assert.equal(gate.decide(laughingFace, 4200, false).phase, 'releasing');
});
