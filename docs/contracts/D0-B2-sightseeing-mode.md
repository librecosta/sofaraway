# D0-B2 — Sightseeing Mode

基准 `dev@f0806d12a58f22e149dacc9161712d0a5ba8fe4a`。

四卷各提供独立的 `standard` 和 `sightseeing` 模式。Standard 继续提供 Easy、Normal、Hard。Sightseeing 固定 5 条命、沿用 Normal 的计分规则，玩家移动、碰撞、扣命、终止、暂停和重试使用原有流程。

观光模式沿用 Audio-master 和固定仿真步长，原曲的 BPM、事件与时长即为结算基准。向前速度从 `24 / 3` 开始。以完整 Normal 门谱及选定路线的进度计算原加速曲线，再乘 `1/3`，保留阻尼和 Boost 倍率。门与道具在原定拍点抵达玩家，路径采样基于实际向前推进速度。

观光门谱从原 Normal 门谱确定性抽取，约保留三分之一，保持各有门章节的代表性。保留入选门的拍点、方向、门型和通行截面。ELSEWHERE 保留 Main、Challenge、Score（UI 显示 BONUS）及随机布局，目标分别为 3、4、8 道分路门。分叉仍在第 315 拍建立锚点、第 320 拍选路、第 352 拍汇合。允许仅在观光模式调整弯道区间，确保通道分离、相机连续和门体对齐。

ELSEWHERE 的 Prism Shield、Resonance、Lumen 继续在第 306.66 拍主动拾取，沿用独立于分路的 Run Seed 流。Lumen 给予 Normal 的 5000 分。成绩页标识 SIGHTSEEING，保留本次分数、通过数、连击与准确率，观光成绩从 Standard Best Score 隔离。菜单可用键盘与鼠标选模式，并保留 Standard 难度设置。

验收包括四卷完整碰撞通关、ELSEWHERE 三路及两种布局、五次失误终止、速度与固定步验证、一首真实 AudioContext 全曲、模式与 Best Score 隔离，以及浏览器、资源、音画和既有玩法回归。沿用现有 Runtime、Transport、Three.js 和 WebGL2。BSD-3-Clause 继续适用。交付目标为 `origin/dev`。
