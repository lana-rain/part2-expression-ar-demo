import test from 'node:test';
import assert from 'node:assert/strict';
import { publicAssetUrl } from './asset-url.js';

test('public assets stay inside a GitHub Pages repository path', () => {
  const options = { base: './', pageUrl: 'https://example.github.io/live-ar/?mode=demo' };
  assert.equal(publicAssetUrl('/models/face_landmarker.task', options),
    'https://example.github.io/live-ar/models/face_landmarker.task');
  assert.equal(publicAssetUrl('validation/smile.jpg', options),
    'https://example.github.io/live-ar/validation/smile.jpg');
});

test('public assets continue to work at localhost and explicit base paths', () => {
  assert.equal(publicAssetUrl('/wasm', { base: '/', pageUrl: 'http://localhost:5173/' }),
    'http://localhost:5173/wasm');
  assert.equal(publicAssetUrl('effects/cloud.png', {
    base: '/live-ar/', pageUrl: 'https://example.github.io/live-ar/index.html',
  }), 'https://example.github.io/live-ar/effects/cloud.png');
});
