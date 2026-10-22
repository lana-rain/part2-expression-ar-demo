import test from 'node:test';
import assert from 'node:assert/strict';
import { sweepEllipse } from './collision.js';

const head = { x: 100, y: 100, rx: 40, ry: 50, vx: 0, vy: 0 };

test('a fast particle crossing the head reverses its inward motion', () => {
  const particle = { x: 200, y: 100, vx: 2000, vy: 0, radius: 2 };
  const hit = sweepEllipse(particle, 0, 100, 0.1, head);
  assert.equal(hit, true);
  assert.ok(particle.vx < 0);
  assert.ok(particle.x < head.x - head.rx);
  assert.ok(Number.isFinite(particle.x) && Number.isFinite(particle.y));
});

test('a particle engulfed by a moving head is moved clear of its collision boundary', () => {
  const movingHead = { ...head, vx: 100 };
  const particle = { x: 105, y: 100, vx: 0, vy: 0, radius: 2 };
  const hit = sweepEllipse(particle, 105, 100, 1 / 60, movingHead);
  assert.equal(hit, true);
  const distance = Math.hypot(
    (particle.x - movingHead.x) / (movingHead.rx + particle.radius),
    (particle.y - movingHead.y) / (movingHead.ry + particle.radius),
  );
  assert.ok(distance >= 1, `particle remains inside the head after collision: ${distance}`);
});
