/** Classify camera acquisition and playback failures for the input sidebar. */
export function classifyCameraFailure(error, { hasDeviceId = false, offerLocalhost = false } = {}) {
  const name = error?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return {
      kind: 'permission',
      message: offerLocalhost
        ? '当前地址摄像头被拒绝 · 请切换到 localhost 后重试'
        : '摄像头权限被拒绝 · 请允许相机后重试',
      autoRetry: false,
      fallbackToDefault: false,
    };
  }

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return {
      kind: 'missing',
      message: '未找到可用摄像头 · 连接设备后重试',
      autoRetry: false,
      fallbackToDefault: false,
    };
  }

  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return {
      kind: 'constraint',
      message: hasDeviceId
        ? '所选摄像头不可用 · 正在尝试默认镜头'
        : '摄像头条件不匹配 · 请更换镜头后重试',
      autoRetry: Boolean(hasDeviceId),
      fallbackToDefault: Boolean(hasDeviceId),
    };
  }

  if (name === 'NotReadableError' || name === 'AbortError') {
    return {
      kind: 'busy',
      message: '摄像头暂不可用 · 正在自动重试',
      autoRetry: true,
      fallbackToDefault: false,
    };
  }

  return {
    kind: 'unexpected',
    message: '摄像头连接中断 · 正在自动重试',
    autoRetry: true,
    fallbackToDefault: false,
  };
}

/** A stream is usable only while at least one video track is live. */
export function cameraTrackLive(stream) {
  return Boolean(stream?.getVideoTracks?.().some((track) => track.readyState === 'live'));
}
