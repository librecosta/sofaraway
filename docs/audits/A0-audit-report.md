# SoFarAway A0 审计报告

审计日期 2026-11-11（Asia/Shanghai）。本地 `dev` 工作区起初干净，`HEAD` 与 `origin/dev` 均为 [`b61d716f002d52055c023f0fa2a8aee4636b93dd`](https://github.com/librecosta/sofaraway/commit/b61d716f002d52055c023f0fa2a8aee4636b93dd)。范围以 [A0 契约](../contracts/A0-architecture-correctness-audit.md) 为准。

`FIXED` 表示已修复并复测，`CONFIRMED` 表示有证据的遗留缺陷，`SUSPECTED` 表示有具体触发条件但缺少直接证据，`BLOCKED` 表示当前测试条件无法得出结论。

## A0-A · 架构与资源

```text
index.html + style.css → main.js（DOM、输入、G/CAM、RAF、挂载生命周期）
                         ├─ AudioEngine → Web Audio
                         ├─ chart / audio / gates / tunnel ← volumes.VOL ← URL
                         ├─ Path → camera / Gates.place / Tunnel
                         ├─ textures → Tunnel + scene environment
                         ├─ quality ← URL、storage、DPR、pointer、viewport
                         ├─ PostFX → Three.js renderer
                         └─ Recorder ← camera / G / CAM → Canvas2D / JSON
```

| 模块 | 当前职责、依赖与所有权 | B0 处理 |
| --- | --- | --- |
| `main.js` | 导入时读取 DOM、URL、存储和设备并创建渲染器。单例 `G`、`CAM`、指针和键集合贯穿交互、仿真、HUD 与渲染。RAF 调用 `step`，其中直接更新 DOM、音频、相机和世界。 | **替换入口及 DOM 壳**。把 run state、输入快照、时钟和读数从渲染拆开。提供可重入的 mount/start/stop/dispose，React 订阅状态快照。SSG 只加载页面数据，客户端挂载时才访问平台 API。 |
| `volumes.js` / `chart.js` | 编排能量、章节、拓扑和难度来自同一份配置。Mulberry32 生成门序列。活跃 `VOL` 依赖模块加载时的 URL，部分导入带版本参数，部分无参数。 | **保留配置和算法，局部解耦**。显式传入 volume/seed，统一章节边界与模块标识。明确 chart 变体与门轴种子的版本。 |
| `audio.js` | 音色和编排在运行时合成。每 25 ms 检查未来 120 ms 的十六分音符网格，起播预留 60 ms，`AudioContext.currentTime - t0` 驱动节拍。页面持有 context、主增益、压缩器、noise 和 impulse，每局持有干湿总线。 | **保留合成与编排，局部重构 transport**。独立声明启动取消、可见性、前台长帧及输出延迟策略。保留离线入口。 |
| `path.js` / `tunnel.js` | Path 预采样弧长 frame，以二分查找并重建正交基。Tunnel 持有共享材质、bolt 几何和灯光，按窗口流式构造 Chunk，每块持有独立几何和实例矩阵。页面持有纹理。 | **保留几何算法，局部重构所有权**。将帧采样与 Chunk 构造显式接收 topology，隔离流式调度与渲染，迁移后再评估按需 path frame 和 Chunk CPU 峰值。 |
| `gates.js` | 每门两张平面共用 ShaderMaterial，全局共享平面几何。门的绝对拍和局部开口定义参与碰撞、准星锁定和对准诊断。轴 RNG 从固定初态随生成顺序推进。 | **保留四种 Shader 与开口规则**。把门规格和碰撞移到独立规则层，渲染从同一规格构造 uniform。将共享几何限定在引擎实例。 |
| `post.js` / `quality.js` | 五个 HalfFloat target，依次做半分辨率深度、场景、DOF、四分之一分辨率 bloom 与合成。PostFX 持有目标、quad、材质，主循环管理 DPR。 | **保留管线**。抽出可测的画质选择、能力检测和 resize，统一后处理与 canvas 的尺寸来源。 |
| `textures.js` / `recorder.js` | Canvas2D 生成 hull、normal 等纹理，颜色和法线使用固定种子。记录器每帧取样，保留 3600 项，下载时创建并回收 Blob URL。 | **保留生成函数，局部解耦**。工厂接收 seed 与生成环境，记录器订阅诊断数据。页面截图继续仅用于文档。 |

正常重开保留 renderer、context、贴图和共享几何，清空门和上一局的音频输出。卸载释放场景、后处理、PMREM target、材质和纹理并关闭 AudioContext。BFCache 保留页面实例并暂停 transport，恢复后复用。模拟捕获用 60 Hz 加尾步，星空固定种子，关闭随机撞击抖动。实时音频的 noise/impulse 和实时镜头抖动仍使用 `Math.random`，因此回放状态、跨设备像素和音频波形有不同的可复现性边界。

## A0-B / D · 证据与修复

| 优先级 / 状态 | 位置与复现 | 预期、基准表现和修复证据 |
| --- | --- | --- |
| P0 · `FIXED` | [`chart.js`](https://github.com/librecosta/sofaraway/blob/88a4adb533e2c5ec6f8e77a166ca11e75794be58/js/chart.js) `buildChart`，检查首门与章节表 | 首个活跃章节从第 16 拍开始。基准首门为第 24 拍，所有门整体晚 8 拍，终点截断 1–3 扇门。统一从 0 开始累积，并按实际节拍显示 HUD 章节。12 局通关复测。 |
| P0 · `FIXED` | [`gates.js`](https://github.com/librecosta/sofaraway/blob/88a4adb533e2c5ec6f8e77a166ca11e75794be58/js/gates.js) `sectorOf`、`laneOf`、门 fragment，在 gate-local 点采样 GPU 像素 | Iris 在 `(1,0)` 仍为实体 hub，基准判开放。Lattice 中心编号 4 一直被重映射为 5，严格中心仍是实心，相邻的 `x≈1.26` 在 JS 已进入右侧格，Shader 仍在中心。ORBIT 第 0 孔中心 `(2.15,0)`，`(1.05,0)` 同扇区却在孔外，`(2.15,0.94)` 在孔内却跨扇区。对齐实际平面 UV、hub 半径和圆孔方程，四类实绘与判定通过。 |
| P0 · `FIXED` | [`gates.js`](https://github.com/librecosta/sofaraway/blob/88a4adb533e2c5ec6f8e77a166ca11e75794be58/js/gates.js) DRIFT 横/竖快门，探测 `y>0.55`、分带边界及距镜头 3 单位处 | 两轴在 JS 与 GLSL 的方向相同，但 UV 尺度不同。基准渠壁上沿裁掉部分门，横门顶带没有实绘开口，靠近 4 单位时门也会突然透明。门覆盖原可操控的八边形截面，保留开顶渠体、三条带与单开口。移除近距离错误的整片淡出。按两轴读回像素。 |
| P0 · `FIXED` | [`main.js`](https://github.com/librecosta/sofaraway/blob/88a4adb533e2c5ec6f8e77a166ca11e75794be58/js/main.js) `readKeyboard`、pointer capture、`step`，启动后按 D/↑，或触摸拖动 | 基准键盘转向无效，鼠标与 Shift 相互清除 Boost，触摸拖动触发 Boost，取消后留有 touch anchor。每帧读取按键，同一截面约束下累计偏移，鼠标按住和 Shift 独立，触摸拖动按 README 约定巡航。测试含松开、失焦、触摸取消和最短键盘过门。 |
| P0 · `FIXED` | [`main.js`](https://github.com/librecosta/sofaraway/blob/88a4adb533e2c5ec6f8e77a166ca11e75794be58/js/main.js) `step`、`takeHit`、`settleRun`，跨门拍、切 Boost、帧间跨多门 | 基准绝对音频拍、受 50 ms 截断的门倒计时和门位置分别推进，新门同帧多扣一次，变速也可让门在判定拍仍离镜头有距离。现以绝对拍放置和判断，先逐门结算再结束。无敌期撞上门仍计为未通过并中断连击，命中数只计扣命，连击统计记完整长度，积分乘数仍封顶 50。跨帧命中只算一次，跨多个门按拍序判断。 |
| P0 · `FIXED` | [`main.js`](https://github.com/librecosta/sofaraway/blob/88a4adb533e2c5ec6f8e77a166ca11e75794be58/js/main.js) `CORRIDOR_LEN`，DESCENT 全程 Boost | 基准仅预留 7200 单位，Boost 路径可超过此界，`Path.sample` 会夹到末端。按每卷时长、速度上界和可视窗口扩展，硬难度实际 158/158，终点仍有前视余量。 |
| P0 · `FIXED` | [`main.js`](https://github.com/librecosta/sofaraway/blob/88a4adb533e2c5ec6f8e77a166ca11e75794be58/js/main.js) 启动、退回、结算，[CSS](https://github.com/librecosta/sofaraway/blob/88a4adb533e2c5ec6f8e77a166ca11e75794be58/css/style.css) `.screen.hidden`，按住开始键或结算动画内 Escape | 基准结算依赖墙钟 timeout，CRASH 无 Escape，固定时钟无法同步生成结果。旧画面即使透明，子按钮仍可能捕获输入。结算由仿真时间推进，重开清理输入和过渡效果，隐藏画面不可交互，启动有状态守卫。真实失败/重试与结算动画中退出均复测。 |
| P1 · `FIXED` | [`audio.js`](https://github.com/librecosta/sofaraway/blob/88a4adb533e2c5ec6f8e77a166ca11e75794be58/js/audio.js) `start`、`stop`、`_schedule`、音量，在 resume 未完成时退出或人为将时钟推进 1.3 s | 基准旧启动仍可重启调度器，stop 只停 timer，已排程音符与混响仍可听见。延迟调度重设下一拍墙钟却未推进步号。使用启动代次、独立干湿输出总线和固定十六分音符网格跳过过期事件。预设音量生效，mute 保留设定值。离线残音、代次竞争和跳拍测试通过。 |
| P1 · `FIXED` | [`audio.js`](https://github.com/librecosta/sofaraway/blob/88a4adb533e2c5ec6f8e77a166ca11e75794be58/js/audio.js) 压缩器输出，离线渲染章节片段 | ELSEWHERE、DESCENT、ORBIT 样本有超过满幅的瞬态，ORBIT 基准观测峰值 1.1695。固定余量初测通过，复跑仍捕获 1.0365 的瞬态。最终输出保留约 2.50 dB 余量，并在 0.90 满幅以上做软限幅，满音量片段复测峰值 ≤1。 |
| P1 · `FIXED` | [`main.js`](https://github.com/librecosta/sofaraway/blob/88a4adb533e2c5ec6f8e77a166ca11e75794be58/js/main.js) settings 事件、`resize`、`render`，高画质 DPR 2，注入 40 ms 帧 | 基准 q 按钮监听委托给其兄弟元素，点击无效。运行时只缩 canvas，resize 又用初始 DPR 缩放目标，`?dbg=1` 只读到最后一次合成。将委托放在 settings，统一有效 DPR 并对整帧累加 draw calls。高→低设置、降级和 resize 复测。 |
| P1 · `FIXED` | [`tunnel.js`](https://github.com/librecosta/sofaraway/blob/88a4adb533e2c5ec6f8e77a166ca11e75794be58/js/tunnel.js) `update`，飞过 Chunk、再返回起点，触发上下文丢失及 `pagehide` | 基准回收时 dispose 共享 bolt 几何却漏实例缓冲，退回起点时还保留前方旧块。回收实例、保留共享几何、双向淘汰。显式释放 page-owned 资源，恢复时重建 PMREM。见资源轨迹和上下文测试。 |
| P1 · `FIXED` | [`path.js`](https://github.com/librecosta/sofaraway/blob/88a4adb533e2c5ec6f8e77a166ca11e75794be58/js/path.js) `sample(s)`，[`index.html`](https://github.com/librecosta/sofaraway/blob/88a4adb533e2c5ec6f8e77a166ca11e75794be58/index.html) DRIFT easy HUD，[`gates.js`](https://github.com/librecosta/sofaraway/blob/88a4adb533e2c5ec6f8e77a166ca11e75794be58/js/gates.js) `clear` | 基准省略 `out` 调用会解引用未初始化的 `r`，DRIFT easy 有四条命但 HUD 只显示三条，重开继续沿用门轴 RNG。补齐缺失基向量、生命槽与 RNG 重置。 |
| P1 · `CONFIRMED` | [`post.js`](https://github.com/librecosta/sofaraway/blob/88a4adb533e2c5ec6f8e77a166ca11e75794be58/js/post.js) `render` 与 [`quality.js`](https://github.com/librecosta/sofaraway/blob/88a4adb533e2c5ec6f8e77a166ca11e75794be58/js/quality.js) | `low.dof=false` 未被消费，低画质仍执行 DOF 与深度 pass，当前差异是采样、DPR 与 shader taps。启动也没有 HalfFloat/MSAA 能力探测或降级路径。把能力分级和目标重用列入 B0/C0，保留当前画面管线。 |
| P1 · `CONFIRMED` | [`main.js`](https://github.com/librecosta/sofaraway/blob/88a4adb533e2c5ec6f8e77a166ca11e75794be58/js/main.js) `step` / `pauseForSurface` 与 [`audio.js`](https://github.com/librecosta/sofaraway/blob/88a4adb533e2c5ec6f8e77a166ca11e75794be58/js/audio.js) `time` | 连续前台长帧只能使用相邻已知转向位置插值，无法还原阻塞期间的输入。音频渲染拍与扬声器输出仍可能相差设备延迟。B0 定义固定步、输入时间戳及中断策略，并测量端到端音画差。 [Web Audio timing](https://www.w3.org/TR/webaudio/#dom-audiocontext-getoutputtimestamp) |
| P1 · `SUSPECTED` | `main.js` 与 `quality.js` 中的存储、`AudioContext.resume` 和页面可见性 | 禁用存储的嵌入环境可能在启动读取 best/difficulty 时抛异常。音频系统中断、权限阻止或 resume 长期 pending 可能阻塞开局或恢复。Chromium 已测取消与 visibility handler，实机策略与恢复等待交 B0。 |
| P2 · `CONFIRMED` | `main.js` `updateCursor`，`post.js` vignette 与 `gates.js` iris seams | 准星显示目标输入，碰撞使用已阻尼位置，靠近边界二者可短时分离。部分 GLSL `smoothstep` 边沿倒置，在不同驱动存在移植风险。正式修订美术表现交后续。 [GLSL ES smoothstep](https://registry.khronos.org/OpenGL-Refpages/es3.0/html/smoothstep.xhtml) |
| P2 · `SUSPECTED` | `main.js` 终点前 12 拍白场 | 终幕白场与最后几扇门同时出现。可复现其时间重叠，实际可读性需在设备上人工验证。 |
| P2 · `CONFIRMED` | `README.md` 与 `tools/render-audio.html` | README 卷 III 时长及旧的 lane/时钟说明与实现有差异，调试导出页标题和下载文件名固定为卷 I。A0 在此报告记录实测时长，README 仅补充测试入口。原 Art Pass 2 烘焙计划与零预生成资产约束冲突，交 B0 决策文档处理。 |

### 关卡验证矩阵

下表数值均按 easy / normal / hard 顺序。基准终点前只统计 `beat < SONG_BEATS` 的门，基准上限来自图谱审计。修复后以 `?align=1&god=0` 在原碰撞、积分和结算路径完成整局，四卷均为 0 hit、100% accuracy、S，生命数与配置一致。

| Volume | BPM / 时长 | 章节边界（拍） | 基准总门 / 终点前 | 修复后实际通过 / 总门 | 最短门距（拍） |
| --- | --- | --- | --- | --- | --- |
| ELSEWHERE | 128 / 210.000 s | 0, 16, 96, 160, 192, 288, 320, 384, 448 | 143/144/144 · 140/141/141 | 143/143 · 144/144 · 144/144 | 2 / 1 / 1 |
| DRIFT | 96 / 140.000 s | 0, 16, 80, 128, 160, 208, 224 | 40/40/40 · 39/39/39 | 40/40 · 40/40 · 40/40 | 3 / 3 / 3 |
| DESCENT | 110 / 218.182 s | 0, 16, 112, 208, 240, 336, 400 | 158/158/158 · 155/155/155 | 158/158 · 158/158 · 158/158 | 2 / 2 / 2 |
| ORBIT | 100 / 192.000 s | 0, 16, 96, 176, 256, 320 | 91/91/91 · 89/89/89 | 91/91 · 91/91 · 91/91 | 2.5 / 2.5 / 2.5 |

ELSEWHERE normal 的 383→384 是 468.75 ms 的 E→N 转向，以真实键盘处理器按 A+W 通过。对准模式证明所有相邻开口在正常仿真步可达，手指移动时间和玩家可读性仍需真机验证。规则测试在 16 拍前和当拍观察门距离，另一次帧跳过 17、18 拍，确认两门各结算一次且只扣一条命，最终 2/4 为 50%。ORBIT 两次独立加载以相同种子和 110.125 s 截点对比相机、门、距离和分数。

## A0-C · 测试环境与复跑

- ASUS TUF Gaming A15 FA506QR，Ryzen 7 5800H，约 32 GiB RAM，Windows 10 Home 10.0.19045。Chrome 157.0.8103.38 headless，Playwright 1.61.1，Node 24.22.1，Python 3.10.8。
- WebGL 2.0 Chromium，ANGLE Direct3D11，AMD Radeon Graphics `0x1638`，驱动 `31.0.21921.1000`。同机 RTX 3070 Laptop 的驱动为 `32.0.16.1074`，测量采用实际报告的 Radeon 实现。
- 静态 Python server 监听 127.0.0.1:8088。测试仅在 Playwright 拦截的 JS 响应上附加读数和可控时钟，普通运行不加载测试控制接口。性能采样沿正常 RAF，保留 PostFX、实时 Web Audio 和正常碰撞。
- 同一套回归在原始 worktree 跑了 22 项，21 项复现失败、DRIFT 离线信号通过。修复后 23 项通过，新增真实 transport 的模拟 visibility 验证。六组实时时间窗口的性能 smoke 在基准和修复版均运行成功。

```powershell
npm ci
npx playwright install chromium
npm test
npm run test:perf

# 复现本报告的系统 Chrome 以及原始 dev 基准
$env:A0_BROWSER_CHANNEL = 'chrome'
git worktree add --detach ../sofaraway-a0-before b61d716
$env:A0_APP_ROOT = (Resolve-Path ../sofaraway-a0-before).Path
npm test
npm run test:perf
Remove-Item Env:A0_APP_ROOT
npm test
npm run test:perf
```

### 性能与资源

同一浏览器和设备串行执行基准与修复后采样。每个 profile 创建独立 context，从点击 START 后约 2.5–6.5 s 采集 RAF 间隔，表中 draw calls 和三角数为采样终点的整帧统计，包括深度与后处理。RAF 反映浏览器回调节奏，不能作为 GPU 渲染时长或设备性能上限。

| 场景 | FPS 基准 → 修复 | 帧间隔 P50 / P95 / max ms，基准 → 修复 | Calls，基准 → 修复 | Triangles，基准 → 修复 | Geometry / Texture / Program，基准 → 修复 |
| --- | --- | --- | --- | --- | --- |
| ELSEWHERE low | 239.7 → 235.5 | 4.2/4.3/8.3 → 4.2/4.3/75.0 | 47 → 51 | 89,870 → 89,878 | 21/9/8 → 22/9/9 |
| DRIFT low | 240.0 → 240.0 | 4.2/4.3/5.5 → 4.2/4.3/4.3 | 49 → 51 | 56,198 → 56,202 | 22/11/9 → 23/11/10 |
| DESCENT low | 239.5 → 239.7 | 4.2/4.3/8.3 → 4.2/4.3/8.3 | 47 → 51 | 89,870 → 89,878 | 21/9/8 → 22/9/9 |
| ORBIT low | 239.5 → 240.0 | 4.2/4.2/8.4 → 4.2/4.2/4.3 | 41 → 43 | 27,174 → 27,178 | 18/11/9 → 19/11/10 |
| ELSEWHERE high | 130.3 → 153.7 | 8.3/8.5/16.6 → 8.2/8.5/16.7 | 47 → 51 | 89,870 → 89,878 | 21/9/8 → 22/9/9 |
| DRIFT auto 触摸模拟 | 239.7 → 240.0 | 4.2/4.3/8.3 → 4.2/4.2/4.3 | 49 → 51 | 56,198 → 56,202 | 22/11/9 → 23/11/10 |

修复后的门提前 8 拍进入前视范围。同一时段的 draw calls 与程序数因此不同，以上短窗不能分离场景变化、调度噪声与纯 GPU 成本。软限幅加入前的另一轮修复版采样中，ELSEWHERE high 为 124.7 FPS。ELSEWHERE low 两次均出现约 75 ms 长帧。首批 Shader 编译或分配是 `SUSPECTED`，需要标记各次编译、生成和 GPU 时间再定位。六组 WebGL 错误值均为 0，未见未捕获异常或 console error。

| 配置 | CSS 视口 / 输入 DPR | 生效 DPR | Canvas / Scene / DOF | Depth | Bloom A/B | Scene MSAA |
| --- | --- | --- | --- | --- | --- | --- |
| low | 960×540 / 1 | 1 | 960×540 | 480×270 | 240×135 | 0 |
| high | 960×540 / 2 | 1.6 | 1536×864 | 768×432 | 384×216 | 4 |
| auto 触摸模拟 | 393×720 / 2 | 1.25 | 491×900 | 245×450 | 122×225 | 0 |

- 降级测试的 high 起始为 320×180 CSS、DPR 2。185 个 40 ms 帧后 DPR 降至 1。修复前 Scene target 仍为 512×288，修复后与 canvas 同为 320×180。resize 到 400×220 后，Scene/DOF、Depth、Bloom 分别为 400×220、200×110、100×55。
- 六组的运行→菜单→重开 Chunk 为基准 `4→4→5`、修复后 `4→4→4`。例如 ELSEWHERE low 的 Geometry 为 `21→21→26` 和 `22→22→22`。修复后独立沿程采样 4200→4800→5400→6000→6600→7200→4200，Chunk 和实例数量均为 `4,4,4,3,4,3,4`，Geometry 为 `21,21,21,16,21,16,21`，Texture 为 9。淘汰时实例发出 dispose，共享 bolt 几何未被销毁。
- 修复后各组 `performance.memory.usedJSHeapSize` 抽样约 15.3–23.7 MB，DRIFT low 的运行→菜单→重开约 `17.1→17.1→23.1 MB`。数据含浏览器分配与 GC 时序，Three.js 统计按对象计数，二者均无法提供 GPU 显存字节数或长时内存泄漏结论。

### 音频与人工验收

自动离线采样覆盖全部 25 个章节，每章从首拍采 8 拍，16 kHz stereo、满音量。测试检查有限非静音信号和峰值，另验证停止后干声与混响静音以及新局可重新发声。音符和混响随机源会使具体数值略有差异。

观测的章节 RMS 范围及最高峰值分别为 ELSEWHERE 0.023–0.096 / 0.949、DRIFT 0.103–0.134 / 0.797、DESCENT 0.056–0.078 / 0.854、ORBIT 0.030–0.087 / 0.935。

- `BLOCKED` 四卷真实听感、持续整轨峰值与扬声器音画延迟。单次把整首 ELSEWHERE 全部排程进 OfflineAudioContext 后，测试在 120 s 超时。实时 transport 和逐章节信号已分别验证。人工使用扬声器/耳机听开场、转段和尾奏，核对撞击、停止与重试。
- `BLOCKED` 实体手机、移动浏览器系统中断及真机帧率。Chromium 的触摸测试使用 393×720、DPR 2 和 CDP touch 输入，覆盖拖动和取消。真机需复测手势遮挡、最短门距的可读性和暂停恢复。
- `BLOCKED` RTX 3070、其他 GPU/浏览器的 GPU 计时及驱动显存、真实 BFCache 导航回收。上下文测试通过 `WEBGL_lose_context` 触发，卸载采用 `PageTransitionEvent` 验证 dispose 路径，不能测量驱动何时回收显存。

## B0 准入

可进入 B0。A0 已复测的 P0 有回归测试，四卷三难度能在正常判定下完成。B0 首先建立无 DOM 的规则/时钟边界与客户端引擎所有权，使同一页面可挂载、销毁、重挂载，并把 WebGL 能力、音频启动和中断作为显式状态。保留按拍生成、四类门和程序化零资产定位。真机与听感项目仍作为后续验收条件。
