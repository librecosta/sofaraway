# D0-B1-R2 — 微表面与高速可读性验收

基准：`dev@ae98ebe63f8ac70b1cf5102f415b8118531f280e`，实施前与 `origin/dev` 一致。仅修改 ELSEWHERE 的 Iris、Square、Diamond 光学着色器与速度输入。

## 参数与视觉

- 保留 `0.055` 周期、`0.18` 占空比、每秒 `0.65` 周期的相位移动、`lineIntegral()` 和 `fwidth`。在原像素足迹 `0.50–0.95` 周期内平滑减对比，超过 `0.95` 后仍是零细线对比。
- 保留 `ε = 0.06`。玻璃局部每单位 `0.85` 个噪声格，用固定四角散列和三次平滑插值。它只调制扣除平均覆盖后的细线幅度；没有时间输入、贴图或 CanvasTexture。近景同高五点的相位对比从一致的 `74` 变为 `76 / 76 / 76 / 74 / 72`（8 位 RGB 之和的极差）。固定近景成片的最大通道变化只有 1/255：变化局限在微表面，无新增粗条纹。
- `V(v) = 1 − 0.20 × smoothstep(28, 43, v)`。由实际 `sim.speed` 每场景更新一次，沿用光学玻璃的一个 Shader Program。四卷空间回归里，ELSEWHERE 原速 Shift 按下和松开期间，相邻 60 Hz 步的最大系数变化约 `0.020`；观光测得始终为 `1.000`。最高持续 Boost 速度 `49.3` 时系数为 `0.800`。
- 光学层的既有 Alpha 能量经 `smoothstep(0.005, 0.035, energy)` 将细线调制平滑限制在面材区域。面材底色、基准 Alpha、Gaussian、三级高光和 Hit/Fade 公式原样保留。实际 GPU 样点中，Square 亮核、Halo、拼缝、外轮廓和 Diamond/Iris 开口在两档速度系数下分别保持 `754 / 182 / 396 / 326 / 754 / 760`，也与基准一致。

三种门在固定位置采 40 个相位。近景两个像素足迹（`0.0015`、`0.003`）的对比从 `76` 降至 `60`；过渡足迹 `0.033` 从 `18` 降至 `14`；远景 `0.08` 仍为 `0`。样点的平均叠加亮度变化不超过 1.7%；底色与透明度基值未改变。相位扫描测量的是细线时域幅度，不能代替人眼实机观感。

固定时间截图覆盖近远 Iris、Square、Diamond 和 Score，并比较持续 Boost (`49.3` 单位/秒) 与观光 (`11.33` 单位/秒)。低画质有效 DPR 1（960×540），高画质在设备 DPR 2 时按既有上限使用 DPR 1.6（1536×864）。Boost 样图开口轮廓保持清晰，最大通道变化为 2/255（低）和 4/255（高）。36 秒的远 Iris 与基准逐像素一致；DRIFT、DESCENT、ORBIT 的同时间画面也均逐像素一致。原几何、开口、F2 世界站位和空间碰撞未改。

## 同机性能

Windows 10 build 19045，Ryzen 7 5800H，Chrome 157.0.8103.39，Playwright 1.61.1，AMD Radeon 核显 ANGLE/D3D11 WebGL2。固定 960×540、DPR 1，同一运行种子；每场景两轮 ABBA。每窗口预热 24 帧，记录 480 帧 CPU 和 20 个异步整帧 GPU 计时。下表为每版本四窗口的分位数中位值，单位 ms。资源是整帧对象计数。

| 场景 | CPU P95 基准 → R2 | GPU P50 / P95 基准 → R2 | Draw Calls / Triangles | Geometry / Texture / Program |
| --- | ---: | ---: | ---: | ---: |
| Iris 高画质 | 1.10 → 0.90 | 1.976 / 2.432 → 1.923 / 2.161 | 50 / 90,858 | 23 / 9 / 13 |
| Score 高画质，巡航 | 0.85 → 0.75 | 1.748 / 2.027 → 1.658 / 1.796 | 33 / 49,766 | 10 / 9 / 13 |
| Score 低画质，巡航 | 0.55 → 0.55 | 0.907 / 1.728 → 0.897 / 1.704 | 25 / 25,464 | 10 / 7 / 11 |
| Score 高画质，持续 Boost | 0.85 → 0.80 | 1.799 / 1.979 → 1.782 / 2.013 | 33 / 49,766 | 10 / 9 / 13 |

绘制调用、三角形和资源计数每组均相同。Score 样点两版都是 12 道门、12 个 Mesh 和两份共享门几何；134 个预热 Shader 句柄全部释放，四轮切卷的混合门资源计数一致。高速整帧 GPU P95 的单窗口范围为 `1.895–2.525 → 1.916–2.108 ms`，没有观察到持续退化，也不据此宣称提速或跨设备性能。

复跑：为基准和候选构建 `build/client`、`build/harness`。基准只复制当前 `tests/harness/glass-optics.ts` 和 `tests/harness/stability.ts` 两份观测工具，应用代码留在基准。`STABILITY_REFERENCE_DIR` 指向基准的 `build` 后，执行 `npx playwright test --config playwright.stability.config.ts --grep '@glass|shader handle|bounded'`。截图输出在 `test-results/stability`，不纳入仓库。

## 回归与人工验收

`npm run typecheck`、`npm test`、`npm run test:release` 均通过：133 项单测、52 项浏览器回归及 6 项静态发布验收。视觉和资源套件通过 5 项，另重复执行 GPU 对照。F2 关卡空间、玻璃 CPU/GPU 开口、三岔路、拾取道具及四卷音频信号回归通过。未重新执行四首实时全曲；本轮未修改 Simulation 或 Audio。

图形兼容回归 50 项通过：Chromium、Firefox、WinCairo WebKit 及移动 Chromium/WebKit 模拟均通过 GPU 开口和细线读回、DPR、图形降级及上下文恢复检查。WinCairo 无原生 AudioContext，上下文恢复用例沿用无声路径。

仍需在真实高刷新率显示器和移动设备上观察高速时的主观闪烁及开口可读性。固定图、像素读回和浏览器移动模拟不能代替这些人工验收。Hull、Normal Map、Sky 和项目许可证不在改动范围。
