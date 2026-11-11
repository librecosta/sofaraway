# B0 迁移与回归报告

基准为 `dev@88a4adb533e2c5ec6f8e77a166ca11e75794be58`。验证对象为本报告所在的 B0-D 提交。应用在 Node 24 LTS 下通过 React Router 8 生成静态 HTML，React 19 Hydration 完成后才加载 Three.js r187 和 Web Audio。TypeScript 启用 Strict。

## 运行时边界

- React 管理菜单、设置、HUD、结算和回退界面。Router 管理 `?vol` 与浏览器历史。UI 通过命令与不可变 Snapshot 通信。状态转换即时发布，常规 HUD 最多约 12.5 Hz。准星和闪屏由视口适配器更新。
- Runtime 持有一个 Renderer、一个 Audio Engine 和最多一个挂起的 RAF。Volume Session 持有场景、路径、门共享几何、纹理和环境图。每次 Run 重置图谱游标、相机、得分、生命与音频代次。退出时停止调度、断开干声及混响总线。切卷回收旧场景并复用 Canvas 和 Renderer。
- Simulation 在 Node 可单独测试。音频模式读取 `AudioContext.currentTime`，无声模式读取单调时钟，两者驱动同一个 60 Hz 消费器。一次最多补算五步，超出窗口保留最后的有效进度并暂停。恢复重建时间锚点，音频继续使用原绝对十六分音符网格。
- WebGL 丢失时停止 RAF 和仿真，恢复时重新检测能力、初始化渲染目标和 PMREM。缓存导航保留会话。真实卸载使 Runtime 立即失效。低画质跳过深度和 DOF pass，所有实际渲染目标使用有效 DPR。

## 行为回归

`npm run typecheck` 与生产静态构建通过。Vitest 16 项、B0 Playwright 28 项、A0 快照 Playwright 23 项通过。A0 和 B0 的性能命令各完成六个配置。

十二组以固定时间跑过全曲，使用 `align=1&god=0` 实际通过碰撞，全部零撞击、100% 准确率和 S 评级。完整 Chart 的绝对拍、门编号和章节与 A0 的 SHA-256 一致。下表门数和结算分数均与 A0 相同。

| Volume / 障碍 | BPM / 总拍数 | Easy 门数 / 分数 | Normal 门数 / 分数 | Hard 门数 / 分数 |
| --- | ---: | ---: | ---: | ---: |
| ELSEWHERE / iris | 128 / 448 | 143 / 67701 | 144 / 107726 | 144 / 160426 |
| DRIFT / shutter | 96 / 224 | 40 / 15468 | 40 / 23928 | 40 / 35208 |
| DESCENT / lattice | 110 / 400 | 158 / 75314 | 158 / 119039 | 158 / 177339 |
| ORBIT / aperture | 100 / 320 | 91 / 41444 | 91 / 65069 | 91 / 96569 |

- Vitest 覆盖 12 份图谱、开口边界、撞击与重开、60/120/144 Hz 逻辑轨迹一致性，以及长帧暂停前零推进和恢复。
- Playwright 读取四种实际 Shader 的 GPU 像素，检查门轴、中心和边界，与碰撞规则逐点核对。检查桌面键鼠与 Boost、模拟触摸及取消、失败与重开、持久化及存储拒绝、历史导航、上下文恢复、DPR 与运行时降级。
- 实时音频覆盖启动、暂停、恢复、音量与静音、启动取消、超时重试和显式无声模式。OfflineAudioContext 检查全部 25 个章节的 8 拍立体声片段，RMS 均超过 0.001，峰值均不超过满幅。断开旧 Run 后干声和混响隔离区间实测峰值为零。独立静态页面完成了 ORBIT 短 WAV 下载。
- 三轮各四次切卷、开局、返回，GPU 几何、纹理和程序计数保持有界。验证所有四卷双向 Chunk 流式淘汰和 Chunk 独占几何及实例缓冲释放。上下文丢失及合成 BFCache 事件暂停并恢复原进度。每个 Runtime 最多一个挂起 RAF，卸载后挂起数归零且输入与生命周期的 AbortSignal 已取消。开发模式 StrictMode Effect 回放只初始化一个 WebGL Canvas。
- Chrome 960×540 同机以 `q=high&t=24.4&align=1&god=0&ui=0` 对照 A0 和 B0，DRIFT 和 ORBIT 像素完全一致，ELSEWHERE 与 DESCENT 每通道绝对平均差为 1.50 和 0.23（8 位色阶）。同一 B0 固定时间重载逐像素一致。单时刻截图覆盖有限，实际视觉与听感仍需人工走查。

## 性能与资源

ASUS TUF A15 FA506QR，Ryzen 7 5800H，32 GiB，Windows 10 Home 19045，Node 24.22.1，Playwright 1.61.1。Chrome 157.0.8103.38 Headless，WebGL2 ANGLE Direct3D11，AMD Radeon Graphics `0x1638`，驱动 31.0.21921.1000。该进程实际使用 Radeon iGPU。浏览器采样与显卡驱动所报告的计数用于同机比较。

两个版本都从真实点击开始，保留 Web Audio、碰撞和对应画质的 PostFX。单 worker 按同一组 Volume、视口和画质依次采样，记录启动后 2.5–6.5 秒的 RAF 间隔。每组测量一次进入菜单、开局、退出、重开和切卷。诊断文本在采样时隐藏。A0 用原测试附加计数，B0 使用只读诊断输出。

| 配置 | FPS A0 → B0 | 帧 P50/P95 毫秒 A0 → B0 | 每帧 draw calls / triangles A0 → B0 | Geometry / Texture / Program A0 → B0 |
| --- | ---: | ---: | ---: | ---: |
| ELSEWHERE low | 200.9 → 237.7 | 4.2/8.4 → 4.2/4.3 | 51/89878 → 30/44948 | 22/9/9 → 22/7/8 |
| DRIFT low | 232.3 → 238.5 | 4.2/4.3 → 4.2/4.3 | 51/56202 → 29/28108 | 23/11/10 → 23/9/9 |
| DESCENT low | 202.0 → 206.8 | 4.2/8.4 → 4.2/8.4 | 51/89878 → 30/44948 | 22/9/9 → 22/7/8 |
| ORBIT low | 167.6 → 122.6 | 4.2/12.6 → 4.3/16.8 | 43/27178 → 25/13596 | 19/11/10 → 19/9/9 |
| ELSEWHERE high | 62.4 → 45.5 | 12.6/33.3 → 24.9/29.3 | 51/89878 → 51/89878 | 22/9/9 → 22/9/10 |
| DRIFT auto 移动视口 | 132.7 → 112.4 | 4.3/16.7 → 8.3/16.8 | 51/56202 → 51/56202 | 23/11/10 → 23/11/11 |

| 配置 | 进入菜单就绪毫秒 A0 → B0 | 切卷就绪毫秒 A0 → B0 | B0 内部初始化 / 切卷毫秒 | JS 堆 MiB A0 → B0 |
| --- | ---: | ---: | ---: | ---: |
| ELSEWHERE low | 1184 → 1277 | 494 → 241 | 983/172 | 17.6 → 24.0 |
| DRIFT low | 450 → 467 | 487 → 222 | 229/140 | 19.8 → 22.2 |
| DESCENT low | 391 → 681 | 494 → 348 | 346/242 | 18.7 → 32.2 |
| ORBIT low | 376 → 731 | 733 → 468 | 328/308 | 19.1 → 20.9 |
| ELSEWHERE high | 689 → 985 | 889 → 445 | 591/298 | 17.7 → 17.3 |
| DRIFT auto 移动视口 | 634 → 961 | 529 → 611 | 490/391 | 25.1 → 25.0 |

就绪耗时包含浏览器导航或交互、引擎初始化以及 Playwright 轮询。内部耗时由 B0 Runtime 记录。A0 切卷需重新导航，B0 在原文档创建场景。进入菜单的 B0 初始化还包含 Hydration、动态加载与就绪前 Shader 预热。单次耗时受缓存与系统负载影响。

六组开局都持有 4 个 Chunk，采样无 WebGL 错误或页面异常。960×540、DPR 1 的 low 配置在 A0 仍使用全尺寸 DOF 与半尺寸深度目标。B0 low 只使用 960×540 场景目标及两个 240×135 Bloom 目标。high 的 960×540、设备 DPR 2 统一限至 1.6，场景目标为 1536×864、4× MSAA，DOF 1536×864、深度 768×432、Bloom 384×216。移动 auto 的 393×720、设备 DPR 2 统一限至 1.25，场景及 DOF 491×900、深度 245×450、Bloom 122×225，无 MSAA。后两个配置的目标与 A0 一致。

独立批次间的 RAF 差异较大。例如较早一次 high 采样 A0 157.6 FPS、B0 108.5 FPS，第二次为上表的 62.4 与 45.5 FPS。使用同一 Chrome 进程按 A0、B0、B0、A0 交替复测 high，各轮 P95 GPU 帧时间为 7.60、6.49、6.56、7.22 ms。计时用 `EXT_disjoint_timer_query_webgl2` 包围运行循环的 WebGL 提交，跳过 disjoint 结果。对应 CPU 回调 P95 为 1.40、1.20、1.00、1.50 ms，RAF FPS 为 115.3、130.6、133.2、101.9。高画质的 draw calls、三角形和目标尺寸相同，交替复测未显示 B0 增加 CPU 或 GPU 单帧成本。不同批次的 RAF 波动不能归因于一个已确认的渲染回归。C0 仍需在隔离负载下长时复测。

帧率接近 240 FPS 的样本受到该 headless RAF 调度上限约束。移动配置为桌面 Chromium 的 393×720 模拟视口。JS 堆读取是时点近似，采样期间没有控制垃圾回收。保真对照和性能都只覆盖此浏览器与 GPU 组合。

## 静态产物

`npm run build` 预渲染 `/`，生成 `build/client/index.html`、客户端代码、字体及独立 WAV 诊断页。Playwright 通过普通 HTTP 文件服务检查了元数据、无 Canvas 的首屏 HTML、客户端 Hydration、直接访问 `/?vol=orbit` 以及切卷历史。运行只需 `build/client`。构建使用的 `build/server` 和测试 harness 均在部署目录外。

| 平台 | 兼容性结论 |
| --- | --- |
| Cloudflare Workers Static Assets | 以 `build/client` 为 `assets.directory`。站点只有 `/`，查询参数由浏览器读取，纯静态 Assets 配置可承载该产物。 [Cloudflare 配置文档](https://developers.cloudflare.com/workers/static-assets/binding/) |
| EdgeOne Pages | 自定义构建使用 `npm run build`，输出目录 `build/client`。也可在 Node 24 本地构建后使用目录部署。静态文件在同样的根路径结构下工作。 [EdgeOne 构建配置](https://pages.edgeone.ai/document/framework-other) · [目录部署](https://pages.edgeone.ai/document/deployment) |

兼容性结论来自静态产物实测与平台文档。平台构建环境与线上路由行为尚未部署验证。

## 后续验证

- C0 在真实手机、Safari、Firefox、较低端显卡和缺少 HalfFloat 的 GPU 上复跑。BFCache 与音频系统中断需按浏览器实机策略验证。Chrome 模拟触摸和可控上下文丢失已覆盖对应代码路径。
- C0 测量端到端声画延迟、持续运行的 GPU 时间和内存占用。当前帧时间为浏览器 RAF，资源计数为 `renderer.info`，没有直接测量 GPU 分配字节或扬声器输出时刻。
- 人工验收四个完整编排的听感、桌面和移动端菜单、门可读性及视觉节奏。自动信号与截图仅覆盖报告列出的样本。
- Vite 对客户端动态 Runtime Chunk 报体积提示，当前约 611 kB minified、157 kB gzip。保留为 C0 加载性能基线。

原 A0 快照仍可从 Git worktree 复跑。B0 浏览器通过生产静态产物和单独构建的 test harness 验证，生产代码没有可写测试全局。命令见 [README](../../README.md#tests)。
