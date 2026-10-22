import test from 'node:test';
import assert from 'node:assert/strict';
import { coverLayout, pointToStage, faceColliderFromLandmarks } from './geometry.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} ≠ ${expected}`);

test('cover crop and camera mirror map landmarks to the displayed video position', () => {
  const layout = coverLayout(1280, 720, 500, 500);
  close(layout.scale, 500 / 720);
  close(pointToStage({ x: 0.5, y: 0.5 }, layout, 1280, 720).x, 250);
  close(pointToStage({ x: 0.5, y: 0.5 }, layout, 1280, 720).y, 250);

  const leftQuarter = pointToStage({ x: 0.25, y: 0.5 }, layout, 1280, 720, true);
  const rightQuarter = pointToStage({ x: 0.75, y: 0.5 }, layout, 1280, 720);
  close(leftQuarter.x, rightQuarter.x);
  close(leftQuarter.y, rightQuarter.y);
});

test('collider follows the same mapped face position and swaps sides on camera mirror', () => {
  const layout = coverLayout(1000, 1000, 600, 600);
  const landmarks = [];
  landmarks[10] = { x: 0.3, y: 0.2 };
  landmarks[152] = { x: 0.3, y: 0.8 };
  landmarks[234] = { x: 0.1, y: 0.5 };
  landmarks[454] = { x: 0.5, y: 0.5 };
  const normal = faceColliderFromLandmarks(landmarks, layout, 1000, 1000);
  const mirrored = faceColliderFromLandmarks(landmarks, layout, 1000, 1000, true);

  assert.ok(normal);
  assert.ok(mirrored);
  close(normal.x + mirrored.x, 600);
  close(normal.y, mirrored.y);
  close(normal.rx, mirrored.rx);
  close(normal.ry, mirrored.ry);
});
