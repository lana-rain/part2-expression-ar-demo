import { publicAssetUrl } from './asset-url.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const easeOut = (value) => 1 - Math.pow(1 - clamp(value, 0, 1), 3);
const easeInOut = (value) => {
  const x = clamp(value, 0, 1);
  return x * x * (3 - 2 * x);
};

export const RAIN_TIMING = Object.freeze({
  approachEnd: 2150, mergeEnd: 2750, lightningAt: 2820,
  rainStart: 3000, rainFull: 3450, neutralGraceMs: 650,
  releaseDurationMs: 900,
});

// An authored weather cue: the recognizer only starts it. The camera frame is
// never sent to a generator, and its timing does not depend on frame rate.
export class SmileRainScene {
  constructor({ reducedMotion = false } = {}) {
    this.reducedMotion = reducedMotion;
    this.reset();
    this.cloudSprite = null;
    this.featheredCloudSprite = null;
    if (typeof Image !== 'undefined') {
      this.cloudSprite = new Image();
      this.cloudSprite.decoding = 'async';
      this.cloudSprite.src = publicAssetUrl('effects/smile-rain-cloud-playful-v4.png');
    }
  }

  reset() {
    this.armed = true;
    this.smiling = false;
    this.hasFace = false;
    this.lowSince = null;
    this.onsetAt = null;
    this.releaseAt = null;
    this.releaseEndAt = null;
    this.releaseRainFrom = 0;
    this.faceLostDuringCue = false;
    this.openCount = 0;
    this.visibility = 0;
    this.anchor = null;
    this.cloudWidth = 480;
    this.cloudHeight = 155;
    this.cramped = false;
    this.hairline = null;
    this.beads = [];
    this.hairRuns = [];
    this.lastImpactAt = -Infinity;
    this.lastHeroImpactAt = -Infinity;
    this.lastHairRunAt = -Infinity;
  }

  timeline() {
    return this.reducedMotion
      ? { approachEnd: 150, mergeEnd: 300, lightningAt: -1,
        rainStart: 320, rainFull: 680, neutralGraceMs: 650,
        releaseDurationMs: 500 }
      : RAIN_TIMING;
  }

  get releaseDurationMs() {
    return this.timeline().releaseDurationMs;
  }

  elapsed(now) {
    return this.onsetAt === null ? -1 : now - this.onsetAt;
  }

  baseRainGate(now) {
    const elapsed = this.elapsed(now);
    const timing = this.timeline();
    if (elapsed < timing.rainStart) return 0;
    return easeOut((elapsed - timing.rainStart)
      / (timing.rainFull - timing.rainStart));
  }

  // The caller can end the cue when another confirmed expression takes over.
  // Returning the actual end lets the outer effect gate block the next cue
  // until the clouds and falling drops have had time to clear.
  requestRelease(now) {
    if (this.onsetAt === null || !Number.isFinite(now)) return null;
    if (this.releaseEndAt !== null) return this.releaseEndAt;
    this.releaseRainFrom = this.baseRainGate(now);
    this.releaseAt = now;
    this.releaseEndAt = now + this.releaseDurationMs;
    this.armed = false;
    return this.releaseEndAt;
  }

  releaseFade(now) {
    return this.releaseAt === null ? 1
      : 1 - easeInOut((now - this.releaseAt) / this.releaseDurationMs);
  }

  hairTop(collider) {
    // The tracked face ellipse begins at the forehead. Extend it upward for
    // a lightweight visual hair cap; this is not hair segmentation.
    return collider.y - collider.ry * 1.34;
  }

  crownPoint(collider, u) {
    const edge = clamp(u, -0.98, 0.98);
    return {
      x: collider.x + edge * collider.rx * 1.03,
      y: this.hairTop(collider) + collider.ry * 0.12
        + collider.ry * 0.35 * (1 - Math.sqrt(1 - edge * edge)),
    };
  }

  update(now, intensity, collider, dt, width, height) {
    const smiling = intensity > 0.25 && Boolean(collider);
    this.hasFace = Boolean(collider);
    if (smiling) {
      if (this.armed && (this.onsetAt === null
        || (this.releaseEndAt !== null && now >= this.releaseEndAt))) {
        this.onsetAt = now;
        this.releaseAt = null;
        this.releaseEndAt = null;
        this.releaseRainFrom = 0;
        this.faceLostDuringCue = false;
        this.openCount++;
        this.armed = false;
        this.beads.length = 0;
      }
      this.lowSince = null;
    } else {
      if (this.lowSince === null) this.lowSince = now;
      if (!collider && this.onsetAt !== null) this.faceLostDuringCue = true;
      if (this.onsetAt !== null && this.releaseAt === null
        && (!collider || now - this.lowSince >= this.timeline().neutralGraceMs)) {
        this.requestRelease(now);
      }
      if (this.releaseEndAt !== null && now >= this.releaseEndAt) this.armed = true;
    }
    this.smiling = smiling;

    // The approach and lightning happen once; the settled storm remains over
    // the tracked head while the smile is sustained. A short neutral wobble
    // does not restart the clouds. Losing the face clears them immediately.
    const active = this.hasFace && !this.faceLostDuringCue && this.onsetAt !== null
      && (this.releaseEndAt === null || now < this.releaseEndAt);
    const desired = active ? 1 : 0;
    const follow = collider ? 9 : 13;
    this.visibility += (desired - this.visibility) * (1 - Math.exp(-dt * follow));
    if (this.visibility < 0.005) this.visibility = 0;
    if (collider) {
      const safeTop = Math.max(126, height * 0.15);
      const hairline = this.hairTop(collider);
      const cramped = hairline < safeTop - 8;
      // The storm occupies the top of the whole live frame. Face tracking
      // determines its lower edge, not the width of the cloud canopy.
      const cloudWidth = clamp(width * 1.26, 350, 820);
      // A high-framed host leaves little room above the crown. Flatten the
      // panoramic bank just enough to reveal its sculpted upper volumes rather
      // than cutting almost the entire cloud off at the top of the viewport.
      const cloudHeight = clamp(Math.min(cloudWidth * 0.43, hairline + 18),
        cloudWidth * 0.25, cloudWidth * 0.43);
      const target = {
        x: clamp(collider.x, width * 0.35, width * 0.65),
        // The underside meets the crown; only the top of the hairstyle can
        // tuck under it. The face remains clear, even in a tight portrait.
        y: clamp(hairline + 8 - cloudHeight * 0.54,
          -cloudHeight * 0.4, height * 0.18),
      };
      this.cramped = cramped;
      this.hairline = hairline;
      if (!this.anchor) {
        this.anchor = target;
        this.cloudWidth = cloudWidth;
        this.cloudHeight = cloudHeight;
      } else {
        const blend = 1 - Math.exp(-dt * 10);
        this.anchor.x += (target.x - this.anchor.x) * blend;
        this.anchor.y += (target.y - this.anchor.y) * blend;
        this.cloudWidth += (cloudWidth - this.cloudWidth) * (1 - Math.exp(-dt * 8));
        this.cloudHeight += (cloudHeight - this.cloudHeight) * (1 - Math.exp(-dt * 8));
      }
    } else if (this.visibility === 0) {
      this.anchor = null;
      this.hairline = null;
      this.beads.length = 0;
    }
    for (const bead of this.beads) bead.age += dt;
    this.beads = this.beads.filter((bead) => bead.age < bead.life);
    for (const run of this.hairRuns) run.age += dt;
    this.hairRuns = this.hairRuns.filter((run) => run.age < run.life);
  }

  phase(now) {
    if (!this.hasFace || this.faceLostDuringCue || this.onsetAt === null
      || this.visibility < 0.01) return 'idle';
    const elapsed = this.elapsed(now);
    const timing = this.timeline();
    if (this.releaseAt !== null) {
      return now < this.releaseEndAt ? 'release' : 'idle';
    }
    if (elapsed < timing.approachEnd) return 'approach';
    if (elapsed < timing.mergeEnd) return 'merge';
    if (elapsed < timing.rainStart) return this.reducedMotion ? 'merge' : 'lightning';
    return 'rain';
  }

  rainGate(now) {
    if (!this.hasFace || this.faceLostDuringCue || this.onsetAt === null) return 0;
    return (this.releaseAt === null ? this.baseRainGate(now) : this.releaseRainFrom)
      * this.releaseFade(now);
  }

  cloudPositions(now, width) {
    if (!this.anchor || this.onsetAt === null) return null;
    const elapsed = Math.max(0, this.elapsed(now));
    const timing = this.timeline();
    const approach = easeInOut(elapsed / timing.approachEnd);
    const merge = easeInOut((elapsed - timing.approachEnd)
      / (timing.mergeEnd - timing.approachEnd));
    const w = this.cloudWidth;
    // Two complete small clouds meet at the crown. Their centers come close
    // enough to overlap before the larger canopy takes over; there is never
    // a pair of sliced image edges to join at the middle.
    const targetGap = w * (0.235 - merge * 0.155);
    const leftTarget = this.anchor.x - targetGap;
    const rightTarget = this.anchor.x + targetGap;
    const leftStart = -w * 0.3;
    const rightStart = width + w * 0.3;
    return {
      leftX: leftStart + (leftTarget - leftStart) * approach,
      rightX: rightStart + (rightTarget - rightStart) * approach,
      pairAlpha: 1 - merge,
      centerAlpha: merge,
      merge,
    };
  }

  getSpawnPoint(random, width, collider) {
    if (!this.anchor || this.visibility < 0.14 || !collider) return null;
    // Most drops cross the entire frame. A second, denser stream aims at the
    // tracked crown, where catchDrop turns a hit into a visible splash.
    const broad = random() < 0.58;
    const spread = collider.rx * 1.18;
    return {
      x: broad ? random() * width
        : clamp(collider.x + (random() - 0.5) * spread * 2, 0, width),
      y: Math.max(-18, Math.min(this.anchor.y + this.cloudWidth * 0.18,
        this.hairTop(collider) - 38) + random() * 12 - 6),
    };
  }

  catchDrop(drop, previousY, collider, now) {
    if (!collider || this.visibility < 0.28 || drop.depth === 0) return false;
    const rx = collider.rx * 1.03;
    const u = (drop.x - collider.x) / rx;
    if (Math.abs(u) > 0.95) return false;
    const hairline = this.crownPoint(collider, u).y;
    // The first drop can be born just inside a low cloud overlapping hair.
    if (previousY > hairline + Math.min(90, collider.ry * 0.72) || drop.y < hairline) return false;
    if (now - this.lastImpactAt >= 55 && this.beads.length < 28) {
      const hero = now - this.lastHeroImpactAt >= 180;
      this.beads.push({
        u, side: u < 0 ? -1 : 1, age: 0,
        hero,
        splashSeed: Math.random(),
        life: hero ? 0.5 + Math.random() * 0.12 : 0.38 + Math.random() * 0.12,
        size: hero ? 1.05 + Math.random() * 0.35 : 0.7 + Math.random() * 0.3,
      });
      this.lastImpactAt = now;
      if (hero) this.lastHeroImpactAt = now;
      // Only a real hit near the side of the crown can feed a brief runnel
      // down the outside of the hair. No water is painted across facial detail.
      if (hero && Math.abs(u) > 0.68 && this.hairRuns.length < 3
        && now - this.lastHairRunAt > 350) {
        this.hairRuns.push({ u, side: Math.sign(u), age: 0,
          life: 1.05 + Math.random() * 0.25 });
        this.lastHairRunAt = now;
      }
    }
    return true;
  }

  cloudArt() {
    if (!this.cloudSprite?.complete || !this.cloudSprite.naturalWidth) return null;
    if (this.featheredCloudSprite) return this.featheredCloudSprite;
    if (typeof document === 'undefined') return this.cloudSprite;
    const art = document.createElement('canvas');
    art.width = this.cloudSprite.naturalWidth;
    art.height = this.cloudSprite.naturalHeight;
    const brush = art.getContext('2d');
    if (!brush) return this.cloudSprite;
    brush.drawImage(this.cloudSprite, 0, 0);
    brush.globalCompositeOperation = 'destination-in';
    const feather = brush.createLinearGradient(0, art.height * 0.55, 0, art.height);
    feather.addColorStop(0, '#fff');
    feather.addColorStop(0.5, 'rgba(255, 255, 255, .58)');
    feather.addColorStop(1, 'rgba(255, 255, 255, 0)');
    brush.fillStyle = feather;
    brush.fillRect(0, 0, art.width, art.height);
    this.featheredCloudSprite = art;
    return art;
  }

  drawSprite(ctx, x, y, w, alpha, flip = false, premium = false, elapsed = 0,
    smallCloud = false) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    // A gentle puff keeps the illustrated bank alive without rubbery wobble.
    if (!this.reducedMotion) {
      ctx.scale(1 + Math.sin(elapsed / 620) * 0.009,
        1 + Math.sin(elapsed / 790 + (flip ? 1.4 : 0)) * 0.015);
    }
    ctx.globalAlpha = clamp(alpha, 0, 1);
    const h = smallCloud ? w * 0.46
      : this.cloudHeight * (w / Math.max(1, this.cloudWidth));
    const art = this.cloudArt();
    if (art) {
      ctx.shadowColor = 'rgba(63, 53, 112, .16)';
      ctx.shadowBlur = premium ? 11 : 7;
      ctx.shadowOffsetY = 2;
      // Every cloud uses the entire feathered illustration. Scaling a full
      // silhouette preserves its soft outer contour during the approach.
      ctx.drawImage(art, -w * 0.56, -h * 0.5, w * 1.12, h);
    } else {
      const cloud = ctx.createLinearGradient(0, -h * 0.5, 0, h * 0.5);
      cloud.addColorStop(0, '#ffffff');
      cloud.addColorStop(0.5, '#e3f8ff');
      cloud.addColorStop(1, '#86c8e5');
      ctx.fillStyle = cloud;
      ctx.strokeStyle = '#6aa9cc';
      ctx.lineWidth = Math.max(2, w * 0.006);
      ctx.beginPath();
      ctx.ellipse(-w * 0.25, 0, w * 0.23, h * 0.36, 0, 0, Math.PI * 2);
      ctx.ellipse(0, -h * 0.1, w * 0.27, h * 0.46, 0, 0, Math.PI * 2);
      ctx.ellipse(w * 0.27, 0, w * 0.22, h * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  drawCloud(ctx, width, height, now, premium = false) {
    if (!this.hasFace || this.faceLostDuringCue || !this.anchor
      || this.visibility < 0.01) return;
    const elapsed = this.elapsed(now);
    const timing = this.timeline();
    if (elapsed < 0 || (this.releaseEndAt !== null && now >= this.releaseEndAt)) return;
    const positions = this.cloudPositions(now, width);
    const { x, y } = this.anchor;
    const w = this.cloudWidth;
    const hover = this.reducedMotion ? 0 : Math.sin(elapsed / 330) * 2.4;
    const fade = this.visibility * this.releaseFade(now);
    const flash = this.reducedMotion || this.releaseAt !== null ? 0 : Math.max(
      0,
      1 - Math.abs(elapsed - timing.lightningAt) / 76,
      0.58 * (1 - Math.abs(elapsed - timing.lightningAt - 106) / 55),
    );

    ctx.save();
    const veil = fade * easeInOut(elapsed / Math.max(1, timing.approachEnd));
    if (veil > 0) {
      const storm = ctx.createLinearGradient(0, 0, 0, Math.min(height * 0.4, 310));
      storm.addColorStop(0, 'rgba(42, 31, 82, .31)');
      storm.addColorStop(0.56, 'rgba(91, 76, 137, .09)');
      storm.addColorStop(1, 'rgba(91, 76, 137, 0)');
      ctx.globalAlpha = veil * 0.48;
      ctx.fillStyle = storm;
      ctx.fillRect(0, 0, width, Math.min(height * 0.4, 310));
    }
    // Two independent clouds travel from both edges, then dissolve into the
    // full-width canopy. The crossfade hides any overlap seam as they meet.
    if (!this.reducedMotion && elapsed < timing.mergeEnd) {
      for (const [cloudX, side] of [[positions.leftX, -1], [positions.rightX, 1]]) {
        ctx.globalAlpha = fade * positions.pairAlpha * 0.15;
        ctx.fillStyle = '#d2c6fb';
        ctx.beginPath();
        ctx.ellipse(cloudX + side * w * 0.37, y + hover + 12,
          w * 0.15, w * 0.022, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const pairScale = this.reducedMotion ? 0.41 : 0.4 + positions.merge * 0.04;
    this.drawSprite(ctx, positions.leftX, y + 7 + hover, w * pairScale,
      fade * positions.pairAlpha, false, premium, elapsed, true);
    this.drawSprite(ctx, positions.rightX, y - 6 - hover, w * pairScale * 0.94,
      fade * positions.pairAlpha, true, premium, elapsed + 350, true);
    const mergePop = this.reducedMotion ? 1 : 1 + 0.045 * Math.sin(Math.PI * positions.merge);
    this.drawSprite(ctx, x, y + hover * 0.4, w * 1.08 * mergePop,
      fade * positions.centerAlpha, false, premium, elapsed);
    // A very shallow, translucent bank feathers the sprite's lower edge at
    // tight camera crops. It stops above the brow rather than fogging the face.
    if (positions.centerAlpha > 0 && this.hairline !== null) {
      const seamY = Math.min(y + this.cloudHeight * 0.37, this.hairline + 7);
      const feather = ctx.createLinearGradient(0, seamY - 12, 0, seamY + 18);
      feather.addColorStop(0, 'rgba(197, 188, 229, 0)');
      feather.addColorStop(0.44, 'rgba(197, 188, 229, .13)');
      feather.addColorStop(1, 'rgba(197, 188, 229, 0)');
      ctx.globalAlpha = fade * positions.centerAlpha * 0.58;
      ctx.fillStyle = feather;
      ctx.beginPath();
      ctx.ellipse(x, seamY + 2, w * 0.47, 15, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (flash > 0) {
      // The cloud lights from within before one restrained strike appears.
      const inside = ctx.createRadialGradient(
        x, y + this.cloudHeight * 0.03, 2,
        x, y + this.cloudHeight * 0.03, w * 0.37);
      inside.addColorStop(0, 'rgba(255, 250, 241, .62)');
      inside.addColorStop(0.38, 'rgba(228, 214, 255, .25)');
      inside.addColorStop(1, 'rgba(228, 214, 255, 0)');
      ctx.globalAlpha = flash * fade * 0.78;
      ctx.fillStyle = inside;
      ctx.fillRect(x - w * 0.4, y - this.cloudHeight * 0.36,
        w * 0.8, this.cloudHeight * 0.72);
      ctx.globalAlpha = flash * fade * 0.085;
      ctx.fillStyle = '#f5eeff';
      ctx.fillRect(0, 0, width, height);
      // Strike beside the tracked head so the face remains readable.
      const side = x > width / 2 ? -1 : 1;
      const boltX = x + side * width * 0.37;
      const boltY = Math.max(55, y + w * 0.16);
      const boltEnd = Math.min(height * 0.49,
        Math.max(boltY + 104, (this.hairline ?? height * 0.22) + 70));
      const step = (boltEnd - boltY) / 5;
      ctx.globalAlpha = flash * fade * 0.92;
      ctx.strokeStyle = '#fffafa';
      ctx.shadowColor = '#d2bbff';
      ctx.shadowBlur = 17;
      ctx.lineWidth = 3.3;
      ctx.beginPath();
      ctx.moveTo(boltX, boltY);
      ctx.lineTo(boltX + side * 10, boltY + step);
      ctx.lineTo(boltX + side * 3, boltY + step * 2);
      ctx.lineTo(boltX + side * 20, boltY + step * 3);
      ctx.lineTo(boltX + side * 10, boltY + step * 4);
      ctx.lineTo(boltX + side * 24, boltEnd);
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(boltX + side * 20, boltY + step * 3);
      ctx.lineTo(boltX + side * 36, boltY + step * 3.45);
      ctx.lineTo(boltX + side * 28, boltY + step * 4.15);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawBeads(ctx, collider) {
    if (!collider || !this.beads.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const bead of this.beads) {
      const progress = clamp(bead.age / bead.life, 0, 1);
      const u = clamp(bead.u + bead.side * progress * 0.1, -0.98, 0.98);
      const crown = this.crownPoint(collider, u);
      const x = crown.x + bead.side * progress * 3;
      const y = crown.y + progress * progress * 18;
      ctx.globalAlpha = (1 - progress) * 0.43 * this.visibility;
      ctx.fillStyle = '#edf4ff';
      ctx.beginPath();
      ctx.ellipse(x, y, bead.size * 0.7, bead.size * 1.12, 0, 0, Math.PI * 2);
      ctx.fill();
      const splashDuration = bead.hero ? 0.34 : 0.25;
      if (bead.age < splashDuration) {
        const impact = this.crownPoint(collider, bead.u);
        if (bead.hero && bead.age < 0.18) {
          const ripple = bead.age / 0.18;
          const radius = 4 + ripple * 10;
          ctx.globalAlpha = Math.pow(1 - ripple, 0.8) * 0.38 * this.visibility;
          ctx.strokeStyle = '#e4efff';
          ctx.lineWidth = 0.95 - ripple * 0.23;
          // Two tiny interrupted crescents spread from this one impact only.
          // The 14 px cap and short lifetime prevent a traced hair boundary.
          for (const [start, end] of [[1.05, 1.38], [1.62, 1.95]]) {
            ctx.beginPath();
            ctx.ellipse(impact.x, impact.y + 2, radius, radius * 0.32,
              0, Math.PI * start, Math.PI * end);
            ctx.stroke();
          }
        }
        // Every recorded hair impact throws short-lived, glistening beads.
        // Their staggered arcs stay within a small patch above the crown;
        // only the less frequent hero impacts use a denser ten-bead spray.
        const count = bead.hero ? 10 : 6;
        ctx.shadowColor = '#b9ddff';
        ctx.shadowBlur = bead.hero ? 3.5 : 2.5;
        for (let i = 0; i < count; i++) {
          const delay = (i % 3) * 0.012;
          const flight = clamp((bead.age - delay) / (splashDuration - delay), 0, 1);
          if (bead.age < delay || flight >= 1) continue;
          const angle = -Math.PI * (0.94 - i * 0.88 / (count - 1)
            + (bead.splashSeed - 0.5) * 0.055);
          const span = 10 + (i % 4) * 2.2 + bead.splashSeed * 2;
          const rise = (11 + (i % 3) * 3 + bead.splashSeed * 2)
            * (0.42 + 0.58 * -Math.sin(angle));
          const diameter = (bead.hero ? 1.05 : 0.9)
            + (i % 4) * 0.26 + bead.splashSeed * 0.18;
          const bubbleX = impact.x + Math.cos(angle) * span * flight;
          const bubbleY = impact.y - rise * Math.sin(Math.PI * flight)
            + 4 * flight * flight;
          ctx.globalAlpha = Math.pow(1 - flight, 0.6) * 0.91 * this.visibility;
          ctx.fillStyle = i % 3 === 0 ? '#d8edff' : '#f8fbff';
          ctx.beginPath();
          ctx.ellipse(bubbleX, bubbleY, diameter, diameter * (1 + (i % 2) * 0.15),
            0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.shadowBlur = 0;
        if (bead.age < 0.09) {
          ctx.globalAlpha = (1 - bead.age / 0.09) * 0.66 * this.visibility;
          ctx.beginPath();
          ctx.ellipse(impact.x, impact.y, 1.8, 0.9, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  drawWetHair(ctx, collider, rainLevel, now) {
    if (!collider || rainLevel < 0.08
      || (!this.beads.length && !this.hairRuns.length)) return;
    const strength = clamp(rainLevel, 0, 1);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#e9efff';
    // Only a few impact-driven, hair-length glints appear inside the crown.
    // Nothing traces the ellipse perimeter or draws permanent temple lines.
    for (const [index, bead] of this.beads.entries()) {
      if (bead.age > 0.23 || (index % 2 === 1 && !bead.hero)) continue;
      const point = this.crownPoint(collider, bead.u);
      const fade = 1 - bead.age / 0.23;
      const shimmer = 0.82 + 0.18 * Math.sin(now / 115 + index * 1.8);
      ctx.globalAlpha = strength * fade * shimmer * 0.28 * this.visibility;
      ctx.lineWidth = bead.hero ? 0.95 : 0.7;
      ctx.beginPath();
      ctx.moveTo(point.x - bead.side * 2, point.y + 5);
      ctx.lineTo(point.x + bead.side * 2.5, point.y + 9.5);
      ctx.stroke();
    }
    // A few impact-fed beads slide along the side hair, distinct from the
    // virtual lens droplets drawn later in the foreground.
    for (const run of this.hairRuns) {
      const progress = clamp(run.age / run.life, 0, 1);
      const crown = this.crownPoint(collider, run.u);
      const outside = Math.max(Math.abs(run.u) * 1.03, 0.9);
      const x = collider.x + run.side * collider.rx * (outside + progress * 0.09);
      const y = crown.y + progress * collider.ry * 0.94;
      const opacity = Math.sin(Math.PI * progress) * strength * this.visibility;
      if (opacity <= 0) continue;
      ctx.globalAlpha = opacity * 0.46;
      ctx.strokeStyle = '#e8f7ff';
      ctx.lineWidth = 0.85;
      ctx.beginPath();
      ctx.moveTo(x - run.side * 0.8, y - 5.5);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.globalAlpha = opacity * 0.68;
      ctx.fillStyle = '#f5fcff';
      ctx.beginPath();
      ctx.ellipse(x, y, 1.15, 1.75, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
