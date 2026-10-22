import test from 'node:test';
import assert from 'node:assert/strict';
import { SmileRainScene } from './rain-scene.js';

const head = { x: 195, y: 270, rx: 72, ry: 94 };

function update(scene, now, intensity = 0.8, collider = head, dt = 0.05) {
  scene.update(now, intensity, collider, dt, 390, 690);
}

function recordingContext() {
  let path = [];
  const strokes = [];
  const ellipses = [];
  return {
    strokes, ellipses,
    save() {}, restore() {}, beginPath() { path = []; },
    moveTo(x, y) { path.push([x, y]); },
    lineTo(x, y) { path.push([x, y]); },
    stroke() { strokes.push([...path]); }, fill() {},
    ellipse(x, y, rx, ry, rotation, start, end) {
      const ellipse = { x, y, rx, ry, rotation, start, end };
      ellipses.push(ellipse);
      path.push(ellipse);
    },
  };
}

function cloudRecordingContext() {
  const draws = [];
  const state = [];
  return {
    draws, globalAlpha: 1, tx: 0,
    save() { state.push({ globalAlpha: this.globalAlpha, tx: this.tx }); },
    restore() { Object.assign(this, state.pop()); },
    translate(x) { this.tx += x; }, scale() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    drawImage(...args) { draws.push({ args, alpha: this.globalAlpha, x: this.tx }); },
    fillRect() {}, beginPath() {}, ellipse() {}, fill() {},
    moveTo() {}, lineTo() {}, stroke() {},
  };
}

test('one held smile runs the authored opening and keeps raining past seven seconds', () => {
  const scene = new SmileRainScene();
  update(scene, 1000);
  assert.equal(scene.openCount, 1);
  assert.equal(scene.phase(1000), 'approach');
  assert.equal(scene.phase(3300), 'merge');
  assert.equal(scene.phase(3800), 'lightning');
  assert.equal(scene.rainGate(3900), 0);
  assert.equal(scene.phase(4400), 'rain');
  assert.ok(scene.rainGate(4400) > 0.8);
  update(scene, 4200, 0, head);
  update(scene, 4700);
  assert.equal(scene.openCount, 1);
  assert.equal(scene.phase(4700), 'rain', 'a brief neutral wobble keeps the cue running');
  update(scene, 8000);
  assert.equal(scene.phase(8000), 'rain');
  assert.ok(scene.rainGate(8000) > 0.99);
  update(scene, 8100);
  assert.equal(scene.openCount, 1, 'a held smile must not restart the cue');
  update(scene, 8200, 0, head);
  update(scene, 8900, 0, head);
  assert.equal(scene.phase(8900), 'release');
  assert.equal(scene.releaseEndAt, 9800);
  assert.ok(scene.rainGate(9300) < 0.8);
  update(scene, 9900, 0, head);
  assert.equal(scene.phase(9900), 'idle');
  assert.equal(scene.rainGate(9900), 0);
  update(scene, 10100);
  assert.equal(scene.openCount, 2);
  assert.equal(scene.phase(10100), 'approach');
});

test('an explicit expression change releases rain without replaying clouds or late rain', () => {
  const scene = new SmileRainScene();
  update(scene, 1000);
  update(scene, 4300);
  const end = scene.requestRelease(4600);
  assert.equal(end, 5500);
  assert.equal(scene.releaseDurationMs, 900);
  update(scene, 4700, 0.8);
  assert.equal(scene.phase(4700), 'release');
  assert.ok(scene.rainGate(4700) < scene.rainGate(4600));
  assert.equal(scene.openCount, 1);
  update(scene, 5500, 0);
  assert.equal(scene.phase(5500), 'idle');
  assert.equal(scene.rainGate(5500), 0);

  const interrupted = new SmileRainScene();
  update(interrupted, 1000);
  interrupted.requestRelease(3550);
  update(interrupted, 3800, 0);
  assert.equal(interrupted.rainGate(3800), 0,
    'releasing before rain starts must not add a late shower');
});

test('two clouds enter from opposite screen edges and converge over the tracked head', () => {
  const scene = new SmileRainScene();
  update(scene, 1000);
  assert.ok(scene.cloudWidth > 390, 'the cloud canopy spans the live frame');
  assert.ok(scene.anchor.y + scene.cloudHeight * 0.54 < scene.hairTop(head) + 15,
    'the cloud underside meets the tracked crown without covering the face');
  const start = scene.cloudPositions(1000, 390);
  const middle = scene.cloudPositions(2075, 390);
  const merged = scene.cloudPositions(3750, 390);
  assert.ok(start.leftX < 0 && start.rightX > 390);
  assert.ok(middle.leftX > start.leftX && middle.rightX < start.rightX);
  assert.ok(Math.abs(merged.leftX - scene.anchor.x) < scene.cloudWidth * 0.25);
  assert.ok(Math.abs(merged.rightX - scene.anchor.x) < scene.cloudWidth * 0.25);
  assert.equal(merged.centerAlpha, 1);
  assert.equal(scene.rainGate(3750), 0, 'rain waits for the clouds to meet');
});

test('the approach draws two complete small cloud silhouettes rather than cropped halves', () => {
  const scene = new SmileRainScene();
  update(scene, 1000);
  const art = { width: 1950, height: 800 };
  scene.cloudArt = () => art;
  const ctx = cloudRecordingContext();
  scene.drawCloud(ctx, 390, 690, 2450);
  assert.equal(ctx.draws.length, 2, 'the large canopy waits until the small clouds meet');
  assert.ok(ctx.draws.every(({ args }) => args.length === 5 && args[0] === art),
    'each small cloud paints the entire illustrated sprite without a source crop');
  assert.ok(ctx.draws.every(({ args }) => args[3] < scene.cloudWidth * 0.5),
    'the two traveling clouds are smaller than the final canopy');
  assert.ok(ctx.draws[0].x < scene.anchor.x && ctx.draws[1].x > scene.anchor.x,
    'the two whole clouds approach from opposite sides');
});

test('small clouds overlap and crossfade into one full canopy without a visible half-image join', () => {
  const scene = new SmileRainScene();
  update(scene, 1000);
  const art = { width: 1950, height: 800 };
  scene.cloudArt = () => art;
  const halfway = scene.cloudPositions(3450, 390);
  const smallWidth = scene.cloudWidth * (0.4 + halfway.merge * 0.04) * 1.12;
  assert.ok(halfway.rightX - halfway.leftX < smallWidth * 0.97,
    'the two complete silhouettes overlap as the merged cloud emerges');
  assert.ok(halfway.pairAlpha > 0 && halfway.pairAlpha < 1);
  assert.ok(halfway.centerAlpha > 0 && halfway.centerAlpha < 1);
  const mid = cloudRecordingContext();
  scene.drawCloud(mid, 390, 690, 3450);
  assert.equal(mid.draws.length, 3, 'both small clouds and the full canopy crossfade together');
  assert.ok(mid.draws.every(({ args }) => args.length === 5),
    'the full silhouette is used throughout the merge');
  const settled = cloudRecordingContext();
  scene.drawCloud(settled, 390, 690, 3750);
  assert.equal(settled.draws.length, 1, 'only the finished large cloud remains before lightning');
});

test('rain covers the screen while a denser stream aims at the head', () => {
  const scene = new SmileRainScene();
  update(scene, 1000);
  update(scene, 4600, 0, head);
  assert.equal(scene.phase(4600), 'rain');
  assert.ok(scene.rainGate(4600) > 0);
  const from = (values) => () => values.shift();
  const left = scene.getSpawnPoint(from([0.1, 0.02, 0.5]), 390, head);
  const right = scene.getSpawnPoint(from([0.1, 0.98, 0.5]), 390, head);
  const crown = scene.getSpawnPoint(from([0.9, 0.5, 0.5]), 390, head);
  assert.ok(left.x < 20 && right.x > 370, 'background rain reaches both edges');
  assert.equal(crown.x, head.x, 'foreground rain tracks the head');
  assert.ok([left, right, crown].every((point) => point.y < scene.hairTop(head)));
});

test('the cloud follows the head and disappears after face loss', () => {
  const scene = new SmileRainScene();
  update(scene, 1000);
  const firstX = scene.anchor.x;
  for (let i = 1; i <= 12; i++) update(scene, 1000 + i * 50, 0.8, { ...head, x: 290 });
  assert.ok(scene.anchor.x > firstX + 45);
  update(scene, 1650, 0, null);
  update(scene, 1700, 0.8, head);
  assert.equal(scene.phase(1700), 'idle', 'a quick face return cannot revive the old cloud');
  assert.equal(scene.rainGate(1700), 0);
  for (let i = 3; i <= 25; i++) update(scene, 1600 + i * 50, 0, null);
  assert.equal(scene.visibility, 0);
  assert.equal(scene.anchor, null);
  assert.equal(scene.phase(2850), 'idle');
  assert.equal(scene.rainGate(2850), 0);
});

test('a face near the header moves the full-width cloud upward instead of over the eyes', () => {
  const scene = new SmileRainScene();
  const highHead = { x: 185, y: 173, rx: 70, ry: 88 };
  update(scene, 1000, 0.8, highHead);
  assert.equal(scene.cramped, true);
  assert.ok(scene.anchor.y < 0);
  assert.ok(scene.cloudWidth > 390);
  assert.ok(scene.cloudHeight < scene.cloudWidth * 0.32,
    'tight framing compresses the panoramic shelf instead of hiding it above the viewport');
  assert.ok(scene.anchor.y + scene.cloudHeight * 0.54 < scene.hairTop(highHead) + 15);
});

test('a foreground drop meets the hairline and becomes a short-lived bead', () => {
  const scene = new SmileRainScene();
  for (let i = 0; i < 8; i++) update(scene, 1000 + i * 50);
  const drop = { x: head.x, y: 180, depth: 1 };
  assert.equal(scene.catchDrop(drop, 155, head, 1500), true);
  assert.equal(scene.beads.length, 1);
  assert.equal(scene.catchDrop({ ...drop, depth: 0 }, 155, head, 1500), false);
  assert.equal(scene.catchDrop({ x: head.x + 30, y: 210, depth: 1 }, 192, head, 1600), true,
    'a drop born in a low cloud still creates contact on the crown');
  update(scene, 2200, 0, head, 0.05);
  for (let i = 0; i < 30; i++) update(scene, 2250 + i * 50, 0, head, 0.05);
  assert.equal(scene.beads.length, 0);
});

test('wet-hair glints only follow recent impacts and never trace a long head outline', () => {
  const scene = new SmileRainScene();
  for (let i = 0; i < 8; i++) update(scene, 1000 + i * 50);
  const ctx = recordingContext();
  scene.drawWetHair(ctx, head, 1, 1500);
  assert.equal(ctx.strokes.length, 0, 'rain alone must not paint a synthetic hairline');
  scene.catchDrop({ x: head.x, y: 180, depth: 1 }, 155, head, 1500);
  scene.drawWetHair(ctx, head, 1, 1510);
  assert.ok(ctx.strokes.length > 0, 'a real crown impact creates a local wet glint');
  for (const stroke of ctx.strokes) {
    assert.equal(stroke.length, 2, 'wet highlights are single short strands');
    const [[x1, y1], [x2, y2]] = stroke;
    assert.ok(Math.hypot(x2 - x1, y2 - y1) < 8,
      'a glint cannot become a long cyan outline over the hair');
  }
});

test('only an outer crown hit can send a small water bead down side hair', () => {
  const scene = new SmileRainScene();
  for (let i = 0; i < 8; i++) update(scene, 1000 + i * 50);
  const u = 0.82;
  const point = scene.crownPoint(head, u);
  scene.catchDrop({ x: point.x, y: point.y + 2, depth: 1 }, point.y - 4, head, 1500);
  assert.equal(scene.hairRuns.length, 1);
  update(scene, 1600, 0.8, head, 0.05);
  const ctx = recordingContext();
  scene.drawWetHair(ctx, head, 1, 1600);
  assert.ok(ctx.ellipses.length > 0, 'a droplet follows the outside of the hair');
  assert.ok(ctx.ellipses.every(({ x }) => x > head.x + head.rx * 0.88),
    'the runnel stays clear of the eyes, nose and mouth');
  assert.ok(ctx.strokes.every((stroke) => stroke.length === 2
    && Math.hypot(stroke[1][0] - stroke[0][0], stroke[1][1] - stroke[0][1]) < 8),
  'wetness remains small local strokes, never a head outline');
  for (let i = 0; i < 30; i++) update(scene, 1700 + i * 50, 0, head, 0.05);
  assert.equal(scene.hairRuns.length, 0);
});

test('a crown hit scatters ten visible local water beads without outlining the head', () => {
  const scene = new SmileRainScene();
  for (let i = 0; i < 8; i++) update(scene, 1000 + i * 50);
  scene.catchDrop({ x: head.x, y: 180, depth: 1 }, 155, head, 1500);
  scene.beads[0].age = 0.12;
  const ctx = recordingContext();
  scene.drawBeads(ctx, head);
  assert.equal(ctx.strokes.length, 2, 'only two broken ripples at the actual hit may be stroked');
  assert.equal(ctx.ellipses.length, 13,
    'one tracked bead, two local ripples and ten airborne beads are visible');
  const ripples = ctx.ellipses.filter(({ end, start }) => end - start < Math.PI * 0.5);
  assert.equal(ripples.length, 2);
  assert.ok(ripples.every(({ rx, ry }) => rx <= 14 && ry <= 4.5),
    'a contact ripple cannot grow into a head-sized outline');
  const droplets = ctx.ellipses.filter(({ end, start }) => end - start >= Math.PI * 2);
  assert.equal(droplets.length, 11);
  const impact = scene.crownPoint(head, scene.beads[0].u);
  assert.ok(droplets.every(({ x, y, rx, ry }) => Math.abs(x - impact.x) <= 20
    && y >= impact.y - 22 && y <= impact.y + 5 && rx <= 2.2 && ry <= 2.5),
  'water beads stay small and local to the hair impact instead of crossing the face');
  scene.beads[0].age = 0.2;
  const faded = recordingContext();
  scene.drawBeads(faded, head);
  assert.equal(faded.strokes.length, 0, 'ripple strokes disappear well before the bead fades');
  scene.beads[0].age = 0.35;
  const settled = recordingContext();
  scene.drawBeads(settled, head);
  assert.equal(settled.ellipses.length, 1,
    'the airborne spray disappears after 340 ms, leaving only a sliding wet bead');
});

test('even an ordinary head hit makes a brief six-bead splash within the event budget', () => {
  const scene = new SmileRainScene();
  for (let i = 0; i < 8; i++) update(scene, 1000 + i * 50);
  const hit = { x: head.x + 25, y: 190, depth: 1 };
  assert.equal(scene.catchDrop(hit, 150, head, 1500), true);
  assert.equal(scene.catchDrop(hit, 150, head, 1560), true);
  assert.equal(scene.beads[1].hero, false);
  scene.beads = [scene.beads[1]];
  scene.beads[0].age = 0.1;
  const ctx = recordingContext();
  scene.drawBeads(ctx, head);
  assert.equal(ctx.strokes.length, 0, 'secondary hits do not add extra ripple strokes');
  assert.equal(ctx.ellipses.length, 7,
    'every accepted drop still has one sliding bead and six airborne water beads');
  scene.beads[0].age = 0.26;
  const faded = recordingContext();
  scene.drawBeads(faded, head);
  assert.equal(faded.ellipses.length, 1, 'secondary splash lasts less than 250 ms');
});

test('reduced motion skips the glimmer while keeping a clear rain trigger', () => {
  const scene = new SmileRainScene({ reducedMotion: true });
  update(scene, 1000);
  assert.equal(scene.phase(1200), 'merge');
  assert.equal(scene.phase(1400), 'rain');
  assert.ok(scene.rainGate(1400) > 0);
  update(scene, 7000);
  assert.equal(scene.phase(7000), 'rain');
  assert.equal(scene.releaseDurationMs, 500);
});
