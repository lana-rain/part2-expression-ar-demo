import test from 'node:test';
import assert from 'node:assert/strict';
import { RainGlassLayer } from './rain-glass.js';

function randomSequence(seed = 41) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

test('a full rain cue adds a small, bounded set of glass beads and only a few trails', () => {
  const glass = new RainGlassLayer({ random: randomSequence() });
  for (let i = 0; i < 85; i++) glass.update(0.05, 1, 390, 690);
  assert.ok(glass.drops.length > 0, 'rain reaches the virtual lens');
  assert.ok(glass.drops.length <= 18, 'glass never becomes an opaque drop curtain');
  assert.ok(glass.drops.filter((drop) => drop.flowing).length <= 4,
    'only a handful of beads form sliding runnels');
  assert.ok(glass.drops.every((drop) => drop.radius < 12),
    'individual beads cannot cover the eyes or mouth');
  for (let i = 0; i < 85; i++) glass.update(0.05, 0, 390, 690);
  assert.equal(glass.drops.length, 0, 'the glass clears after the rain ends');
});

test('nearby impact beads join into a heavier drop that can run down the glass', () => {
  const values = [0.5, 0.5, 0.1, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
  const glass = new RainGlassLayer({ random: () => values.shift() ?? 0.5 });
  glass.drops.push({
    x: 100, y: 120, startX: 100, startY: 120, radius: 5,
    age: 0.5, life: 1.2, speed: 55, drift: 0, flowing: false, seed: 0,
  });
  glass.addDrop(390, 690);
  assert.equal(glass.drops.length, 1);
  assert.ok(glass.drops[0].radius > 5);
  assert.equal(glass.drops[0].flowing, true);
  const startingY = glass.drops[0].y;
  for (let i = 0; i < 12; i++) glass.update(0.05, 0, 390, 690);
  assert.ok(glass.drops[0].y > startingY + 10,
    'a pooled drop visibly slides rather than remaining a static dot');
});

test('a sliding bead gathers a stationary impact and records the gravity trail', () => {
  const glass = new RainGlassLayer();
  glass.drops = [
    { x: 94, y: 120, startX: 94, startY: 104, radius: 5,
      age: 0.4, life: 2.1, speed: 86, drift: 0, flowing: true, seed: 0,
      track: [{ x: 94, y: 104 }, { x: 94, y: 120 }] },
    { x: 95, y: 128, startX: 95, startY: 128, radius: 4,
      age: 0.1, life: 1.2, speed: 55, drift: 0, flowing: false, seed: 0 },
  ];
  glass.update(0.05, 1, 390, 690);
  assert.equal(glass.drops.length, 1, 'the flowing bead absorbs nearby water');
  assert.ok(glass.drops[0].radius > 5, 'gathered water makes a heavier bead');
  for (let i = 0; i < 12; i++) glass.update(0.05, 0, 390, 690);
  assert.ok(glass.drops[0].track.length > 2, 'the stream keeps its travelled path');
  assert.ok(glass.drops[0].track.at(-1).y > glass.drops[0].track[0].y + 30,
    'the trail follows gravity instead of remaining a static overlay');
});

test('glass beads over facial features become translucent without a hard face cutout', () => {
  const glass = new RainGlassLayer();
  const face = { x: 195, y: 300, rx: 70, ry: 92 };
  assert.ok(glass.faceOpacity(195, 300, face) >= 0.35);
  assert.ok(glass.faceOpacity(195, 300, face) < 0.5);
  const feather = glass.faceOpacity(265, 300, face);
  assert.ok(feather > 0.5 && feather < 1);
  assert.equal(glass.faceOpacity(350, 300, face), 1);
});

test('reduced motion keeps brief impact beads but never animates a falling trail', () => {
  const glass = new RainGlassLayer({ reducedMotion: true, random: randomSequence(16) });
  for (let i = 0; i < 45; i++) glass.update(0.05, 1, 390, 690);
  assert.ok(glass.drops.length > 0);
  assert.ok(glass.drops.every((drop) => !drop.flowing));
  assert.ok(glass.drops.length <= 8);
  glass.reset();
  assert.equal(glass.drops.length, 0);
  assert.equal(glass.spawnCarry, 0);
});

test('rendering uses isolated droplet paths and never paints a screen-wide veil', () => {
  const glass = new RainGlassLayer();
  glass.drops = [{
    x: 72, y: 155, startX: 70, startY: 95,
    age: 0.65, life: 2.3, radius: 6, speed: 60,
    drift: 1, flowing: true, seed: 0,
  }];
  const calls = [];
  const ctx = {
    save() {}, restore() {}, beginPath() {},
    moveTo() {}, lineTo() {}, quadraticCurveTo() {}, closePath() {},
    ellipse() {}, arc() {},
    stroke() { calls.push('stroke'); },
    fill() { calls.push('fill'); },
    fillRect() { throw new Error('glass overlay must leave the live view unobscured'); },
  };
  glass.draw(ctx, { x: 195, y: 300, rx: 70, ry: 92 });
  assert.ok(calls.includes('stroke'));
  assert.ok(calls.includes('fill'));
});

test('fresh glass contact renders a brief splash of separate beads without a large ring', () => {
  const glass = new RainGlassLayer();
  glass.drops = [{ x: 75, y: 180, startX: 75, startY: 180,
    age: 0.12, life: 1.5, radius: 6, speed: 60, drift: 0,
    flowing: false, seed: 0, track: [{ x: 75, y: 180 }] }];
  const arcs = [];
  const ellipses = [];
  let incomingStreak = false;
  const ctx = {
    save() {}, restore() {}, beginPath() {},
    moveTo() {}, lineTo() { incomingStreak = true; },
    quadraticCurveTo() {}, closePath() {},
    ellipse(...args) { ellipses.push(args); },
    arc(...args) { arcs.push(args); },
    stroke() {}, fill() {},
    fillRect() { throw new Error('a glass impact must not cover the video'); },
  };
  glass.draw(ctx);
  assert.equal(incomingStreak, true, 'the drop has a visible arrival');
  assert.ok(arcs.length >= 5, 'contact splashes into several tiny water beads');
  assert.ok(ellipses.every(([, , rx]) => rx < 8),
    'the impact has no large circular face-covering ring');
});
