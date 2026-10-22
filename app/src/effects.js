import { sweepEllipse } from './collision.js';
import { hasCurrentSmile } from './expression.js';
import { GIFTS_BY_ID } from './gifts.js';
import { SmileRainScene } from './rain-scene.js';
import { RainGlassLayer } from './rain-glass.js';

// All appearance is authored in advance. Recognition chooses a preset and time;
// particle positions and physical motion are the only runtime variation.
export const EFFECT_PRESET = Object.freeze({
  rain: Object.freeze({
    colors: ['#9ceaff', '#c6d9ff', '#d8f7ff'],
    fallSpeed: [390, 710],
    lean: 0.025,
    max: 580,
  }),
  firework: Object.freeze({
    colors: ['#ffd43b', '#ff39aa', '#35ddff', '#aa62ff', '#9bff58', '#ff793f', '#fff3d7'],
    max: 1320,
    restitution: 0.76,
  }),
});

// Includes the final bloom and its fade, so expression detection stays locked
// for the entire visible performance.
export const FIREWORK_SHOW_MS = 9000;
export const FIREWORK_RELEASE_MS = 900;
// The authored launch pattern spans 6.6 s. Repeating at that cadence keeps
// rockets climbing while the laugh is held without replaying a hard intro.
const FIREWORK_WAVE_MS = 6600;

const clamp = (x, low, high) => Math.max(low, Math.min(high, x));
const randomBetween = (low, high) => low + Math.random() * (high - low);
const easeOut = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
const cubic = (a, b, c, d, t) => {
  const inverse = 1 - t;
  return inverse ** 3 * a + 3 * inverse ** 2 * t * b
    + 3 * inverse * t ** 2 * c + t ** 3 * d;
};

// Every rocket has an authored launch point and a target behind the host's head.
// Center launches bow around the host instead of crossing the face.
function rocketPosition(rocket, progress, collider) {
  const t = clamp(progress, 0, 1);
  const targetX = clamp(collider
    ? collider.x + collider.rx * rocket.headOffsetX : rocket.x, 8, rocket.stageWidth - 8);
  const targetY = clamp(collider
    ? collider.y + collider.ry * rocket.headOffsetY : rocket.y, 52, rocket.stageHeight * 0.82);
  const dx = targetX - rocket.startX;
  const dy = targetY - rocket.startY;
  return {
    x: cubic(rocket.startX, rocket.startX + dx * 0.08 + rocket.bendX,
      targetX - dx * 0.23 + rocket.bendX, targetX, t),
    y: cubic(rocket.startY, rocket.startY + dy * 0.38,
      targetY + Math.max(38, Math.abs(dy) * 0.18), targetY, t),
  };
}

// Protect the eyes and mouth spark by spark, without cutting a head-shaped
// hole out of the entire fireworks layer. The hair and cheeks remain active.
function faceDetailOpacity(x, y, collider) {
  if (!collider) return 1;
  const side = Math.abs(x - collider.x) / Math.max(1, collider.rx);
  const vertical = (y - collider.y) / Math.max(1, collider.ry);
  const horizontalGuard = clamp((0.83 - side) / 0.30, 0, 1);
  const topGuard = clamp((vertical + 0.49) / 0.22, 0, 1);
  const bottomGuard = clamp((0.70 - vertical) / 0.24, 0, 1);
  return 1 - horizontalGuard * topGuard * bottomGuard * 0.70;
}

// Rocket exhaust is drawn directly rather than simulated by the collision
// solver. Fade only its individual tiny grains as they pass behind the face;
// a gradual falloff avoids the old, visible face-shaped cutout.
function fineSparkFaceOpacity(x, y, collider) {
  if (!collider) return 1;
  const radial = Math.hypot((x - collider.x) / Math.max(1, collider.rx),
    (y - collider.y) / Math.max(1, collider.ry));
  const fade = clamp((radial - 0.78) / 0.28, 0, 1);
  return 0.08 + 0.92 * fade * fade * (3 - 2 * fade);
}

const ROCKET_CUES = Object.freeze([
  // launch x/y (stage fractions), head offset x/y (head radii), delay, flight, bloom size
  // Six overlapping waves keep rockets rising through the entire nine-second cue.
  [0.08, 0.96, -1.35, -0.28, 0, 850, 1.05],
  [0.92, 0.96, 1.35, -0.24, 160, 870, 1.05],
  [0.12, 1.05, -0.48, -1.48, 410, 1030, 1.14],
  [0.88, 1.05, 0.48, -1.48, 620, 1020, 1.14],
  [-0.07, 0.60, -1.42, 0.48, 1000, 820, 1.04],
  [1.07, 0.56, 1.42, 0.45, 1210, 820, 1.04],
  [0.50, 1.08, 0, -1.92, 1450, 1080, 1.20],
  [0.20, 1.05, -0.92, -1.24, 1710, 930, 0.98],
  [0.80, 1.05, 0.92, -1.24, 1850, 930, 0.98],
  [-0.08, 0.78, -1.55, -0.30, 2240, 820, 1.08],
  [1.08, 0.77, 1.55, -0.30, 2490, 830, 1.08],
  [0.12, 1.06, -0.28, -1.62, 2720, 1010, 1.18],
  [0.88, 1.06, 0.28, -1.62, 2940, 1010, 1.18],
  [0.50, 1.07, 0, -2.12, 3150, 1050, 1.23],
  [-0.06, 0.54, -1.40, 0.45, 3500, 850, 1.13],
  [1.06, 0.54, 1.40, 0.45, 3740, 850, 1.13],
  [0.30, 1.05, -0.95, -1.45, 3950, 920, 1.08],
  [0.70, 1.05, 0.95, -1.45, 4180, 920, 1.08],
  [-0.06, 0.88, -1.60, -0.25, 4550, 880, 1.15],
  [1.06, 0.88, 1.60, -0.25, 4780, 880, 1.15],
  [0.50, 1.06, 0, -2.03, 5030, 1070, 1.25],
  [-0.06, 0.58, -1.45, 0.48, 5270, 830, 1.08],
  [1.06, 0.58, 1.45, 0.48, 5480, 830, 1.08],
  [0.12, 1.06, -0.47, -1.66, 5750, 990, 1.22],
  [0.88, 1.06, 0.47, -1.66, 5960, 990, 1.22],
  [-0.06, 0.77, -1.50, -0.18, 6200, 820, 1.17],
  [1.06, 0.77, 1.50, -0.18, 6410, 820, 1.17],
  [0.50, 1.06, 0, -1.90, 6570, 760, 1.28],
  // Broad peonies on the outer thirds make the whole live room celebrate.
  [-0.08, 1.02, -2.40, -1.28, 340, 970, 1.26],
  [1.08, 1.02, 2.40, -1.26, 1170, 970, 1.28],
  [0.04, 1.05, -2.25, 0.82, 2110, 990, 1.22],
  [0.96, 1.05, 2.25, 0.88, 3070, 990, 1.23],
  [-0.07, 0.95, -2.48, -1.02, 3890, 900, 1.28],
  [1.07, 0.95, 2.48, -1.02, 4620, 930, 1.28],
  [0.09, 1.05, -2.18, 1.05, 5370, 950, 1.22],
  [0.91, 1.05, 2.18, 1.05, 6040, 950, 1.22],
  [-0.05, 0.93, -2.48, -0.75, 6500, 760, 1.30],
  [1.05, 0.93, 2.48, -0.75, 6600, 750, 1.30],
]);

const PREMIUM_ROCKET_CUES = Object.freeze([
  [0.02, 1.01, -1.85, -1.05, 760, 930, 0.95],
  [0.98, 1.01, 1.85, -1.05, 2050, 900, 0.96],
  [-0.07, 0.71, -1.85, -0.72, 3330, 870, 1.00],
  [1.07, 0.71, 1.85, -0.72, 4400, 870, 1.00],
  [0.02, 1.05, -1.22, -1.55, 5600, 930, 1.06],
  [0.98, 1.05, 1.22, -1.55, 6270, 840, 1.06],
]);

// The blooms are authored as five distinct silhouettes. Recognition never
// generates a style; each queued rocket chooses one before it launches.
const FIREWORK_FLOWERS = Object.freeze(['peony', 'chrysanthemum', 'willow', 'palm', 'dahlia']);

function seededRandom(seed) {
  let n = seed >>> 0;
  return () => {
    n += 0x6d2b79f5;
    let x = n;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function makeGlow(color) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.07, color);
  gradient.addColorStop(0.27, `${color}a8`);
  gradient.addColorStop(1, `${color}00`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return canvas;
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function matchesExpression(snapshot, expression) {
  if (!snapshot || snapshot.hasFace === false) return false;
  if (expression === 'smile') {
    return hasCurrentSmile(snapshot);
  }
  if (expression === 'laugh') {
    return snapshot.laughConfirmed === true || snapshot.firework === true || snapshot.state === 'firework';
  }
  return true;
}

export class EffectStage {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.fireworkCanvas = document.createElement('canvas');
    this.fireworkCtx = this.fireworkCanvas.getContext('2d', { alpha: true });
    this.width = 1;
    this.height = 1;
    this.glows = {
      rain: EFFECT_PRESET.rain.colors.map(makeGlow),
      fire: EFFECT_PRESET.firework.colors.map(makeGlow),
      smoke: makeGlow('#bbb8c8'),
      rose: makeGlow('#ffa2bd'),
      heart: makeGlow('#ff82bd'),
      crown: makeGlow('#ffe1a2'),
      star: makeGlow('#b9edff'),
    };
    this.debug = false;
    this.collisionEnabled = true;
    this.rainScene = new SmileRainScene({
      reducedMotion: typeof window !== 'undefined'
        && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches),
    });
    this.rainGlass = new RainGlassLayer({
      reducedMotion: this.rainScene.reducedMotion,
    });
    this.clear();
  }

  resize(width, height) {
    const nextWidth = Math.max(1, width);
    const nextHeight = Math.max(1, height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(nextWidth * dpr);
    const pixelHeight = Math.round(nextHeight * dpr);
    // Assigning canvas.width/height clears the backing store, even when the
    // number is unchanged. ResizeObserver can report an unchanged layout after
    // nearby controls move, so preserve the current frame in that case.
    if (this.width === nextWidth && this.height === nextHeight
      && this.canvas.width === pixelWidth && this.canvas.height === pixelHeight
      && this.fireworkCanvas.width === pixelWidth && this.fireworkCanvas.height === pixelHeight) return;
    this.width = nextWidth;
    this.height = nextHeight;
    this.canvas.width = pixelWidth;
    this.canvas.height = pixelHeight;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.fireworkCanvas.width = pixelWidth;
    this.fireworkCanvas.height = pixelHeight;
    this.fireworkCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  clear(preservePendingGifts = false) {
    const pendingGifts = preservePendingGifts ? this.pendingGifts?.slice() ?? [] : [];
    this.rain = [];
    this.splashes = [];
    this.fire = [];
    this.pending = [];
    this.bloomFlashes = [];
    this.rings = [];
    this.giftSprites = [];
    this.giftTokens = [];
    this.pendingGifts = pendingGifts;
    this.contacts = [];
    this.rainCarry = 0;
    this.rainLevel = 0;
    this.rainScene.reset();
    this.rainGlass.reset();
    this.rainBoostUntil = 0;
    this.rainBoostGraceUntil = 0;
    this.rainPremiumOnset = null;
    this.crownUntil = 0;
    this.charge = null;
    this.collisionCount = 0;
    this.highlightCount = 0;
    this.lastHighlightAt = -Infinity;
    this.lastFireworkAt = -Infinity;
    this.lastFireworkLevel = 0;
    this.fireworkUntil = 0;
    this.fireworkReleaseAt = null;
    this.fireworkSustained = false;
    this.nextFireworkWaveAt = Infinity;
    this.fireworkWave = 0;
    this.lastExpression = null;
    this.lastExpressionAt = -Infinity;
    this.fireworkSerial = 0;
  }

  // Call this for every recognition snapshot, before the ordinary firework call.
  onExpression(snapshot, collider, now = performance.now()) {
    this.lastExpression = snapshot;
    this.lastExpressionAt = now;
    const activated = [];
    for (let i = this.pendingGifts.length - 1; i >= 0; i--) {
      const pending = this.pendingGifts[i];
      if (now > pending.expiresAt) {
        this.pendingGifts.splice(i, 1);
      } else if (matchesExpression(snapshot, pending.gift.expression)) {
        this.activateGift(pending.gift, collider, now);
        activated.push(pending.gift.id);
        this.pendingGifts.splice(i, 1);
      }
    }
    return activated;
  }

  // Returns a compact receipt for the live UI. A linked gift gets an immediate
  // visual token, then an 8 s window for its expression-triggered main effect.
  sendGift(id, collider, now = performance.now(), { effectsBlocked = false, resumeAt = now } = {}) {
    const gift = GIFTS_BY_ID[id];
    if (!gift) return null;
    // Only a new expression-linked gift replaces a waiting interaction.
    // Ordinary gifts play at once without cancelling its eight-second window.
    if (gift.expression) this.pendingGifts.length = 0;
    this.giftTokens.push({ gift, start: now, life: 1850, x: collider?.x ?? this.width / 2,
      y: collider ? collider.y + collider.ry * 0.8 : this.height * 0.45 });
    this.giftTokens = this.giftTokens.slice(-5);
    if (effectsBlocked) {
      if (gift.expression) {
        const expiresAt = Math.max(now, resumeAt) + 8000;
        this.pendingGifts.push({ gift, expiresAt, start: now });
        this.pendingGifts = this.pendingGifts.slice(-5);
        return { gift, matched: false, pending: true, expiresAt };
      }
      return { gift, matched: false, pending: false, deferred: true };
    }
    const freshExpression = now - this.lastExpressionAt < 550;
    const matched = !gift.expression || (freshExpression && matchesExpression(this.lastExpression, gift.expression));
    let expiresAt = null;
    if (matched) this.activateGift(gift, collider, now);
    else {
      expiresAt = now + 8000;
      this.pendingGifts.push({ gift, expiresAt, start: now });
      this.pendingGifts = this.pendingGifts.slice(-5);
    }
    return { gift, matched, pending: !matched, expiresAt };
  }

  activateGift(gift, collider, now) {
    if (gift.id === 'rain') {
      this.rainBoostUntil = Math.max(this.rainBoostUntil, now + 9000);
      this.rainBoostGraceUntil = now + 1300;
    } else if (gift.id === 'firework') {
      const seed = 20261017 + ++this.fireworkSerial * 131;
      if (this.fireworkSustained) {
        // Upgrade the current laugh with six premium launches. Requeuing the
        // entire base show would restart its opening and trim in-flight cues.
        this.queueFireworkCues(PREMIUM_ROCKET_CUES, collider, now, seed, this.fireworkWave + 2);
      } else {
        this.triggerFirework(collider, now, seed, true);
      }
    } else if (gift.id === 'crown') {
      this.crownUntil = Math.max(this.crownUntil, now + 3000);
      this.spawnGiftSprites('star', collider, 20);
    } else {
      this.spawnGiftSprites(gift.id, collider, gift.id === 'star' ? 30 : 22);
    }
  }

  triggerFirework(collider, now = performance.now(), seed = 20261017, premium = false) {
    const elapsed = now - this.lastFireworkAt;
    if (!premium && elapsed < 650) return false;
    if (premium && elapsed < 420 && this.lastFireworkLevel === 2) return false;
    const upgrading = premium && elapsed < 420 && this.lastFireworkLevel === 1;
    this.lastFireworkAt = now;
    this.lastFireworkLevel = premium ? 2 : 1;
    this.fireworkReleaseAt = null;
    this.fireworkUntil = Math.max(this.fireworkUntil, now + FIREWORK_SHOW_MS);
    if (!upgrading) {
      this.highlightCount = 0;
      this.lastHighlightAt = -Infinity;
    }

    const cues = upgrading ? PREMIUM_ROCKET_CUES
      : premium ? [...ROCKET_CUES, ...PREMIUM_ROCKET_CUES] : ROCKET_CUES;
    this.queueFireworkCues(cues, collider, now, seed);
    return true;
  }

  queueFireworkCues(cues, collider, now, seed, flowerOffset = 0) {
    const cx = collider?.x ?? this.width / 2;
    const cy = collider?.y ?? this.height * 0.42;
    const rx = collider?.rx ?? this.width * 0.18;
    const ry = collider?.ry ?? this.height * 0.13;
    for (let i = 0; i < cues.length; i++) {
      const [launchX, launchY, headOffsetX, headOffsetY, delay, flight, scale] = cues[i];
      const x = cx + rx * headOffsetX;
      const y = cy + ry * headOffsetY;
      this.pending.push({
        launchAt: now + delay,
        at: now + delay + flight,
        startX: this.width * launchX,
        startY: this.height * launchY,
        headOffsetX, headOffsetY,
        x, y,
        bendX: Math.abs(headOffsetX) < 0.1
          ? (i % 2 ? 1 : -1) * rx * 1.40 : 0,
        stageWidth: this.width, stageHeight: this.height,
        targetX: cx,
        seed: seed + i * 181 + delay,
        color: (i + Math.floor(seed / 17)) % EFFECT_PRESET.firework.colors.length,
        flower: (i + flowerOffset) % FIREWORK_FLOWERS.length,
        scale,
      });
    }
    // If a premium accent lands exactly at a wave boundary, preserve the
    // soonest already-rising launches and shed only the farthest future cues.
    if (this.pending.length > 48) {
      this.pending.sort((a, b) => a.launchAt - b.launchAt);
      this.pending.length = 48;
    }
  }

  // The expression gate decides when laughter starts and ends. This merely
  // replenishes the predesigned launch pattern while that gate holds it open.
  // Calling false outside an active sustained show leaves ordinary gift cues
  // and the original finite firework API untouched.
  setFireworkSustain(active, collider, now = performance.now()) {
    if (active) {
      if (!this.fireworkSustained) {
        this.fireworkSustained = true;
        this.fireworkWave = 0;
        this.nextFireworkWaveAt = now + FIREWORK_WAVE_MS;
      }
      this.fireworkReleaseAt = null;
      this.fireworkUntil = Infinity;
      if (now >= this.nextFireworkWaveAt) {
        const seed = 20261017 + ++this.fireworkSerial * 131;
        this.queueFireworkCues(ROCKET_CUES, collider, now, seed, ++this.fireworkWave);
        // A background-tab gap never backfills several seconds of launches.
        this.nextFireworkWaveAt = now + FIREWORK_WAVE_MS;
      }
      return;
    }
    if (!this.fireworkSustained) return;
    this.fireworkSustained = false;
    this.nextFireworkWaveAt = Infinity;
    // No new bloom after the expression ends. Existing petals and contact
    // flashes carry the graceful exit, then everything clears before the gate
    // is ready for a different effect.
    this.pending.length = 0;
    this.fireworkReleaseAt = now;
    this.fireworkUntil = now + FIREWORK_RELEASE_MS;
  }

  getFireworkEndAt() {
    return this.fireworkUntil;
  }

  burst(x, y, seed, scale = 1, targetX = this.width / 2, emitImpactSparks = true,
    targetY = this.height * 0.42, targetRy = this.height * 0.13,
    flower = Math.abs(seed) % FIREWORK_FLOWERS.length) {
    const random = seededRandom(seed);
    const desired = Math.floor(104 * scale);
    // Four separately readable comets are stronger than a wall of identical
    // spokes. Each is aimed at a different point on the moving head.
    const heroCount = emitImpactSparks ? 4 : 0;
    const shortage = this.fire.length + desired + heroCount - EFFECT_PRESET.firework.max;
    if (shortage > 0) {
      // The newest bloom must still explode at full size late in the show.
      // Retire the dimmest, oldest background sparks before reaching the cap.
      const oldest = this.fire.map((spark, index) => ({ spark, index }))
        .filter(({ spark }) => !spark.hero)
        .sort((a, b) => (Number(a.spark.micro) - Number(b.spark.micro))
          || (b.spark.age / b.spark.life - a.spark.age / a.spark.life));
      const retire = new Set(oldest.slice(0, shortage).map(({ index }) => index));
      this.fire = this.fire.filter((_, index) => !retire.has(index));
    }
    const available = EFFECT_PRESET.firework.max - this.fire.length;
    const count = Math.min(desired, Math.max(0, available - heroCount));
    if (!count) return;
    const paletteShift = Math.floor(random() * EFFECT_PRESET.firework.colors.length);
    const style = FIREWORK_FLOWERS[flower % FIREWORK_FLOWERS.length];
    for (let i = 0; i < count; i++) {
      const outer = i < count * 0.70;
      const willow = style === 'willow' || (style === 'peony' && i % 12 === 0);
      let angle = i * Math.PI * (3 - Math.sqrt(5)) + (random() - 0.5) * 0.085;
      let speed = outer ? 250 + random() * 208 : 105 + random() * 160;
      if (style === 'chrysanthemum') {
        // Two offset, fine-spoked crowns read differently from a round peony.
        angle = ((i % 26) + (outer ? 0 : 0.43)) * Math.PI * 2 / 26
          + (random() - 0.5) * 0.035;
        speed = outer ? 305 + random() * 95 : 162 + random() * 72;
      } else if (style === 'willow') {
        speed = outer ? 265 + random() * 110 : 125 + random() * 85;
      } else if (style === 'palm') {
        // Nine slightly feathered branches sweep out instead of filling a disc.
        angle = -Math.PI / 2 + (i % 9) * Math.PI * 2 / 9
          + (random() - 0.5) * 0.12;
        speed = outer ? 315 + random() * 145 : 145 + random() * 95;
      } else if (style === 'dahlia') {
        // Broad outer petals orbit a slower, glittering inner flower.
        angle += outer ? 0 : 0.38;
        speed = outer ? 335 + random() * 98 : 135 + random() * 88;
      }
      speed *= scale;
      const startX = x + Math.cos(angle) * 6;
      const startY = y + Math.sin(angle) * 6;
      this.fire.push({
        x: startX, y: startY, oldX: startX, oldY: startY,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 36,
        radius: outer ? (style === 'palm' ? 2.0 : 1.7) + random() * 1.4
          : 1.15 + random() * 1.05,
        age: 0, life: style === 'willow'
          ? (outer ? 1.78 : 1.36) + random() * 0.62
          : (outer ? 1.47 : 0.92) + random() * 0.60,
        color: (paletteShift + (style === 'dahlia' && !outer ? 3
          : i % 11 === 0 ? 6 : style === 'chrysanthemum' ? i % 2 : i % 5))
          % EFFECT_PRESET.firework.colors.length,
        drag: willow ? 0.38 : style === 'palm' ? 0.51 : 0.60 + random() * 0.28,
        gravity: willow ? 126 : style === 'palm' ? 88 : 64,
        // Petals meet the head too. Most die quietly at contact and a few
        // glance away; only the larger authored comets create impact flashes.
        hitCooldown: 0, collidable: true, faceResponse: i % 4 === 0 ? 'glance' : 'absorb', willow,
        sparkle: style === 'dahlia' ? i % 3 === 0 : i % 7 === 0,
        flower: style,
      });
    }
    // These brighter spokes deliberately enter the tracked head boundary.
    // Physics reflects them; a separate foreground layer makes the collision
    // legible without plastering an opaque explosion over the eyes and mouth.
    const toward = targetX >= x ? 1 : -1;
    for (let i = 0; emitImpactSparks && i < heroCount && this.fire.length < EFFECT_PRESET.firework.max; i++) {
      const spread = (i - (heroCount - 1) / 2) / ((heroCount - 1) / 2);
      const startX = x - toward * clamp(Math.abs(targetX - x) * 0.24, 18, 45);
      const startY = y + spread * 7;
      const aimX = targetX;
      const aimY = targetY + spread * targetRy * 0.57;
      const aimLength = Math.hypot(aimX - startX, aimY - startY) || 1;
      const speed = 300 + random() * 54;
      this.fire.push({
        x: startX, y: startY, oldX: startX, oldY: startY,
        vx: (aimX - startX) / aimLength * speed,
        vy: (aimY - startY) / aimLength * speed,
        radius: 3.0 + random() * 0.65, age: 0, life: 1.45 + random() * 0.28,
        color: (paletteShift + i) % EFFECT_PRESET.firework.colors.length,
        drag: 0.29, gravity: 34, hitCooldown: 0,
        hero: true, leadHero: i === 1 || i === 2,
        impactSpread: spread,
        trail: [{ x: startX, y: startY }],
      });
    }
    const start = this.lastFrameAt ?? performance.now();
    this.bloomFlashes.push({ x, y, start, life: 820,
      color: paletteShift, scale: 1.12 * scale, flower: style });
    this.bloomFlashes = this.bloomFlashes.slice(-14);
  }

  spawnGiftSprites(type, collider, count) {
    const cx = collider?.x ?? this.width / 2;
    const cy = collider?.y ?? this.height * 0.42;
    const rx = collider?.rx ?? this.width * 0.18;
    const ry = collider?.ry ?? this.height * 0.13;
    for (let i = 0; i < count; i++) {
      const angle = randomBetween(-Math.PI, Math.PI);
      const distance = randomBetween(rx * 0.8, rx * 2.4);
      const x = cx + Math.cos(angle) * distance;
      const y = cy + Math.sin(angle) * (ry * 1.2) + ry * 0.5;
      this.giftSprites.push({
        type, x, y, oldX: x, oldY: y,
        vx: Math.cos(angle) * randomBetween(12, 82),
        vy: type === 'star' ? randomBetween(70, 150) : randomBetween(-125, -35),
        age: 0, life: randomBetween(1.35, 2.6),
        size: randomBetween(6, type === 'heart' ? 15 : 12),
        angle: randomBetween(0, Math.PI * 2), spin: randomBetween(-3, 3),
        color: i % 3,
      });
    }
    this.giftSprites = this.giftSprites.slice(-100);
  }

  update(dt, targetRain, collider, now = performance.now()) {
    dt = clamp(dt, 0, 0.05);
    this.lastFrameAt = now;
    this.rainScene.update(now, targetRain, collider, dt, this.width, this.height);
    this.rainGlass.update(dt, this.rainScene.rainGate(now), this.width, this.height);
    this.pendingGifts = this.pendingGifts.filter((pending) => now <= pending.expiresAt);
    const freshSmile = now - this.lastExpressionAt < 600
      && matchesExpression(this.lastExpression, 'smile');
    const phase = this.rainScene.phase(now);
    if (now < this.rainBoostUntil && phase !== 'idle'
      && (freshSmile || now < this.rainBoostGraceUntil)) {
      this.rainPremiumOnset = this.rainScene.onsetAt;
    }
    const upgradedRain = now < this.rainBoostUntil
      && this.rainPremiumOnset === this.rainScene.onsetAt;
    // Recognition starts the authored rain entrance once; the settled storm
    // continues while the current expression sustains it.
    const rainTarget = (collider ? (upgradedRain ? 1.55 : 1.12) : 0)
      * this.rainScene.rainGate(now);
    this.rainLevel += (rainTarget - this.rainLevel) * (1 - Math.exp(-dt * 4.8));
    if (!collider) this.rain.length = 0;
    this.rainCarry += this.rainLevel * 380 * dt;
    if (phase === 'idle') this.rainCarry = 0;
    let toSpawn = Math.min(22, Math.floor(this.rainCarry));
    this.rainCarry -= toSpawn;
    while (phase !== 'idle' && toSpawn-- > 0 && this.rain.length < EFFECT_PRESET.rain.max) {
      const depth = Math.random() < 0.16 ? 0 : Math.random() < 0.66 ? 1 : 2;
      const cloudSource = this.rainScene.getSpawnPoint(Math.random, this.width, collider);
      if (!cloudSource) break;
      this.rain.push({
        x: cloudSource.x,
        y: cloudSource.y,
        vx: randomBetween(-18, 18),
        vy: depth === 0 ? randomBetween(370, 490) : depth === 1 ? randomBetween(490, 680) : randomBetween(680, 830),
        length: depth === 0 ? randomBetween(11, 20)
          : depth === 1 ? randomBetween(18, upgradedRain ? 35 : 29)
            : randomBetween(23, upgradedRain ? 42 : 36),
        width: depth === 0 ? randomBetween(0.6, 1.0) : depth === 1 ? randomBetween(0.85, 1.45) : randomBetween(1.1, 1.75),
        depth, color: Math.floor(Math.random() * 3),
        alpha: depth === 0 ? randomBetween(0.29, 0.49)
          : depth === 1 ? randomBetween(0.43, 0.72) : randomBetween(0.52, 0.78),
      });
    }
    const showerBottom = collider ? this.height : 0;
    // Update and compact in one pass. Recreating a rain array every frame
    // otherwise adds avoidable GC work during sustained smiles.
    let liveRain = 0;
    for (const drop of this.rain) {
      const previousY = drop.y;
      drop.x += drop.vx * dt;
      drop.y += drop.vy * dt;
      if (this.collisionEnabled && this.rainScene.catchDrop(drop, previousY, collider, now)) {
        drop.hit = true;
        continue;
      }
      if (!drop.hit && drop.y < showerBottom && drop.x >= 0 && drop.x <= this.width) {
        this.rain[liveRain++] = drop;
      }
    }
    this.rain.length = liveRain;
    for (const splash of this.splashes) splash.age += dt;
    this.splashes = this.splashes.filter((splash) => splash.age < splash.life);

    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (now >= this.pending[i].at) {
        const rocket = this.pending[i];
        const bloom = rocketPosition(rocket, 1, collider);
        const headX = collider?.x ?? rocket.targetX;
        const sideBloom = Math.abs(bloom.x - headX)
          > (collider?.rx ?? this.width * 0.18) * 0.8;
        this.burst(bloom.x, bloom.y, rocket.seed, rocket.scale, headX, sideBloom,
          collider?.y ?? this.height * 0.42, collider?.ry ?? this.height * 0.13,
          rocket.flower);
        this.pending.splice(i, 1);
      }
    }

    const collisionSparks = [];
    // The transparent collision margin keeps flashes just outside the face.
    // Head movement nudges the bounce without throwing sparks across the room.
    const contactCollider = collider ? {
      ...collider, rx: collider.rx + 9, ry: collider.ry + 9,
      vx: clamp((collider.vx || 0) * 0.22, -70, 70),
      vy: clamp((collider.vy || 0) * 0.22, -70, 70),
    } : null;
    for (const p of this.fire) {
      p.oldX = p.x;
      p.oldY = p.y;
      p.age += dt;
      p.hitCooldown = Math.max(0, p.hitCooldown - dt);
      const damping = Math.exp(-p.drag * dt);
      p.vx *= damping;
      p.vy = p.vy * damping + (p.gravity ?? 88) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const incomingVx = p.vx;
      if (this.collisionEnabled && p.collidable !== false && p.hitCooldown === 0 && contactCollider
        && sweepEllipse(p, p.oldX, p.oldY, dt,
          p.hero ? contactCollider : collider,
          p.hero ? EFFECT_PRESET.firework.restitution : 0.38)) {
        if (!p.hero) {
          // A face-sized collision flash would trace an artificial oval. Let
          // the little petals disappear on impact or skim back without adding
          // contact rings or a foreground veil over the host's features.
          if (p.faceResponse !== 'glance') p.age = p.life;
          else {
            p.hitCooldown = 0.22;
            p.vx *= 0.68;
            p.vy *= 0.68;
          }
          continue;
        }
        p.hitCooldown = 0.30;
        this.collisionCount++;
        const firstImpact = p.hero && p.impactAt == null;
        if (firstImpact) {
          // A hard contact releases the comet along the side of the head.
          // Preserve the solver's hit point but redirect the residual energy
          // into a readable horizontal ricochet rather than a face-covering arc.
          const offset = p.hitX - contactCollider.x;
          const side = Math.abs(offset) < contactCollider.rx * 0.13
            ? (incomingVx >= 0 ? -1 : 1) : Math.sign(offset);
          p.impactSide = side;
          p.vx = side * Math.max(320, Math.abs(p.vx) * 1.08);
          p.vy = clamp(p.vy * 0.28 + (p.impactSpread ?? 0) * 76, -146, 146);
          p.x = p.hitX + side * (p.radius + 7);
          // Keep the incoming and outgoing segments separate so a ricochet is
          // readable as a change of direction, rather than a single scribble.
          p.incomingTrail = [...p.trail.slice(-10), { x: p.hitX, y: p.hitY }];
          p.reboundTrail = [{ x: p.hitX, y: p.hitY }];
          p.impactAt = now;
        }
        if (firstImpact && this.highlightCount < 34 && now - this.lastHighlightAt > 190
          && !this.contacts.some((contact) => Math.hypot(contact.x - p.hitX, contact.y - p.hitY) < 15)) {
          this.highlightCount++;
          this.lastHighlightAt = now;
          const nx = (p.hitX - contactCollider.x) / (contactCollider.rx * contactCollider.rx);
          const ny = (p.hitY - contactCollider.y) / (contactCollider.ry * contactCollider.ry);
          const normal = Math.hypot(nx, ny) || 1;
          const normalX = nx / normal;
          const normalY = ny / normal;
          // All secondary shards share a sideways escape direction. Their
          // vertical fan adds sparkle without spraying across the face.
          const rawJetX = (p.impactSide || Math.sign(normalX) || 1) * 0.94;
          const rawJetY = normalY * 0.28;
          const jetLength = Math.hypot(rawJetX, rawJetY) || 1;
          const jetX = rawJetX / jetLength;
          const jetY = rawJetY / jetLength;
          const tangentX = -jetY;
          const tangentY = jetX;
          const burstX = p.hitX + normalX * 5 + jetX * 6;
          const burstY = p.hitY + normalY * 5 + jetY * 6;
          this.contacts.push({ x: burstX, y: burstY, age: 0, life: 0.64,
            cx: contactCollider.x, cy: contactCollider.y,
            rx: contactCollider.rx, ry: contactCollider.ry,
            color: p.color, jetSide: p.impactSide,
            angle: Math.atan2((p.hitY - contactCollider.y) / contactCollider.ry,
              (p.hitX - contactCollider.x) / contactCollider.rx) });
          const random = seededRandom(Math.floor(now * 31 + p.hitX * 53 + p.hitY * 41));
          for (let i = 0; i < 22; i++) {
            const spread = (i - 10.5) / 10.5;
            const shard = i % 3 === 0;
            const outward = (shard ? 300 : 225) + random() * 175;
            const across = spread * (120 + random() * 165);
            collisionSparks.push({
              x: burstX, y: burstY, oldX: burstX, oldY: burstY,
              vx: jetX * outward + tangentX * across,
              vy: jetY * outward + tangentY * across - 22,
              radius: (shard ? 3.0 : 1.25) + random() * 0.8, age: 0,
              life: (shard ? 0.77 : 0.56) + random() * 0.24,
              color: (p.color + i) % EFFECT_PRESET.firework.colors.length,
              drag: 0.79, gravity: 62, hitCooldown: 0.08,
              collidable: true, faceResponse: 'glance', micro: true, impactShard: shard,
            });
          }
        }
      }
      if (p.hero) {
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 14) p.trail.splice(0, p.trail.length - 14);
        if (p.reboundTrail) {
          p.reboundTrail.push({ x: p.x, y: p.y });
          if (p.reboundTrail.length > 11) p.reboundTrail.shift();
        }
      }
    }
    const excess = this.fire.length + collisionSparks.length - EFFECT_PRESET.firework.max;
    if (excess > 0) {
      const faded = this.fire.map((spark, index) => ({ spark, index }))
        .filter(({ spark }) => !spark.hero)
        .sort((a, b) => b.spark.age / b.spark.life - a.spark.age / a.spark.life);
      const retire = new Set(faded.slice(0, excess).map(({ index }) => index));
      this.fire = this.fire.filter((_, index) => !retire.has(index));
    }
    this.fire.push(...collisionSparks.slice(0,
      Math.max(0, EFFECT_PRESET.firework.max - this.fire.length)));
    // Most frames touch the particle cap. Keep the retained array's backing
    // storage instead of allocating a fresh array at display refresh rate.
    let liveFire = 0;
    for (const p of this.fire) {
      if (p.age < p.life && p.x > -90 && p.x < this.width + 90 && p.y < this.height + 90) {
        this.fire[liveFire++] = p;
      }
    }
    this.fire.length = liveFire;
    for (const contact of this.contacts) contact.age += dt;
    this.contacts = this.contacts.filter((contact) => contact.age < contact.life);
    for (const p of this.giftSprites) {
      p.oldX = p.x;
      p.oldY = p.y;
      p.age += dt;
      p.angle += p.spin * dt;
      p.vx *= Math.exp(-0.45 * dt);
      p.vy += (p.type === 'star' ? 18 : -4) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.giftSprites = this.giftSprites.filter((p) => p.age < p.life);
    this.giftTokens = this.giftTokens.filter((token) => now - token.start < token.life);
    this.rings = this.rings.filter((ring) => now - ring.start < ring.life);
    this.bloomFlashes = this.bloomFlashes.filter((flash) => now - flash.start < flash.life);
    if (this.charge && now > this.charge.until) this.charge = null;
    if (this.fireworkUntil > 0 && now >= this.fireworkUntil) {
      this.pending.length = 0;
      this.fire.length = 0;
      this.contacts.length = 0;
      this.bloomFlashes.length = 0;
      this.rings = this.rings.filter((ring) => !ring.firework);
      this.fireworkReleaseAt = null;
    }
  }

  draw(collider, now = performance.now()) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    this.drawRain(ctx, collider, now);
    this.drawFirework(ctx, collider, now);
    this.drawGiftSprites(ctx, collider, now);
    this.drawGiftFeedback(ctx, collider, now);
    if (this.debug && collider) this.drawDebug(ctx, collider);
  }

  drawRain(ctx, collider, now) {
    if (this.rainLevel < 0.025 && this.rain.length === 0
      && this.rainScene.visibility < 0.01 && this.rainGlass.drops.length === 0) return;
    ctx.save();
    const premium = now < this.rainBoostUntil
      && this.rainPremiumOnset === this.rainScene.onsetAt;
    if (collider && this.rainScene.anchor && this.rainLevel > 0.08) {
      const top = Math.max(0, this.rainScene.anchor.y + this.rainScene.cloudWidth * 0.11);
      const wash = ctx.createLinearGradient(0, top, 0, this.height);
      wash.addColorStop(0, `rgba(133, 207, 246, ${clamp(this.rainLevel * 0.12, 0, 0.18)})`);
      wash.addColorStop(0.55, `rgba(116, 186, 230, ${clamp(this.rainLevel * 0.045, 0, 0.07)})`);
      wash.addColorStop(1, 'rgba(116, 186, 230, 0)');
      ctx.fillStyle = wash;
      ctx.fillRect(0, top, this.width, this.height - top);
    }
    ctx.save();
    if (collider) {
      // Mask the complete rain stroke, not only its endpoint: long streaks
      // otherwise remain visible across the eyes even after a hairline hit.
      ctx.beginPath();
      ctx.rect(0, 0, this.width, this.height);
      ctx.ellipse(collider.x, collider.y, collider.rx + 5, collider.ry + 5,
        0, 0, Math.PI * 2);
      ctx.clip('evenodd');
    }
    ctx.globalCompositeOperation = 'screen';
    for (const p of this.rain) {
      let alpha = p.alpha * clamp(this.rainLevel, 0, 1.2);
      if (collider) {
        const u = (p.x - collider.x) / Math.max(1, collider.rx);
        const v = (p.y - collider.y) / Math.max(1, collider.ry);
        if (u * u + v * v < 1.04) alpha *= p.depth === 2 ? 0.13 : 0.19;
      }
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = EFFECT_PRESET.rain.colors[p.color];
      ctx.lineWidth = p.width;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.length * EFFECT_PRESET.rain.lean, p.y - p.length);
      ctx.stroke();
      if (p.width > 1.55 && p.color !== 1) {
        ctx.globalAlpha = alpha * 0.22;
        ctx.drawImage(this.glows.rain[p.color], p.x - 5, p.y - 5, 10, 10);
      }
    }
    ctx.restore();
    this.rainScene.drawCloud(ctx, this.width, this.height, now, premium);
    this.rainScene.drawWetHair(ctx, collider, this.rainLevel, now);
    this.rainScene.drawBeads(ctx, collider);
    this.rainGlass.draw(ctx, collider);
    ctx.restore();
  }

  drawFirework(ctx, collider, now) {
    const fx = this.fireworkCtx;
    fx.clearRect(0, 0, this.width, this.height);
    if (!this.pending.length && !this.fire.length && !this.bloomFlashes.length
      && !this.contacts.length && !this.rings.length) return;
    fx.save();
    fx.globalCompositeOperation = 'screen';
    for (const flash of this.bloomFlashes) {
      const progress = clamp((now - flash.start) / flash.life, 0, 1);
      const size = (150 + easeOut(progress) * 245) * flash.scale;
      fx.globalAlpha = Math.pow(1 - progress, 1.28) * 0.87;
      fx.drawImage(this.glows.fire[flash.color], flash.x - size / 2,
        flash.y - size / 2, size, size);
      fx.globalAlpha = Math.pow(1 - progress, 2.1) * 0.9;
      fx.drawImage(this.glows.fire[6], flash.x - 39, flash.y - 39, 78, 78);
      // The quick radial crown echoes the underlying petal silhouette, so a
      // palm, a fine chrysanthemum and a broad peony do not share one stamp.
      if (progress < 0.68) {
        fx.strokeStyle = EFFECT_PRESET.firework.colors[flash.color];
        fx.lineCap = 'round';
        fx.lineWidth = (flash.flower === 'palm' ? 3.4 : 2.6) * (1 - progress) + 0.5;
        fx.globalAlpha = Math.pow(1 - progress, 1.55) * 0.76;
        const rayLength = (30 + easeOut(progress) * 105) * flash.scale;
        const rayCount = flash.flower === 'chrysanthemum' ? 26
          : flash.flower === 'palm' ? 9 : flash.flower === 'willow' ? 14 : 18;
        for (let ray = 0; ray < rayCount; ray++) {
          const angle = ray * Math.PI * 2 / rayCount
            + (flash.flower === 'palm' ? -Math.PI / 2 : 0);
          const sine = Math.sin(angle);
          const cosine = Math.cos(angle);
          const length = rayLength * (flash.flower === 'dahlia' && ray % 2 ? 0.68 : 1);
          fx.beginPath();
          fx.moveTo(flash.x + cosine * 16, flash.y + sine * 16);
          fx.lineTo(flash.x + cosine * length, flash.y + sine * length);
          fx.stroke();
        }
      }
    }
    // The launch is part of the event: bright cores travel from the four
    // edges in curved, staggered arcs before the wide blooms appear.
    for (const rocket of this.pending) {
      if (now < rocket.launchAt) continue;
      const progress = clamp((now - rocket.launchAt) / (rocket.at - rocket.launchAt), 0, 1);
      if (progress <= 0) continue;
      const head = rocketPosition(rocket, progress, collider);
      const tailStart = Math.max(0, progress - 0.075);
      const tail = rocketPosition(rocket, tailStart, collider);
      const behind = rocketPosition(rocket, Math.max(0, progress - 0.018), collider);
      const vectorX = head.x - behind.x;
      const vectorY = head.y - behind.y;
      const length = Math.hypot(vectorX, vectorY) || 1;
      const dx = vectorX / length;
      const dy = vectorY / length;
      const sideX = -dy;
      const sideY = dx;
      // A few translucent puffs linger on the travelled arc. The smoke is
      // restrained so the firework stays bright and the host remains clear.
      for (let i = 5; i >= 1; i--) {
        const behindProgress = Math.max(0, progress - 0.035 - i * 0.031);
        if (behindProgress <= 0) continue;
        const smoke = rocketPosition(rocket, behindProgress, collider);
        const wobble = Math.sin(now * 0.0027 + rocket.seed + i * 2.1) * (4 + i * 2);
        const size = 26 + i * 8;
        fx.globalAlpha = (0.23 - i * 0.026) * Math.min(1, progress * 5);
        fx.drawImage(this.glows.smoke,
          smoke.x + sideX * wobble - size / 2,
          smoke.y + sideY * wobble - size / 2, size, size);
      }
      const gradient = fx.createLinearGradient(tail.x, tail.y, head.x, head.y);
      gradient.addColorStop(0, '#ffae4b00');
      gradient.addColorStop(0.48, '#ffb44d78');
      gradient.addColorStop(0.85, '#ffd288c2');
      gradient.addColorStop(1, '#fff2c7');
      fx.globalAlpha = 0.48;
      fx.strokeStyle = gradient;
      fx.lineWidth = 5;
      fx.lineCap = 'round';
      fx.shadowColor = '#ffd893';
      fx.shadowBlur = 10;
      fx.beginPath();
      fx.moveTo(tail.x, tail.y);
      for (let step = 1; step <= 7; step++) {
        const position = rocketPosition(rocket,
          tailStart + (progress - tailStart) * step / 7, collider);
        fx.lineTo(position.x, position.y);
      }
      fx.stroke();
      fx.shadowBlur = 0;
      // Broken, offset grains carry the long trail. There is deliberately no
      // continuous white line connecting the launch point to the fire core.
      for (let i = 1; i <= 24; i++) {
        const lag = 0.008 + i * 0.0093;
        if (progress <= lag) continue;
        const spark = rocketPosition(rocket, progress - lag, collider);
        const oscillation = Math.sin(rocket.seed * 0.013 + i * 7.11 + now * 0.0087);
        const lateral = oscillation * (3.8 + i * 0.72);
        const px = spark.x + sideX * lateral;
        const py = spark.y + sideY * lateral + i * i * 0.032;
        const radius = i % 6 === 0 ? 3.0 : i % 4 === 0 ? 2.4 : 1.5;
        const grainAlpha = clamp(0.96 - i * 0.029, 0.18, 0.94);
        const faceOpacity = fineSparkFaceOpacity(px, py, collider);
        fx.globalAlpha = grainAlpha * faceOpacity;
        fx.fillStyle = i % 7 === 0 ? '#fff8df' : i % 3 === 0 ? '#ff7439' : '#ffc466';
        fx.beginPath();
        fx.arc(px, py, radius, 0, Math.PI * 2);
        fx.fill();
        if (i % 4 === 0) {
          const glowSize = radius * 8;
          fx.globalAlpha = grainAlpha * 0.52 * faceOpacity;
          fx.drawImage(this.glows.fire[i % 7 === 0 ? 6 : 0],
            px - glowSize / 2, py - glowSize / 2, glowSize, glowSize);
        }
      }
      // The leading object is a round white-gold burning core, never an arrow.
      // Several diverging filaments form a soft cone of expelled sparks.
      for (let filament = -2; filament <= 2; filament++) {
        const flicker = Math.sin(now * 0.019 + rocket.seed + filament * 2.7);
        const spread = filament * (4.7 + flicker * 0.9);
        const flare = 23 + Math.abs(filament) * 6 + flicker * 5;
        fx.globalAlpha = 0.51 - Math.abs(filament) * 0.09;
        fx.strokeStyle = filament % 2 ? '#ffc66f' : '#fff0b3';
        fx.lineWidth = filament === 0 ? 3.8 : 1.6;
        fx.beginPath();
        fx.moveTo(head.x - dx * 5, head.y - dy * 5);
        fx.quadraticCurveTo(head.x - dx * flare * 0.55 + sideX * spread * 0.4,
          head.y - dy * flare * 0.55 + sideY * spread * 0.4,
          head.x - dx * flare + sideX * spread,
          head.y - dy * flare + sideY * spread);
        fx.stroke();
      }
      fx.globalAlpha = 0.78;
      fx.drawImage(this.glows.fire[6], head.x - 28, head.y - 28, 56, 56);
      fx.globalAlpha = 0.38;
      fx.drawImage(this.glows.fire[rocket.color], head.x - 15, head.y - 15, 30, 30);
      fx.globalAlpha = 1;
      fx.fillStyle = '#ffe39b';
      fx.beginPath();
      fx.arc(head.x, head.y, 6.5, 0, Math.PI * 2);
      fx.fill();
      fx.fillStyle = '#fffef4';
      fx.beginPath();
      fx.arc(head.x, head.y, 3.4, 0, Math.PI * 2);
      fx.fill();
    }
    for (const ring of this.rings) {
      const progress = clamp((now - ring.start) / ring.life, 0, 1);
      fx.globalAlpha = ring.alpha * (1 - progress);
      fx.strokeStyle = ring.color;
      fx.lineWidth = 3.1 * (1 - progress) + 0.6;
      fx.beginPath();
      fx.arc(ring.x, ring.y, ring.radius + easeOut(progress) * ring.spread, 0, Math.PI * 2);
      fx.stroke();
    }
    for (let i = 0; i < this.fire.length; i++) {
      const p = this.fire[i];
      const life = clamp(1 - p.age / p.life, 0, 1);
      const color = EFFECT_PRESET.firework.colors[p.color];
      const faceOpacity = faceDetailOpacity(p.x, p.y, collider);
      const glitter = p.sparkle && !p.hero
        ? 0.69 + 0.31 * Math.sin(p.age * 32 + i * 3.7) ** 2 : 1;
      fx.globalAlpha = Math.pow(life, 0.49) * (p.hero ? 1 : 0.95) * faceOpacity * glitter;
      fx.strokeStyle = color;
      fx.lineWidth = Math.max(1.1, p.radius * (p.hero ? 1.25 : p.willow ? 1.05 : 0.92));
      fx.beginPath();
      if (p.hero && p.trail?.length > 1) {
        fx.moveTo(p.trail[0].x, p.trail[0].y);
        for (let j = 1; j < p.trail.length; j++) fx.lineTo(p.trail[j].x, p.trail[j].y);
      } else {
        const trailLength = p.willow ? 0.088 : 0.050;
        fx.moveTo(p.x - p.vx * trailLength, p.y - p.vy * trailLength);
        fx.lineTo(p.x, p.y);
      }
      fx.stroke();
      if (p.hero || p.micro || p.willow || i % 2 === 0) {
        const size = p.radius * (p.hero ? 13 : p.micro ? 11 : p.sparkle ? 10 : 8);
        fx.globalAlpha = life * (p.hero ? 0.88 : p.micro ? 0.74 : p.sparkle ? 0.63 : 0.50)
          * faceOpacity;
        fx.drawImage(this.glows.fire[p.color], p.x - size / 2, p.y - size / 2, size, size);
      }
    }
    fx.restore();
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    if (this.fireworkReleaseAt != null) {
      ctx.globalAlpha = clamp((this.fireworkUntil - now) / FIREWORK_RELEASE_MS, 0, 1);
    } else if (this.fireworkUntil > now && now > this.fireworkUntil - 480) {
      ctx.globalAlpha = clamp((this.fireworkUntil - now) / 480, 0, 1);
    }
    ctx.drawImage(this.fireworkCanvas, 0, 0, this.width, this.height);
    ctx.restore();
    // Only the actual collision points have a foreground impact; there is no
    // full-head cutout or traced contour around the face.
    this.drawFireworkContacts(ctx, collider, now);
  }

  drawFireworkContacts(ctx, collider, now) {
    if (!this.contacts.length
      && !this.fire.some((p) => (p.hero && (p.collided || p.leadHero)) || p.impactShard)) return;
    const releaseFade = this.fireworkReleaseAt == null ? 1
      : clamp((this.fireworkUntil - now) / FIREWORK_RELEASE_MS, 0, 1);
    if (releaseFade <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const strokeTrail = (points, color, opacity, width) => {
      if (!points || points.length < 2 || opacity <= 0) return;
      ctx.globalAlpha = opacity * releaseFade;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.stroke();
    };
    // Two bright lead comets per side bloom show the full incoming route.
    // After a hit, a fading old path and a new outward path form a visible V.
    for (const p of this.fire) {
      if (!p.hero || (!p.leadHero && !p.collided) || p.trail.length < 2) continue;
      const life = clamp(1 - p.age / p.life, 0, 1);
      if (life < 0.08) continue;
      const color = EFFECT_PRESET.firework.colors[p.color];
      if (!p.collided) {
        strokeTrail(p.trail, color, life * 0.82, p.radius * 2.6);
        strokeTrail(p.trail.slice(-6), '#fff6d6', life * 0.90, p.radius * 0.80);
      } else {
        const impactFade = clamp(1 - (now - p.impactAt) / 360, 0, 1);
        strokeTrail(p.incomingTrail, color, impactFade * 0.78, p.radius * 2.5);
        strokeTrail(p.incomingTrail?.slice(-6), '#fff6d6', impactFade * 0.91,
          p.radius * 0.85);
        strokeTrail(p.reboundTrail, color, life * 0.98, p.radius * 2.4);
        strokeTrail(p.reboundTrail?.slice(-7), '#fffdf0', life * 0.98,
          p.radius * 0.80);
      }
      const glow = p.radius * (p.collided ? 15 : 17);
      ctx.globalAlpha = life * (p.leadHero ? 0.89 : 0.72) * releaseFade;
      ctx.drawImage(this.glows.fire[p.color], p.x - glow / 2,
        p.y - glow / 2, glow, glow);
      if (p.leadHero) {
        ctx.globalAlpha = life * 0.96 * releaseFade;
        ctx.drawImage(this.glows.fire[6], p.x - 6, p.y - 6, 12, 12);
      }
    }
    // A handful of the bounced fragments are also in front of the video;
    // their motion makes the tiny secondary flower feel released by the hit.
    for (const p of this.fire) {
      if (!p.impactShard || p.age > 0.62) continue;
      const life = clamp(1 - p.age / p.life, 0, 1);
      ctx.globalAlpha = life * 0.88 * releaseFade;
      ctx.strokeStyle = EFFECT_PRESET.firework.colors[p.color];
      ctx.lineWidth = p.radius * 1.45;
      ctx.beginPath();
      ctx.moveTo(p.oldX, p.oldY);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.globalAlpha = life * 0.82 * releaseFade;
      const glow = p.radius * 10;
      ctx.drawImage(this.glows.fire[p.color], p.x - glow / 2,
        p.y - glow / 2, glow, glow);
    }
    for (const contact of this.contacts) {
      const progress = clamp(contact.age / contact.life, 0, 1);
      const life = 1 - progress;
      // The soft imprint sits just inside the actual cheek/hairline. The
      // reflected shards are outside it, so the eye connects hit to bounce.
      const rx = Math.max(8, (collider?.rx ?? contact.rx - 9) - 10);
      const ry = Math.max(8, (collider?.ry ?? contact.ry - 9) - 10);
      const cx = collider?.x ?? contact.cx;
      const cy = collider?.y ?? contact.cy;
      const angle = contact.angle;
      const px = cx + Math.cos(angle) * rx;
      const py = cy + Math.sin(angle) * ry;
      const color = EFFECT_PRESET.firework.colors[contact.color];
      // Local side-light at the actual impact point: a wall-hit flash, not
      // a glow painted around the whole head.
      if (progress < 0.48) {
        const reflection = ctx.createRadialGradient(px, py, 0, px, py, 25);
        reflection.addColorStop(0, `${color}d9`);
        reflection.addColorStop(0.38, `${color}6b`);
        reflection.addColorStop(1, `${color}00`);
        ctx.globalAlpha = (1 - progress / 0.48) * 0.82 * releaseFade;
        ctx.fillStyle = reflection;
        ctx.fillRect(px - 25, py - 25, 50, 50);
      }
      ctx.globalAlpha = Math.pow(life, 0.7) * 0.98 * releaseFade;
      ctx.drawImage(this.glows.fire[contact.color], px - 24, py - 24, 48, 48);
      ctx.drawImage(this.glows.fire[6], px - 14, py - 14, 28, 28);
      ctx.globalAlpha = life * releaseFade;
      ctx.fillStyle = '#fffdf3';
      ctx.beginPath();
      ctx.moveTo(px, py - 12 * life);
      ctx.lineTo(px + 3.8 * life, py - 3.8 * life);
      ctx.lineTo(px + 12 * life, py);
      ctx.lineTo(px + 3.8 * life, py + 3.8 * life);
      ctx.lineTo(px, py + 12 * life);
      ctx.lineTo(px - 3.8 * life, py + 3.8 * life);
      ctx.lineTo(px - 12 * life, py);
      ctx.lineTo(px - 3.8 * life, py - 3.8 * life);
      ctx.closePath();
      ctx.fill();
      // Broken, asymmetric shock fragments are centered on the impact;
      // no complete circle is ever drawn beside the face.
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.6 * life + 0.5;
      ctx.lineCap = 'round';
      const pulseRadius = 5 + easeOut(progress) * 21;
      const brokenSegments = [[-1.10, -0.58], [-0.12, 0.32], [0.79, 1.13]];
      for (let segment = 0; segment < brokenSegments.length; segment++) {
        const [start, end] = brokenSegments[segment];
        ctx.globalAlpha = life * (0.82 - segment * 0.12) * releaseFade;
        ctx.beginPath();
        ctx.arc(px, py, pulseRadius + (segment - 1) * 2.5,
          angle + start, angle + end);
        ctx.stroke();
      }
      const nx = Math.cos(angle) / rx;
      const ny = Math.sin(angle) / ry;
      const nLength = Math.hypot(nx, ny) || 1;
      const normalX = nx / nLength;
      const normalY = ny / nLength;
      const rawJetX = (contact.jetSide ?? (Math.sign(normalX) || 1)) * 0.94;
      const rawJetY = normalY * 0.28;
      const jetLength = Math.hypot(rawJetX, rawJetY) || 1;
      const jetX = rawJetX / jetLength;
      const jetY = rawJetY / jetLength;
      const tangentX = -jetY;
      const tangentY = jetX;
      // Two broad wings visibly peel away to the side, anchored at the hit.
      for (let i = 0; i < 11; i++) {
        const side = (i - 5) / 5;
        const reach = 20 + easeOut(progress) * (74 + (i % 3) * 13);
        const ex = px + jetX * reach + tangentX * side * reach * 0.61;
        const ey = py + jetY * reach + tangentY * side * reach * 0.61;
        ctx.globalAlpha = Math.pow(life, 0.65) * (i % 2 ? 0.67 : 0.96) * releaseFade;
        ctx.strokeStyle = EFFECT_PRESET.firework.colors[(contact.color + i) % this.glows.fire.length];
        ctx.lineWidth = i % 3 === 0 ? 3.6 : 1.8;
        ctx.beginPath();
        ctx.moveTo(px + jetX * 8, py + jetY * 8);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        if (i % 3 === 0) {
          ctx.globalAlpha = Math.pow(life, 0.6) * 0.92 * releaseFade;
          ctx.drawImage(this.glows.fire[(contact.color + i) % this.glows.fire.length],
            ex - 11, ey - 11, 22, 22);
          ctx.strokeStyle = '#fff9e9';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(ex - jetX * 16, ey - jetY * 16);
          ctx.lineTo(ex, ey);
          ctx.stroke();
        }
      }
      for (let i = 0; i < 6; i++) {
        const side = (i - 2.5) / 2.5;
        const outward = 11 + progress * (36 + i * 3);
        const across = side * (7 + progress * 30);
        const sx = px + jetX * outward + tangentX * across;
        const sy = py + jetY * outward + tangentY * across;
        const size = (2.5 + (i % 3)) * life;
        ctx.globalAlpha = life * 0.94 * releaseFade;
        ctx.strokeStyle = EFFECT_PRESET.firework.colors[(contact.color + i + 1) % this.glows.fire.length];
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(sx - size, sy);
        ctx.lineTo(sx + size, sy);
        ctx.moveTo(sx, sy - size);
        ctx.lineTo(sx, sy + size);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawGiftSprites(ctx, collider, now) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const p of this.giftSprites) {
      const life = clamp(1 - p.age / p.life, 0, 1);
      const alpha = Math.min(1, p.age * 4) * Math.pow(life, 0.65);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.globalAlpha = alpha * 0.85;
      if (p.type === 'rose') {
        ctx.fillStyle = ['#ffb7cb', '#ff719f', '#ffe0e7'][p.color];
        ctx.beginPath();
        ctx.moveTo(0, -p.size);
        ctx.bezierCurveTo(p.size * 0.9, -p.size * 0.6, p.size * 0.72, p.size * 0.72, 0, p.size);
        ctx.bezierCurveTo(-p.size * 0.72, p.size * 0.72, -p.size * 0.9, -p.size * 0.6, 0, -p.size);
        ctx.fill();
      } else if (p.type === 'heart') {
        const s = p.size;
        ctx.fillStyle = ['#ff89b8', '#ffb6d3', '#ffdce9'][p.color];
        ctx.beginPath();
        ctx.moveTo(0, s * 0.82);
        ctx.bezierCurveTo(-s * 1.2, 0, -s * 0.9, -s, 0, -s * 0.42);
        ctx.bezierCurveTo(s * 0.9, -s, s * 1.2, 0, 0, s * 0.82);
        ctx.fill();
      } else {
        const s = p.size;
        ctx.fillStyle = ['#fff3c5', '#a9e7ff', '#d2beff'][p.color];
        ctx.beginPath();
        for (let j = 0; j < 10; j++) {
          const a = -Math.PI / 2 + j * Math.PI / 5;
          const r = j % 2 ? s * 0.35 : s;
          const x = Math.cos(a) * r;
          const y = Math.sin(a) * r;
          if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        if (p.type === 'star') {
          ctx.globalAlpha = alpha * 0.45;
          ctx.strokeStyle = '#c7edff';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-p.vx * 0.12, -p.vy * 0.12);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
    if (this.crownUntil > now) {
      const cx = collider?.x ?? this.width / 2;
      const top = (collider?.y ?? this.height * 0.42) - (collider?.ry ?? this.height * 0.13) - 20;
      const alpha = clamp((this.crownUntil - now) / 500, 0, 1);
      const w = clamp((collider?.rx ?? 60) * 1.15, 48, 86);
      ctx.save();
      ctx.translate(cx, top + Math.sin(now / 210) * 3);
      ctx.globalAlpha = alpha * 0.9;
      ctx.fillStyle = '#f9cf70';
      ctx.strokeStyle = '#fff4cc';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-w / 2, 0);
      ctx.lineTo(-w * 0.38, -24);
      ctx.lineTo(-w * 0.16, -7);
      ctx.lineTo(0, -30);
      ctx.lineTo(w * 0.16, -7);
      ctx.lineTo(w * 0.38, -24);
      ctx.lineTo(w / 2, 0);
      ctx.lineTo(w * 0.42, 10);
      ctx.lineTo(-w * 0.42, 10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fb8ead';
      ctx.beginPath();
      ctx.arc(0, -3, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  drawGiftFeedback(ctx, collider, now) {
    ctx.save();
    for (const token of this.giftTokens) {
      const progress = clamp((now - token.start) / token.life, 0, 1);
      const enter = easeOut(Math.min(1, progress * 2.8));
      const x = this.width * 0.78 + (token.x - this.width * 0.78) * enter;
      const y = this.height * 0.82 + (token.y - this.height * 0.82) * enter - progress * 35;
      const alpha = Math.min(1, progress * 8, (1 - progress) * 3.3);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(20, 18, 38, 0.72)';
      ctx.strokeStyle = token.gift.expression === 'smile' ? 'rgba(162, 229, 255, 0.75)'
        : token.gift.expression === 'laugh' ? 'rgba(255, 213, 157, 0.75)' : 'rgba(255, 218, 234, 0.68)';
      ctx.lineWidth = 1.2;
      roundedRect(ctx, x - 54, y - 21, 108, 42, 21);
      ctx.fill();
      ctx.stroke();
      ctx.font = '23px "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(token.gift.emoji, x - 42, y + 1);
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(token.gift.name, x - 9, y + 1);
    }
    if (this.pendingGifts.length) {
      const next = this.pendingGifts[this.pendingGifts.length - 1];
      const left = clamp((next.expiresAt - now) / 8000, 0, 1);
      const x = collider?.x ?? this.width / 2;
      const faceBottom = (collider?.y ?? this.height * 0.42) + (collider?.ry ?? this.height * 0.13);
      const y = clamp(faceBottom + 48, this.height * 0.43, this.height * 0.75);
      const label = next.gift.expression === 'smile' ? '微笑，点亮大雨' : '大笑，绽放烟花';
      ctx.globalAlpha = clamp(left * 3, 0, 0.8);
      ctx.fillStyle = 'rgba(10, 15, 34, 0.7)';
      roundedRect(ctx, x - 78, y - 16, 156, 32, 16);
      ctx.fill();
      ctx.fillStyle = '#f8fbff';
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x, y + 1);
      ctx.strokeStyle = next.gift.id === 'rain' ? '#a5e9ff' : '#ffe0aa';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 66, y + 16);
      ctx.lineTo(x - 66 + 132 * left, y + 16);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawDebug(ctx, collider) {
    ctx.save();
    ctx.strokeStyle = this.collisionEnabled ? '#73f0da' : '#ff9a98';
    ctx.fillStyle = 'rgba(39, 219, 194, 0.07)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.ellipse(collider.x, collider.y, collider.rx, collider.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    for (const contact of this.contacts) {
      ctx.fillStyle = '#fff2bc';
      ctx.beginPath();
      ctx.arc(contact.x, contact.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  get stats() {
    return { rain: this.rain.length, fire: this.fire.length, contacts: this.collisionCount,
      pendingGifts: this.pendingGifts.length, giftSprites: this.giftSprites.length };
  }
}
