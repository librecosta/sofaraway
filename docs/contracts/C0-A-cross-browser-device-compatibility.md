# C0-A — Cross-browser & Device Compatibility Contract

- **Project** LibreCosta / SoFarAway
- **Status** Frozen
- **Baseline** `dev@3ff0e9951709a35e924efe71b427ae1171d5c7a1`

## 1. 目的与范围

验证浏览器初始化、WebGL2、GLSL、Framebuffer、PostFX、音频激活与中断、键鼠与触控、移动布局、页面生命周期及失败恢复。先复现问题，再局部修复并完成跨浏览器回归。

保留 React Router 8 Framework Mode 与 SSG、React 19、TypeScript Strict、Vite、Three.js r187、WebGL2、GLSL、Web Audio 和独立的 Runtime、Simulation、Graphics、Audio 边界。保留四卷、三档难度、游戏规则、编排、视觉风格和完全运行时程序化定位。排除 R3F、WebGPU、WebGL1、引擎重构、艺术设计、音乐编曲、性能专项和生产部署。

## 2. 环境与结果

用现有 Playwright 版本建立独立配置。桌面覆盖 Chromium、Firefox、WebKit，移动覆盖 Android 风格 Chromium 和 iOS 风格 WebKit。跨引擎用标准 Playwright API，Chromium 专用输入在独立分支验证。可用时在 Windows Chrome 或 Edge、Windows Firefox、实际 WebKit 环境、Android Chrome 和 iOS Safari 验证真实交互与音频。真实设备缺失记为 `BLOCKED — REAL_DEVICE_UNAVAILABLE`，归入 C0-D。模拟结果独立记录。

| 结果 | 含义 |
| --- | --- |
| `PASS` | 在记录的条件下正常 |
| `DEGRADED` | 以较低图形配置可靠运行 |
| `UNSUPPORTED` | 能力不足并正确显示回退 |
| `FAIL` | 已复现故障 |
| `BLOCKED` | 当前环境无法完成有效验证 |

`UNSUPPORTED` 证明回退路径。`BLOCKED` 排除在通过率之外。

## 3. Graphics

区分缺少 WebGL2、必要能力不足、Shader 编译或链接失败、Framebuffer 创建失败和上下文丢失。故障进入可操作的 `GameFallback`，保持页面可读。

验证 `EXT_color_buffer_float`、RGBA16F、RGBA8、MSAA 样本数、实际绑定的 Framebuffer 完整性、纹理和 Renderbuffer 尺寸、DPR 与 Canvas 尺寸。探测与失败时回收资源。能力正常时执行选择的画质。HalfFloat 无效时选择 RGBA8 并关闭依赖浮点精度的效果。MSAA 无效时保留其他有效功能。PostFX 故障时使用正确的基础场景。核心 API 或 Shader 无法工作时进入 Unsupported。画质偏好服从实际设备能力，降级保持 Chart、碰撞和计分语义。

核对四种 Gate Shader、Tunnel 材质与 PostFX 的编译、精度、未定义行为、`smoothstep` 边界、深度、Alpha 与混合。允许保真兼容修复。跨 GPU 容许正常像素差异，避免明显缺失、错色和几何消失。

## 4. Audio

保持合成与编排。验证手势激活、成功恢复、拒绝、超时、无 API 和明确的无声选择。失败提供可见操作。无声模式使用独立的单调时钟，保持节拍与规则。

验证后台、窗口失焦、可用环境中的系统中断及 suspended/interrupted、暂停恢复、退出重开。恢复保留进度。需手势时显示 RESUME。停止、重试和切卷作废旧调度，隔离干声与混响，保留音量和静音。音质与端到端延迟由 C0-C 验证。

## 5. Input 与移动布局

桌面验证 WASD、方向键、鼠标移动、按住鼠标与 Shift Boost、Space / Enter 开始和重试、Escape、P、M，以及对话框和表单键盘行为。失焦清除按下状态。

移动验证单指与快速拖动、释放、pointercancel、lostpointercapture、双指、触摸期间进后台，以及暂停退出后的新触摸。次要触点不能夺取主触点，触摸保持巡航。优先使用真实触摸或浏览器级输入。

覆盖竖屏、横屏、视口尺寸、DPR、浏览器可见区和安全区。菜单、Settings、HUD、Results 保持可操作。Canvas 与输入坐标共享有效视口，CSS 适配保持碰撞规则。

## 6. 页面生命周期

后台停止渲染、判定和音频，恢复保留进度且没有一次性大幅跳跃。区分 BFCache 与真实卸载，pageshow 后保留原会话且避免重复 RAF、事件和 AudioContext。自动恢复遵守用户暂停状态及浏览器手势策略。

上下文丢失时暂停并停止提交绘制，恢复后重验能力与资源，保留 Run Session，无法恢复时可退出或重试。测试扩展不可用时说明限制并使用有效的回退证据。

## 7. 验证与交付

- 独立 `npm run test:compat` 与 `playwright.compat.config.ts`。各引擎覆盖静态 HTML、Hydration、WebGL2 或回退、四卷初始化、真实运行片段、基本交互、启动退出重试、音频激活或错误处理以及无未捕获异常。真实 WebGL2 不可用时同时记录回退与运行 BLOCKED。
- 受控验证无 WebGL2、HalfFloat、MSAA、Framebuffer、无 AudioContext 与激活拒绝。测试不向生产代码暴露可写全局，也不通过改动浏览器安全策略获得假通过。
- 保留 A0/B0、四类碰撞、确定性、音频调度、切卷、生命周期、Hydration 和 SSG 回归。跨引擎无需重复跑完十二组全曲。
- P0 优先修复并加回归。P1 在既有边界内解决，重型性能工作归 C0-B。P2 记录并做必要兼容修正。
- 交付本契约、`docs/audits/C0-A-compatibility-report.md`、兼容性测试与配置。报告记录基准、OS、版本、图形能力、结果分类、证据、未覆盖设备、剩余问题和 C0-B 准入。只保留关键证据。
- 使用跨平台 Node/npm。验证后提交到 `dev`，沿用原分支治理，保护 `main` 且禁止强推。

## 8. 验收

Chromium、Firefox、WebKit 有明确结果。可运行环境通过四卷初始化与核心交互。WebGL2 回退、HalfFloat、MSAA、Framebuffer 降级、音频成功与失败、移动触控布局、Context Loss 和页面生命周期有测试证据。A0/B0、TypeScript Strict 和 SSG 通过，无未解释 P0。环境限制明确记为 BLOCKED。C0-A 可以在手机真机缺失时结束，C0-D 承接最终真实移动浏览器验收。下一阶段为 C0-B — Performance & Memory Stability。
