import test from 'node:test';
import assert from 'node:assert/strict';
import { handCoversMouth } from './hand-mouth.js';

function faceLandmarks() {
  const face = Array.from({ length: 455 }, () => ({ x: 0, y: 0 }));
  face[1] = { x: 0.5, y: 0.51 };
  face[10] = { x: 0.5, y: 0.18 };
  face[152] = { x: 0.5, y: 0.82 };
  face[234] = { x: 0.28, y: 0.5 };
  face[454] = { x: 0.72, y: 0.5 };
  face[61] = { x: 0.44, y: 0.63 };
  face[291] = { x: 0.56, y: 0.63 };
  face[13] = { x: 0.5, y: 0.62 };
  face[14] = { x: 0.5, y: 0.64 };
  return face;
}

function coveringHand() {
  const hand = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.63 }));
  hand[0] = { x: 0.5, y: 0.76 };
  hand[5] = { x: 0.45, y: 0.66 };
  hand[9] = { x: 0.49, y: 0.65 };
  hand[13] = { x: 0.53, y: 0.65 };
  hand[17] = { x: 0.57, y: 0.66 };
  return hand;
}

test('multiple fingers and the palm overlapping the mouth count as coverage', () => {
  assert.equal(handCoversMouth(faceLandmarks(), [coveringHand()], 1000, 1000), true);
});

test('one fingertip or one finger across the lip is not a covered mouth', () => {
  const finger = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.82 }));
  finger[0] = { x: 0.5, y: 0.7 };
  for (const index of [5, 6, 7, 8]) finger[index] = { x: 0.48, y: 0.64 };
  assert.equal(handCoversMouth(faceLandmarks(), [finger], 1000, 1000), false);
});

test('hand beside the cheek and invalid face geometry are rejected', () => {
  const cheekHand = coveringHand().map((point) => ({ x: point.x + 0.24, y: point.y }));
  assert.equal(handCoversMouth(faceLandmarks(), [cheekHand], 1000, 1000), false);
  assert.equal(handCoversMouth([{}], [coveringHand()], 1000, 1000), false);
  assert.equal(handCoversMouth(faceLandmarks(), [coveringHand()], 0, 1000), false);
});

test('the mouth region remains usable if occluded lip landmarks are unavailable', () => {
  const face = faceLandmarks();
  face[13] = {};
  face[14] = {};
  assert.equal(handCoversMouth(face, [coveringHand()], 1000, 1000), true);
});
