export const INTERACTION_MODES = Object.freeze(['natural', 'gift', 'pk', 'topic']);

const EFFECT_FOR_EXPRESSION = Object.freeze({ smile: 'rain', laugh: 'firework' });

// A scene grants permission to START an effect. Once started, the expression
// gate owns its duration, so closing a PK or topic window cannot abruptly cut
// off rain or fireworks while the host is still smiling.
export class InteractionContext {
  constructor() {
    this.mode = 'natural';
    this.sceneOpen = false;
    this.giftWindow = null;
  }

  select(mode) {
    if (!INTERACTION_MODES.includes(mode)) throw new RangeError('Unknown interaction mode');
    if (this.mode === mode) return;
    this.mode = mode;
    this.sceneOpen = false;
    this.giftWindow = null;
  }

  setSceneOpen(open) {
    if (this.mode !== 'pk' && this.mode !== 'topic') return false;
    this.sceneOpen = Boolean(open);
    return this.sceneOpen;
  }

  armGift(expression, expiresAt) {
    const effect = EFFECT_FOR_EXPRESSION[expression];
    if (this.mode !== 'gift' || !effect || !Number.isFinite(expiresAt)) return false;
    this.giftWindow = { effect, expiresAt };
    return true;
  }

  canStart(effect, now) {
    if (effect !== 'rain' && effect !== 'firework') return false;
    if (this.mode === 'natural') return true;
    if (this.mode === 'pk' || this.mode === 'topic') return this.sceneOpen;
    return this.giftWindow?.effect === effect && now <= this.giftWindow.expiresAt;
  }

  consume(effect, now) {
    if (!this.canStart(effect, now)) return false;
    if (this.mode === 'gift') this.giftWindow = null;
    return true;
  }

  status(now) {
    if (this.mode === 'gift' && this.giftWindow && now > this.giftWindow.expiresAt) {
      this.giftWindow = null;
    }
    return {
      mode: this.mode,
      sceneOpen: this.sceneOpen,
      waitingFor: this.giftWindow?.effect ?? null,
      giftRemainingMs: this.giftWindow ? Math.max(0, this.giftWindow.expiresAt - now) : 0,
    };
  }
}
