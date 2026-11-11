# C0-C — Audio & Gameplay Synchronization Contract

- **Project** LibreCosta / SoFarAway
- **Status** Frozen
- **Baseline** `dev@6cebb8a5d015b01886e13c328edaa8b7693b5a20`

## 1. 目标与范围

用可复跑证据验证四卷程序化音乐、游戏仿真和视觉时间关系，覆盖启动、长时间播放、暂停恢复、低帧率、音频设备中断和结束。先复现再修复时序缺陷。

保留 React Router 8、React 19、TypeScript Strict、Three.js r187、WebGL2、GLSL、Web Audio、独立 Runtime / Simulation / Graphics / Audio 和 60 Hz 固定步。保留 BPM、章节、时长、和声与配器、Chart、碰撞、得分、PostFX 和运行时程序化定位。允许修复调度、时间映射、恢复和已证实的声音异常。新增中间件、Worklet 合成器、图形 API、游戏框架和重新编排均超出范围。

## 2. 时间域与规则

Simulation Time 管理固定步与关卡结果。Audio Context Time 管理调度和歌曲锚点。Presentation Time 通过单调浏览器时间、输出时间戳和渲染帧观测。以 Audio-master 保持同一歌曲原点，绝对 Beat 为逻辑秒乘以 BPM 再除以 60。无声模式使用单调时钟实现相同规则。

复核启动手势、激活取消、约 60 ms Lead、第一拍、第一帧反馈与首个章节边界。准备程序化缓冲和合成器后建立锚点。锚点前冻结逻辑，正常固定步误差为一步及浮点容差。保持跨刷新率判定一致。超出安全补算窗口时暂停，保留最近一次已提交的关卡状态。

## 3. 调度与编排

验证 25 ms Scheduler、120 ms Lookahead、16 分音符网格和绝对 Step，记录预定播放时间及回调提前量。网格仅允许浮点误差。覆盖 25/50 ms 抖动、超窗口延迟、100–200 ms 主线程阻塞、Suspend/Resume、快速取消和重新启动。记录重复、过期与丢失，保持安全暂停。

验证全部四卷的章节能量、Riser、Impact、各声部、小节与尾奏，至少覆盖 25 个章节的代表片段和关键边界。实际改动调度参数需要证据。编排与玩法设计调整归 D0。

## 4. 视觉与输出时间

检查 `currentTime`、`getOutputTimestamp()`、`baseLatency`、`outputLatency` 和实际采样率。校验初始零值、非 running、不可用与异常样本。区分预定音符、浏览器输出估计、实际声音和实际屏幕呈现。无外部设备的端到端物理测量标记 `BLOCKED — PHYSICAL_MEASUREMENT_UNAVAILABLE`。

记录 Tunnel、Hue、Gate、Camera/FOV、终幕和章节反馈。视觉相位调整须有证据和原始/更新后的定点画面。允许独立 Presentation Beat，权威 Beat、碰撞、计分和难度保持现有时间。时间估计失效时沿用逻辑时钟，避免跳相。

## 5. 生命周期与信号

暂停保留逻辑位置，恢复重建 Audio Anchor。防止已播放部分重播、关卡跳过、旧 Scheduler/Run Bus 和异步任务污染。覆盖失焦、隐藏、BFCache、WebGL 恢复、长帧、真实 Suspended、可测的 Interrupted 和显式无声。需要手势的恢复应有清楚操作入口。

用 OfflineAudioContext 检查 RMS、Peak、静音、非有限样本、削波、异常跳变与残音。验证音量和静音偏好、持续节点数与调度器数量。主观听感独立验证，无证据标记 `BLOCKED — HUMAN_LISTENING_REQUIRED`。真实听音检查开场、转场、Drop、Gate、恢复和尾奏。

## 6. 测试与交付

新增 `npm run test:sync`，复用 Vitest、Playwright 和现有 Harness。验证四卷完整时长、全部 Step、最后有效音乐事件、最后 Gate、结束及音频停止。可控时钟验证相同输入的规则，正常 Audio Transport 验证真实播放。WinCairo 无音频 API 时记为 BLOCKED。

确认 A0/B0/C0-A/C0-B 相关回归、SSG、TypeScript Strict、四卷有声与无声结果、原有视觉与音乐。P0 在本阶段解决，P1 有证据时局部修复，P2 留至 D0。报告保留复现、前后数据、环境与 C0-D 准入结论。仓库只保留必要的测试和文档。

在 `dev` 核对本地与远端基线。完成验证后提交，普通 `git push origin dev`，查询远端确认 SHA。保护 `main`，禁止强推。推送失败需报告实际原因。
