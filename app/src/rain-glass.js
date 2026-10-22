const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smoothstep = (edge0, edge1, value) => {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

// A few foreground droplets suggest rain striking the viewer's camera glass.
// The main shower and the actual head-contact splashes live in SmileRainScene.
// This is deliberately sparse: a wet lens should add depth, not hide a host.
export class RainGlassLayer {
  constructor({ reducedMotion = false, random = Math.random } = {}) {
    this.reducedMotion = reducedMotion;
    this.random = random;
    this.maxDrops = reducedMotion ? 8 : 18;
    this.maxTrails = reducedMotion ? 0 : 4;
    this.reset();
  }

  reset() {
    this.drops = [];
    this.spawnCarry = 0;
    this.width = 1;
    this.height = 1;
  }

  faceOpacity(x, y, collider) {
    if (!collider) return 1;
    const dx = (x - collider.x) / Math.max(1, collider.rx * 1.12);
    const dy = (y - collider.y) / Math.max(1, collider.ry * 1.08);
    const distance = Math.hypot(dx, dy);
    // Feather each individual bead, rather than cutting a visible head-shaped
    // hole. Eye and mouth detail remain legible when a droplet crosses them.
    return 0.38 + 0.62 * smoothstep(0.42, 1.32, distance);
  }

  addDrop(width, height) {
    if (width < 40 || height < 40 || this.drops.length >= this.maxDrops) return;
    const random = this.random;
    const scale = clamp(width / 390, 0.85, 1.45);
    let x = width * (0.045 + random() * 0.91);
    let y = height * (0.12 + random() * 0.68);
    // Closely spaced lens beads meet, pool and become one heavier runnel.
    if (this.drops.length && random() < 0.22) {
      const near = this.drops[Math.floor(random() * this.drops.length)];
      x = clamp(near.x + (random() - 0.5) * near.radius * 2.2, 5, width - 5);
      y = clamp(near.y + (random() - 0.5) * near.radius * 2.2, 5, height - 5);
    }
    const radius = (2.8 + random() * 4.6) * scale;
    const flowing = !this.reducedMotion && radius > 4.5 * scale
      && this.drops.filter((drop) => drop.flowing).length < this.maxTrails
      && random() < 0.42;
    const drop = {
      x, y, startX: x, startY: y, age: 0,
      radius,
      life: flowing ? 2.1 + random() * 0.6 : 0.95 + random() * 0.75,
      speed: (52 + random() * 56) * scale,
      drift: (random() - 0.5) * 10 * scale,
      flowing,
      seed: random() * Math.PI * 2,
      track: [{ x, y }],
    };
    const existing = this.drops.find((candidate) =>
      Math.hypot(candidate.x - drop.x, candidate.y - drop.y)
      < candidate.radius + drop.radius + 1.5);
    if (existing) {
      const ownArea = existing.radius ** 2;
      const newArea = drop.radius ** 2;
      existing.x = (existing.x * ownArea + drop.x * newArea) / (ownArea + newArea);
      existing.y = (existing.y * ownArea + drop.y * newArea) / (ownArea + newArea);
      existing.radius = Math.min(9 * scale, Math.sqrt(ownArea + newArea));
      existing.life = Math.max(existing.life, existing.age + 1.3);
      existing.speed = Math.max(existing.speed, drop.speed);
      if (!this.reducedMotion && (existing.flowing
        || this.drops.filter((item) => item.flowing).length < this.maxTrails)) {
        existing.flowing = true;
      }
      return;
    }
    this.drops.push(drop);
  }

  // Moving rivulets pick up stationary beads they meet. The area-weighted
  // radius keeps the combined bead believable instead of suddenly doubling.
  joinDrops() {
    for (let i = 0; i < this.drops.length; i++) {
      const moving = this.drops[i];
      if (!moving.flowing) continue;
      for (let j = this.drops.length - 1; j >= 0; j--) {
        if (j === i) continue;
        const bead = this.drops[j];
        if (Math.hypot(moving.x - bead.x, moving.y - bead.y)
          > (moving.radius + bead.radius) * 0.82) continue;
        const ownArea = moving.radius ** 2;
        const newArea = bead.radius ** 2;
        moving.x = (moving.x * ownArea + bead.x * newArea) / (ownArea + newArea);
        moving.y = (moving.y * ownArea + bead.y * newArea) / (ownArea + newArea);
        moving.radius = Math.min(11 * clamp(this.width / 390, 0.85, 1.45),
          Math.sqrt(ownArea + newArea));
        moving.speed = Math.max(moving.speed, bead.speed) * 1.08;
        moving.life = Math.max(moving.life, moving.age + 0.8);
        this.drops.splice(j, 1);
        if (j < i) i--;
      }
    }
  }

  update(dt, rainGate, width, height) {
    const elapsed = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.05);
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    const gate = clamp(rainGate || 0, 0, 1);
    if (gate > 0.08) {
      const rate = (this.reducedMotion ? 3.2 : 9.2) * gate;
      this.spawnCarry += rate * elapsed;
      const count = Math.min(2, Math.floor(this.spawnCarry));
      this.spawnCarry -= count;
      for (let i = 0; i < count; i++) this.addDrop(this.width, this.height);
    } else {
      this.spawnCarry = 0;
    }
    for (const drop of this.drops) {
      drop.age += elapsed * (gate < 0.08 ? 1.5 : 1);
      if (drop.flowing && drop.age > 0.22) {
        const acceleration = smoothstep(0.22, 1.2, drop.age);
        drop.y += drop.speed * elapsed * (0.45 + acceleration * 0.7);
        drop.x += drop.drift * elapsed
          + Math.sin(drop.age * 5.4 + drop.seed) * elapsed * 1.8;
        const track = drop.track ?? (drop.track = [{ x: drop.startX, y: drop.startY }]);
        if (Math.hypot(drop.x - track.at(-1).x, drop.y - track.at(-1).y) > 7) {
          track.push({ x: drop.x, y: drop.y });
          if (track.length > 13) track.shift();
        }
      }
    }
    this.joinDrops();
    this.drops = this.drops.filter((drop) =>
      drop.age < drop.life && drop.y - drop.radius < this.height);
  }

  draw(ctx, collider = null) {
    if (!this.drops.length) return;
    ctx.save();
    ctx.lineCap = 'round';
    for (const drop of this.drops) {
      const opening = smoothstep(0, 0.08, drop.age);
      const closing = 1 - smoothstep(drop.life - 0.48, drop.life, drop.age);
      const face = this.faceOpacity(drop.x, drop.y, collider);
      const alpha = opening * closing * face;
      if (alpha < 0.01) continue;
      const x = drop.x;
      const y = drop.y;
      // The bead visibly gathers out of an impact, rather than appearing as
      // a fully formed oval in its first frame.
      const r = drop.radius * (0.4 + 0.6 * smoothstep(0.02, 0.2, drop.age));

      // On a vertical window, impact produces a tiny star of water beads and
      // a short incoming streak, not a pond-like concentric ripple.
      if (!this.reducedMotion && drop.age < 0.32) {
        const progress = drop.age / 0.32;
        const burst = Math.sin(Math.PI * progress) * (1 - progress * 0.25);
        ctx.globalAlpha = alpha * (1 - progress) * 0.65;
        ctx.strokeStyle = '#f1fcff';
        ctx.lineWidth = Math.max(0.8, r * 0.21);
        ctx.beginPath();
        ctx.moveTo(x - r * 0.12, y - r - 5 - (1 - progress) * 16);
        ctx.lineTo(x - r * 0.04, y - r * 0.56);
        ctx.stroke();
        for (let i = 0; i < 5; i++) {
          const angle = drop.seed + i * (Math.PI * 2 / 5);
          const distance = r * (0.8 + progress * (1.5 + (i % 2) * 0.45));
          const sx = x + Math.cos(angle) * distance;
          const sy = y + Math.sin(angle) * distance * 0.62;
          ctx.globalAlpha = alpha * burst * (i % 2 ? 0.62 : 0.82);
          ctx.fillStyle = i % 2 ? '#b4e9f5' : '#f5fdff';
          ctx.beginPath();
          ctx.arc(sx, sy, Math.max(0.7, r * (i % 2 ? 0.16 : 0.23)), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (drop.flowing && drop.age > 0.3) {
        const track = drop.track?.length > 1 ? drop.track
          : [{ x: drop.startX, y: drop.startY }, { x, y }];
        if (y - track[0].y > 4) {
          // A recorded path follows the bead's small sideways wander. Its
          // center stays clear; just the dark refraction and bright edge show.
          ctx.beginPath();
          ctx.moveTo(track[0].x, track[0].y);
          for (let i = 1; i < track.length; i++) ctx.lineTo(track[i].x, track[i].y);
          ctx.lineTo(x, y);
          ctx.globalAlpha = alpha * 0.26;
          ctx.strokeStyle = '#2e6687';
          ctx.lineWidth = Math.max(2.2, r * 0.58);
          ctx.stroke();
          ctx.globalAlpha = alpha * 0.58;
          ctx.strokeStyle = '#e7faff';
          ctx.lineWidth = Math.max(0.9, r * 0.18);
          ctx.stroke();
          // Small beads caught in the runnel make the downward travel legible.
          for (let i = Math.max(0, track.length - 5); i < track.length - 1; i += 2) {
            ctx.globalAlpha = alpha * 0.42;
            ctx.fillStyle = '#e5faff';
            ctx.beginPath();
            ctx.arc(track[i].x + r * 0.15, track[i].y, Math.max(0.65, r * 0.16),
              0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // A hanging teardrop has a narrow upper shoulder and heavy lower edge;
      // it remains translucent over eyes and mouth.
      const ry = r * (drop.flowing ? 1.2 : 0.9);
      ctx.globalAlpha = alpha * 0.3;
      ctx.fillStyle = '#b3e5f0';
      ctx.beginPath();
      ctx.moveTo(x, y - ry * 1.18);
      ctx.quadraticCurveTo(x + r * 0.98, y - ry * 0.58, x + r * 0.84, y + ry * 0.3);
      ctx.quadraticCurveTo(x + r * 0.62, y + ry * 1.06, x, y + ry * 0.94);
      ctx.quadraticCurveTo(x - r * 0.8, y + ry * 0.94, x - r * 0.87, y + ry * 0.2);
      ctx.quadraticCurveTo(x - r * 0.82, y - ry * 0.56, x, y - ry * 1.18);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = alpha * 0.49;
      ctx.strokeStyle = '#356c8e';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.ellipse(x + 0.65, y + 0.7, r * 0.85, ry * 0.94,
        -0.07, Math.PI * 0.08, Math.PI * 0.99);
      ctx.stroke();
      ctx.globalAlpha = alpha * 0.78;
      ctx.strokeStyle = '#f5fdff';
      ctx.lineWidth = Math.max(0.9, r * 0.19);
      ctx.beginPath();
      ctx.ellipse(x - 0.7, y - 0.7, r * 0.64, r * 0.73,
        -0.25, Math.PI * 1.05, Math.PI * 1.75);
      ctx.stroke();
      ctx.globalAlpha = alpha * 0.54;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x - r * 0.27, y - r * 0.38, Math.max(0.7, r * 0.13), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
