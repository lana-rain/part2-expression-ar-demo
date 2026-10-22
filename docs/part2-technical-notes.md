# Part 2：浏览器表情 AR Demo 技术核查

核查日期：2026-10-17。本文仅记录对浏览器技术与官方资料的核查，以及对本项目的实现建议；产品阈值和视觉方案需要通过真实设备试验调整。

## 结论与接口

- 使用 `@mediapipe/tasks-vision` 的 `FaceLandmarker`。npm 官方登记的当前版本是 **1.1.1**；实现时锁定 JS 包与 WASM 路径的同一版本，避免 `latest` 升级后不一致。[npm 包](https://www.npmjs.com/package/@mediapipe/tasks-vision)
- WASM 根路径可用 `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm`；Google 官方文档用同样结构的 `@latest/wasm` 路径。模型可用 `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`。已核实该模型 URL 返回 HTTP 200，大小约 3.76 MB；Google 模型页将其列为 FaceLandmarker bundle。[Web 指南](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js) · [模型页](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker)
- 创建方式是 `FaceLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath }, runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true })`，其中 `vision = await FilesetResolver.forVisionTasks(wasmRoot)`。如需面部姿态矩阵，再开启 `outputFacialTransformationMatrixes: true`。Web API 仅有 `IMAGE` 与 `VIDEO` 两种运行模式；总览页列出的 `LIVE_STREAM` 属于跨平台描述，不适用于当前 Web TypeScript 接口。[Web 指南](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js) · [Web 选项类型](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/web/vision/face_landmarker/face_landmarker_options.d.ts) · [Web 运行模式类型](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/web/vision/core/vision_task_options.d.ts)
- 摄像头或上传视频：`landmarker.detectForVideo(videoElement, performance.now())`。第二个参数是必需的毫秒时间戳，且连续调用应递增。静态表情图：设置 `runningMode: 'IMAGE'` 后 `landmarker.detect(imageElement)`。单实例切换模式时先 `await landmarker.setOptions({ runningMode: 'IMAGE' | 'VIDEO' })`，或者为照片与摄像头各建一个实例。官方 Web 指南的视频示例遗漏了 `detectForVideo` 的时间戳，**以 Web TypeScript 接口签名为准**。[Web 接口源码](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/web/vision/face_landmarker/face_landmarker.ts) · [Web 指南](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js)
- 返回值为 `faceLandmarks: NormalizedLandmark[][]`、`faceBlendshapes: Classifications[]`、`facialTransformationMatrixes: Matrix[]`。读取首张脸的某项表情可从 `result.faceBlendshapes[0]?.categories` 中按 `categoryName` 找到其 `score`；没有人脸时各数组可为空。模型输出估计 478 个三维人脸关键点、52 个 blendshape 分数。[结果类型](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/web/vision/face_landmarker/face_landmarker_result.d.ts) · [分类类型](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/web/components/containers/classification_result.d.ts) · [类别类型](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/web/components/containers/category.d.ts) · [模型页](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker)

```ts
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const wasmRoot = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm';
const modelAssetPath = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const vision = await FilesetResolver.forVisionTasks(wasmRoot);
const landmarker = await FaceLandmarker.createFromOptions(vision, {
  baseOptions: { modelAssetPath },
  runningMode: 'VIDEO',
  numFaces: 1,
  outputFaceBlendshapes: true,
});

const result = landmarker.detectForVideo(videoElement, performance.now());
const scores = new Map(
  (result.faceBlendshapes[0]?.categories ?? []).map(({ categoryName, score }) => [categoryName, score]),
);
const smile = Math.min(scores.get('mouthSmileLeft') ?? 0, scores.get('mouthSmileRight') ?? 0);
```

这个 `smile` 算式仅示意双侧微笑信号，不是经验证的触发阈值；单侧笑、遮挡、张嘴笑等需要实测并做时间平滑。

## 表情、动作与测试输入

- 与需求直接相关的官方 blendshape 名称：`mouthSmileLeft`、`mouthSmileRight`、`jawOpen`；可参考 `cheekSquintLeft/Right` 判断眼周参与，但不应把某一分数当成“大笑”的唯一证据。名称来自 MediaPipe 官方图定义，左右指**被拍摄者**自身的左右；若把输入像素镜像，左右结果会交换。建议仅在显示层镜像自拍预览，识别层使用原始相机帧，并统一坐标映射。[blendshape 清单](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/cc/vision/face_landmarker/face_landmarker_graph.cc) · [Web 指南](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js)
- 真实摄像头从 `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })` 获取，赋给 `<video autoplay playsinline muted>` 的 `srcObject`，用户授权后播放。浏览器要求安全上下文：线上 HTTPS 或本机 `localhost`；若 Demo 被嵌进 iframe，顶层页面还须允许 `camera` 权限。无相机、用户拒绝、设备占用应给出可理解的失败提示。[MDN：getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- 上传测试图走文件选择器、`URL.createObjectURL(file)` 加载到 `<img>`，然后在 `IMAGE` 模式执行 `detect(img)`。它可验证“笑脸有分数、平静脸低分、无人脸不触发”；**一张静态图不能证明持续大笑、冷却时间、重复触发或实时跟踪正确**。这些状态需要上传视频、预录连续帧，或在独立的逻辑测试器里注入逐帧分数，并明确标为模拟输入。[Web 指南](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js) · [MDN：用户选择文件](https://developer.mozilla.org/en-US/docs/Web/API/File_API/Using_files_from_web_applications)
- 顶层图片、视频、摄像头都必须走同一套“关键点/表情分数 → 时间状态机 → 已预制粒子效果参数”的触发逻辑。上传图是识别与视觉预览入口，不应被描述为真实摄像头验收。正式校准至少包含中性、轻笑、露齿笑、张嘴但不笑、侧脸、弱光，以及不同脸型与肤色的样本。

## 性能与 AR 表现边界

- `detect()`、`detectForVideo()` 在 Web 中同步运行，调用期间阻塞所在线程。首版可让渲染每帧执行、检测仅在视频帧变化时执行并限制检测频率，记录检测耗时和视觉帧率；性能不达标时把检测放到 Web Worker。使用 Worker 时要传可用的帧图像数据，不能假设 DOM 的 `<video>` 元素能直接在 Worker 中访问。[Web 指南：性能](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js) · [官方 Worker 示例](https://github.com/google-ai-edge/mediapipe-samples-web/blob/main/src/workers/face-landmarker.worker.ts)
- `numFaces: 1` 有利于单人直播玩法，官方说明平滑只在 `numFaces=1` 时启用。面部关键点是归一化图像坐标，画布叠加时必须处理自拍镜像、裁切比例与设备像素比。Face Landmarker 提供 `FACE_LANDMARKS_FACE_OVAL` 等轮廓连线；它并不直接给出完整头发轮廓。烟花碰撞可基于面部轮廓和扩展的头部包围形状建立屏幕空间碰撞体；是否“看起来碰到头”仍需视觉验收。[Web 指南：配置和结果](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js) · [Web 接口源码](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/web/vision/face_landmarker/face_landmarker.ts)
- 预制的雨线、飞溅、烟花形态与配色可以固定，实时只计算实例位置、强度、速度与碰撞反弹。这个边界符合“先做好 AR 特效，再由网页按表情触发”的产品方向；无需实时生成素材。

## 授权与引用

`@mediapipe/tasks-vision` npm 包标注 Apache-2.0；官方 MediaPipe 示例仓库也使用 Apache-2.0，Google 文档的代码示例亦标注 Apache-2.0。可以参考其接口和实现，但复制示例代码时保留相应许可声明。模型文件随官方模型页提供；后续公开发布前应核对模型页和模型卡的具体分发条件，不把文档代码的许可自动套到模型权重上。[npm 包](https://www.npmjs.com/package/@mediapipe/tasks-vision) · [官方示例许可](https://github.com/google-ai-edge/mediapipe-samples-web/blob/main/LICENSE) · [文档许可说明](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js)
