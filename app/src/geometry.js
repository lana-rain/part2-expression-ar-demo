export function coverLayout(sourceWidth, sourceHeight, stageWidth, stageHeight, zoom = 1, panX = 0, panY = 0) {
  const scale = Math.max(stageWidth / sourceWidth, stageHeight / sourceHeight) * zoom;
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return { width, height, left: (stageWidth - width) / 2 + panX, top: (stageHeight - height) / 2 + panY, scale, stageWidth };
}

export function pointToStage(point, layout, sourceWidth, sourceHeight, mirrored = false) {
  const unmirroredX = layout.left + point.x * sourceWidth * layout.scale;
  return {
    x: mirrored ? layout.stageWidth - unmirroredX : unmirroredX,
    y: layout.top + point.y * sourceHeight * layout.scale,
  };
}

export function faceColliderFromLandmarks(landmarks, layout, sourceWidth, sourceHeight, mirrored = false) {
  if (!landmarks || !landmarks[10] || !landmarks[152] || !landmarks[234] || !landmarks[454]) return null;
  const top = pointToStage(landmarks[10], layout, sourceWidth, sourceHeight, mirrored);
  const chin = pointToStage(landmarks[152], layout, sourceWidth, sourceHeight, mirrored);
  const cheekA = pointToStage(landmarks[234], layout, sourceWidth, sourceHeight, mirrored);
  const cheekB = pointToStage(landmarks[454], layout, sourceWidth, sourceHeight, mirrored);
  const midX = (cheekA.x + cheekB.x) / 2;
  const faceHeight = Math.abs(chin.y - top.y);
  const faceWidth = Math.abs(cheekA.x - cheekB.x);
  if (faceHeight < 12 || faceWidth < 12) return null;
  return {
    x: midX,
    y: top.y + faceHeight * 0.47,
    rx: faceWidth * 0.59,
    ry: faceHeight * 0.62,
    vx: 0,
    vy: 0,
  };
}

export function updateColliderMotion(previous, next, dtSeconds) {
  if (!next) return null;
  if (!previous || dtSeconds <= 0 || dtSeconds > 0.25) return next;
  const maxSpeed = 320;
  next.vx = Math.max(-maxSpeed, Math.min(maxSpeed, (next.x - previous.x) / dtSeconds));
  next.vy = Math.max(-maxSpeed, Math.min(maxSpeed, (next.y - previous.y) / dtSeconds));
  return next;
}
