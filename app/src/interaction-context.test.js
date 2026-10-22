import test from 'node:test';
import assert from 'node:assert/strict';
import { InteractionContext } from './interaction-context.js';

test('natural interaction starts either effect without a gift or scene event', () => {
  const context = new InteractionContext();
  assert.equal(context.canStart('rain', 0), true);
  assert.equal(context.canStart('firework', 0), true);
  assert.equal(context.canStart('unknown', 0), false);
});

test('gift interaction requires the matching gift, expires, and is consumed once', () => {
  const context = new InteractionContext();
  context.select('gift');
  assert.equal(context.canStart('rain', 100), false);
  assert.equal(context.armGift('smile', 8100), true);
  assert.equal(context.canStart('rain', 8000), true);
  assert.equal(context.canStart('firework', 8000), false);
  assert.equal(context.consume('rain', 8000), true);
  assert.equal(context.canStart('rain', 8001), false);
  context.armGift('laugh', 9000);
  assert.equal(context.canStart('firework', 9001), false);
  assert.equal(context.status(9001).waitingFor, null);
});

test('PK and topic windows require an explicit start, and changing modes clears it', () => {
  const context = new InteractionContext();
  context.select('pk');
  assert.equal(context.canStart('rain', 0), false);
  context.setSceneOpen(true);
  assert.equal(context.canStart('rain', 1), true);
  context.setSceneOpen(false);
  assert.equal(context.canStart('rain', 2), false);
  context.select('topic');
  assert.equal(context.canStart('firework', 3), false);
  context.setSceneOpen(true);
  assert.equal(context.canStart('firework', 4), true);
  context.select('natural');
  assert.equal(context.status(5).sceneOpen, false);
  assert.equal(context.canStart('firework', 5), true);
});
