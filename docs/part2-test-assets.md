# Part 2 测试素材说明

四张头像通过 Codex 内置 imagegen（`photorealistic-natural`）生成，原件与拼接视频已从 `app/public/samples/` 移到本机的 `output/part2-test-samples/`。按当前视觉打磨需求，平静、微笑、大笑、只张嘴四张图及合成视频的**开发版副本**放在 `app/public/validation/`，供本地“互动实验台 → 画面输入”切换。所选素材直接显示在主播画面上，经过与摄像头相同的模型、表情规则和 AR 特效链路；还可上传本地图片。公开构建自动隐藏这些测试入口并剔除副本。静态图重复推理只检验固定样本，**不代表真人动态表情识别准确率**。以下时间线给出 32.5 秒合成视频在持续特效规则下的预期检查点；最终时刻以实际逐帧识别为准：

| 播放时间 | 表情 | 预期检查点 |
| --- | --- | --- |
| 0–1.5 秒 | 平静 | 建立面部跟踪与平静基线 |
| 1.5–8.0 秒 | 微笑 | 云与闪电只入场一次；雨在这段微笑中持续。此片段不足以单独验证超过旧版 7 秒后的雨效 |
| 8.0–12.5 秒 | 大笑 | 雨先平滑收束；当前大笑经多帧确认后直接转烟花，不要求插入平静帧 |
| 12.5–15.5 秒 | 平静 | 烟花停止新增发射、旧火星淡出；随后进入 2 秒冷却 |
| 15.5–27.5 秒 | 再次大笑 | 冷却结束且大笑再次确认后，烟花持续发射，跨过旧版 9 秒上限仍应有新波次 |
| 27.5–30.0 秒 | 平静 | 烟花渐退并进入 2 秒冷却 |
| 30.0–32.5 秒 | 只张嘴 | 展示非笑容反例 |

时间点是合成视频中表情的切换时刻；识别确认、特效起止由应用当前运行结果决定。要验证**微笑超过旧版 7 秒仍下雨**，需另用持续更久的静态微笑输入或真人摄像头；这段视频的第一段微笑不够长。视频是 **640 × 480、12 fps、H.264 / `yuv420p` MP4**，用于浏览器模拟摄像头输入；它是构造素材，不是实拍视频。历史生成脚本保存在原开发环境，未随公开包提供；本地测试可直接使用页面中的“播放连续表情视频”。

## 最终提示词组

**中性基础照：**

> Use case: photorealistic-natural. Asset type: local facial-expression recognition test fixture for an AR webcam prototype. A single adult East Asian woman streamer, age around 28, facing camera straight on, head and shoulders fully visible, neutral relaxed expression with mouth closed, eyes open, no smile, no hand or hair obscuring facial features. Contemporary creator studio in soft warm low-key lighting with subtle lavender/teal practical light accents, realistic skin texture, crisp facial details, centered face occupying about 45% of image width. No text, no logo, no watermark, no filters, no exaggerated beauty retouching. Image should be clear enough for a face landmark detector.

**微笑变体（以前图为编辑目标）：**

> Preserve exactly the same adult East Asian woman, camera angle, hair, clothes, room, lighting and crop. Change only her facial expression to a clearly visible genuine closed-mouth warm smile: both mouth corners lifted, cheeks gently raised, eyes smiling, lips closed. Realistic photo; no added objects, text, logos, watermarks or filters.

**大笑变体（以前图为编辑目标）：**

> Preserve exactly the same adult East Asian woman, camera angle, hair, clothes, room, lighting and crop. Change only her facial expression to a strong joyful laugh: mouth corners clearly up, cheeks raised, eyes smiling, open mouth with natural teeth visible. Face stays roughly front-facing and unobscured. Realistic photo; no added objects, text, logos, watermarks or filters.

**只张嘴反例（以前图为编辑目标）：**

> Preserve exactly the same adult East Asian woman, camera angle, hair, clothes, room, lighting and crop. Change only her facial expression to a neutral open mouth as if speaking a vowel or yawning: jaw open, mouth corners NOT lifted, cheeks relaxed, eyebrows neutral, eyes open, absolutely no smile or laughter. Realistic photo; no added objects, text, logos, watermarks or filters.

生成图是构造的测试样本，不能当作跨真人与跨设备的准确率证据。
