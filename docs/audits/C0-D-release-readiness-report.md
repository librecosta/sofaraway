# C0-D — 发布准备与工程验收

## 基准与环境

审计于 2026-11-11 在干净的 `dev` 工作区开始。本地 HEAD 与远程 `origin/dev` 均为冻结基准 `189234f25c1c1cf877d0644600b3189ed73ba34e`。远程 `main` 为 `8e440ec2e092338619b366f9cec75e054e29e297`。验收范围见 [C0-D 契约](../contracts/C0-D-release-readiness.md)。

环境为 ASUS TUF Gaming A15 FA506QR、Windows 10 Home x64 19045、Ryzen 7 5800H、32 GB、Node 24.22.1、Playwright 1.61.1。桌面快速检查使用 960×540、DPR 1、Chrome stable 157.0.8103.38，WebGL2 由 AMD Radeon 核显通过 ANGLE D3D11 提供。兼容性矩阵另用 Playwright Firefox 151 和 Windows WinCairo WebKit 26.5，移动项目使用 Pixel 7 和 iPhone 13 视口模拟。浏览器测试均在本机运行。Playwright 自带 Chromium 的下载连接被重置，Chromium 项目以本机 Chrome 执行。

## 生产构建与托管

`npm run test:release` 先执行 TypeScript Strict 检查与 SSG 生产构建，再从独立 HTTP 服务器测试 `build/client`。首页无脚本即可渲染，Hydration 后才请求含 Three.js 的 Runtime Chunk。测试拦住此请求时 START 保持禁用，释放请求后成功开局。四个 `?vol` 直达入口、同页切卷、前进、后退和刷新均通过。生成的 `build/server` 仅在构建时使用。

产物共 27 个文件，含首页、品牌 404、favicon、离线音频工具、17 个指纹 JS/CSS/WOFF2、许可说明和平台响应头配置，约 1.16 MB。逐一检查公开文件的 HTTP 状态和 MIME，检查 JS 中无 Harness 的可写全局及内部探针，并验证不存在 SPA fallback。Vite 仍提示 Runtime Chunk 约 609.67 kB minified、156.95 kB gzip，与基准相同。 [React Router 预渲染](https://reactrouter.com/how-to/pre-rendering)

| 环境 | 配置及实际证据 |
| --- | --- |
| 独立 HTTP 预览 | `npm start` 提供 `build/client`。首页和音频页可直达，未知路由和缺失的旧 Chunk 返回品牌 404。HTML 使用 ETag 和 `max-age=0, must-revalidate`，匹配返回 304，旧 ETag 返回 200。当前带指纹的 JS/CSS/字体缓存一年并标记 immutable。 |
| Cloudflare Workers Static Assets | 仓库根 `wrangler.jsonc` 只声明 `build/client`、`404-page` 与 HTML 路由行为。Wrangler 4.160.0 本地 Workerd 实测首页与 `?vol=orbit` 返回 200，`/index.html` 307 至 `/`。音频工具的 `.html` 路径 307 至无扩展名 URL，参数保留。HTML ETag 304，已知 Chunk 可长期缓存，未知路径和缺失 Chunk 返回品牌 404 且可重新验证。Chrome 实测 ORBIT 开局、退出和诊断页生成 WAV。 |
| EdgeOne Pages | 使用 Node 24 在本地或 CI 构建，Direct Upload 预备物为 `build/client` 本身或以 `index.html` 为根的 ZIP。产物在其文件数量和单文件大小限制内。根目录有 `404.html` 和生成的 `edgeone.json`，后者只为当前指纹资源配置响应头。托管构建的 Node 24 支持、线上路由和 CDN 行为均未实测。 |

Cloudflare 可用已有的 Node 24 Workers Builds 环境执行 `npm ci && npm run build`，部署时读取仓库根的静态配置。使用 Wrangler 可复跑本地路由检查，命令为 `npx --yes wrangler@4.160.0 dev --local --ip 127.0.0.1 --port 8101`。EdgeOne 文档列出的托管构建版本未包含 Node 24，预构建上传可避开这一依赖。两家均未部署，也未配置账户、域名或密钥。 [Cloudflare SSG](https://developers.cloudflare.com/workers/static-assets/routing/static-site-generation/) · [HTML 路由](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/) · [静态响应头](https://developers.cloudflare.com/workers/static-assets/headers/) · [构建镜像](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/) · [EdgeOne Direct Upload](https://pages.edgeone.ai/document/direct-upload) · [EdgeOne 配置](https://pages.edgeone.ai/document/edgeone-json) · [EdgeOne 404](https://pages.edgeone.ai/document/custom-404-page) · [EdgeOne 缓存](https://pages.edgeone.ai/document/configuring-cache)

## 修复与网站检查

| 项目 | 复现与验收 |
| --- | --- |
| 无脚本与元数据 | 基线禁用脚本后菜单停在 LOADING，缺少使用要求。现有作品名称和 LibreCosta 署名在无脚本时可见，同时说明需要 JavaScript 和 WebGL2。Title、Description、英语 `lang`、Canonical、OG 及 Twitter Card 由 SSG 输出，favicon 为同源 SVG。卷查询共用 `https://sofaraway.librecosta.com/`。单页目前不需要 sitemap 或 robots 文件，品牌 404 含 noindex。最终分享图留给 D0。 |
| WebGL2 回退 | 基线全局隐藏系统指针，而无 WebGL2 时游戏光标无法获得有效运行状态。现只在可交互的图形状态隐藏系统指针。受控禁用 WebGL2 后检查提示、重试焦点和系统指针，恢复能力后重试可加载同一卷，且仅有一个 Canvas。 |
| Fullscreen | 基线模拟 `requestFullscreen` 不可用时没有菜单提示。现显示可读状态，同一测试验证提示，另在正常 Chrome 测试进入与退出全屏。 |
| 404 和缓存 | 基线预览未返回 ETag 或缓存策略。补齐后验证新旧 ETag、字体和音频工具 MIME、404 状态与回首页链接。首轮 Workerd 验证另发现目录通配缓存规则给缺失 Chunk 的 404 加了一年缓存。改为构建时为实际存在的指纹文件生成精确规则，两类旧 Chunk 路径复测均可重新验证。 |
| 客户端下载失败 | 首次 Runtime Chunk 网络请求失败时显示可重试提示。基线与本次构建均可重试成功，沿用已有恢复路径。 |

## 许可证与分支

| 对象 | 核查结果 |
| --- | --- |
| `main` 与 GitHub | 审计时 `main` 只有初始提交，含 `.gitignore`、BSD-3-Clause `LICENSE` 和题为 `elsewhere` 的 README。它是 `dev` 的祖先，冻结基准比较为 `main 0 / dev 59`。公开 GitHub 仓库默认分支为 `main`，许可证元数据为 BSD-3-Clause，简介仍以单卷 128 BPM 描述。主页元数据已指向 Canonical 域名。 |
| `dev` | `LICENSE`、README、`package.json` 和锁文件的项目许可均为 MIT。产物复制当前分支的项目许可证，供随后经维护者确认的正式发布构建沿用。许可证源文件、仓库元数据和分支关系均未修改。 |
| npm 依赖 | React、React DOM、React Router、Three.js、Scheduler 为 MIT，并进入 Vite 生成的 `THIRD-PARTY-NOTICES.txt`。同时核对了包树中的 Route Pattern 与 Cookie ES（MIT）和 isbot（Unlicense）。用官方 npm registry 对完整锁文件及生产子集审计均返回 0 条已知漏洞。 |
| 随仓字体 | 五个 WOFF2 的内嵌许可记录均为 SIL Open Font License 1.1。加入 Chakra Petch 和 Rajdhani 的上游完整许可与版权说明，原字体保持不变，静态产物可获取两份说明。 |

发布前由维护者确认 MIT/BSD-3-Clause 的处理方式及历史版权说明，再通过经审查的集成 PR 将拟发布提交纳入 `main`。最终同步项目许可证、包元数据、README 与 GitHub 简介，并复跑发布检查。 [仓库](https://github.com/librecosta/sofaraway) · [Vite 构建许可清单](https://vite.dev/config/build-options#build-license) · [Chakra Petch OFL](https://github.com/google/fonts/blob/main/ofl/chakrapetch/OFL.txt) · [Rajdhani OFL](https://github.com/google/fonts/blob/main/ofl/rajdhani/OFL.txt)

## 关键恢复与回归

| 验证路径 | 实测 |
| --- | --- |
| 图形能力不足 | 五个浏览器项目均在无 WebGL2、纹理能力不足或核心 Shader 失效时显示 `GAME UNAVAILABLE`，状态为 `UNSUPPORTED`。HalfFloat、MSAA、Framebuffer 及 PostFX Shader 注入故障时正确 `DEGRADED`，保留可用场景与游戏规则。 |
| 上下文丢失与恢复 | 五个项目使用原生 `WEBGL_lose_context`，丢失期间停绘、冻结同局进度，恢复后推进，无 GL 错误。 |
| 音频启动失败与无声 | 五个项目受控移除 AudioContext、拒绝或挂起启动。回退可重试，明确选择 PLAY WITH SOUND OFF 后以单调时钟推进。Chrome 和 Firefox 实际运行 AudioContext、暂停、静音及恢复。WinCairo 有声为 `BLOCKED`。 |
| 后台、长帧与退出 | 五个项目通过可见性及受控 BFCache 流程。Chromium 原生 BFCache 回到原局，Firefox/WinCairo 原生 BFCache 为 `BLOCKED`。Chrome 和 Firefox 调度饥饿和 160 ms 阻塞触发安全暂停，恢复后节拍继续。回菜单、重开、切卷验证停止旧 Scheduler、断开旧 Run Bus，B0 另验证单 Canvas、单 RAF 和资源数量有界。 |
| UI 与输入 | 桌面验证键鼠、设置焦点与关闭回焦、音量/静音、暂停、恢复和结果页。移动模拟验证竖屏与横屏、设置可滚动、触摸区域、暂停及结果页。移动 Chromium 原生触摸验证主触点与取消。WinCairo 支持可信点按，其原生拖动、多指和取消为 `BLOCKED`。硬件安全区和移动浏览器工具栏变化待真机。 |

| 命令 | 结果 |
| --- | --- |
| `npm run test:release` | Strict、SSG 与 6 项快速发布用例通过。可设置 `RELEASE_CHROMIUM_CHANNEL=chrome` 复跑本机 Chrome。 |
| `npm run test:a0` | 23 个通过。以 `A0_APP_ROOT` 指向独立 worktree `88a4adb533e2c5ec6f8e77a166ca11e75794be58`，验证原始基线。 |
| `npm test` | 25 个 Vitest 和 28 个 B0 浏览器用例通过。当前代码四卷 × 三难度保持原有 Gate 数、碰撞与结算，四种 GLSL 开口与碰撞一致。 |
| `npm run test:compat` | 5 个项目共 101 个用例完成，0 失败、0 跳过。环境限制见上表。 |
| `npm run test:stability -- --grep "benchmark production\|benchmark elsewhere low\|fixed-time visual\|prewarming"` | 4 个通过。设置 `STABILITY_REFERENCE_DIR` 指向独立冻结基准 worktree 的 `build`，事先在该 worktree 执行 `npm ci`、`npm run build` 和 `npm run build:harness`。 |
| `npm run test:sync -- --grep-invert "completes the full song"` | 9 个 Transport 单测和 16 个浏览器用例完成，覆盖锚点、章节信号、停止后的干声与混响隔离、恢复和长帧。 |

性能 A-B-B-A 复测中，ELSEWHERE / low / 960×540 / DPR 1 每个样本 5.4 s。基准与候选的 RAF 间隔 P95 都为 4.2–4.3 ms，CPU P95 为 0.50 → 0.40 ms，GPU Frame P95 为 1.86–1.90 → 1.82–1.90 ms。资源数相同，每轮为 17 个 Geometry、7 个 Texture、8 个 Program、4 个 Chunk，GL 错误为 0。重复预热创建的 108 个 Shader Handle 全部释放。四卷 83 s 的高画质 Canvas 像素与基准相同。

热缓存 START 就绪时间为基准 177–187 ms、候选 185–196 ms。首次基准冷样本含 878 ms Runtime 初始化，另一个基准冷样本为 174 ms，候选两次均为约 167 ms。暖缓存 JS 传输均为 0 B。复测未发现可重复的明显退化。采样描述同一主机和场景。

渲染、音频、仿真与关卡源文件无改动。完整的 C0-B 20 轮及最长卷 Soak、C0-C 四首真实时长测试沿用基准报告，本轮复跑上表与改动相关的检查。 [C0-A 兼容性报告](C0-A-compatibility-report.md) · [C0-B 性能报告](C0-B-performance-report.md) · [C0-C 音频报告](C0-C-audio-sync-report.md)

## 正式公开发布前

| 待验证 | 状态 |
| --- | --- |
| Android Chrome、iOS Safari、macOS Safari | `BLOCKED — REAL_DEVICE_UNAVAILABLE`。验证首屏、音频手势、触摸与取消、旋转、安全区、系统音频中断及回到游戏。 |
| 四卷完整听音 | `BLOCKED — HUMAN_LISTENING_REQUIRED`。按 C0-C 清单验证开场、转场、Drop、门与节拍、暂停恢复、尾奏和异常声音。 |
| 扬声器输出到屏幕发光的延迟 | `BLOCKED — PHYSICAL_MEASUREMENT_UNAVAILABLE`。公开宣称精确物理声画同步前需进行外部测量。 |
| 其他 GPU 的高画质 | `BLOCKED — OTHER_GPU_UNAVAILABLE`。本次实测只覆盖所记录的图形环境。 |
| 托管后的 CDN、域名与 TLS | `BLOCKED — NOT_DEPLOYED`。上线时检查所选平台的直达、404、缓存、字体和分发情况。 |

1. 完成 D0 美术、音乐与体验验收，准备最终作品介绍和 OG 分享图，完成目标设备实操及人工听音。
2. 由维护者确认许可证，审查 `dev` 到 `main` 的发布集成 PR，并同步 GitHub 页面信息。
3. 用确定的发布 SHA 和 Node 24 构建并归档完整 `build/client`，记录产物校验值及宿主版本。发布前对同一产物执行发布检查。
4. 选定托管平台后，在 HTTPS 上验证根页、四卷参数、浏览器历史、404、音频工具、字体和缓存头。用上版 HTML 的 ETag 验证新首页返回 200，使用当前 ETag 验证 304。验证更新前打开的旧标签页可刷新回新版本。
5. 保存上一可用版本的完整产物和托管版本标识。回滚时恢复 HTML、Chunk 和响应头所对应的同一版本，验证首页、查询参数与 404，并确认 CDN 按需重新验证 HTML。

## 验收结论

**Engineering Ready — PASS。** 生产静态产物、基础网站质量、关键故障回退和相关回归均通过，未发现遗留的已确认工程 P0。可进入 D0。

**Public Release Ready — 待验收。** 正式公开发布取决于 D0 验收、目标设备、人工听音、分享素材、维护者许可证决定和实际托管验证。
