# 微笑雨云素材生成记录

**当前使用** `app/public/effects/smile-rain-cloud-playful-v4.png`：这是用户发送参考图之前的彩色顶部云，浅蓝紫体积云带有淡粉受光和银色柔边，见当时的直播画面（历史本机留档，未随公开源码发布）。网页仍控制两侧聚拢、顶部合拢、轻微呼吸、雷光、降雨与淡出，并保留后续加入的下缘柔化，以免云压到发顶时形成硬边。

下方记录的是**上一版、目前未启用**的 `app/public/effects/smile-rain-cloud-luminous.png`：它由 Codex 内置 `imagegen` 生成，为透明 PNG，2022 × 778。用户提供的 2026-10-19 图片只作为云形、略暗的蓝紫色调、云内透光与细微电光的视觉参考；未纳入产品素材。

生成时使用的提示词：

> Use case: stylized-concept. Asset type: transparent, panoramic cloud overlay for a live-camera AR rain effect. The supplied image is a VISUAL REFERENCE ONLY for the cloud's cinematic billowing silhouette, slightly stormy lavender-blue shadowing, inner pearlescent light and delicate lightning-like illumination. Create a NEW cloud asset; do not copy the lower scene or any exact details. One connected bank of soft cloud volumes spanning a wide horizontal 2.6:1 composition, with varied tall upper puffs and a gently broken lower edge. It should feel like a beautiful, aspirational social-video effect: moody but not black, ominous, or frightening. Light silver-lilac tops, desaturated blue-violet shadow interiors, subtle warm opalescent highlights close to the lower middle. Within the cloud, a few fine branching light streaks suggest distant internal electricity; no external lightning bolt. The underside has a small soft glow to motivate rain that will be drawn separately by code. The cloud must be a CLEAN transparent cutout with smooth, feathered outer edges and no background, no lower cloud landscape, no falling rain, no spectrum waterfall, no person, no text, no watermark. Prioritize a cohesive art-directed AR asset over an AI fantasy image. It must remain legible over a live camera, so transparent gaps and airy edges are important.

生成模式：内置工具；`transparent_background: true`。这是预制美术素材，实时运行时只做位移、透明度和画布特效，不实时生成图像。
