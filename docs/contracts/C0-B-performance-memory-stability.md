# C0-B — Performance & Memory Stability Contract

- **Project** LibreCosta / SoFarAway
- **Status** Frozen
- **Baseline** `dev@f1a164a208ac8aa31b8f4ec40e2b3d8d8d4d7b53`

## 1. 目标与边界

先测量并定位 CPU/GPU 帧、Chunk 流式生成、长期资源、初始化和 Shader 预热、高 DPR、画质以及生产加载，再实施可验证的局部优化。保留 React Router 8、React 19、TypeScript Strict、SSG、Vite、Three.js r187、WebGL2、GLSL、Web Audio 和独立 Runtime、Simulation、Graphics、Audio。四卷三档、音乐、几何、Shader、关卡、碰撞、计分及视觉定位保持原有行为。允许复用运行时生成资源。排除离线资产、新图形框架、通用游戏框架、后端和美术或玩法修改。

## 2. 测量

- CPU 记录实际 Frame、Simulation、Chunk、Graphics Update、Renderer、Shader 和场景初始化耗时。支持时记录 Long Task 次数与持续时间。使用测试专用低侵入探针，独立统计 RAF 间隔。
- GPU 优先使用 `EXT_disjoint_timer_query_webgl2` 异步查询。测量完整 GPU 帧、Scene、Depth、DOF、Bloom、Composite 及高低画质差异。必要时用独立实验。查询不可用记为 `GPU_TIMING_UNAVAILABLE`，不用 RAF、频繁 `gl.finish()` 或同步读回来代替。
- 输出 FPS、帧间隔 P50/P95/P99、GPU P50/P95、超过 50 ms 的帧数、Draw Calls、Triangles、Geometry/Texture/Program/Chunk、可得的 JS Heap 近似以及初始化和切卷时间。注明环境、硬件或软件渲染、浏览器、DPR、画质、场景和采样窗口。资源计数及估算尺寸不等于显存；内存 API 局限写入报告。

## 3. 可复跑基准

同一设备和浏览器按需要使用 A–B–B–A 交错顺序，重要结论至少两次采样。覆盖 ELSEWHERE high/low、DRIFT auto、DESCENT high、ORBIT high/low、移动 DPR 2/3 以及 960×540、1920×1080，独立复测移动 WebKit。记录冷启动与热启动。软件和硬件结果独立记录，采用相同测试条件比较。

## 4. Geometry 与 Graphics

审查完整路径预采样、`_buildChunk`、位置法线 UV、实例对象所有权、前后保留窗口、临时分配与 GC。优先局部复用和减少重复计算，保持原形状、细节与连续性，仍按需流式生成。没有证据时避免引入 Worker 或新调度架构。

分析 DPR 和实际像素、RGBA16F、MSAA、DOF、Bloom、Shader 和环境初始化。保留三档画质定位。调整效果需同时有 GPU 成本和视觉对照证据。画质策略需有稳定触发条件，避免初始化偶发长帧触发永久下降。Windows WebKit 的特殊表现不能单独决定全局画质策略。

## 5. 内存、Soak 和启动

持续运行覆盖最长 Volume 的真实时间完整曲目，另进行至少 20 轮切卷、开始、退出、重试、画质、Resize、暂停恢复，并覆盖销毁和重挂载。检查 Geometry、Material、Program、Texture、Render Target、InstancedMesh、环境、AudioContext、节点、调度、RAF 和监听器。允许缓存预热增长，区分释放后的稳定计数、临时分配和真实保留。可控 GC 只允许作为测试观测手段。

分析静态页面加载、JS 解析/执行、Hydration、Runtime 动态加载、纹理、Path/Tunnel、Shader 与首个可交互画面。B0 Runtime 约 611 KB minified / 157 KB gzip 是比较基线。避免为构建警告拆碎模块或引入额外框架。

## 6. 缺陷、回归与验收

P0 为持续泄漏、反复阻断实跑的长帧、资源耗尽或核心正确性回归。P1 优先处理证据明确的构建卡顿、后处理开销、重复初始化和资源增长，超范围项记录理由。P2 保持记录。实际优化需有前后对照，收益无法复现或明显牺牲画质时撤回。

新增 `npm run test:stability`，复用现有 Playwright 与 Harness。TypeScript Strict、SSG、A0/B0/C0-A、十二种规则组合、四卷固定时间视觉及音频行为需要通过。生产产物不得附带高频探针或测试全局。验收依赖可比较的 P95 等证据，无脱离硬件的统一 FPS 阈值。完成可信基线、成本定位、流式与长跑稳定性证据，解释高 DPR 风险，无遗留确认 P0。

## 7. 交付

提交本契约、`docs/audits/C0-B-performance-report.md`、必要测试和命令。报告包含环境、成本、生命周期、Soak、前后对照、遗留问题与 C0-C 准入。原始 Trace、缓存和构建产物放在忽略目录。

在 `dev` 检查本地与远程基线，完成测试后提交，普通 `git push origin dev` 并核对远程 `dev` SHA。保护 `main`，禁止强推或覆盖其他改动。最终报告 Commit、测试结果、主要变化、遗留问题与下一阶段建议；如推送失败，明确给出原因和本地状态。
