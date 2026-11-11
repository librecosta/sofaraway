# C0-A — 浏览器与设备兼容性报告

## 环境与复跑

- 基线为 `dev@3ff0e9951709a35e924efe71b427ae1171d5c7a1`。在 ASUS TUF Gaming A15 FA506QR 上运行 Windows 10 Home x64 build 19045，Ryzen 7 5800H，32 GB RAM。Chrome 使用 AMD Radeon 核显及 ANGLE D3D11。主机的 RTX 3070 未用于已确认的 Chrome 渲染。
- Node 24.22.1，仓库锁定的 Playwright 1.61.1。单 worker、headless、同一主机，使用独立 HTTP 服务器提供 `build/client` 和测试专用 GPU harness。Chromium 项目使用本机 Chrome stable，Firefox 与 WebKit 使用 Playwright 固定构建。跨引擎用标准 Playwright API，只有 Chromium 触摸序列使用 CDP。
- `npm ci` 后执行 `npx playwright install chromium firefox webkit`，再运行 `npm run test:compat`。也可在已安装 Chrome stable 的机器上设置 `COMPAT_CHROMIUM_CHANNEL=chrome` 后运行同一命令。`npm run test:compat -- --project=mobile-webkit` 可单独复跑移动 WebKit。标准输出的 `COMPAT` JSON 行记录分项分类及能力；断言失败由 Playwright 标为 `FAIL` 并保留截图。
- `npm run typecheck` 验证 Strict，`npm test` 验证 Vitest、SSG 生产构建、独立静态服务和 B0 回归。A0 对照使用 `git worktree add --detach ../sofaraway-a0 88a4adb533e2c5ec6f8e77a166ca11e75794be58`，设置 `A0_APP_ROOT` 后执行 `npm run test:a0`。A0 验证历史快照，B0 的 12 组关卡回归直接验证当前代码。

## 实测环境

| 项目 | 浏览器 | 浏览器报告的 WebGL Renderer | CSS 视口与设备 DPR | Auto 场景颜色目标 |
| --- | --- | --- | --- | --- |
| `chromium` | Chrome 157.0.8103.38 | ANGLE AMD Radeon 0x1638，D3D11 | 960×540 / 1 | 960×540，4× MSAA |
| `firefox` | Firefox 151.0，Playwright | `ANGLE (AMD, Radeon HD 3200 Graphics Direct3D11 vs_5_0 ps_5_0), or similar` | 960×540 / 1 | 960×540，4× MSAA |
| `webkit` | WebKit 26.5，Windows WinCairo | `Apple GPU` | 960×540 / 1 | 960×540，4× MSAA |
| `mobile-chromium` | Chrome 157.0.8103.38，Pixel 7 模拟 | 同桌面 Chrome | 412×839 / 2.625 | 515×1048，MSAA 0 |
| `mobile-webkit` | WebKit 26.5，iPhone 13 视口模拟 | 同桌面 WebKit | 390×664 / 2，另验 DPR 3 | 487×830，MSAA 0 |

五组运行均提供 WebGL2、`EXT_color_buffer_float`、16384 的最大纹理及 Renderbuffer 尺寸、`MAX_SAMPLES=8`。实际 RGBA16F 与 RGBA8 颜色和深度 Framebuffer 均完整，项目配置所用的 4/2/1 样本均通过实际绑定探测。各正常 Auto 场景均启用 DOF。Firefox 与 WebKit 的 Renderer 是浏览器报告字符串，无法据此确认底层显卡。移动 UA 与视口来自模拟配置。[Playwright 浏览器](https://playwright.dev/docs/browsers) · [Playwright 设备模拟](https://playwright.dev/docs/emulation)

## 结果矩阵

`DEGRADED` 表示以能力允许的配置运行。`UNSUPPORTED` 表示已验证回退提示。`BLOCKED` 表示环境无法有效覆盖该功能。表中的能力故障注入独立于每个浏览器的正常运行结果。

| 验证项 | Chromium | Firefox | WebKit | 移动 Chromium | 移动 WebKit |
| --- | --- | --- | --- | --- | --- |
| 静态 HTML、Hydration、四卷初始化、实跑、退出及重开 | PASS | PASS | PASS，显式无声 | PASS | PASS，显式无声 |
| WebGL 错误与四类 Gate GPU 像素对照碰撞 | PASS | PASS | PASS | PASS | PASS |
| 无 WebGL2、资源上限不足、核心 Shader 编译失败 | UNSUPPORTED | UNSUPPORTED | UNSUPPORTED | UNSUPPORTED | UNSUPPORTED |
| HalfFloat、MSAA、Framebuffer、PostFX Shader 故障注入 | DEGRADED | DEGRADED | DEGRADED | DEGRADED | DEGRADED |
| Resize 与 DPR 变化同步 Canvas 和 Render Target | PASS | PASS | PASS | PASS | PASS |
| 原生 AudioContext 激活、suspend、恢复及调度清理 | PASS | PASS | UNSUPPORTED 回退 / BLOCKED 有声 | PASS | UNSUPPORTED 回退 / BLOCKED 有声 |
| 无音频 API、拒绝、超时及明确选择无声 | PASS | PASS | PASS | PASS | PASS |
| 键鼠、Boost、设置键盘焦点 | PASS | PASS | PASS | PASS 设置键盘 | PASS 设置键盘 |
| 移动竖横屏、暂停、恢复、退出及结算 | — | — | — | PASS | PASS，DPR 2 |
| 主触点、拖动、多指、取消、丢失捕获、后台清理 | — | — | — | PASS，浏览器级输入 | PASS 可信点按 / BLOCKED 原生拖动、多指及取消 |
| 受控 visibility / BFCache 生命周期 | PASS | PASS | PASS | PASS | PASS |
| 真实历史导航触发 BFCache | PASS | BLOCKED | BLOCKED | PASS | BLOCKED |
| 真实 WebGL 上下文丢失并恢复原局 | PASS | PASS | PASS | PASS | PASS，DPR 2 |
| DPR 3 额外移动用例 | — | — | — | PASS | PASS 短时实跑及安全暂停 / BLOCKED 持续实跑 |

## 复现与修复证据

| 优先级与结果 | B0 基线上复现 | 局部修复及回归 |
| --- | --- | --- |
| P0 FIXED，核心 Shader 故障无提示 | 在核心 Gate 片元源码末尾注入语法错误。原版仍允许 START。 | 检查链接状态，分别识别编译和链接错误。必要 Shader 失败进入可重试的 `GAME UNAVAILABLE`。用例 `a core shader failure has a visible outcome`。 |
| P0 FIXED，PostFX 故障可能遮挡可用场景 | 向合成 Shader 注入编译错误。原版保持失效的后处理链。 | 回收失败链，恢复默认 Render Target、场景材质及 Gate 可见性，重画基础场景。回归用片元与顶点 varying 类型冲突独立触发链接错误。 |
| P1 FIXED，扩展名和样本数不足以证明可用 | 保留 float 扩展，让浮点 FBO、MSAA FBO 或全部 FBO 报 `FRAMEBUFFER_UNSUPPORTED`。原版仍选择无效的目标。 | 绑定并检查 RGBA16F、RGBA8、颜色和深度样本配对，回收探测资源。检查实际 Three 目标与 MSAA resolve 目标。故障时依次尝试去掉 MSAA、切 RGBA8 并关闭 DOF、绘制基础场景；Resize 后重新验证。五类注入验证所用目标、DOF 与 `gl.getError()=0`。 |
| P1 FIXED，Shader 未定义行为 | 静态审查发现 iris 接缝及暗角使用反序 `smoothstep`，并发现 iris 在 `atan(y,x)` 中传入 `x=0` 的可能。 | 改用正序反相并处理竖轴，保留原阈值。三个引擎运行四类 Gate Shader 的开口和接缝 GPU 读回与碰撞对照，无不一致。 [Khronos GLSL ES 3.00 规范](https://registry.khronos.org/OpenGL/specs/es/3.0/GLSL_ES_Specification_3.00.pdf) |
| P1 FIXED，DPR 变化与上下文恢复 | 仅改变 DPR 时原运行时只监听窗口 Resize。真实上下文恢复曾报 `INVALID_OPERATION (1282)`，Firefox 日志为 `deleteFramebuffer: obj is from a different (or lost) WebGL context`，首帧加载也触发长帧暂停。 | 监听分辨率媒体查询，重算 Canvas 与目标尺寸。丢失时解绑旧资源的清理回调，恢复时重建图形资源并完成必要绘制，再接回原 Run Session 的 Transport。测试检查丢失期间零绘制、Beat 冻结、同一 Canvas、恢复后的推进和零 WebGL 错误。后续若出现长帧可用 RESUME 保留进度。 |
| P1 FIXED，设置键盘焦点 | 打开 Settings 后按 Tab，原版焦点进入背后的菜单。 | 对话框接收焦点，背景菜单、HUD、结果 inert，关闭后回焦。表单键由原生控件处理，聚焦按钮的 Space/Enter 保持原生行为。 |
| P1 FIXED，移动暂停与窄横屏设置 | B0 的触控流程没有可点按的 Pause。修复过程中另复现 412 px 高视口的关闭按钮落到 y≈436。 | 粗指针显示 Pause，Settings 保持可滚动，HUD 和操作按钮预留安全区。真实点按走完设置、暂停、恢复、退出和结算。 |
| P1 FIXED，触摸捕获释放不完整 | B0 只在 Canvas 上收取终止事件，取消时已排队的触摸增量仍可被下一步读取。 | Window 级结束监听和取消清理；移动 Chromium 的可信触点验证次要触点不会抢占、取消与捕获丢失后不继续移动、后台旧触点不生效、新触点能接管，速度保持巡航。 |

音频成功路径调用真实 `AudioContext.suspend()`，验证可见恢复提示、同一局节拍继续、`M` 的静音偏好、切卷和重开。浏览器探针检查旧调度器停止且 Run Bus 与 Master 断开，干声和混响均经该 Run Bus。无声启动先完成首帧提交，再锚定独立单调时钟。测得的是调度与连接关系，系统输出和听感留给 C0-C/C0-D。

## 限制与移交

- `BLOCKED — REAL_DEVICE_UNAVAILABLE`。无 Android 手机、iOS 手机或 macOS Safari 环境。真实 Safari 的音频激活、系统 `interrupted`、触控取消、硬件安全区及浏览器工具栏收起移交 C0-D。Windows Chrome 的实机主机覆盖由自动化执行，Windows Firefox 使用同一主机的 Playwright 构建，未另跑 Edge 品牌浏览器。
- Windows WebKit 26.5 无 `AudioContext` 或 `webkitAudioContext`。实际运行验证了提示和玩家手动选择的无声模式。Windows 上的 WebKit 自动化只可发送原生点按；原生拖动、多指和取消留给真机。Playwright Firefox 与 WebKit 的真实跨文档导航未产生 `pageshow.persisted=true`，受控事件覆盖同一 Runtime 的暂停与恢复。
- Windows WebKit 的 iPhone 13 视口在 DPR 3 下短时实跑通过，较早复测中同一用例触发了 B0 的有界补算保护，验证了冻结 Beat 和退出。同一环境的独立采样在 DPR 3 观察到多次 100–190 ms RAF 间隔，切到 DPR 2 后约 38–47 ms，游戏时钟正常推进。DPR 3 的持续实跑记为 `BLOCKED`，将合成和呈现开销移交 C0-B。数字仅描述本次主机与模拟环境。
- Firefox 对现有 Rajdhani 和 Chakra Petch 字体发出字形边界或 `maxZones` 修正警告。字体与界面仍加载，记为 P2，字体文件保留原样。
- 首轮故障证据在基线 Chrome 获得，关键症状和可执行复现见上表。跨 GPU 色彩目视验收、真实移动操作以及系统级声画验收仍待 C0-D，当前证据包含 GPU 开口判定、桌面与模拟视口以及实际浏览器交互。

## 回归与准入

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run test:compat` | 101 个 Playwright 用例完成，0 失败、0 跳过。分项环境限制见矩阵。 |
| `npm test` | 16 个 Vitest 与 28 个 B0 浏览器用例通过，生产 SSG 构建通过。 |
| `npm run test:a0` | A0 固定基线 23 个 Playwright 用例通过。 |

C0-A 满足进入 C0-B 的条件。已复现的 P0 已修复，五个项目覆盖四卷核心流程，当前代码的十二种关卡组合回归通过。高 DPR 持续性能、真实设备、原生 WebKit 音频和部分引擎的真实 BFCache 仍按上表限制处理。
