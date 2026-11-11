# C0-B — 性能与资源稳定性报告

## 环境与复跑

基线为 `dev@f1a164a208ac8aa31b8f4ec40e2b3d8d8d4d7b53`。测试主机为 ASUS TUF Gaming A15 FA506QR，Windows 10 Home x64 build 19045，Ryzen 7 5800H，32 GB RAM，Node 24.22.1，Playwright 1.61.1。Chrome stable 157.0.8103.38 headless 报告 `ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001638) Direct3D11 …, D3D11)`，AMD 驱动为 31.0.21921.1000。这里的 Chrome 测量来自 AMD 核显的硬件 WebGL2。移动 WebKit 为 Playwright 26.5 WinCairo，`Apple GPU` 是浏览器报告的别名，不能用来确认显卡型号。两者数据分别记录。

`npx playwright install chromium webkit` 后运行 `npm run test:stability`。若用系统 Chrome，将 `STABILITY_CHROMIUM_CHANNEL` 设为 `chrome`。默认重复测量当前构建。对照需准备相同 Harness 的 C0-A 构建。

```sh
git worktree add --detach ../sofaraway-c0b-base f1a164a208ac8aa31b8f4ec40e2b3d8d8d4d7b53
node --input-type=module -e "import {copyFileSync} from 'node:fs'; for (const f of ['index.html','main.ts','stability.ts']) copyFileSync('tests/harness/'+f, '../sofaraway-c0b-base/tests/harness/'+f)"
npm --prefix ../sofaraway-c0b-base ci
npm --prefix ../sofaraway-c0b-base run build
npm --prefix ../sofaraway-c0b-base run build:harness
```

把 `STABILITY_REFERENCE_DIR` 指向基线的 `build` 目录，再运行 `npm run test:stability`。可附 `-- --grep benchmark` 或 `-- --grep soak`。单 worker，逐场景 A–B–B–A。`STABILITY` JSON 行保留原始汇总及环境信息。截图仅用于失败诊断。Harness、测试注入和 CDP 均在测试侧，SSG 产物不包含探针。

复跑基线长跑时，把 `playwright.stability.config.ts` 和 `tests/stability/stability.spec.ts` 复制到已构建基线工作树的相同位置。在基线工作树中清除 `STABILITY_REFERENCE_DIR`，运行 `npx playwright test --config playwright.stability.config.ts --grep soak`。

## 测量口径

- Chrome 从真实 Runtime 开始后预热 1 秒，再采 5.4 秒窗口。使用无声 Transport 和现有诊断自动对齐，保留碰撞及计分。早段基准用同一输入和节拍区间，密集段另有全曲真实渲染样本。WebKit 用 iPhone 13 视口、DPR 2/3 与 DRIFT auto，各采 3.6 秒。
- RAF 间隔独立统计 FPS、P50/P95/P99 和 >50 ms 帧。CPU 包裹 RAF 回调、固定步 `consume`、Graphics `update/draw`、Renderer、Chunk 和初始化步骤。CPU 总量和子项有包含关系。`LongTask` 依浏览器支持记录，CDP 的 Script/Task/V8 指标为页面加载诊断。
- Chrome 用 `EXT_disjoint_timer_query_webgl2` 交错采样完整渲染帧、Scene、Depth、DOF、Bloom 和 Composite。查询后续帧异步取回，丢弃 disjoint 结果和超出窗口的待完成查询。Bloom 汇总同一帧 5 个 Pass。Scene 与 Depth 查询范围为 Renderer 调用，各 Pass 分时采样，所以中位数不可直接相加。GPU 数据不含浏览器合成。 [Khronos 扩展规范](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/)
- GPU 资源用 Three.js 计数及目标尺寸。JS Heap 用 Chromium CDP `Runtime.getHeapUsage` 近似，测试在循环之间排空旧音频后另采 GC 后数据。二者均无法测出实际显存或全部浏览器进程的原生内存。

## Chrome 硬件基准

箭头左侧为 C0-A，右侧为 C0-B 最终构建。区间是两个独立采样窗口的范围，时间单位为 ms。除 1080p 外，桌面和移动 Chrome 的 RAF P50/P95/P99 约为 4.2/4.3/4.3 ms。1080p 两版均为 12.4/12.6/12.6 ms。32 个窗口中大于 50 ms 的帧均为 0。约 240 FPS 受本次环境的 RAF 节奏上限影响。

| Volume / Quality / Viewport | FPS | Frame CPU P95 | GPU P50 | GPU P95 | Draw Calls / Triangles | 切卷就绪 |
| --- | --- | --- | --- | --- | --- | --- |
| ELSEWHERE high · 960×540 | 240 → 239.8–240 | 0.80 → 0.70 | 1.93–2.03 → 1.90–1.92 | 2.56–2.63 → 2.54–2.58 | 51 / 89,878 → 21 / 22,486 | 96.6–114.9 → 42.7–44.8 |
| ELSEWHERE low · 960×540 | 239.8–240 → 240 | 0.60–1.10 → 0.50–0.60 | 1.02–1.19 → 0.98–1.00 | 1.79–1.95 → 1.75–1.78 | 30 / 44,948 → 15 / 11,252 | 90.3–102.1 → 43.0–46.1 |
| ELSEWHERE high · 1920×1080 | 93.5–95.6 → 91.9–93.1 | 0.90–1.00 → 0.90 | 8.42–8.50 → 8.84–8.87 | 8.87–8.95 → 9.12–9.41 | 51 / 89,878 → 21 / 22,486 | 121.9–126.5 → 54.3–58.1 |
| DESCENT high · 960×540 | 240 → 239.8–240 | 0.80 → 0.80–0.90 | 2.00 → 1.92–1.96 | 2.27–2.36 → 2.53–2.66 | 51 / 89,878 → 51 / 89,878 | 98.4–100.9 → 35.9–43.8 |
| ORBIT low · 960×540 | 240 → 240 | 0.90–1.10 → 0.60–0.70 | 0.65–0.89 → 0.55–0.60 | 1.30–1.39 → 1.25–1.34 | 25 / 13,596 → 12 / 3,420 | 117.1–118.6 → 45.0–52.4 |
| ORBIT high · 960×540 | 240 → 240 | 0.70–0.80 → 0.60–0.80 | 1.48–1.70 → 1.34–1.73 | 1.93–2.21 → 1.88–2.08 | 43 / 27,178 → 17 / 6,826 | 97.2–115.0 → 47.2–48.9 |
| DRIFT auto · 390×664 · DPR 2 | 240 → 240 | 0.70 → 0.60–0.70 | 1.06–1.11 → 0.77–0.83 | 1.61–1.63 → 1.52–1.55 | 51 / 56,202 → 21 / 14,082 | 95.5–97.7 → 44.9–48.7 |
| DRIFT auto · 390×664 · DPR 3 | 240 → 240 | 0.60–0.90 → 0.70–0.80 | 0.98–1.18 → 0.82–1.21 | 1.62–1.73 → 1.61–1.63 | 51 / 56,202 → 21 / 14,082 | 92.5–107.7 → 44.0–52.1 |

桌面两种分辨率有效 DPR 均为 1，high 用 4× MSAA、全尺寸 DOF 和 ¼ 宽高的 Bloom，Depth 为 ½ 宽高。移动 auto 在两档设备 DPR 下都是有效 DPR 1.25、487×830、MSAA 0。实时窗口的 Chunk 均为 4。代表性 Geometry/Texture/Program 计数为 ELSEWHERE high `22/9/10 → 17/9/10`、ORBIT high `19/11/11 → 12/9/10`、DRIFT auto `23/11/11 → 18/11/11`。Geometry 计数只包含已经上传的对象。

ELSEWHERE high 在 1920×1080 的分 Pass 数据如下。RGBA16F、MSAA、采样核、Bloom、色差和 Composite 参数保持原样。

| GPU 范围 | C0-A P50 / P95 | C0-B P50 / P95 |
| --- | --- | --- |
| Scene | 5.34–5.49 / 5.87–5.95 | 5.54–5.56 / 5.67–5.85 |
| Depth | 0.17 / 0.20–0.21 | 0.16 / 0.18 |
| DOF | 1.60–1.61 / 1.75 | 1.77–1.78 / 1.97–1.99 |
| Bloom | 0.34–0.35 / 0.38–0.42 | 0.35–0.36 / 0.38–0.40 |
| Composite | 0.90–0.92 / 0.92–0.96 | 0.91–0.92 / 0.93–0.96 |

1080p 的 Scene 和 DOF 为主要 GPU 成本。该档 GPU P95 上升约 0.2–0.5 ms，同批数据中 DOF P95 高约 0.2 ms。更早一轮交错复测的完整 GPU P95 从 8.33–8.37 到 8.49–8.55 ms，DOF 未升。两轮的 RAF P95/P99 持平。已定位主要 Pass，现有样本不足以将差值归到某项代码改动。提交量的改善不能外推为 GPU 或 FPS 加速。DESCENT 起跑位置四个 Chunk 的包围球均与视锥相交，提交量相同。GPU P50 小幅下降，GPU P95 高约 0.2–0.4 ms，CPU P95 与 RAF 尾部近似持平。两个场景的短窗口 GPU 尾部差值保留供其他硬件复测。

## 已确认的成本与修改

1. **切卷重复生成纹理与环境图。** 原版每次切卷重建相同的 Hull Canvas、Normal Map 与 PMREM，另外创建未被材质引用的程序化纹理。基线切卷的 Canvas 读回为 16.9–48.3 ms、PMREM 为 7.9–11.3 ms、场景构建为 43.7–75.8 ms。Graphics 现在持有一套共享 Hull 纹理与环境目标，切卷仅重新生成专属几何和天空。上下文丢失及销毁仍回收共享资源，恢复重建。C0-B 切卷的场景构建为 2.4–6.6 ms，省去 Canvas 读回和 PMREM。整体切卷从 90.3–126.5 ms 降到 35.9–58.1 ms。
2. **Chunk 重复采样和临时对象。** 原版 Shell、Ribs、Ribbons、Braces 对同一 Ring 反复采样。每个 Chunk 还创建从未加入场景组的 Bolt InstancedMesh 与矩阵。现在共享 Ring Frames，复用灯光与法线临时向量，省去未提交的实例。Path 的预采样与插值公式保留。隔离的 15 Chunk 构建试验及前后向回收结果如下。
3. **视锥外的提交。** 恢复 Three.js 对静态 Chunk Mesh 的保守包围球裁剪，保留同样的 Chunk 预读与回收窗口。ELSEWHERE、DRIFT 和 ORBIT 的测量视角提交三角形减少约 75%，效果随位置变化。四卷 `t=83` 的 high 截图逐像素相同，原有碰撞与关卡测试保持独立。 [Three.js BufferGeometry](https://threejs.org/docs/pages/BufferGeometry.html) · [Three.js Object3D](https://threejs.org/docs/pages/Object3D.html)

| CPU Chunk | C0-A P50 / P95 | C0-B P50 / P95 |
| --- | --- | --- |
| ELSEWHERE | 4.1 / 12.1–13.1 | 3.0–3.3 / 7.9–8.6 |
| DRIFT | 1.6–1.9 / 3.4–3.5 | 1.3–1.5 / 2.6–3.1 |
| DESCENT | 3.3–3.4 / 4.2–4.5 | 2.2–3.0 / 3.9–4.4 |
| ORBIT | 0.9 / 2.1–2.3 | 0.5–0.8 / 0.9–1.6 |

路径构建的分段累计约为 1–7 ms。回收试验两版 Chunk 数序列均为 `4,3,3,3,4,4`，退场 Geometry 释放数符合各自所有权，最终剩余 Chunk 为 0。ELSEWHERE 的 Chunk P95 降幅约三分之一，两轮交错测量均可复现。

## 启动与预热

生产 SSG 的 ELSEWHERE high 页面通过标准静态 HTTP 服务加载。冷启动用新浏览器上下文，热启动在相同上下文重新导航，哈希 JS 缓存命中。以下是两次样本的范围，单位为 ms。

| 指标 | C0-A 冷 / 热 | C0-B 冷 / 热 |
| --- | --- | --- |
| 首次可点击 Start | 369.7–1205.9 / 205.1–219.9 | 332.4–335.0 / 202.8–214.7 |
| Runtime 初始化 | 180.0–1033.4 / 153.6–169.7 | 170.2–174.4 / 154.9–164.6 |
| 页面 ScriptDuration | 60.8–87.1 / 24.2–31.0 | 72.9–74.6 / 23.0–23.4 |
| Runtime 模块请求起点 → 响应完成 | 140.2–151.7 → 143.7–156.9 / 34.8–35.4 → 34.8–35.4 | 126.6–134.8 → 130.2–139.2 / 33.4–35.2 → 33.4–35.2 |
| Long Task 数 / 时长 | 每样本 1 个，184–1037 / 155–172 | 每样本 1 个，173–177 / 157–166 |

第一个 C0-A 样本也承担浏览器进程首次 GL 使用，紧邻的独立复测出现相似离群值。热缓存数据相近，首启改善证据不足。动态模块请求在页面加载后发起，请求起点包含应用启动与 Hydration 的前序工作。这里未单独计量 React Hydration。CDP 的 V8CompileDuration 在这些样本约 0.1 ms，仅是该诊断项，不能代表全部 JS 解析时间。

Harness 的首次场景构建约 51–106 ms，PMREM 约 21–51 ms，首次 Shader 预热约 4–13 ms。切卷 Shader 预热约 3–6 ms，Canvas 读回及环境图才是切卷节省的主要来源。WebGL 编译与链接调用的 CPU 提交时间多在 1 ms 内，不能由此推断驱动完整编译成本。

Runtime JS 从 616,061 降至 608,946 字节，gzip 从 157,545 降至 155,586 字节。静态服务器上的冷 JS 传输量含响应开销，从 998,112 降至 990,997 字节，热缓存样本均为 0。没有新增分包或运行时网络依赖。Vite 的大型 Chunk 提示仍存在。

## WinCairo 高 DPR

| DRIFT auto | C0-A FPS → C0-B FPS | C0-A RAF P95 → C0-B RAF P95 | C0-B CPU P95 |
| --- | --- | --- | --- |
| iPhone 13 模拟 DPR 2 | 59.3–59.9 → 61.6–62.1 | 18–19 → 17 ms | 1 ms |
| iPhone 13 模拟 DPR 3 | 31.2–31.7 → 31.0–32.0 | 33–34 → 33–34 ms | 2 ms |

两档游戏渲染目标都是 487×830，帧 P95 差距随设备 DPR 变化，Frame CPU 未见相近幅度增长。差异与显示路径或浏览器内部图形工作有关，当前无法精确拆出 GPU、合成与驱动时间。WinCairo 为 `GPU_TIMING_UNAVAILABLE`。八个采样窗口均正常推进到约 5.9 拍、没有大于 50 ms 的帧。C0-A 与本次完整兼容回归均在另一 DPR 3 用例触发长帧安全暂停。保留原有画质策略，Windows 模拟结果不外推到 Safari 真机。

## Soak 与资源

Chrome 依次执行 20 轮四卷切换、两次有声启动、暂停、继续、退出、high/low 与真实 Resize。每轮在菜单验证 Runtime 的 RAF 仍活动，旧调度器及 Run Bus 均已退出。销毁后 AudioContext 实际关闭，RAF 停止，Runtime 和 Input 的监听器信号均已中止。随后重挂载并按音频时钟跑完最长卷 DESCENT，采用 normal 和自动对齐，碰撞有效。

| 指标 | C0-A | C0-B |
| --- | --- | --- |
| DESCENT 完整结果 | 400 拍、158/158、119,039 分、ESCAPED / S | 相同，约 223.3 秒到结果采样，0 次长帧暂停 |
| 20 轮菜单 Geometry / Texture / Program / Chunk | 18–22 / 7–9 / 8–9 / 4 | 11–22 / 7–9 / 8–9 / 4 |
| 全曲 Geometry / Texture / Program / Chunk | 17–22 / 7 / 8 / 3–4 | 17–22 / 7 / 8 / 3–4 |
| 全曲窗口 Frame CPU P95 | 0.70–1.20 ms | 0.50–1.80 ms |
| 全曲窗口 GPU P95 | 1.02–1.91 ms | 1.07–2.98 ms |
| 大于 50 ms 的帧 / Long Tasks | 0 / 0 | 0 / 0 |
| 全曲采样 JS Heap | 12.71–26.91 MiB | 11.35–30.33 MiB |

两版各采 47 个窗口，Frame CPU P95 的窗口中位数为 0.90 → 0.60 ms，GPU P95 的窗口中位数为 1.20 → 1.89 ms。更早一组长跑中两版的 GPU P95 窗口中位数均为 1.90 ms。长跑是分批执行，跨批次变化明显，GPU 改动主要用交错基准评价。候选最后部分窗口的 RAF P95 升到约 8.4 ms，随后正常结算。候选各窗口的 Simulation CPU P95 为 0–0.1 ms，Graphics Update 为 0.1–0.4 ms，Renderer CPU 为 0.4–1.2 ms。在线 Chunk 单次 CPU 峰值为 8.5 → 6.5 ms，Frame CPU 峰值为 10.5 → 8.1 ms。长跑期间未调用强制 GC。

为复核这项批次差异，额外以 DESCENT low、960×540、DPR 1 按 A–B–B–A 跑相同 5.4 秒窗口。完整 GPU P95 为 1.04–1.14 → 1.01–1.03 ms，Frame CPU P95 为 0.70 → 0.80 ms，四次 RAF P95 均为 4.3 ms，提交均为 30 Draw Calls 和 44,948 Triangles。长跑批次的 GPU P95 中位数差值未在这组交错窗口复现。

20 轮中每四轮在同一 ORBIT 菜单排空旧音频并采样。候选 GC 后 Heap 为 9.39 / 9.65 / 9.85 / 9.96 / 10.09 MiB，DOM 稳定在 26 节点、50 个监听器，Backing Storage 稳定约 2.38 MiB。对象所有权的复核见下文。候选的实时峰值高于基线，不能用单个 Heap 峰值推断保留泄漏。

### P0 Shader 句柄回收

20 轮的 `renderer.info.programs` 保持稳定，额外的 WebGL API 计数发现未删除 Shader 在第 8、20、32、48 轮分别累积 36、84、132、196 个。原实现使用 `compile()` 预热并手动查询 LINK_STATUS。Three.js r187 在首次读取 Program Uniforms 或 Attributes 时完成链接校验并请求删除 Shader。预编译后一直未绘制的材质可绕过该步骤。Program 销毁本身只删除 Program。 [Three.js r187 WebGLProgram](https://github.com/mrdoob/three.js/blob/r187/src/renderers/webgl/WebGLProgram.js)

`Graphics.prepare()` 现在在已有 Shader 错误处理范围内完成该首次使用步骤。回归在同样的 8 次切卷中由 108 次创建、72 次删除请求变为 108 / 108。预热的 Shader 程序和 GLSL 保持一致，四卷固定时间截图仍逐像素相同。修复后的 48 轮补测共创建 1,296 个 Shader，并为每个句柄请求删除。第 8、20、32、48 轮在同一菜单下，Shader 的创建减删除数均为 0，Program、Framebuffer、Texture、VertexArray、Buffer、Renderbuffer 的差值稳定为 8、48、13、10、24、7。GL 删除请求用于验证资源生命周期，实际回收时点由浏览器与驱动决定。

### Heap 保留对象

修复后对同一菜单补跑 48 轮，GC 后 Heap 从第 8 轮的 9.46 MiB 增至第 48 轮的 10.25 MiB。两个 CDP 对象快照中，约 0.69 MiB 的差值来自 V8 指令、字节码和相关元数据。其余差值包含浏览器对象与性能记录。Backing Storage 和 DOM 计数不变，WebGLTexture、WebGLFramebuffer、Float32Array、AudioContext、AudioBuffer 及音频节点的相关保留数量不变。WebGLProgram 包装对象增加 11 个，约 1 KiB，原生 Program 句柄差值保持 8。快照在观测点暂停测量后获取，不参与帧时间对照。

## 回归与准入

| 命令 | 验证 |
| --- | --- |
| `npm run typecheck` | TypeScript Strict 通过 |
| `npm test` | 16 项 Vitest、28 项 B0 浏览器回归，SSG 与纯静态运行通过 |
| `npm run test:stability` | 13 项通过，含两组构建的 32 个 Chrome 和 8 个 WebKit 对照窗口、四卷截图、Shader 句柄、20 轮和最长卷实跑 |
| `npm run test:a0` | 通过历史 A0 Worktree 复跑 23 项，`A0_APP_ROOT` 为 `88a4adb533e2c5ec6f8e77a166ca11e75794be58` 的工作树 |
| `npm run test:compat` | 101 项通过，含 Chrome、Firefox、WebKit 及两种移动模拟；下列环境限制继续标记 `BLOCKED` |

B0 回归包含四卷三档、四类门的规则与可见开口、计分、调度、暂停恢复、流式回收和纯静态 Hydration。生产客户端未打包性能 Harness 或测试全局。实跑验证有声 Transport 和正常完赛。音质、实机端到端延迟和 OS 音频中断仍由后续阶段验证。

WinCairo 缺少 GPU 查询与 AudioContext，移动 WebKit 的原生拖动、多指及 DPR 3 持续游玩仍有限制。Firefox 和 WebKit 的原生导航未将此 WebGL/音频页面存入 BFCache。兼容测试覆盖降级、无声模式及受控生命周期，保留这些环境限制的原状态。移动真机、独显及其他 GPU 的性能未覆盖。1080p high 和 DESCENT 的 GPU 尾部差值待其他硬件复核。当前高 DPR 结果支持继续在 C0-D 复测浏览器显示路径，暂未支持任何全局画质调整。

已确认的 P0 Shader 句柄泄漏已修复。C0-C 可使用本阶段的有声实跑及资源基线，继续验证音频时钟、延迟、听感和中断恢复。
