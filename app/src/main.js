import { FaceLandmarker, HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { ExpressionController, ExpressionEffectGate, hasCurrentSmile, signalsFromResult } from './expression.js';
import { coverLayout, faceColliderFromLandmarks, updateColliderMotion } from './geometry.js';
import { EffectStage } from './effects.js';
import { WorkerFaceVision } from './worker-vision.js';
import { GIFTS } from './gifts.js';
import { cameraTrackLive, classifyCameraFailure } from './camera-recovery.js';
import { InteractionContext } from './interaction-context.js';
import { publicAssetUrl } from './asset-url.js';
import './style.css';

const icons = {
  gift: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3.5 10.4h17v10.4h-17z" fill="#f93384" stroke="#ffacd0" stroke-width="1.1"/><path d="M2.5 7.4h19v3.2h-19z" fill="#ff65a7" stroke="#ffd2e6" stroke-width="1.1"/><path d="M12 7.5v13.3" stroke="#ffcee4" stroke-width="2"/><path d="M11.9 7.5C9.1 7.5 6.4 6.4 6.4 4.1c0-1.2.9-2 2.1-2 2 0 3.4 3.1 3.4 5.4Zm.2 0c2.8 0 5.5-1.1 5.5-3.4 0-1.2-.9-2-2.1-2-2 0-3.4 3.1-3.4 5.4Z" fill="#ff79b3" stroke="#ffd1e6" stroke-width="1.1" stroke-linejoin="round"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20.8 8.7c0 4.3-8.8 10.8-8.8 10.8S3.2 13 3.2 8.7A4.7 4.7 0 0 1 12 6.3a4.7 4.7 0 0 1 8.8 2.4Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  emoji: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.9"/><circle cx="8.4" cy="9.4" r="1" fill="currentColor"/><circle cx="15.6" cy="9.4" r="1" fill="currentColor"/><path d="M7.7 14.2c.9 2 2.4 3 4.3 3s3.4-1 4.3-3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m13.5 4.5 7 7-7 7M20 11.5H9a5 5 0 0 0-5 5v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  coin: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#F8CC69"/><circle cx="12" cy="12" r="6.3" stroke="#A96B18" stroke-width="1.2"/><path d="M12 7.7v8.6M9.4 10.1c.4-.8 1.2-1.2 2.6-1.2 1.6 0 2.6.6 2.6 1.7 0 2.6-5.2 1-5.2 3.1 0 1 1 1.7 2.7 1.7 1.2 0 2.1-.4 2.5-1.1" stroke="#A96B18" stroke-width="1.15" stroke-linecap="round"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 5 19 19M19 5 5 19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};

const $ = (selector) => document.querySelector(selector);
const initialComments = [
  { name: 'Mia', text: '来啦！今天直播间好热闹' },
  { name: '阿圆', text: '今晚的氛围真不错 ✨' },
  { name: 'Lina', text: '主播晚上好！' },
];
// The installed localhost preview can opt into the same image inputs as the
// dev server. Public builds leave this flag unset and omit the sample assets.
const VALIDATION_ENABLED = import.meta.env.DEV || import.meta.env.VITE_LOCAL_VALIDATION === 'true';
const IMAGE_SAMPLES = VALIDATION_ENABLED ? [
  { id: 'neutral', name: '平静', src: publicAssetUrl('validation/neutral.jpg') },
  { id: 'smile', name: '微笑', src: publicAssetUrl('validation/smile.jpg') },
  { id: 'eye-smile', name: '眯眼微笑', src: publicAssetUrl('validation/eye-smile.png') },
  { id: 'laugh', name: '张嘴大笑', src: publicAssetUrl('validation/laugh.jpg') },
  { id: 'eye-laugh-open', name: '眯眼张嘴笑', src: publicAssetUrl('validation/eye-laugh-open.png') },
  { id: 'covered-laugh', name: '捂嘴遮挡边界', src: publicAssetUrl('validation/covered-laugh.png') },
  { id: 'squint-neutral', name: '眯眼平静', src: publicAssetUrl('validation/squint-neutral.png') },
  { id: 'covered-neutral', name: '捂嘴平静', src: publicAssetUrl('validation/covered-neutral.png') },
  { id: 'mouth-open', name: '只张嘴', src: publicAssetUrl('validation/mouth-open.jpg') },
] : [];

$('#app').innerHTML = `
  <div class="live-app">
    <div class="demo-layout">
    <main class="phone-shell" id="phone-shell" aria-label="直播间">
      <div class="live-stage" id="stage" aria-label="主播直播画面">
        <img id="source-image-bg" class="media-backdrop" alt="" aria-hidden="true" hidden />
        <video id="source-video-bg" class="media-backdrop" autoplay muted playsinline loop hidden aria-hidden="true"></video>
        <img id="source-image" class="source-media" alt="" hidden />
        <video id="source-video" class="source-media" autoplay muted playsinline loop hidden aria-label="主播直播视频"></video>
        <div class="live-grade"></div>
        <canvas id="effect-canvas" aria-hidden="true"></canvas>
        <div class="live-vignette"></div>

        <header class="live-top">
          <div class="broadcaster">
            <span class="broadcaster-avatar" aria-hidden="true"><img src="${publicAssetUrl('host-avatar.jpg')}" alt="" /></span>
            <div class="broadcaster-info"><strong>小夏 Summer</strong><small>正在直播 · 关注我</small></div>
            <button id="follow-button" class="follow-button" type="button" aria-label="关注主播">关注</button>
          </div>
          <div class="audience" aria-label="模拟在线观众">1.2K</div>
          <button class="live-close" id="close-button" type="button" aria-label="退出直播间">${icons.close}</button>
        </header>

        <div class="gift-toast" id="gift-toast" role="status" aria-live="polite"></div>
        <div class="reaction-stream" id="reaction-stream" aria-hidden="true"></div>
        <div class="live-lower">
          <div class="live-comments" id="live-comments" aria-live="polite"></div>
          <div class="emoji-picker" id="emoji-picker" aria-label="选择聊天表情" hidden>${['🥰', '😂', '❤️', '👏', '✨', '🌧️', '🎆', '🎁'].map((emoji) => `<button type="button" data-chat-emoji="${emoji}" aria-label="插入${emoji}">${emoji}</button>`).join('')}</div>
          <div class="live-bottom">
            <form class="chat-form" id="chat-form"><input class="chat-input" id="chat-input" type="text" maxlength="80" placeholder="说点什么…" aria-label="发送评论" /></form>
            <button class="bottom-action emoji-action" id="emoji-button" type="button" aria-label="选择聊天表情" aria-expanded="false">${icons.emoji}</button>
            <button class="bottom-action heart-action" id="heart-button" type="button" aria-label="点赞">${icons.heart}<span class="action-count" id="like-count">2.4K</span></button>
            <button class="bottom-action gift-action" id="gift-button" type="button" aria-label="打开礼物面板">${icons.gift}<span>礼物</span></button>
            <button class="bottom-action share-action" id="share-button" type="button" aria-label="分享">${icons.share}</button>
          </div>
        </div>
        <div class="live-home-indicator" aria-hidden="true"></div>
        <div class="ended-overlay" id="ended-overlay" hidden><h2>已退出直播间</h2><p>返回后将重新连接实时摄像头。</p><button id="resume-button" type="button">返回直播</button></div>
      </div>

      <div class="sheet-backdrop" id="sheet-backdrop" hidden></div>
      <section class="gift-sheet" id="gift-sheet" aria-label="礼物面板" aria-hidden="true">
        <div class="sheet-handle"></div>
        <div class="sheet-head"><div><h2>送出礼物</h2><p id="gift-sheet-hint">礼物会出现在主播画面中，并加强表情特效</p></div><button id="gift-close" class="sheet-close" type="button" aria-label="关闭礼物面板">${icons.close}</button></div>
        <div class="gift-tabs" id="gift-tabs"><button type="button" class="active" data-gift-tab="all">热门</button><button type="button" data-gift-tab="interactive">表情互动</button></div>
        <div class="gift-grid" id="gift-grid"></div>
        <div class="gift-send-row"><div class="coin-balance">${icons.coin}<span>体验币 <b id="coin-count">999</b></span><button id="reset-coins" type="button">重置</button></div><button class="send-gift-button" id="send-gift-button" type="button">送出礼物</button></div>
        <p class="gift-disclaimer">体验礼物，不产生实际扣费，也不会发送到真实直播间。</p>
      </section>

      <section class="source-sheet" id="source-sheet" aria-label="画面输入设置" aria-hidden="false">
        <div class="sheet-head"><div><h2>画面输入</h2><p>${VALIDATION_ENABLED ? '实时镜头与本地图像模拟' : '实时摄像头'}</p></div></div>
        <div class="source-status" id="source-status">正在准备输入</div>
        <div class="camera-help" id="camera-help" hidden>
          <strong>当前地址的摄像头请求被拒绝</strong>
          <div class="camera-localhost-step" id="camera-localhost-step" hidden>
            <p>先换用这台电脑的 localhost 地址，再点一次“打开摄像头”。浏览器可能对两个本机地址分别保存相机权限。</p>
            <a class="camera-localhost-link" id="camera-localhost-link" href="#">切换到 localhost 继续测试 →</a>
          </div>
          <p>仍然无法打开？请在浏览器地址栏的网站权限中允许“相机”，然后点下方“实时摄像头”重试。也可以在 Chrome、Edge 或 Safari 打开同一地址：</p>
          <div class="camera-help-link"><code id="camera-help-url"></code><button id="camera-help-copy" type="button">复制地址</button></div>
          <p>仍被拒绝时，请检查 macOS「系统设置 → 隐私与安全性 → 相机」中对应浏览器的权限。</p>
        </div>
        <div class="source-options">
          <button class="source-option camera-toggle" id="camera-retry" type="button" role="switch" aria-label="实时摄像头" aria-checked="true"><span class="camera-toggle-icon">📷</span><span class="camera-toggle-copy"><b>实时摄像头</b><small id="camera-toggle-hint">本机识别，不录音</small></span><span class="camera-toggle-track" aria-hidden="true"><i></i></span></button>
        </div>
        <div class="camera-device-row" id="camera-device-row" hidden><label for="camera-device-select">当前摄像头</label><select id="camera-device-select" aria-label="选择要使用的摄像头"></select><small>如果画面拍到天花板或房间，请换一个镜头，或调整镜头方向。</small></div>
        <div class="image-test-group" ${VALIDATION_ENABLED ? '' : 'hidden'}>
          <strong class="source-subtitle">图像模拟验证</strong>
          <div class="sample-grid" id="sample-grid">${IMAGE_SAMPLES.map((sample) => `<button class="sample-card" type="button" data-image-sample="${sample.id}" aria-label="用${sample.name}图片模拟主播" aria-pressed="false"><img src="${sample.src}" alt="" loading="lazy" /><span class="sample-card-info"><b>${sample.name}</b></span></button>`).join('')}</div>
          <label class="upload-option" for="image-upload">上传本地表情图片 <span aria-hidden="true">＋</span></label>
          <input id="image-upload" type="file" accept="image/*" hidden aria-label="上传本地表情图片" />
          <button class="sequence-button" id="play-sequence" type="button">播放连续表情视频 · 32 秒</button>
          <p class="image-test-note">图片或视频会显示在直播画面中，并由同一人脸模型连续识别；仅供本地验证。</p>
          <button class="return-camera" id="return-camera" type="button" hidden>返回实时摄像头</button>
        </div>
        <p class="source-note">面部表情只在本机实时识别，不录音或上传画面。</p>
      </section>
    </main>
    <aside class="lab-panel" id="lab-panel" aria-label="互动演示控制台">
      <header class="lab-panel-head">
        <span class="lab-eyebrow"><i aria-hidden="true"></i> LIVE STUDIO · 本地演示</span>
        <h1>互动实验台</h1>
        <p>直播画面与演示控制分开呈现</p>
      </header>
      <section class="lab-card lab-input-summary" aria-label="当前输入">
        <div class="lab-section-heading"><h2>画面来源</h2><span class="source-pill" id="source-pill">正在连接实时摄像头</span></div>
        <button class="camera-status" id="camera-status" type="button" aria-live="polite">正在连接实时摄像头…</button>
      </section>
      <section class="lab-card lab-readout" aria-label="实时识别状态">
        <div class="lab-section-heading"><h2>实时状态</h2><span class="lab-live-pulse" aria-hidden="true"></span></div>
        <div class="recognition-status" id="recognition-status" role="status" aria-live="polite">● 正在连接实时摄像头</div>
        <div class="effect-caption" id="effect-caption" aria-live="polite">面向镜头，试着微笑 ✨</div>
        <div class="effect-countdown" id="effect-countdown" hidden></div>
        <div class="gift-cue" id="gift-cue" aria-live="polite"></div>
      </section>
      <section class="lab-card lab-context" aria-label="互动触发场景">
        <div class="lab-section-heading"><h2>触发场景</h2><span class="context-assumption">方案假设</span></div>
        <p class="context-intro">场景决定何时开放互动；表情决定下雨或放烟花。</p>
        <div class="context-modes" aria-label="选择触发场景">
          <button type="button" data-context-mode="natural" aria-pressed="true">自然互动</button>
          <button type="button" data-context-mode="gift" aria-pressed="false">礼物联动</button>
          <button type="button" data-context-mode="pk" aria-pressed="false">PK 阶段</button>
          <button type="button" data-context-mode="topic" aria-pressed="false">话题片段</button>
        </div>
        <p class="context-detail" id="context-detail">默认开放：无需送礼，微笑或大笑经确认即可触发。</p>
        <button class="context-toggle" id="context-toggle" type="button" hidden></button>
        <div class="context-status" id="context-status" role="status" aria-live="polite">自然互动已开放</div>
      </section>
    </aside>
    </div>
  </div>
`;

// Keep the full live frame free of diagnostic controls. The existing camera and
// image-validation inputs remain available in the adjacent experiment panel.
$('#lab-panel').append($('#source-sheet'));

const stage = $('#stage');
const image = $('#source-image');
const video = $('#source-video');
const imageBg = $('#source-image-bg');
const videoBg = $('#source-video-bg');
const engine = new EffectStage($('#effect-canvas'));
const controller = new ExpressionController();
const effectGate = new ExpressionEffectGate();
const interactionContext = new InteractionContext();

let landmarker = null;
let handLandmarker = null;
let handModelPromise = null;
let handModelUnavailable = false;
let handModelMode = 'IMAGE';
let visionWorker = null;
let workerUnavailable = false;
let modelPromise = null;
let modelMode = 'IMAGE';
let inferenceBusy = false;
let lastInferenceStartAt = 0;
let mode = 'idle';
let stream = null;
let currentResult = null;
let currentSignals = null;
let currentHandResult = null;
let lastHandDetectionAt = -Infinity;
let lastHandInferenceAt = -Infinity;
let sourceWidth = 0;
let sourceHeight = 0;
let layout = null;
let collider = null;
let lastColliderAt = 0;
let lastDetectionAt = 0;
let lastVideoTime = -1;
let lastFrameAt = performance.now();
let operation = 0;
let selectedGiftId = GIFTS[0].id;
let giftTab = 'all';
let coins = 999;
let likes = 2400;
let toastUntil = 0;
let cueUntil = 0;
let pendingGift = null;
let closed = false;
let latestSnapshot = controller.snapshot(false, 0);
let lastControllerDetectionAt = 0;
let cameraConnecting = false;
let cameraEnabled = true;
let queuedCameraStart = false;
let queuedCameraDeviceId = null;
let currentCameraLabel = '';
let cameraPermissionBlocked = false;
let resumeCameraOnVisible = false;
let resumeCameraDeviceId = null;
let videoReadyCancel = null;
let cameraRetryTimer = null;
let cameraRetryCount = 0;
let selectedImageId = null;
let uploadedImageUrl = null;
let lastStatusRenderedAt = 0;
$('#camera-help-url').textContent = location.href;
const cameraLocalhostUrl = (() => {
  if (location.hostname !== '127.0.0.1' || !['http:', 'https:'].includes(location.protocol)) return null;
  const url = new URL(location.href);
  url.hostname = 'localhost';
  return url.href;
})();
if (cameraLocalhostUrl) $('#camera-localhost-link').href = cameraLocalhostUrl;

function setInputStatus(message, kind = 'info') {
  const action = $('#camera-status');
  action.dataset.statusMessage = message;
  action.title = message;
  const actionLabel = mode === 'image' || mode === 'sample-video' ? '📷 切换实时摄像头'
    : mode === 'camera' ? '📷 实时摄像头'
      : !cameraEnabled ? '📷 打开摄像头'
        : kind === 'warning' || kind === 'error' ? '📷 相机重试' : '📷 连接摄像头中…';
  if (action.textContent !== actionLabel) action.textContent = actionLabel;
  action.dataset.kind = kind;
  action.dataset.inputMode = mode;
  action.disabled = cameraConnecting && mode !== 'image' && mode !== 'sample-video';
  $('#camera-retry').setAttribute('aria-checked', String(cameraEnabled));
  $('#camera-toggle-hint').textContent = cameraEnabled && !cameraConnecting && mode === 'idle'
    && (kind === 'warning' || kind === 'error') ? '连接失败 · 点击重试'
    : cameraEnabled ? '本机识别，不录音'
    : mode === 'image' || mode === 'sample-video' ? '模拟验证中 · 点击恢复镜头' : '已关闭，不使用摄像头';
  $('#return-camera').hidden = mode !== 'image' && mode !== 'sample-video';
  if ($('#source-status').textContent !== message) $('#source-status').textContent = message;
  $('#source-status').dataset.kind = kind;
  const sourcePill = $('#source-pill');
  const sourceLabel = mode === 'image' ? '表情样本 · 非实时'
    : mode === 'sample-video' ? '演示片段 · 非实时'
      : mode === 'camera' ? '实时摄像头' : cameraEnabled ? '正在连接实时摄像头' : '摄像头已关闭';
  if (sourcePill.textContent !== sourceLabel) sourcePill.textContent = sourceLabel;
}

const contextDetails = Object.freeze({
  natural: '默认开放：无需送礼，微笑或大笑经确认即可触发。',
  gift: '互动礼物开启 8 秒等待窗口；对应表情出现才开始特效。',
  pk: '用下方开关模拟 PK 事件；只在 PK 阶段允许新特效开始。',
  topic: '手动标记主播的内容片段；网页不识别讲话内容或声音。',
});

function renderContextStatus(now = performance.now()) {
  const context = interactionContext.status(now);
  $('#context-detail').textContent = contextDetails[context.mode];
  $('#gift-sheet-hint').textContent = context.mode === 'gift'
    ? '互动礼物会等待对应表情，匹配后开启特效'
    : '礼物会出现在主播画面中，并加强表情特效';
  $('#lab-panel').querySelectorAll('[data-context-mode]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.contextMode === context.mode));
  });
  const toggle = $('#context-toggle');
  toggle.hidden = context.mode !== 'pk' && context.mode !== 'topic';
  if (!toggle.hidden) {
    const name = context.mode === 'pk' ? 'PK 阶段' : '话题片段';
    toggle.textContent = context.sceneOpen ? `结束 ${name}` : `开启 ${name}`;
    toggle.setAttribute('aria-pressed', String(context.sceneOpen));
  }
  let message = '自然互动已开放 · 新表情可触发';
  if (context.mode === 'gift') {
    message = context.waitingFor
      ? `礼物已就绪 · 等待${context.waitingFor === 'rain' ? '微笑' : '大笑'}（剩余 ${Math.ceil(context.giftRemainingMs / 1000)} 秒）`
      : '等待雨系或烟花系互动礼物';
  } else if (context.mode === 'pk' || context.mode === 'topic') {
    const name = context.mode === 'pk' ? 'PK 阶段' : '话题片段';
    message = context.sceneOpen ? `${name}已开放 · 新表情可触发` : `等待开启 ${name}`;
  }
  if ($('#context-status').textContent !== message) $('#context-status').textContent = message;
}

function renderLiveStatus(snapshot, hasFace, now) {
  // Reflect the real recognizer and the actual effect gate. This display never
  // controls recognition or the effect timeline.
  if (now - lastStatusRenderedAt < 100) return;
  lastStatusRenderedAt = now;
  renderContextStatus(now);
  const status = $('#recognition-status');
  const effectCaption = $('#effect-caption');
  const countdown = $('#effect-countdown');
  const source = mode === 'image' ? '表情样本' : mode === 'sample-video' ? '演示片段' : '实时摄像头';
  let recognition;
  if (!['camera', 'image', 'sample-video'].includes(mode)) {
    const inputKind = $('#camera-status').dataset.kind;
    recognition = inputKind === 'warning' || inputKind === 'error'
      ? `● ${$('#camera-status').dataset.statusMessage}`
      : cameraConnecting ? '● 正在连接实时摄像头' : cameraEnabled ? '● 等待画面输入' : '● 摄像头已关闭';
  } else if (!hasFace) {
    recognition = `● ${source} · 未识别到人脸`;
  } else {
    const expression = snapshot.coveredLaughConfirmed
      ? '捂嘴笑' : snapshot.laughConfirmed || snapshot.state === 'laugh'
        ? '大笑' : snapshot.coveredLaughCandidate ? '捂嘴笑识别中'
          : hasCurrentSmile(snapshot) ? '微笑' : '平静';
    recognition = mode === 'camera' ? `● 已识别到人脸 · ${expression}` : `● ${source} · ${expression}`;
  }
  if (status.textContent !== recognition) status.textContent = recognition;
  status.dataset.kind = hasFace ? 'face' : 'waiting';

  const gate = effectGate.status(now);
  let caption = '面向镜头，试着微笑 ✨';
  let timer = '';
  if (gate.phase === 'playing') {
    caption = gate.effect === 'rain' ? '雨正淋在主播头上 · 笑容召雨 🌧️' : '烟花正在绽放 · 火花碰到主播会弹开 🎆';
    timer = '表情持续，特效继续';
  } else if (gate.phase === 'releasing') {
    caption = gate.effect === 'rain' ? '笑容收起 · 雨云正在散去 🌧️' : '笑容收起 · 烟花正在收尾 🎆';
  } else if (gate.phase === 'cooldown') {
    caption = '本轮特效结束 · 即将识别下一轮表情';
    timer = `下一轮识别 ${Math.ceil(gate.cooldownRemainingMs / 1000)} 秒`;
  } else if (!interactionContext.canStart('rain', now)
    && !interactionContext.canStart('firework', now)) {
    const context = interactionContext.status(now);
    caption = context.mode === 'gift' ? '等待互动礼物开启表情特效'
      : context.mode === 'pk' ? '等待 PK 阶段开启'
        : '等待话题片段开启';
  } else if (hasFace && snapshot.coveredLaughConfirmed) {
    caption = '笑眼已识别 · 捂嘴笑放烟花 🎆';
  } else if (hasFace && snapshot.coveredLaughCandidate) {
    caption = '手捂嘴、眼睛在笑 · 即将放烟花 🎆';
  } else if (hasFace && (snapshot.laughConfirmed || snapshot.state === 'laugh')) {
    caption = '笑容已识别 · 开口笑放烟花 🎆';
  } else if (hasFace && hasCurrentSmile(snapshot)) {
    caption = '笑容已识别 · 即将召来雨云 🌧️';
  } else if (hasFace) {
    caption = '表情已识别 · 试着微笑 ✨';
  }
  if (effectCaption.textContent !== caption) effectCaption.textContent = caption;
  if (countdown.textContent !== timer) countdown.textContent = timer;
  countdown.hidden = !timer;
  stage.dataset.effectPhase = gate.phase;
}

function cancelCameraRetry() {
  if (cameraRetryTimer !== null) window.clearTimeout(cameraRetryTimer);
  cameraRetryTimer = null;
}

function scheduleCameraRetry() {
  cancelCameraRetry();
  if (closed || !cameraEnabled) return;
  if (document.hidden) {
    resumeCameraOnVisible = true;
    resumeCameraDeviceId = null;
    return;
  }
  const delay = Math.min(1500 * 2 ** Math.min(cameraRetryCount++, 4), 20000);
  cameraRetryTimer = window.setTimeout(() => {
    cameraRetryTimer = null;
    if (closed || !cameraEnabled) return;
    if (document.hidden) {
      resumeCameraOnVisible = true;
      resumeCameraDeviceId = null;
      return;
    }
    void startCamera();
  }, delay);
}

function stopCameraByUser() {
  cameraEnabled = false;
  queuedCameraStart = false;
  resumeCameraOnVisible = false;
  cancelCameraRetry();
  cameraRetryCount = 0;
  cameraPermissionBlocked = false;
  $('#camera-help').hidden = true;
  operation++;
  releaseMedia();
  resetVisualState();
  mode = 'idle';
  showEmptyStage();
  pendingGift = null;
  setCue('');
  setInputStatus('摄像头已关闭', 'off');
}

function enableCamera() {
  cameraEnabled = true;
  selectedImageId = null;
  updateSampleSelection();
  const oldUpload = uploadedImageUrl;
  uploadedImageUrl = null;
  if (oldUpload) URL.revokeObjectURL(oldUpload);
  setInputStatus('正在连接实时摄像头…');
  // Device IDs can change between browser sessions. Start with the default;
  // the device picker still allows an explicit switch after connection.
  void startCamera();
}

function updateSampleSelection() {
  $('#sample-grid').querySelectorAll('[data-image-sample]').forEach((button) => {
    const selected = button.dataset.imageSample === selectedImageId;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

function showToast(emoji, title, detail, duration = 3000) {
  const toast = $('#gift-toast');
  toast.innerHTML = `<span class="gift-toast-icon">${emoji}</span><span><strong>${title}</strong><small>${detail}</small></span>`;
  toast.classList.add('visible');
  toastUntil = performance.now() + duration;
}

function setCue(text, duration = 8000) {
  const cue = $('#gift-cue');
  cue.textContent = text;
  cue.classList.toggle('visible', Boolean(text));
  cueUntil = text ? performance.now() + duration : 0;
}

function addComment(name, text, gift = false) {
  const list = $('#live-comments');
  const item = document.createElement('div');
  item.className = `comment${gift ? ' gift-comment' : ''}`;
  const nameNode = document.createElement('strong');
  const textNode = document.createElement('span');
  nameNode.textContent = name;
  textNode.textContent = text;
  item.append(nameNode, textNode);
  list.append(item);
  while (list.children.length > 5) list.firstElementChild.remove();
}

function spawnHeart() {
  const heart = document.createElement('span');
  heart.className = 'floating-heart';
  heart.textContent = ['♥', '♥', '✦'][Math.floor(Math.random() * 3)];
  heart.style.setProperty('--heart-x', `${Math.round((Math.random() - 0.5) * 80)}px`);
  $('#reaction-stream').append(heart);
  heart.addEventListener('animationend', () => heart.remove(), { once: true });
}

function renderGiftGrid() {
  const shown = giftTab === 'interactive' ? GIFTS.filter((gift) => gift.expression) : GIFTS;
  $('#gift-grid').innerHTML = shown.map((gift) => `
    <button class="gift-card${selectedGiftId === gift.id ? ' active selected' : ''}" type="button" data-gift="${gift.id}" aria-label="选择${gift.name}礼物">
      <span class="gift-visual gift-${gift.id}"><span class="gift-icon">${gift.emoji}</span></span>
      <span class="gift-name">${gift.name}</span>
      <span class="gift-price">${icons.coin}${gift.price}</span>
      ${gift.expression ? `<span class="gift-tag">${gift.expression === 'smile' ? '微笑联动' : '大笑联动'}</span>` : ''}
    </button>`).join('');
  $('#gift-grid').querySelectorAll('[data-gift]').forEach((button) => button.addEventListener('click', () => {
    selectedGiftId = button.dataset.gift;
    renderGiftGrid();
    updateSendButton();
  }));
  updateSendButton();
}

function updateSendButton() {
  const gift = GIFTS.find((item) => item.id === selectedGiftId);
  $('#coin-count').textContent = String(coins);
  const button = $('#send-gift-button');
  button.textContent = gift ? `送出 ${gift.name}` : '送出礼物';
  button.disabled = !gift || coins < gift.price;
}

function openSheet(name) {
  $('#emoji-picker').hidden = true;
  $('#emoji-button').setAttribute('aria-expanded', 'false');
  const giftOpen = name === 'gift';
  $('#gift-sheet').classList.toggle('open', giftOpen);
  $('#gift-sheet').setAttribute('aria-hidden', String(!giftOpen));
  $('#sheet-backdrop').hidden = !giftOpen;
  stage.classList.toggle('sheet-open', giftOpen);
}

function sendSelectedGift() {
  const gift = GIFTS.find((item) => item.id === selectedGiftId);
  if (!gift || coins < gift.price) return;
  coins -= gift.price;
  updateSendButton();
  const now = performance.now();
  const gate = effectGate.status(now);
  const sameEffectPlaying = gate.phase === 'playing'
    && ((gate.effect === 'rain' && gift.expression === 'smile')
      || (gate.effect === 'firework' && gift.expression === 'laugh'));
  // Expression-linked gifts enter a finite waiting window before the gate
  // starts an effect. This also prevents a gift from bypassing scene rules.
  const effectsBlocked = gift.expression ? !sameEffectPlaying : gate.blocked;
  const result = engine.sendGift(gift.id, collider, now, {
    effectsBlocked,
    // A sustained effect has no known end. A gift's wait window must remain
    // finite instead of inheriting Infinity from the active effect gate.
    resumeAt: Number.isFinite(effectGate.cooldownUntil)
      ? Math.max(now, effectGate.cooldownUntil) : now,
  });
  if (gift.expression && result?.pending) {
    interactionContext.armGift(gift.expression, result.expiresAt);
  }
  renderContextStatus(now);
  openSheet(null);
  addComment('你', `送出了 ${gift.name} ×1`, true);
  for (let i = 0; i < 3; i++) window.setTimeout(spawnHeart, i * 90);
  if (result?.pending) {
    pendingGift = { id: gift.id, expiresAt: result.expiresAt };
    setCue(`${gift.emoji} ${gift.name}已送出 · 等待匹配表情`, result.expiresAt - now);
    showToast(gift.emoji, `你送出了 ${gift.name}`, '等待主播表情点亮礼物');
  } else {
    if (gift.expression) {
      pendingGift = null;
      setCue('');
    }
    showToast(gift.emoji, `你送出了 ${gift.name}`, result?.deferred ? '当前特效期间仅显示送礼反馈'
      : gift.expression && result?.matched ? '主播表情已点亮礼物特效' : '礼物已出现在直播画面中');
  }
}

async function ensureModel() {
  if (visionWorker) return visionWorker;
  if (landmarker) return landmarker;
  if (!modelPromise) {
    modelPromise = (async () => {
      if (!workerUnavailable) {
        const candidate = new WorkerFaceVision();
        try {
          await candidate.ready;
          visionWorker = candidate;
          document.documentElement.dataset.visionRuntime = 'worker';
          return candidate;
        } catch (error) {
          candidate.close();
          workerUnavailable = true;
          console.warn('Worker recognition unavailable; using compatible mode:', error);
        }
      }
      const vision = await FilesetResolver.forVisionTasks(publicAssetUrl('wasm'));
      document.documentElement.dataset.visionRuntime = 'main-thread-fallback';
      const face = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: publicAssetUrl('models/face_landmarker.task'), delegate: 'CPU' },
        runningMode: 'IMAGE', numFaces: 1,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputFaceBlendshapes: true,
      });
      // Hand tracking is optional so a model failure cannot take down the
      // established camera and open-mouth smile path.
      void ensureFallbackHandModel(vision);
      return face;
    })().then((instance) => {
      if (instance !== visionWorker) landmarker = instance;
      return instance;
    }).catch((error) => {
      modelPromise = null;
      setInputStatus('识别模型加载失败，可重试', 'error');
      throw error;
    });
  }
  return modelPromise;
}

function ensureFallbackHandModel(vision) {
  if (handLandmarker || handModelUnavailable) return Promise.resolve(handLandmarker);
  if (!handModelPromise) {
    handModelPromise = HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: publicAssetUrl('models/hand_landmarker.task'), delegate: 'CPU' },
      runningMode: 'IMAGE', numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    }).then(async (instance) => {
      if (modelMode !== 'IMAGE') await instance.setOptions({ runningMode: modelMode });
      handLandmarker = instance;
      handModelMode = modelMode;
      return instance;
    }).catch((error) => {
      handModelUnavailable = true;
      console.warn('Hand recognition unavailable; face recognition remains active:', error);
      return null;
    });
  }
  return handModelPromise;
}

async function switchModelMode(nextMode) {
  const model = await ensureModel();
  if (model === visionWorker) return model;
  if (modelMode !== nextMode) {
    await model.setOptions({ runningMode: nextMode });
    modelMode = nextMode;
  }
  if (handLandmarker && handModelMode !== nextMode) {
    await handLandmarker.setOptions({ runningMode: nextMode });
    handModelMode = nextMode;
    currentHandResult = null;
    lastHandDetectionAt = -Infinity;
    lastHandInferenceAt = -Infinity;
  }
  return model;
}

function detectFallbackHands(source, runningMode, now) {
  if (!handLandmarker || handModelMode !== runningMode
    || now - lastHandInferenceAt < 190) return { result: null, timestampMs: null };
  lastHandInferenceAt = now;
  try {
    return {
      result: runningMode === 'VIDEO'
        ? handLandmarker.detectForVideo(source, now)
        : handLandmarker.detect(source),
      timestampMs: now,
    };
  } catch (error) {
    handModelUnavailable = true;
    handLandmarker?.close();
    handLandmarker = null;
    currentHandResult = null;
    console.warn('Hand recognition stopped; face recognition remains active:', error);
    return { result: null, timestampMs: null };
  }
}

function releaseMedia() {
  videoReadyCancel?.(new Error('摄像头启动已取消'));
  videoReadyCancel = null;
  const oldStream = stream;
  stream = null;
  if (oldStream) for (const track of oldStream.getTracks()) track.stop();
  currentCameraLabel = '';
  video.pause();
  videoBg.pause();
  video.srcObject = null;
  videoBg.srcObject = null;
  video.removeAttribute('src');
  videoBg.removeAttribute('src');
  video.load();
  videoBg.load();
}

function showEmptyStage() {
  image.hidden = true;
  imageBg.hidden = true;
  video.hidden = true;
  videoBg.hidden = true;
  image.removeAttribute('src');
  imageBg.removeAttribute('src');
  sourceWidth = 0;
  sourceHeight = 0;
  layout = null;
  stage.classList.remove('landscape-source');
}

function resetVisualState(preservePendingGifts = false) {
  controller.reset();
  effectGate.reset();
  latestSnapshot = controller.snapshot(false, 0);
  lastControllerDetectionAt = 0;
  engine.clear(preservePendingGifts);
  currentResult = null;
  currentSignals = null;
  currentHandResult = null;
  lastHandDetectionAt = -Infinity;
  lastHandInferenceAt = -Infinity;
  collider = null;
  lastColliderAt = 0;
  lastDetectionAt = 0;
  lastInferenceStartAt = 0;
  lastVideoTime = -1;
}

function applyLayout() {
  if (!sourceWidth || !sourceHeight || !['camera', 'image', 'sample-video'].includes(mode)) return;
  const wideSource = sourceWidth / sourceHeight > stage.clientWidth / stage.clientHeight * 1.18;
  stage.classList.toggle('landscape-source', wideSource);
  layout = coverLayout(sourceWidth, sourceHeight, stage.clientWidth, stage.clientHeight, wideSource ? 0.78 : 1, 0, 0);
  const media = mode === 'image' ? image : video;
  Object.assign(media.style, {
    width: `${layout.width}px`,
    height: `${layout.height}px`,
    left: `${layout.left}px`,
    top: `${layout.top}px`,
  });
  video.classList.toggle('mirror', mode === 'camera');
  videoBg.classList.toggle('mirror', mode === 'camera');
}

function updateCollider(now) {
  const points = currentResult?.faceLandmarks?.[0];
  if (!points || !layout || !controller.hasFace || !['camera', 'image', 'sample-video'].includes(mode) || now - lastDetectionAt > 800) {
    collider = null;
    return;
  }
  const target = faceColliderFromLandmarks(points, layout, sourceWidth, sourceHeight, mode === 'camera');
  if (!target) { collider = null; return; }
  const dt = (now - lastColliderAt) / 1000;
  if (collider && dt > 0 && dt < 0.25) {
    const alpha = 0.28;
    target.x = collider.x + (target.x - collider.x) * alpha;
    target.y = collider.y + (target.y - collider.y) * alpha;
    target.rx = collider.rx + (target.rx - collider.rx) * alpha;
    target.ry = collider.ry + (target.ry - collider.ry) * alpha;
  }
  collider = updateColliderMotion(collider, target, dt);
  lastColliderAt = now;
}

function assignResult(result, now, handResult = null, handTimestampMs = null) {
  currentResult = result;
  if (handResult && Number.isFinite(handTimestampMs)) {
    currentHandResult = handResult;
    lastHandDetectionAt = handTimestampMs;
  }
  const handIsFresh = currentHandResult && now >= lastHandDetectionAt
    && now - lastHandDetectionAt <= 270;
  currentSignals = signalsFromResult(result, sourceWidth, sourceHeight,
    handIsFresh ? currentHandResult : null, handIsFresh ? lastHandDetectionAt : null);
  lastDetectionAt = now;
}

function applyVideoResult(result, now, handResult = null, handTimestampMs = null) {
  assignResult(result, now, handResult, handTimestampMs);
}

function waitForVideoReady() {
  return new Promise((resolve, reject) => {
    let playing = false;
    let frameReady = video.readyState >= 2;
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (videoReadyCancel === cancel) videoReadyCancel = null;
      error ? reject(error) : resolve();
    };
    const cancel = (error) => finish(error);
    videoReadyCancel = cancel;
    const maybeReady = () => { if (playing && frameReady) finish(); };
    const timer = window.setTimeout(() => finish(new Error('视频启动超时')), 12000);
    const onReady = () => { frameReady = true; maybeReady(); };
    const onError = () => finish(new Error('无法读取视频'));
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('error', onError);
    };
    video.addEventListener('loadeddata', onReady, { once: true });
    video.addEventListener('error', onError, { once: true });
    Promise.resolve().then(() => video.play()).then(() => { playing = true; maybeReady(); }, finish);
  });
}

async function startVideo(cameraStream, token) {
  releaseMedia();
  resetVisualState(true);
  mode = 'camera';
  image.hidden = true;
  video.hidden = false;
  imageBg.hidden = true;
  videoBg.hidden = false;
  setInputStatus('正在连接实时摄像头…');
  try {
    stream = cameraStream;
    video.srcObject = cameraStream;
    videoBg.srcObject = cameraStream;
    video.loop = false;
    videoBg.loop = false;
    void videoBg.play().catch(() => {});
    await waitForVideoReady();
    if (token !== operation) return null;
    sourceWidth = video.videoWidth;
    sourceHeight = video.videoHeight;
    applyLayout();
    await switchModelMode('VIDEO');
    if (token !== operation) return null;
    setInputStatus('实时摄像头', 'live');
  } catch (error) {
    if (token !== operation) return null;
    releaseMedia();
    mode = 'idle';
    showEmptyStage();
    console.error('Camera video failed:', error);
    // A video.play() NotAllowedError is an autoplay failure, not camera
    // permission denial. Let the outer camera recovery path handle it.
    throw new Error(error?.message || '视频画面启动失败', { cause: error });
  }
  return token;
}

async function startImageSource(src, { sampleId = null, objectUrl = null } = {}) {
  if (closed) return;
  const token = ++operation;
  cancelCameraRetry();
  queuedCameraStart = false;
  resumeCameraOnVisible = false;
  cameraEnabled = false;
  releaseMedia();
  resetVisualState(true);
  showEmptyStage();
  mode = 'image';
  selectedImageId = sampleId;
  updateSampleSelection();
  const oldUpload = uploadedImageUrl;
  uploadedImageUrl = objectUrl;
  image.src = src;
  imageBg.src = src;
  image.hidden = false;
  imageBg.hidden = false;
  video.hidden = true;
  videoBg.hidden = true;
  if (oldUpload && oldUpload !== objectUrl) URL.revokeObjectURL(oldUpload);
  setInputStatus('图像模拟 · 正在加载图片…', 'image');
  openSheet(null);
  try {
    await image.decode();
    if (token !== operation || mode !== 'image') return;
    sourceWidth = image.naturalWidth;
    sourceHeight = image.naturalHeight;
    if (!sourceWidth || !sourceHeight) throw new Error('图片尺寸不可用');
    applyLayout();
    await switchModelMode('IMAGE');
    if (token !== operation || mode !== 'image') return;
    setInputStatus('图像模拟 · 正在识别表情', 'image');
  } catch (error) {
    if (token !== operation) return;
    console.error('Image input failed:', error);
    setInputStatus('图片读取或识别失败 · 请换一张', 'error');
  }
}

async function startSampleVideo() {
  if (closed) return;
  const token = ++operation;
  cancelCameraRetry();
  queuedCameraStart = false;
  resumeCameraOnVisible = false;
  cameraEnabled = false;
  releaseMedia();
  resetVisualState(true);
  showEmptyStage();
  mode = 'sample-video';
  selectedImageId = null;
  updateSampleSelection();
  const oldUpload = uploadedImageUrl;
  uploadedImageUrl = null;
  if (oldUpload) URL.revokeObjectURL(oldUpload);
  video.src = publicAssetUrl('validation/expression-sequence.mp4');
  videoBg.src = video.src;
  video.loop = true;
  videoBg.loop = true;
  image.hidden = true;
  imageBg.hidden = true;
  video.hidden = false;
  videoBg.hidden = false;
  setInputStatus('视频模拟 · 正在加载…', 'sample-video');
  openSheet(null);
  try {
    void videoBg.play().catch(() => {});
    await waitForVideoReady();
    if (token !== operation || mode !== 'sample-video') return;
    sourceWidth = video.videoWidth;
    sourceHeight = video.videoHeight;
    if (!sourceWidth || !sourceHeight) throw new Error('视频尺寸不可用');
    applyLayout();
    await switchModelMode('VIDEO');
    if (token !== operation || mode !== 'sample-video') return;
    setInputStatus('视频模拟 · 连续识别中', 'sample-video');
  } catch (error) {
    if (token !== operation) return;
    releaseMedia();
    mode = 'idle';
    showEmptyStage();
    setInputStatus('连续视频无法播放 · 可改用图片', 'error');
    console.error('Sample video failed:', error);
  }
}

async function refreshCameraDevices() {
  if (!navigator.mediaDevices?.enumerateDevices || !stream) return;
  try {
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'videoinput');
    if (!stream || !devices.length) return;
    const select = $('#camera-device-select');
    const activeId = stream.getVideoTracks()[0]?.getSettings().deviceId;
    select.replaceChildren();
    devices.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || `摄像头 ${index + 1}`;
      select.append(option);
    });
    if (activeId && devices.some((device) => device.deviceId === activeId)) select.value = activeId;
    currentCameraLabel = stream.getVideoTracks()[0]?.label || select.selectedOptions[0]?.textContent || '';
    $('#camera-device-row').hidden = false;
    setInputStatus($('#camera-status').dataset.statusMessage, $('#camera-status').dataset.kind);
  } catch (error) {
    console.warn('Camera list unavailable:', error);
  }
}

function pauseCamera(message = '摄像头已暂停 · 返回页面后自动重连') {
  if (mode !== 'camera') return;
  operation++;
  releaseMedia();
  resetVisualState(true);
  mode = 'idle';
  showEmptyStage();
  setInputStatus(message, 'warning');
}

async function startCamera(deviceId = null) {
  if (closed || !cameraEnabled) return;
  if (document.hidden) {
    resumeCameraOnVisible = true;
    resumeCameraDeviceId = null;
    setInputStatus('页面在后台 · 返回后自动重连摄像头', 'warning');
    return;
  }
  if (mode === 'image' || mode === 'sample-video') {
    if (mode === 'sample-video') releaseMedia();
    mode = 'idle';
    resetVisualState(true);
    showEmptyStage();
  }
  if (cameraConnecting) {
    queuedCameraStart = true;
    queuedCameraDeviceId = deviceId;
    return;
  }
  cancelCameraRetry();
  if (!navigator.mediaDevices?.getUserMedia) {
    setInputStatus(window.isSecureContext
      ? '当前浏览器不支持实时摄像头'
      : '摄像头需要 HTTPS 或 localhost 地址', 'error');
    return;
  }
  if (mode === 'camera') pauseCamera('正在连接实时摄像头…');
  showEmptyStage();
  cameraPermissionBlocked = false;
  $('#camera-help').hidden = true;
  cameraConnecting = true;
  const token = ++operation;
  setInputStatus('正在等待浏览器授权摄像头…');
  $('#camera-device-select').disabled = true;
  try {
    const videoConstraints = { width: { ideal: 1280 }, height: { ideal: 720 } };
    if (deviceId) videoConstraints.deviceId = { exact: deviceId };
    else videoConstraints.facingMode = 'user';
    let cameraStream;
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
    } catch (error) {
      const failure = classifyCameraFailure(error, { hasDeviceId: Boolean(deviceId) });
      if (!failure.fallbackToDefault) throw error;
      setInputStatus(failure.message, 'warning');
      deviceId = null;
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      });
    }
    if (token !== operation || closed || !cameraEnabled || document.hidden) {
      cameraStream.getTracks().forEach((track) => track.stop());
      if (token === operation && document.hidden) {
        resumeCameraOnVisible = true;
        resumeCameraDeviceId = null;
        setInputStatus('页面在后台 · 返回后自动重连摄像头', 'warning');
      }
      return;
    }
    resumeCameraOnVisible = false;
    const readyToken = await startVideo(cameraStream, token);
    if (readyToken === null || mode !== 'camera' || stream !== cameraStream) return;
    if (!cameraTrackLive(cameraStream)) throw new Error('摄像头视频流已中断');
    cameraRetryCount = 0;
    currentCameraLabel = cameraStream.getVideoTracks()[0]?.label || '';
    setInputStatus($('#camera-status').dataset.statusMessage, $('#camera-status').dataset.kind);
    cameraStream.getVideoTracks()[0]?.addEventListener('ended', () => {
      if (mode === 'camera' && stream === cameraStream) {
        pauseCamera('摄像头连接中断 · 正在自动重连');
        scheduleCameraRetry();
      }
    }, { once: true });
    await refreshCameraDevices();
  } catch (error) {
    if (token !== operation) return;
    if (mode === 'camera' && !cameraTrackLive(stream)) pauseCamera('摄像头视频流已中断');
    if (!document.hidden) resumeCameraOnVisible = false;
    const offerLocalhost = error?.name === 'NotAllowedError' && Boolean(cameraLocalhostUrl);
    const failure = classifyCameraFailure(error, { offerLocalhost });
    cameraPermissionBlocked = failure.kind === 'permission';
    $('#camera-help').hidden = !cameraPermissionBlocked;
    $('#camera-localhost-step').hidden = !offerLocalhost;
    setInputStatus(failure.message, 'warning');
    console.warn('Camera unavailable:', error);
    if (failure.autoRetry) scheduleCameraRetry();
  } finally {
    cameraConnecting = false;
    $('#camera-device-select').disabled = false;
    setInputStatus($('#camera-status').dataset.statusMessage, $('#camera-status').dataset.kind);
    if (queuedCameraStart && cameraEnabled && !document.hidden && !closed) {
      const queuedDevice = queuedCameraDeviceId;
      queuedCameraStart = false;
      queuedCameraDeviceId = null;
      void startCamera(queuedDevice);
    } else if (resumeCameraOnVisible && cameraEnabled && !document.hidden && !closed) {
      const resumeDevice = resumeCameraDeviceId;
      resumeCameraOnVisible = false;
      void startCamera(resumeDevice);
    }
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden || closed) { lastFrameAt = now; return; }
  const dt = Math.min((now - lastFrameAt) / 1000, 0.05);
  lastFrameAt = now;

  if ((mode === 'camera' || mode === 'sample-video')
    && (visionWorker || (landmarker && modelMode === 'VIDEO'))
    && video.readyState >= 2 && !inferenceBusy && now - lastInferenceStartAt >= 83
    && video.currentTime !== lastVideoTime) {
    const token = operation;
    const sourceMode = mode;
    lastVideoTime = video.currentTime;
    lastInferenceStartAt = now;
    if (visionWorker) {
      inferenceBusy = true;
      visionWorker.detectVideo(video, now).then((packet) => {
        if (!packet || token !== operation || sourceMode !== mode) return;
        applyVideoResult(packet.result, performance.now(), packet.handResult, packet.handTimestampMs);
      }).catch(async (error) => {
        if (token !== operation) return;
        workerUnavailable = true;
        visionWorker?.close();
        visionWorker = null;
        modelPromise = null;
        document.documentElement.dataset.visionRuntime = 'recovering';
        setInputStatus('识别线程切换兼容模式中…', 'warning');
        console.warn('Worker video recognition failed; switching modes:', error);
        try {
          await switchModelMode('VIDEO');
          if (token === operation && mode === 'camera') setInputStatus('实时摄像头', 'live');
          if (token === operation && mode === 'sample-video') setInputStatus('视频模拟 · 连续识别中', 'sample-video');
        }
        catch (fallbackError) { setInputStatus('面部识别不可用', 'error'); console.error('Video tracking failed:', fallbackError); }
      }).finally(() => { inferenceBusy = false; });
    } else {
      try {
        const faceResult = landmarker.detectForVideo(video, now);
        const hands = detectFallbackHands(video, 'VIDEO', now);
        applyVideoResult(faceResult, now, hands.result, hands.timestampMs);
      } catch (error) {
        setInputStatus('面部跟踪出现问题', 'error');
        console.error('Video tracking failed:', error);
      }
    }
  }

  if (mode === 'image' && (visionWorker || (landmarker && modelMode === 'IMAGE'))
    && image.complete && image.naturalWidth > 0 && !inferenceBusy
    && now - lastInferenceStartAt >= 100) {
    const token = operation;
    lastInferenceStartAt = now;
    if (visionWorker) {
      inferenceBusy = true;
      visionWorker.detectImage(image, now).then((packet) => {
        if (token !== operation || mode !== 'image') return;
        assignResult(packet.result, performance.now(), packet.handResult, packet.handTimestampMs);
      }).catch(async (error) => {
        if (token !== operation) return;
        workerUnavailable = true;
        visionWorker?.close();
        visionWorker = null;
        modelPromise = null;
        console.warn('Worker image recognition failed; switching modes:', error);
        setInputStatus('图像识别切换兼容模式中…', 'warning');
        try {
          await switchModelMode('IMAGE');
          if (token === operation && mode === 'image') setInputStatus('图像模拟 · 正在识别表情', 'image');
        } catch (fallbackError) {
          setInputStatus('图片面部识别不可用', 'error');
          console.error('Image recognition failed:', fallbackError);
        }
      }).finally(() => { inferenceBusy = false; });
    } else {
      try {
        const faceResult = landmarker.detect(image);
        const hands = detectFallbackHands(image, 'IMAGE', now);
        assignResult(faceResult, now, hands.result, hands.timestampMs);
      } catch (error) {
        setInputStatus('图片面部识别不可用', 'error');
        console.error('Image recognition failed:', error);
      }
    }
  }

  const faceAvailable = ['camera', 'image', 'sample-video'].includes(mode) && now - lastDetectionAt < 800
    && Boolean(currentResult?.faceLandmarks?.length);
  // A live expression must be confirmed by multiple distinct camera frames.
  // Re-running the dwell timer on every animation frame would let one stale frame
  // satisfy the smile/laugh hold time by itself.
  let snapshot;
  let freshExpressionFrame = false;
  if (lastDetectionAt && lastDetectionAt !== lastControllerDetectionAt) {
    lastControllerDetectionAt = lastDetectionAt;
    snapshot = controller.update(currentSignals, lastDetectionAt, faceAvailable);
    freshExpressionFrame = true;
  } else if (latestSnapshot.hasFace && now - lastDetectionAt > 950) {
    snapshot = controller.update(null, now, false);
  } else {
    snapshot = latestSnapshot;
  }
  latestSnapshot = snapshot;
  updateCollider(now);
  const liveSnapshot = {
    ...snapshot,
    hasFace: faceAvailable && snapshot.hasFace,
  };
  const decision = effectGate.decide(liveSnapshot, now, freshExpressionFrame);
  const permittedTrigger = decision.trigger
    && interactionContext.canStart(decision.trigger, now) ? decision.trigger : null;
  let activatedGifts = [];
  const oldRainOnset = engine.rainScene.onsetAt;
  if (permittedTrigger === 'firework') {
    const started = engine.triggerFirework(collider, now);
    activatedGifts = engine.onExpression(liveSnapshot, collider, now);
    if (started) {
      effectGate.begin('firework', now);
      interactionContext.consume('firework', now);
    }
  } else if (permittedTrigger === 'rain') {
    activatedGifts = engine.onExpression(liveSnapshot, collider, now);
  } else if (decision.phase === 'playing' && freshExpressionFrame && liveSnapshot.hasFace
    && ((decision.effect === 'rain' && hasCurrentSmile(snapshot))
      || (decision.effect === 'firework' && snapshot.laughConfirmed))) {
    // Matching gifts can strengthen an effect that is already sustained.
    activatedGifts = engine.onExpression(liveSnapshot, collider, now);
  }
  if (decision.phase === 'releasing' && decision.effect === 'rain') {
    engine.rainScene.requestRelease(now);
  }
  const gate = effectGate.status(now);
  const rainIntensity = liveSnapshot.hasFace
    && (permittedTrigger === 'rain' || (gate.phase === 'playing' && gate.effect === 'rain'))
    ? Math.max(0.6, snapshot.rainIntensity) : 0;
  engine.setFireworkSustain(gate.phase === 'playing' && gate.effect === 'firework'
    && liveSnapshot.hasFace, collider, now);
  engine.update(dt, rainIntensity, collider, now);
  if (permittedTrigger === 'rain' && engine.rainScene.onsetAt !== oldRainOnset) {
    const onset = engine.rainScene.onsetAt;
    effectGate.begin('rain', onset);
    interactionContext.consume('rain', now);
  }
  engine.draw(collider, now);
  renderLiveStatus(liveSnapshot, liveSnapshot.hasFace, now);

  if (pendingGift && now < pendingGift.expiresAt) {
    if (activatedGifts.includes(pendingGift.id)) {
      const gift = GIFTS.find((item) => item.id === pendingGift.id);
      showToast(gift.emoji, `${gift.name}已点亮`, '主播表情触发了完整礼物特效');
      setCue('');
      pendingGift = null;
    }
  } else if (pendingGift) {
    pendingGift = null;
    setCue('');
  }
  if (toastUntil && now >= toastUntil) { $('#gift-toast').classList.remove('visible'); toastUntil = 0; }
  if (cueUntil && now >= cueUntil) { setCue(''); }
}

$('#lab-panel').querySelectorAll('[data-context-mode]').forEach((button) => {
  button.addEventListener('click', () => {
    if (interactionContext.mode === button.dataset.contextMode) return;
    interactionContext.select(button.dataset.contextMode);
    // A gift waiting in a previous simulation mode must not redeem later in
    // a different mode. The visible gift-send receipt remains in the room.
    engine.pendingGifts.length = 0;
    pendingGift = null;
    setCue('');
    renderContextStatus();
    lastStatusRenderedAt = -Infinity;
  });
});
$('#context-toggle').addEventListener('click', () => {
  interactionContext.setSceneOpen(!interactionContext.sceneOpen);
  renderContextStatus();
  lastStatusRenderedAt = -Infinity;
});
renderContextStatus();

$('#gift-button').addEventListener('click', () => openSheet('gift'));
$('#gift-close').addEventListener('click', () => openSheet(null));
$('#sheet-backdrop').addEventListener('click', () => openSheet(null));
$('#send-gift-button').addEventListener('click', sendSelectedGift);
$('#reset-coins').addEventListener('click', () => { coins = 999; updateSendButton(); });
$('#gift-tabs').querySelectorAll('[data-gift-tab]').forEach((button) => button.addEventListener('click', () => {
  giftTab = button.dataset.giftTab;
  $('#gift-tabs').querySelectorAll('button').forEach((item) => item.classList.toggle('active', item === button));
  if (giftTab === 'interactive' && !GIFTS.find((gift) => gift.id === selectedGiftId)?.expression) selectedGiftId = 'rain';
  renderGiftGrid();
}));
$('#follow-button').addEventListener('click', (event) => {
  const following = event.currentTarget.classList.toggle('following');
  event.currentTarget.textContent = following ? '已关注' : '关注';
  event.currentTarget.setAttribute('aria-label', following ? '取消关注主播' : '关注主播');
  if (following) showToast('💗', '已关注直播间', '关注成功');
});
$('#heart-button').addEventListener('click', () => { likes++; $('#like-count').textContent = likes >= 1000 ? `${(likes / 1000).toFixed(1)}K` : String(likes); spawnHeart(); });
$('#emoji-button').addEventListener('click', () => {
  const picker = $('#emoji-picker');
  picker.hidden = !picker.hidden;
  $('#emoji-button').setAttribute('aria-expanded', String(!picker.hidden));
});
$('#emoji-picker').querySelectorAll('[data-chat-emoji]').forEach((button) => button.addEventListener('click', () => {
  const input = $('#chat-input');
  input.value = `${input.value}${button.dataset.chatEmoji}`.slice(0, input.maxLength);
  $('#emoji-picker').hidden = true;
  $('#emoji-button').setAttribute('aria-expanded', 'false');
  input.focus();
}));
$('#chat-input').addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    $('#emoji-picker').hidden = true;
    $('#emoji-button').setAttribute('aria-expanded', 'false');
  }
});
$('#share-button').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(location.href); showToast('↗', '已复制直播间链接', '可在本机浏览器打开'); }
  catch { showToast('↗', '复制链接失败', '请从浏览器地址栏复制'); }
});
$('#chat-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('#chat-input');
  const text = input.value.trim();
  if (!text) return;
  addComment('你', text);
  input.value = '';
  $('#emoji-picker').hidden = true;
  $('#emoji-button').setAttribute('aria-expanded', 'false');
});
$('#close-button').addEventListener('click', () => {
  closed = true;
  queuedCameraStart = false;
  cancelCameraRetry();
  resumeCameraOnVisible = false;
  operation++;
  releaseMedia();
  resetVisualState();
  mode = 'idle';
  showEmptyStage();
  pendingGift = null;
  setCue('');
  toastUntil = 0;
  $('#gift-toast').classList.remove('visible');
  $('#gift-toast').replaceChildren();
  openSheet(null);
  $('#ended-overlay').hidden = false;
  setInputStatus('已退出直播间', 'warning');
});
$('#resume-button').addEventListener('click', async () => {
  closed = false;
  $('#ended-overlay').hidden = true;
  if (cameraEnabled) await startCamera();
  else setInputStatus('摄像头已关闭', 'off');
});
$('#camera-status').addEventListener('click', () => {
  if (!cameraEnabled) enableCamera();
  else if (mode === 'camera') {
    $('#camera-retry').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    $('#camera-retry').focus();
  } else void startCamera();
});
$('#camera-help-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    $('#camera-help-copy').textContent = '已复制';
  } catch {
    $('#camera-help-copy').textContent = '请复制地址栏';
  }
});
$('#camera-retry').addEventListener('click', () => {
  if (!cameraEnabled) enableCamera();
  else if (mode === 'camera' || cameraConnecting) stopCameraByUser();
  else void startCamera();
});
$('#return-camera').addEventListener('click', () => {
  enableCamera();
  openSheet(null);
});
$('#sample-grid').querySelectorAll('[data-image-sample]').forEach((button) => {
  button.addEventListener('click', () => {
    const sample = IMAGE_SAMPLES.find((item) => item.id === button.dataset.imageSample);
    if (sample) void startImageSource(sample.src, { sampleId: sample.id });
  });
});
$('#image-upload').addEventListener('change', (event) => {
  const input = event.currentTarget;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/') || file.size > 20 * 1024 * 1024) {
    showToast('🖼️', '无法使用这张图片', '请选择小于 20 MB 的图片');
    return;
  }
  const objectUrl = URL.createObjectURL(file);
  void startImageSource(objectUrl, { objectUrl });
});
$('#play-sequence').addEventListener('click', () => { void startSampleVideo(); });
$('#camera-device-select').addEventListener('change', (event) => {
  openSheet(null);
  if (cameraEnabled) void startCamera(event.target.value);
});
window.addEventListener('keydown', (event) => { if (event.key === 'Escape') openSheet(null); });
new ResizeObserver(() => { engine.resize(stage.clientWidth, stage.clientHeight); applyLayout(); }).observe(stage);
window.addEventListener('pagehide', () => {
  queuedCameraStart = false;
  cancelCameraRetry();
  operation++;
  resumeCameraOnVisible = false;
  releaseMedia();
  mode = 'idle';
  showEmptyStage();
  if (uploadedImageUrl) URL.revokeObjectURL(uploadedImageUrl);
  uploadedImageUrl = null;
  visionWorker?.close();
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) location.reload();
});
document.addEventListener('visibilitychange', () => {
  lastFrameAt = performance.now();
  if (document.hidden) {
    if (mode === 'camera' || cameraConnecting) {
      resumeCameraOnVisible = true;
      resumeCameraDeviceId = null;
    }
    if (mode === 'camera') pauseCamera();
    if (mode === 'sample-video') { video.pause(); videoBg.pause(); }
  } else if (cameraEnabled && !cameraConnecting && !closed
    && (resumeCameraOnVisible || (mode === 'camera' && !cameraTrackLive(stream))
      || (mode === 'idle' && !cameraPermissionBlocked && cameraRetryTimer === null))) {
    resumeCameraOnVisible = false;
    void startCamera();
  } else if (mode === 'sample-video') {
    void video.play().catch(() => {});
    void videoBg.play().catch(() => {});
  }
});
navigator.mediaDevices?.addEventListener?.('devicechange', () => {
  if (stream && cameraTrackLive(stream)) void refreshCameraDevices();
  else if (cameraEnabled && !cameraConnecting && !cameraPermissionBlocked
    && !document.hidden && !closed && mode === 'idle') scheduleCameraRetry();
});

renderGiftGrid();
initialComments.forEach(({ name, text }) => addComment(name, text));
engine.resize(stage.clientWidth, stage.clientHeight);
requestAnimationFrame(frame);
void startCamera();
