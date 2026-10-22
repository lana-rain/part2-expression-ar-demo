// Face and hand landmarks both use the unmirrored, normalized camera image.
// Keep this geometry independent of the mirrored live-room presentation.
const valid = (point) => Number.isFinite(point?.x) && Number.isFinite(point?.y);

function pointBetween(a, b, amount) {
  return { x: a.x + (b.x - a.x) * amount, y: a.y + (b.y - a.y) * amount };
}

function average(points) {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function mouthRegion(face, width, height) {
  const left = face?.[234];
  const right = face?.[454];
  const top = face?.[10];
  const chin = face?.[152];
  const nose = face?.[1];
  if (![left, right, top, chin, nose].every(valid) || !(width > 0) || !(height > 0)) return null;

  const faceWidth = Math.hypot((right.x - left.x) * width, (right.y - left.y) * height);
  const faceHeight = Math.hypot((chin.x - top.x) * width, (chin.y - top.y) * height);
  if (faceWidth < 16 || faceHeight < 20) return null;

  // Covered lips may be hallucinated by the face tracker. Use the visible nose
  // and chin as the anchor, only blending in plausible lip geometry.
  const predicted = pointBetween(nose, chin, 0.37);
  const corners = [face[61], face[291]];
  const lips = [face[13], face[14]];
  let center = predicted;
  if ([...corners, ...lips].every(valid)) {
    const tracked = average([...corners, ...lips]);
    const deviation = Math.hypot((tracked.x - predicted.x) * width, (tracked.y - predicted.y) * height);
    if (deviation < faceWidth * 0.27) center = pointBetween(predicted, tracked, 0.45);
  }
  return { center, rx: faceWidth * 0.26, ry: faceHeight * 0.17 };
}

function withinMouth(point, mouth, width, height, scale = 1) {
  if (!valid(point)) return false;
  const dx = (point.x - mouth.center.x) * width / (mouth.rx * scale);
  const dy = (point.y - mouth.center.y) * height / (mouth.ry * scale);
  return dx * dx + dy * dy <= 1;
}

// One fingertip touching the lip is not a covered mouth. Require knuckle/palm
// proximity and multiple fingers crossing the mouth area.
export function handCoversMouth(face, hands, sourceWidth, sourceHeight) {
  const mouth = mouthRegion(face, sourceWidth, sourceHeight);
  if (!mouth || !Array.isArray(hands)) return false;

  for (const hand of hands) {
    if (!Array.isArray(hand) || hand.length < 21) continue;
    const palmPoints = [hand[0], hand[5], hand[9], hand[13], hand[17]];
    if (!palmPoints.every(valid)) continue;
    const palm = average(palmPoints);
    if (!withinMouth(palm, mouth, sourceWidth, sourceHeight, 1.75)) continue;

    const fingers = [
      [2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12],
      [13, 14, 15, 16], [17, 18, 19, 20],
    ];
    let coveringFingers = 0;
    let coveringPoints = 0;
    for (const indices of fingers) {
      let fingerPoints = 0;
      for (const index of indices) {
        if (withinMouth(hand[index], mouth, sourceWidth, sourceHeight)) fingerPoints++;
      }
      if (fingerPoints > 0) coveringFingers++;
      coveringPoints += fingerPoints;
    }
    if (coveringFingers >= 2 && coveringPoints >= 3) return true;
  }
  return false;
}
