import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCameraFailure, cameraTrackLive } from './camera-recovery.js';

const failure = (name) => ({ name });

test('permission denial requires user action and can offer the localhost origin', () => {
  for (const name of ['NotAllowedError', 'SecurityError']) {
    const result = classifyCameraFailure(failure(name));
    assert.equal(result.kind, 'permission');
    assert.match(result.message, /权限/);
    assert.equal(result.autoRetry, false);
    assert.equal(result.fallbackToDefault, false);
  }
  const localhost = classifyCameraFailure(failure('NotAllowedError'), { offerLocalhost: true });
  assert.match(localhost.message, /localhost/);
  assert.equal(localhost.autoRetry, false);
});

test('missing camera waits for a device or a manual retry', () => {
  for (const name of ['NotFoundError', 'DevicesNotFoundError']) {
    const result = classifyCameraFailure(failure(name));
    assert.equal(result.kind, 'missing');
    assert.equal(result.autoRetry, false);
    assert.equal(result.fallbackToDefault, false);
  }
});

test('busy or aborted acquisition is transient', () => {
  for (const name of ['NotReadableError', 'AbortError']) {
    const result = classifyCameraFailure(failure(name));
    assert.equal(result.kind, 'busy');
    assert.equal(result.autoRetry, true);
    assert.equal(result.fallbackToDefault, false);
  }
});

test('a stale selected device can fall back to the default camera', () => {
  const selected = classifyCameraFailure(failure('OverconstrainedError'), { hasDeviceId: true });
  assert.equal(selected.kind, 'constraint');
  assert.equal(selected.autoRetry, true);
  assert.equal(selected.fallbackToDefault, true);
  assert.match(selected.message, /默认镜头/);

  const defaultCamera = classifyCameraFailure(failure('OverconstrainedError'));
  assert.equal(defaultCamera.autoRetry, false);
  assert.equal(defaultCamera.fallbackToDefault, false);
});

test('unexpected video playback or readiness failures get a recovery attempt', () => {
  for (const error of [new Error('视频启动超时'), new Error('无法读取视频'), null]) {
    const result = classifyCameraFailure(error);
    assert.equal(result.kind, 'unexpected');
    assert.equal(result.autoRetry, true);
    assert.equal(result.fallbackToDefault, false);
  }
});

test('cameraTrackLive requires a live video track', () => {
  assert.equal(cameraTrackLive(null), false);
  assert.equal(cameraTrackLive({ getVideoTracks: () => [] }), false);
  assert.equal(cameraTrackLive({ getVideoTracks: () => [{ readyState: 'ended' }] }), false);
  assert.equal(cameraTrackLive({ getVideoTracks: () => [
    { readyState: 'ended' }, { readyState: 'live' },
  ] }), true);
});
