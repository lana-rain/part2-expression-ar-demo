// Prices are fictional in-demo coins, not TikTok's live gift catalog or pricing.
export const GIFTS = Object.freeze([
  Object.freeze({ id: 'rain', name: '微笑雨', price: 99, emoji: '🌧️', tag: '微笑联动', expression: 'smile' }),
  Object.freeze({ id: 'firework', name: '星耀烟花', price: 299, emoji: '🎆', tag: '大笑联动', expression: 'laugh' }),
  Object.freeze({ id: 'rose', name: '玫瑰', price: 1, emoji: '🌹', tag: '花瓣飞舞', expression: null }),
  Object.freeze({ id: 'heart', name: '心动', price: 9, emoji: '💗', tag: '爱心飘浮', expression: null }),
  Object.freeze({ id: 'crown', name: '皇冠', price: 199, emoji: '👑', tag: '璀璨加冕', expression: null }),
  Object.freeze({ id: 'star', name: '流星', price: 49, emoji: '🌠', tag: '星光划过', expression: null }),
]);

export const GIFTS_BY_ID = Object.freeze(Object.fromEntries(GIFTS.map((gift) => [gift.id, gift])));
