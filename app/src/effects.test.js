import test from 'node:test';
import assert from 'node:assert/strict';
import { EffectStage, FIREWORK_SHOW_MS, FIREWORK_RELEASE_MS, EFFECT_PRESET } from './effects.js';
import { GIFTS } from './gifts.js';

const fakeContext = {
  createRadialGradient: () => ({ addColorStop() {} }),
  fillRect() {},
};

function stage() {
  globalThis.document = {
    createElement: () => ({ getContext: () => fakeContext }),
  };
  const engine = new EffectStage({ getContext: () => fakeContext });
  engine.width = 390;
  engine.height = 690;
  return engine;
}

const head = { x: 195, y: 270, rx: 72, ry: 94, vx: 0, vy: 0 };

test('unchanged layout preserves both effect canvases while a DPR change resizes them', () => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const context = { ...fakeContext, setTransform() {} };
  const makeCanvas = () => {
    let width = 300;
    let height = 150;
    return {
      painted: false,
      getContext: () => context,
      get width() { return width; },
      set width(value) { width = value; this.painted = false; },
      get height() { return height; },
      set height(value) { height = value; this.painted = false; },
    };
  };
  try {
    globalThis.document = { createElement: makeCanvas };
    globalThis.window = { devicePixelRatio: 2 };
    const display = makeCanvas();
    const engine = new EffectStage(display);
    engine.resize(390, 690);
    display.painted = true;
    engine.fireworkCanvas.painted = true;
    engine.resize(390, 690);
    assert.equal(display.painted, true, 'an unchanged ResizeObserver report must not clear the visible frame');
    assert.equal(engine.fireworkCanvas.painted, true, 'the offscreen fireworks frame remains intact');
    globalThis.window.devicePixelRatio = 1.5;
    engine.resize(390, 690);
    assert.equal(display.painted, false, 'a real pixel-size change reallocates the display canvas');
    assert.equal(engine.fireworkCanvas.painted, false, 'the offscreen canvas matches the new pixel density');
    assert.equal(display.width, 585);
    assert.equal(engine.fireworkCanvas.height, 1035);
  } finally {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  }
});

test('gift catalog has six unique gifts and two expression links', () => {
  assert.equal(GIFTS.length, 6);
  assert.equal(new Set(GIFTS.map((gift) => gift.id)).size, 6);
  assert.equal(GIFTS.find((gift) => gift.id === 'rain').expression, 'smile');
  assert.equal(GIFTS.find((gift) => gift.id === 'firework').expression, 'laugh');
});

test('rain gift shows immediately, waits for smile and then boosts rain', () => {
  const engine = stage();
  const receipt = engine.sendGift('rain', head, 1000);
  assert.equal(receipt.pending, true);
  assert.equal(engine.giftTokens.length, 1);
  assert.equal(engine.pendingGifts.length, 1);
  assert.deepEqual(engine.onExpression({ state: 'neutral', hasFace: true }, head, 1500), []);
  assert.deepEqual(engine.onExpression({ state: 'smile', hasFace: true, smileActive: true }, head, 2100), ['rain']);
  assert.equal(engine.pendingGifts.length, 0);
  assert.ok(engine.rainBoostUntil >= 11100);
  engine.update(0.05, 0.7, head, 2150);
  assert.equal(engine.rainScene.phase(2150), 'approach');
  engine.update(0.05, 0.7, head, 2800);
  assert.equal(engine.rainLevel, 0, 'rain must wait until the clouds converge');
  engine.update(0.05, 0, head, 5400);
  assert.ok(engine.rainLevel > 0);
  assert.equal(engine.rainPremiumOnset, 2150, 'the gift boost lasts into the rain stage');
  assert.ok(engine.rain.every((drop) => Math.abs(drop.vx) <= 18));
  assert.ok(engine.rain.length > 0);
  assert.ok(engine.rain.every((drop) => drop.x >= 0 && drop.x <= engine.width));
});

test('laugh activates pending premium fireworks and same-frame base event is deduplicated', () => {
  const engine = stage();
  engine.sendGift('firework', head, 1000);
  const activated = engine.onExpression({ state: 'firework', firework: true, hasFace: true }, head, 2000);
  assert.deepEqual(activated, ['firework']);
  assert.equal(engine.pending.length, 44);
  assert.equal(engine.triggerFirework(head, 2000), false);
  assert.equal(engine.getFireworkEndAt(), 11000);
  assert.ok(engine.pending.some((rocket) => rocket.startX < 0));
  assert.ok(engine.pending.some((rocket) => rocket.startX > engine.width));
  assert.ok(engine.pending.every((rocket) => rocket.at > rocket.launchAt));
  engine.update(0.016, 0, head, 2700);
  assert.equal(engine.fire.length, 0, 'visible rockets rise before they bloom');
  engine.update(0.016, 0, head, 3700);
  assert.ok(engine.fire.length > 150);
  assert.ok(engine.bloomFlashes.length > 0);
});

test('already smiling activates rain immediately; expired pending gift cannot activate', () => {
  const engine = stage();
  engine.onExpression({ state: 'smile', hasFace: true, smileActive: true }, head, 1000);
  assert.equal(engine.sendGift('rain', head, 1100).matched, true);
  const second = stage();
  second.sendGift('firework', head, 1000);
  assert.deepEqual(second.onExpression({ state: 'firework', hasFace: true }, head, 9100), []);
  assert.equal(second.pendingGifts.length, 0);
});

test('unconfirmed one-frame expression cannot redeem a waiting gift', () => {
  const engine = stage();
  engine.sendGift('firework', head, 1000);
  assert.deepEqual(engine.onExpression({ state: 'neutral', hasFace: true,
    laughActive: true, smileActive: true, smile: 0.9, jawOpen: 0.5 }, head, 1200), []);
  assert.equal(engine.pendingGifts.length, 1);
  assert.equal(engine.pending.length, 0);
});

test('confirmed laugh redeems a firework gift during controller cooldown', () => {
  const engine = stage();
  engine.onExpression({ state: 'cooldown', hasFace: true, laughConfirmed: true }, head, 1000);
  assert.equal(engine.sendGift('firework', head, 1100).matched, true);
  assert.equal(engine.pendingGifts.length, 0);
  assert.equal(engine.pending.length, 44);
  const later = stage();
  later.sendGift('firework', head, 1000);
  assert.deepEqual(later.onExpression({ state: 'cooldown', hasFace: true, laughConfirmed: true }, head, 1200), ['firework']);
});

test('gifts sent during an active cue show feedback without starting another effect', () => {
  const engine = stage();
  engine.onExpression({ state: 'firework', hasFace: true }, head, 1000);
  const linked = engine.sendGift('firework', head, 1100, { effectsBlocked: true, resumeAt: 10000 });
  const ordinary = engine.sendGift('rose', head, 1200, { effectsBlocked: true, resumeAt: 10000 });
  assert.equal(linked.pending, true);
  assert.equal(linked.expiresAt, 18000, 'the waiting window starts after this cue is released');
  assert.equal(ordinary.deferred, true);
  assert.equal(engine.giftTokens.length, 2, 'both gifts still acknowledge the sender');
  assert.equal(engine.pending.length, 0, 'fireworks do not overlap the current cue');
  assert.equal(engine.giftSprites.length, 0, 'ordinary gift visuals also wait for the next round');
  assert.deepEqual(engine.onExpression({ state: 'firework', hasFace: true }, head, 11000), ['firework']);
  assert.equal(engine.pending.length, 44);
});

test('an edge-launched rocket follows a moving host and blooms near the back of the head', () => {
  const engine = stage();
  engine.triggerFirework(head, 1000, 42);
  assert.equal(engine.pending.length, 38);
  const shifted = { ...head, x: 250 };
  engine.update(0.016, 0, shifted, 1890);
  assert.equal(engine.pending.length, 37);
  assert.equal(engine.bloomFlashes.length, 1);
  assert.ok(Math.abs(engine.bloomFlashes[0].x - (shifted.x - shifted.rx * 1.35)) < 0.01);
  assert.ok(engine.bloomFlashes[0].x > head.x - head.rx * 1.35);
});

test('a newer linked gift replaces the old one, while an ordinary gift leaves it waiting', () => {
  const engine = stage();
  engine.sendGift('firework', head, 1000);
  engine.sendGift('rain', head, 1100);
  assert.deepEqual(engine.pendingGifts.map(({ gift }) => gift.id), ['rain']);
  assert.deepEqual(engine.onExpression({ state: 'firework', hasFace: true }, head, 1300), []);
  engine.sendGift('rose', head, 1400);
  assert.deepEqual(engine.pendingGifts.map(({ gift }) => gift.id), ['rain']);
  assert.deepEqual(engine.onExpression({ state: 'smile', hasFace: true, smileActive: true }, head, 1500), ['rain']);
});

test('input switches preserve a waiting gift without extending its expiry', () => {
  const engine = stage();
  engine.sendGift('rain', head, 1000);
  const expiresAt = engine.pendingGifts[0].expiresAt;
  engine.clear(true);
  assert.equal(engine.pendingGifts[0].expiresAt, expiresAt);
  assert.deepEqual(engine.onExpression({ state: 'smile', hasFace: true, smileActive: true }, head, 2500), ['rain']);
  const expired = stage();
  expired.sendGift('rain', head, 1000);
  expired.clear(true);
  assert.deepEqual(expired.onExpression({ state: 'smile', hasFace: true, smileActive: true }, head, 9001), []);
  assert.equal(expired.pendingGifts.length, 0);
  engine.clear();
  assert.equal(engine.pendingGifts.length, 0);
});

test('unlinked gifts create immediate performer-area effects', () => {
  const engine = stage();
  assert.equal(engine.sendGift('rose', head, 1000).matched, true);
  assert.ok(engine.giftSprites.length >= 20);
  assert.equal(engine.sendGift('crown', head, 1050).matched, true);
  assert.ok(engine.crownUntil > 1050);
});

test('authored firework sparks visibly reverse at the head margin only with collision enabled', () => {
  const bouncing = stage();
  bouncing.burst(94, head.y, 42);
  const incoming = bouncing.fire.filter((particle) => particle.hero);
  assert.equal(incoming.length, 4);
  assert.equal(incoming.filter((particle) => particle.leadHero).length, 2);
  let highlighted = false;
  let microBloomed = false;
  for (let frame = 1; frame <= 34; frame++) {
    bouncing.update(0.016, 0, head, 1000 + frame * 16);
    highlighted ||= bouncing.contacts.length > 0;
    microBloomed ||= bouncing.fire.filter((particle) => particle.micro).length >= 8;
  }
  assert.ok(incoming.some((particle) => particle.collided && particle.vx < 0));
  assert.ok(incoming.some((particle) => particle.incomingTrail?.length > 2
    && particle.reboundTrail?.length > 2),
  'an identifiable comet leaves separate incoming and reflected trajectories');
  assert.ok(highlighted);
  assert.ok(microBloomed, 'head contact opens a secondary fan of tiny fireworks');
  assert.ok(bouncing.fire.some((particle) => particle.impactShard),
    'bright, moving fragments make the hit a secondary bloom');
  assert.ok(bouncing.highlightCount <= 34);

  const passing = stage();
  passing.collisionEnabled = false;
  passing.burst(94, head.y, 42);
  for (let frame = 1; frame <= 34; frame++) passing.update(0.016, 0, head, 1000 + frame * 16);
  assert.equal(passing.collisionCount, 0);
  assert.equal(passing.highlightCount, 0);
  assert.ok(passing.fire.filter((particle) => particle.hero).every((particle) => !particle.collided));
});

test('a cheek strike sends the comet and its secondary flower out to that side', () => {
  for (const [launchX, expectedSide] of [[94, -1], [296, 1]]) {
    const engine = stage();
    engine.burst(launchX, head.y, 42, 1, head.x);
    let firstContact = null;
    for (let frame = 1; frame <= 45 && !firstContact; frame++) {
      engine.update(0.016, 0, head, 1000 + frame * 16);
      firstContact = engine.contacts[0] || null;
    }
    assert.ok(firstContact, 'a side bloom must reach the tracked cheek');
    assert.equal(firstContact.jetSide, expectedSide);
    const reflected = engine.fire.filter((particle) => particle.hero && particle.impactAt != null);
    assert.ok(reflected.some((particle) => particle.vx * expectedSide >= 320),
      'the main comet travels sideways away from the cheek');
    const fragments = engine.fire.filter((particle) => particle.micro);
    assert.ok(fragments.length >= 20);
    assert.ok(fragments.filter((particle) => particle.vx * expectedSide > 0).length
      >= fragments.length * 0.9, 'the small second bloom follows the same outward side');
    assert.ok(fragments.every((particle) => particle.collidable),
      'secondary sparks remain solid if a moving face meets them');
  }
});

test('the secondary impact flower stays off facial features as the head moves', () => {
  const engine = stage();
  const tracked = { ...head };
  engine.burst(94, tracked.y, 42, 1, tracked.x);
  let sawFragments = false;
  for (let frame = 1; frame <= 55; frame++) {
    if (frame > 10 && frame < 30) {
      tracked.x += 1.5;
      tracked.vx = 90;
    } else tracked.vx = 0;
    engine.update(0.016, 0, tracked, 1000 + frame * 16);
    const fragments = engine.fire.filter((particle) => particle.micro);
    sawFragments ||= fragments.length > 0;
    assert.ok(fragments.every((particle) =>
      ((particle.x - tracked.x) / tracked.rx) ** 2
      + ((particle.y - tracked.y) / tracked.ry) ** 2 >= 0.9 ** 2),
    'impact glitter must not cover the eyes and mouth when the host shifts');
  }
  assert.ok(sawFragments);
});

test('queued fireworks cycle five authored flower silhouettes with different motion', () => {
  const show = stage();
  show.triggerFirework(head, 1000, 42);
  assert.deepEqual(new Set(show.pending.map((rocket) => rocket.flower)), new Set([0, 1, 2, 3, 4]));
  const flowers = [];
  for (let flower = 0; flower < 5; flower++) {
    const engine = stage();
    engine.burst(72, 160, 42, 1, head.x, false, head.y, head.ry, flower);
    flowers.push(engine.fire);
    assert.equal(new Set(engine.fire.map((particle) => particle.flower)).size, 1);
    assert.equal(engine.bloomFlashes[0].flower, engine.fire[0].flower);
  }
  assert.deepEqual(flowers.map((particles) => particles[0].flower),
    ['peony', 'chrysanthemum', 'willow', 'palm', 'dahlia']);
  assert.ok(flowers[2].every((particle) => particle.gravity === 126)
    && flowers[0].filter((particle) => particle.gravity === 126).length < 20,
  'most willow trails droop distinctly rather than inheriting the peony motion');
  assert.ok(flowers[4].filter((particle) => particle.sparkle).length
    > flowers[0].filter((particle) => particle.sparkle).length * 2,
  'the dahlia has a denser glittering center');
  const palmAngles = flowers[3].map((particle) =>
    Math.atan2(particle.vy + 36, particle.vx));
  assert.ok(palmAngles.every((angle) => {
    const nearestBranch = Math.round((angle + Math.PI / 2) * 9 / (2 * Math.PI));
    const branchAngle = -Math.PI / 2 + nearestBranch * 2 * Math.PI / 9;
    return Math.abs(angle - branchAngle) < 0.07;
  }), 'palm petals follow nine feathered branches instead of a round disc');
});

test('small firework petals stop at the live face while some skim away', () => {
  const protectedFace = stage();
  const unprotectedFace = stage();
  unprotectedFace.collisionEnabled = false;
  protectedFace.burst(94, head.y, 42);
  unprotectedFace.burst(94, head.y, 42);
  for (let frame = 1; frame <= 20; frame++) {
    const now = 1000 + frame * 16;
    protectedFace.update(0.016, 0, head, now);
    unprotectedFace.update(0.016, 0, head, now);
  }
  const insideFace = (p) => ((p.x - head.x) / head.rx) ** 2
    + ((p.y - head.y) / head.ry) ** 2 < 0.8 ** 2;
  const ordinary = (p) => !p.hero && !p.micro;
  assert.ok(unprotectedFace.fire.filter((p) => ordinary(p) && insideFace(p)).length >= 10,
    'this bloom would otherwise leave many small sparks across the features');
  assert.equal(protectedFace.fire.filter((p) => ordinary(p) && insideFace(p)).length, 0,
    'ordinary petals either extinguish or reflect before crossing the face');
  assert.ok(protectedFace.fire.some((p) => p.faceResponse === 'glance' && p.collided),
    'a few petals visibly skim away instead of all vanishing at a hard boundary');
  assert.ok(protectedFace.fire.some((p) => p.hero && p.collided),
    'the prominent comet and its local collision feedback still work');
});

test('firework sparks still meet a head positioned away from screen center', () => {
  const engine = stage();
  const shiftedHead = { ...head, x: 305 };
  // The launch is right of screen center but left of the actual head.
  engine.burst(205, shiftedHead.y, 42, 1, shiftedHead.x);
  const incoming = engine.fire.filter((particle) => particle.hero);
  for (let frame = 1; frame <= 20; frame++) {
    engine.update(0.016, 0, shiftedHead, 1000 + frame * 16);
  }
  assert.ok(incoming.some((particle) => particle.collided));
});

test('hero comets aim toward the tracked head height instead of crossing in a horizontal band', () => {
  const engine = stage();
  const loweredHead = { ...head, x: 300, y: 410 };
  engine.burst(75, 220, 42, 1, loweredHead.x, true, loweredHead.y, loweredHead.ry);
  const heroes = engine.fire.filter((particle) => particle.hero);
  assert.equal(heroes.length, 4);
  assert.ok(heroes.every((particle) => particle.vx > 0 && particle.vy > 0));
  let struck = false;
  for (let frame = 1; frame <= 54; frame++) {
    engine.update(0.016, 0, loweredHead, 1000 + frame * 16);
    struck ||= heroes.some((particle) => particle.collided);
  }
  assert.ok(struck, 'at least one incoming comet hits the relocated head');
});

test('head contact stays local and follows motion without a face-sized air ring', () => {
  const engine = stage();
  const calls = [];
  const composites = [];
  const context = {
    set globalCompositeOperation(value) { composites.push(value); },
    createRadialGradient: () => ({ addColorStop() {} }),
    clearRect() {}, save() {}, restore() {}, translate() {}, scale() {},
    beginPath() {}, closePath() {}, fill() {}, fillRect() {}, stroke() {},
    moveTo(x, y) { calls.push({ type: 'moveTo', x, y }); },
    lineTo(x, y) { calls.push({ type: 'lineTo', x, y }); },
    arc(x, y, radius, start, end) { calls.push({ type: 'arc', x, y, radius, start, end }); },
    ellipse(x, y) { calls.push({ type: 'ellipse', x, y }); },
    drawImage(target) { calls.push({ type: 'drawImage', target }); },
  };
  engine.fireworkCtx = context;
  engine.contacts.push({
    x: 110, y: head.y, cx: head.x, cy: head.y,
    rx: head.rx + 9, ry: head.ry + 9,
    angle: Math.PI, color: 1, age: 0.12, life: 0.56,
  });
  const movedHead = { ...head, x: head.x + 45 };
  engine.drawFirework(context, movedHead, 1200);
  const composited = calls.findIndex((call) => call.target === engine.fireworkCanvas);
  const impactX = movedHead.x - movedHead.rx + 10;
  const foregroundPulse = calls.findIndex((call, index) => index > composited
    && call.type === 'arc' && Math.abs(call.x - impactX) < 0.01 && call.y === movedHead.y
    && call.radius <= 26);
  assert.ok(composited >= 0, 'the fireworks layer is composited before the point impact');
  assert.ok(foregroundPulse > composited,
    'the local hit imprint follows the head and sits just inside the cheek');
  assert.ok(calls.slice(composited + 1).some((call) => call.type === 'lineTo'
    && call.x < impactX - 40),
  'the secondary shards travel distinctly away from the cheek');
  assert.equal(calls.filter((call) => call.type === 'ellipse').length, 0,
    'no continuous oval contour is drawn around the head');
  assert.ok(calls.filter((call, index) => index > composited && call.type === 'arc')
    .every((call) => call.end - call.start < Math.PI),
  'every contact wave is an open fragment rather than a closed small circle');
  assert.ok(!composites.includes('destination-out'),
    'the whole face is never punched out of the fireworks layer');
  assert.ok(calls.slice(composited + 1).some((call) => call.type === 'drawImage'),
    'the front contact has a distinct bright core');
});

test('ascending fireworks draw a round hot comet and spark plume without arrow polygons', () => {
  const engine = stage();
  const radii = [];
  const images = [];
  const tailSpans = [];
  let softFilaments = 0;
  let polygons = 0;
  const context = {
    createRadialGradient: () => ({ addColorStop() {} }),
    createLinearGradient: (x0, y0, x1, y1) => {
      tailSpans.push(Math.hypot(x1 - x0, y1 - y0));
      return { addColorStop() {} };
    },
    clearRect() {}, save() {}, restore() {}, translate() {}, scale() {},
    beginPath() {}, fill() {}, stroke() {}, moveTo() {}, lineTo() {},
    arc(_x, _y, radius) { radii.push(radius); },
    quadraticCurveTo() { softFilaments++; },
    closePath() { polygons++; },
    drawImage(image) { images.push(image); },
  };
  engine.fireworkCtx = context;
  engine.triggerFirework(head, 1000, 42);
  engine.drawFirework(context, head, 1400);
  assert.ok(radii.includes(6.5) && radii.includes(3.4),
    'the lead fire is a layered circular white-gold core');
  assert.ok(softFilaments >= 5, 'the trailing exhaust is a curved cone of sparks');
  assert.ok(tailSpans.length > 0 && tailSpans.every((length) => length < 70),
    'the continuous light stays short instead of forming a long laser beam');
  assert.ok(radii.filter((radius) => radius >= 1.5 && radius <= 3).length >= 12,
    'the main ascent trail breaks into irregular visible fire grains');
  assert.ok(images.includes(engine.glows.smoke), 'a faint smoke wake follows the travelled arc');
  assert.equal(polygons, 0, 'the launch does not draw a triangular arrow body');
});

test('tiny rocket exhaust grains dim smoothly where a launch passes behind the face', () => {
  const engine = stage();
  engine.pending.push({
    launchAt: 0, at: 1000, startX: head.x, startY: 500,
    headOffsetX: 0, headOffsetY: 0, x: head.x, y: head.y,
    bendX: 0, stageWidth: engine.width, stageHeight: engine.height,
    seed: 42, color: 0,
  });
  const context = () => ({
    alpha: 1, grains: [],
    set globalAlpha(value) { this.alpha = value; },
    get globalAlpha() { return this.alpha; },
    createLinearGradient: () => ({ addColorStop() {} }),
    clearRect() {}, save() {}, restore() {}, drawImage() {},
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    quadraticCurveTo() {}, fill() {},
    arc(x, y, radius) {
      if (radius >= 1.5 && radius <= 3) this.grains.push({ x, y, alpha: this.alpha });
    },
  });
  const acrossFace = context();
  engine.fireworkCtx = acrossFace;
  engine.drawFirework(acrossFace, head, 750);
  const withoutFace = context();
  engine.fireworkCtx = withoutFace;
  engine.drawFirework(withoutFace, null, 750);
  assert.equal(acrossFace.grains.length, withoutFace.grains.length);
  assert.ok(acrossFace.grains.some((grain, index) => grain.alpha
    < withoutFace.grains[index].alpha * 0.2),
  'grains behind facial features should become barely visible');
  assert.ok(acrossFace.grains.some((grain, index) => grain.alpha
    > withoutFace.grains[index].alpha * 0.8),
  'grains outside the head remain bright rather than masking the whole trail');
});

test('broad launch waves fill a nine-second show without silent gaps or early trimming', () => {
  const engine = stage();
  engine.triggerFirework(head, 1000, 42);
  assert.equal(FIREWORK_SHOW_MS, 9000);
  assert.equal(engine.getFireworkEndAt(), 10000);
  assert.equal(engine.pending.length, 38);
  const delays = engine.pending.map((rocket) => rocket.launchAt - 1000).sort((a, b) => a - b);
  assert.equal(delays[0], 0);
  assert.ok(delays.at(-1) >= 6500, 'the last wave launches late in the performance');
  assert.ok(delays.every((delay, i) => i === 0 || delay - delays[i - 1] <= 450),
    'rockets rise in a steady cadence rather than a single opening salvo');
  assert.ok(engine.pending.every((rocket) => rocket.at <= 1000 + FIREWORK_SHOW_MS - 1500),
    'the last bloom has time to finish fading inside the locked cue');
  assert.ok(engine.pending.some((rocket) => rocket.headOffsetX < -2.3));
  assert.ok(engine.pending.some((rocket) => rocket.headOffsetX > 2.3));
  assert.ok(engine.pending.some((rocket) => rocket.headOffsetY > 0.8),
    'some blossoms fill the lower half rather than clustering above the face');

  assert.equal(engine.triggerFirework(head, 1000, 42, true), true);
  assert.equal(engine.pending.length, 44, 'same-frame premium upgrade adds accents without losing core launches');
  assert.equal(engine.getFireworkEndAt(), 10000);
});

test('long show stays within particle and queue budgets, then clears at its visible end', () => {
  const engine = stage();
  engine.triggerFirework(head, 1000, 91, true);
  let visibleLate = false;
  for (let frame = 1; frame < 560; frame++) {
    const now = 1000 + frame * 16;
    engine.update(0.016, 0, head, now);
    assert.ok(engine.pending.length <= 48);
    assert.ok(engine.fire.length <= EFFECT_PRESET.firework.max);
    assert.ok(engine.bloomFlashes.length <= 14);
    if (now > 8000 && now < 9000) visibleLate ||= engine.fire.length > 0;
  }
  assert.ok(visibleLate, 'late waves keep the show active well after the opening bursts');
  engine.update(0.016, 0, head, 10000);
  assert.equal(engine.pending.length, 0);
  assert.equal(engine.fire.length, 0);
  assert.equal(engine.contacts.length, 0);
  assert.equal(engine.bloomFlashes.length, 0);
});

test('held laughter replenishes fireworks beyond the old nine-second end without unbounded particles', () => {
  const engine = stage();
  engine.triggerFirework(head, 1000, 91);
  let visibleAfterNineSeconds = false;
  for (let now = 1000; now <= 25200; now += 50) {
    engine.setFireworkSustain(true, head, now);
    engine.update(0.05, 0, head, now);
    assert.ok(engine.pending.length <= 48, `rocket queue overflow at ${now}`);
    assert.ok(engine.fire.length <= EFFECT_PRESET.firework.max, `spark cap overflow at ${now}`);
    if (now > 11000 && engine.fire.length > 0) visibleAfterNineSeconds = true;
  }
  assert.ok(visibleAfterNineSeconds, 'fireworks continue after the original finite show');
  assert.ok(engine.fireworkWave >= 3, 'several authored launch patterns follow the held laugh');
  assert.equal(engine.fireworkSustained, true);
  assert.equal(engine.getFireworkEndAt(), Infinity);
});

test('ending laughter cancels future launches and fades all existing fireworks in 900 ms', () => {
  const engine = stage();
  engine.triggerFirework(head, 1000, 91);
  for (let now = 1000; now <= 7850; now += 50) {
    engine.setFireworkSustain(true, head, now);
    engine.update(0.05, 0, head, now);
  }
  assert.ok(engine.pending.length > 0);
  const wavesBeforeRelease = engine.fireworkWave;
  engine.setFireworkSustain(false, head, 7850);
  assert.equal(engine.pending.length, 0, 'no rocket can bloom after the face becomes neutral');
  assert.equal(engine.getFireworkEndAt(), 7850 + FIREWORK_RELEASE_MS);
  assert.equal(engine.fireworkSustained, false);
  for (let now = 7900; now <= 9000; now += 50) {
    engine.setFireworkSustain(false, head, now);
    engine.update(0.05, 0, head, now);
  }
  assert.equal(engine.fireworkWave, wavesBeforeRelease, 'release never schedules another launch');
  assert.equal(engine.fire.length, 0);
  assert.equal(engine.contacts.length, 0);
  assert.equal(engine.bloomFlashes.length, 0);
});

test('release calls outside a sustained laugh do not cancel a standalone firework gift', () => {
  const engine = stage();
  engine.triggerFirework(head, 1000, 91, true);
  engine.setFireworkSustain(false, head, 1500);
  assert.equal(engine.pending.length, 44);
  assert.equal(engine.getFireworkEndAt(), 10000);
});

test('a firework gift upgrades the held show without restarting its base launch sequence', () => {
  const engine = stage();
  engine.triggerFirework(head, 1000, 91);
  engine.setFireworkSustain(true, head, 1000);
  for (let now = 1050; now <= 3000; now += 50) engine.update(0.05, 0, head, now);
  const baseSeeds = engine.pending.map((rocket) => rocket.seed);
  const count = engine.pending.length;
  const nextWaveAt = engine.nextFireworkWaveAt;
  engine.activateGift(GIFTS.find((gift) => gift.id === 'firework'), head, 3000);
  assert.equal(engine.pending.length, count + 6);
  assert.ok(baseSeeds.every((seed) => engine.pending.some((rocket) => rocket.seed === seed)),
    'premium accents do not displace the existing base rockets');
  assert.equal(engine.nextFireworkWaveAt, nextWaveAt);
  assert.equal(engine.getFireworkEndAt(), Infinity);
});

test('late fireworks keep a full bloom by retiring faded background sparks', () => {
  const engine = stage();
  engine.fire = Array.from({ length: EFFECT_PRESET.firework.max - 30 }, () => ({
    age: 0.9, life: 1, hero: false, micro: false,
  }));
  engine.burst(94, head.y, 42);
  assert.equal(engine.fire.filter((spark) => spark.age === 0).length, 108,
    '104 large petals and four traceable contact comets appear near the cap');
  assert.ok(engine.fire.length <= EFFECT_PRESET.firework.max);
});
