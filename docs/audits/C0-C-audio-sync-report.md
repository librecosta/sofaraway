# C0-C — 音频与游戏同步报告

## 基线与复跑

对照为 `dev@6cebb8a5d015b01886e13c328edaa8b7693b5a20`。主机为 ASUS TUF Gaming A15 FA506QR，Windows 10 Home x64 build 19045，Ryzen 7 5800H，32 GB，AMD Radeon 核显，Node 24.22.1 和 Playwright 1.61.1。Chromium 项目使用已安装的 Chrome stable，Firefox 与 WebKit 采用 Playwright 自带浏览器。测量均为本机无头浏览器。实际浏览器输出时间戳与软件渲染时钟可观测，扬声器和屏幕的物理时间需另测。

运行 `npx playwright install chromium firefox webkit` 和 `npm run test:sync`。将 `SYNC_CHROMIUM_CHANNEL` 设为 `chrome` 可复跑系统 Chrome。全曲用两个浏览器 Worker、640×360、low、normal，沿用自动对齐诊断参数，碰撞开启。可用 `npm run test:sync -- full.spec.ts` 单独跑全曲，或传 `lifecycle.spec.ts`、`signal.spec.ts`。输出的 `SYNC` JSON 行保存时序和信号汇总。Harness 仅在测试构建中加载。

## 时间关系

- START 的手势同步触发 `AudioContext.resume()`，建好共享缓冲和当局 Synthesizer 后读取 Context 当前时间。歌曲原点 `anchor = contextTime + 0.060 − offset`，恢复用最近提交的 Simulation 秒数为 `offset`。引擎在 Lead 内保持逻辑位置。
- 音乐网格 `stepSeconds = 15 / BPM`，第 `i` 步的预定播放时间为 `anchor + i × stepSeconds`。25 ms Interval 每次向前安排 120 ms，数据中的提前量为 `scheduledTime − triggerContextTime`。
- 游戏取同一 Context 的 `max(offset, currentTime − anchor)`，用 60 Hz FixedStepClock 消费。权威 Beat 为逻辑秒乘 BPM / 60。无声使用单调浏览器时间重建原点。20、60、120、144 Hz 的相同轨迹结果一致。
- 输出诊断用 `Pevent = timestamp.performanceTime + 1000 × (eventContextTime − timestamp.contextTime)`。测试拒绝零、非有限、暂停和明显超前的时间戳。用绘制返回后的单调时间对比此映射，结果只描述浏览器估计与画面提交。BaseLatency 与 OutputLatency 单列，Context 网格时间也不含音符包络和母带 DSP 对实际起音的影响。 [Web Audio API 的 getOutputTimestamp](https://www.w3.org/TR/webaudio/#dom-audiocontext-getoutputtimestamp)

## 已复现的时序缺陷

| 优先级 | 冻结基线 | 修复及回归 |
| --- | --- | --- |
| P0 调度过期 | ELSEWHERE 的 Step 1 应在 177.1875 ms 调度到 Context 网格。回调迟到至 200 ms 时，原调度器跳过 Step，Runtime 仍可读取 140 ms 逻辑时间。 | 保持顺序游标，下一步逾期时走 `long-frame` 安全暂停。RAF 读取和 Interval 都检查同一截止时间，覆盖 Interval 单独饥饿及主线程同时阻塞。 |
| P1 到点浮点边界 | ORBIT 锚点 4.06 s，读到 4.21 s 时，重新除回网格得到 1.0000000000000024，原 `ceil` 跳过 Step 1。 | 比较绝对预定时间并使用 1 ns 浮点容差，Step 1 保留在 4.21 s。 |
| P1 恢复重复起音 | 在 Context 75 ms 暂停，Step 0 已到点而逻辑仍可能在 tick 0。原恢复将 Step 0 再排一次。 | 记录已越过渲染时间的已排 Step，保留 Simulation 提交的位置。恢复时取消未来旧排程并在新锚点重排，已开始 Step 不再触发。真正重开从 Step 0 开始。 |

三项同一回归在修复前失败、修复后通过。在冻结基线的 Chrome 上单独压住 Interval 400 ms，画面仍推进到逻辑 0.767 s，恢复回调后 Step 从 3 跳至 7。修复版压力测试在下一未排时间 1.0547 s 前的 1.0500 s 停住，Firefox 样本在 0.5859 s 前的 0.5667 s 停住。调度器、逻辑和渲染的基本参数保持原样。

已开始 Step 的持续包络、混响及 Step 内后续偏移声部随旧 Run Bus 一并切断，恢复不重建旧声部的波形。Step 已进入 Context 渲染时间与物理扬声器播放属于不同观测。停止后仍可能存在浏览器已排入设备的缓冲。

## 四卷真实全曲

Chrome stable 157.0.8103.38，真实 AudioContext 和 Runtime，全部正常结束。每个 Step 在同一 Run Bus 中只调用一次，序列连续，前瞻范围包含首个 Step 的 60 ms Lead。全部网格残差低于 1 ns，整曲 Context 目标与已提交的 Simulation 最大差为 16.000 ms，低于一步 16.667 ms。每个章节和最后一门在对应拍后一个固定步内呈现或判定。最后一门浮点误差遵循既有碰撞容差。

| Volume | BPM / 拍 / 秒 | Step 数与末索引 | 回调提前量 ms | 最后 Gate 拍 | normal 得分 / 通关 |
| --- | --- | --- | --- | --- | --- | --- |
| ELSEWHERE | 128 / 448 / 210.000 | 1,792 / 1,791 | 60.00–119.96 | 446.91 | 107,726 · 144/144 |
| DRIFT | 96 / 224 / 140.000 | 896 / 895 | 60.00–119.42 | 220 | 23,928 · 40/40 |
| DESCENT | 110 / 400 / 218.182 | 1,600 / 1,599 | 60.00–120.00 | 399 | 119,039 · 158/158 |
| ORBIT | 100 / 320 / 192.000 | 1,280 / 1,279 | 60.00–120.00 | 316 | 65,069 · 91/91 |

四卷均为 ESCAPED / S，生命未损失，成绩与 A0 无声定时回归一致。到终点立即停止调度并移除 Run Bus，Chrome 在记录终幕画面时的 Context 已越过预定终点约 1.3–9.3 ms。到结算后无活动 Run Bus 或 Scheduler。

| Volume | 章节名和绝对起拍 | Riser → Impact 拍 |
| --- | --- | --- |
| ELSEWHERE | INTRO 0 · A 16 · B 96 · BUILD 160 · DROP 192 · BREAK 288 · A2 320 · FINALE 384 | 12→16 · 92→96 · 156→160 · 188→192 · 316→320 · 380→384 |
| DRIFT | OPEN 0 · DRIFT 16 · SWELL 80 · LULL 128 · RISE 160 · OUT 208 | 12→16 · 76→80 · 156→160 |
| DESCENT | MOUTH 0 · FALL 16 · PRESS 112 · HOLD 208 · SHEAR 240 · BOTTOM 336 | 12→16 · 108→112 · 236→240 |
| ORBIT | LAUNCH 0 · ORBIT 16 · WIDE 96 · FLARE 176 · HOME 256 | 12→16 · 92→96 · 172→176 |

## 视觉呈现与浏览器估计

Chrome 全曲为 48 kHz，稳定时 `baseLatency` 约 10 ms，`outputLatency` 约 40 ms。部分首次画面采到零 `performanceTime`，诊断弃用。四卷在 Lead 内均以 beat 0 提交首个游戏画面，Tunnel 脉冲为 0.55，开场闪白为 0.90，FOV 约 80.48°。首帧提交比估计的开场 Context 锚点输出早约 92–105 ms，第一次 Simulation 推进的画面早约 27–33 ms。后续章节切换的提交早约 29–50 ms，部分章节的固定步量化会缩短此差值。

Tunnel 与 FOV 读取同一仿真拍相位，Hue 用每 32 拍的插值，Gate 用与当前拍之差定位，HUD 章节来自同一份 `sectionAt()`。HUD 快照节流为 80 ms，React 更新与实际屏幕发光时间另有开销。终幕从末 12 拍开始，Crash 样本闪白为 0.95。基于现有测量保留逻辑相位和全部视觉公式，实际声画偏差留给物理采样。

Firefox 151.0 为 48 kHz，`baseLatency` 为 0，`outputLatency` 约 37–40 ms。样本中，Context 值与映射回当前时刻的输出估计几乎相同，原始输出时间戳的两个分量都向过去偏移约 `outputLatency`。这与 Gecko 已报告的时间戳问题相符。Firefox 的原始数据保留用于诊断，视觉提交偏移取 Chrome 样本。WinCairo 26.5 缺少 AudioContext，因此有声时序为 `BLOCKED`。 [Mozilla Bug 2085696](https://bugzilla.mozilla.org/show_bug.cgi?id=2085696)

## 章节、尾奏与信号

Chrome 与 Firefox 各用 OfflineAudioContext 以 24 kHz、立体声、音量 0.8 渲染 25 个章节。每段采开场八拍，后续章节同时采边界前四拍，尾部独立渲染最后十二拍及 1.9 秒自然尾音。RMS 由章节片段得出，Peak 包括边界、章节及尾部样本。运行时仍在终点断开当局音频。随机噪声和混响会带来幅值变化。

| Volume | 章节 RMS 范围 | 最大 Peak | 最后有效声部，Step / 拍 / 秒 | 全曲声部调用 |
| --- | --- | --- | --- | --- |
| ELSEWHERE | 0.0180–0.0815 | 0.8420 | Snare 1791 / 447.75 / 209.883 | 3,706 |
| DRIFT | 0.0799–0.1053 | 0.7397 | Pad 880 / 220 / 137.500 | 1,000 |
| DESCENT | 0.0425–0.0655 | 0.7157 | Snare 1599 / 399.75 / 218.045 | 2,442 |
| ORBIT | 0.0240–0.0725 | 0.7448 | Bass 1278 / 319.5 / 191.700 | 2,392 |

采样中非有限值和削波均为零。向高能章节切换时，Riser 在前一小节开始、Impact 落在新章节下拍。边界后半拍 RMS 最大约为前半拍的 11 倍，对应低电平尾音进入高能下拍。各声部连同音高、时值、力度和时间参数的 SHA-256 与冻结基线相同。数据保留了末段 Fill 仍出现的 Snare、部分卷尾奏仍有 Bass 等既有编排。

Chrome 离线停止测试在旧总线断开后的 0.65–1.95 s 内测得 RMS 和 Peak 均为 0。前后两个播放窗口都有信号，旧的未来事件和混响没有进入新一局。Firefox 的 OfflineAudioContext 没有 suspend/resume，此项离线隔离在该引擎为 `BLOCKED`，25 章信号和在线 Suspend 仍已验证。 [Mozilla Bug 1265406](https://bugzilla.mozilla.org/show_bug.cgi?id=1265406)

## 生命周期压力

- Chromium 和 Firefox 以用户手势启动、暂停两次并恢复，验证冻结的拍、分数与判定游标，以及恢复 Offset。可见时失焦只清输入，受控 Hidden 暂停并断开音频，回前台从同一逻辑位置继续。
- 真实 AudioContext Suspend 后停止调度和 Run Bus，停在原位。用户手势恢复后以旧 Offset 重建 Anchor，亦可显式选择无声恢复。音量 0.37 静音后回到原值。快速开始和切卷只留一个 Run Bus，新局从 Step 0 开始。
- 首门在 16 拍（7.500 s）。故意在逻辑 7.367 s 阻塞主线程 160 ms。两个引擎均在 7.367 s 暂停，门、分数、生命保持。恢复后首门只判定一次且通过。可控时钟交替给出 25/50 ms 调度延迟，四卷保持网格；过期用例确认安全暂停。
- BFCache、WebGL 恢复、音频激活失败与无声入口复跑 C0-A。Firefox 和 WinCairo 的真实历史导航未将此 WebGL/音频页存入 BFCache，受控生命周期已覆盖。实际 OS 设备中断触发的 `interrupted` 尚无可控证据，记录 `BLOCKED`。WinCairo 的测试并发期间曾出现长帧安全暂停，回归明确检查暂停原因并保留恢复后推进条件。

## 人工及物理验收

- `BLOCKED — PHYSICAL_MEASUREMENT_UNAVAILABLE`。在同一采集时间基准上用麦克风或线路回录捕获音频，并用光电二极管或同步高速相机捕获画面。建议从启动、四分拍脉冲、章节切换、Gate 和终幕分别采样，记录浏览器、输出设备及刷新率。播放器 API 估计留作对照。
- `BLOCKED — HUMAN_LISTENING_REQUIRED`。在目标设备上戴耳机或用扬声器，四卷分别检查开场首拍、章节转场和 Drop、Gate 抵达与节奏、暂停恢复和结尾。记录卷名、拍数、设备及是否听到爆音、掉音、错误重奏或上一局残响。OfflineAudioContext 数值检查用于验证信号完整性。

## 回归

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | TypeScript Strict 通过 |
| `npm run test:sync` | 分批执行。9 项 Transport 单测、4 项真实全曲、16 项短浏览器用例均完成。WinCairo 有声及 Firefox 离线暂停的限制如上。 |
| `npm test` | 25 项 Vitest、28 项 B0 浏览器回归。SSG、纯静态运行和 12 个关卡组合通过。 |
| `npm run test:a0` | `A0_APP_ROOT` 指向 `88a4adb533e2c5ec6f8e77a166ca11e75794be58`，23 项通过。 |
| `npm run test:compat` | 101 项通过，保留 C0-A 既有环境限制。 |
| `npm run test:stability -- --grep "benchmark production\|benchmark elsewhere low\|fixed-time visual\|prewarming\|soak"` | 5 项针对性 C0-B 回归通过。 |

C0-B 对照使用冻结版与候选版交错执行。ELSEWHERE low、960×540、DPR 1 的 RAF P95 为 4.3 → 4.2–4.3 ms，CPU 帧 P95 为 0.5–0.6 → 0.4 ms，GPU P95 为 1.77–1.90 → 1.84–1.91 ms，仍为 15 Draw Calls、11,252 Triangles。四卷 high 的 `t=83` 截图逐像素相同。Shader 预热回归的 108 次创建和删除请求保持配对。

20 轮切换、暂停、重开及销毁后，菜单 Geometry/Texture/Program/Chunk 计数为 11–22 / 7–9 / 8–9 / 4。随后再次按真实音频时钟完成 DESCENT 的 400 拍和 158 道 Gate，47 个采样窗口中没有 50 ms 以上帧，没有长帧暂停。

## C0-D 准入

C0-C 的已确认 P0 已修复。四卷可进入 C0-D，优先在真实设备上执行听音、输出设备切换、中断恢复和物理声画采样。浏览器输出估计及离线信号作为对照基线。
