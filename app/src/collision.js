export function sweepEllipse(particle, oldX, oldY, dt, collider, restitution = 0.68) {
  if (!collider || !dt) return false;
  const rx = collider.rx + particle.radius;
  const ry = collider.ry + particle.radius;
  const sx = (oldX - collider.x) / rx;
  const sy = (oldY - collider.y) / ry;
  const dx = (particle.x - oldX) / rx;
  const dy = (particle.y - oldY) / ry;
  const a = dx * dx + dy * dy;
  const b = 2 * (sx * dx + sy * dy);
  const c = sx * sx + sy * sy - 1;
  let hitT = null;

  if (c <= 0) {
    hitT = 0;
  } else if (a > 1e-10) {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const root = (-b - Math.sqrt(disc)) / (2 * a);
      if (root >= 0 && root <= 1) hitT = root;
    }
  }
  if (hitT == null) return false;

  let hitX = oldX + (particle.x - oldX) * hitT;
  let hitY = oldY + (particle.y - oldY) * hitT;
  if (c <= 0) {
    // If the head moved over the particle, first project the particle center
    // to the expanded ellipse boundary. A tiny outward nudge alone leaves it inside.
    let ux = sx;
    let uy = sy;
    const length = Math.hypot(ux, uy);
    if (length < 1e-8) {
      ux = collider.vx ? Math.sign(collider.vx) : 1;
      uy = 0;
    } else {
      ux /= length;
      uy /= length;
    }
    hitX = collider.x + ux * rx;
    hitY = collider.y + uy * ry;
  }
  let nx = (hitX - collider.x) / (rx * rx);
  let ny = (hitY - collider.y) / (ry * ry);
  let normalLength = Math.hypot(nx, ny);
  if (normalLength < 1e-8) {
    nx = -particle.vx;
    ny = -particle.vy;
    normalLength = Math.hypot(nx, ny) || 1;
  }
  nx /= normalLength;
  ny /= normalLength;

  const headVx = Math.max(-320, Math.min(320, collider.vx || 0));
  const headVy = Math.max(-320, Math.min(320, collider.vy || 0));
  const relativeX = particle.vx - headVx;
  const relativeY = particle.vy - headVy;
  const inward = relativeX * nx + relativeY * ny;
  if (inward >= 0 && c > 0) return false;
  if (inward < 0) {
    particle.vx = relativeX - (1 + restitution) * inward * nx + headVx;
    particle.vy = relativeY - (1 + restitution) * inward * ny + headVy;
  }
  particle.x = hitX + nx * (particle.radius + 1.5) + particle.vx * dt * (1 - hitT);
  particle.y = hitY + ny * (particle.radius + 1.5) + particle.vy * dt * (1 - hitT);
  particle.collided = true;
  particle.hitX = hitX;
  particle.hitY = hitY;
  return true;
}
