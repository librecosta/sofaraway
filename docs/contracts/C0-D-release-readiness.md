# C0-D — Release Readiness & Engineering Closure Contract

**Project:** LibreCosta / SoFarAway

**Status:** Frozen

**Baseline:** `dev@189234f25c1c1cf877d0644600b3189ed73ba34e`

**Path:** `docs/contracts/C0-D-release-readiness.md`

## 1. Objective

C0-D 是 SoFarAway 工程稳定化的最后阶段。

目标是完成生产静态构建、部署可移植性、基础网站质量、异常恢复及发布工程治理的最终验收。

阶段结束后，项目应具备可部署、可维护、可回滚的技术基础，并能够安全进入 D0 的艺术、音乐与游戏体验开发。

**C0-D 不执行正式公开发布。**

## 2. Frozen Boundaries

保留现有：

- React Router Framework Mode + SSG
- React + TypeScript Strict + Vite
- Three.js r187 + WebGL2 + GLSL
- Web Audio API
- 独立 Game Runtime / Simulation / Graphics / Audio
- 四个 Volume 与三种难度
- Fully Runtime Procedural 定位

不新增游戏后端、账号系统、排行榜、分析平台或服务器运行时。

不引入 R3F、WebGPU 或新的游戏框架。

不重新设计 UI、音乐、关卡和美术。

## 3. Production Build & Static Hosting

### 3.1 Static Output

生产构建继续使用 `npm run build`。

检查 `build/client` 是否包含正确的 HTML、JavaScript、CSS、字体以及需要公开的静态文件。

验证：

- SSG 首页可以直接访问。
- Hydration 正常。
- 浏览器按需加载 Three.js。
- 四个 Volume 均能通过查询参数初始化。
- 静态资源不存在错误路径。
- 直接刷新、浏览器前进后退正常。
- 未知路径正确返回 404。
- 正式产物不包含测试 Harness、可写调试对象、测试数据或无关资源。

生产运行不能依赖 Node.js SSR 服务。

### 3.2 Hosting Compatibility

目标平台：

- Cloudflare Workers Static Assets
- EdgeOne Pages

两个平台均以 `build/client` 为静态输出目录。

验证各平台最新的静态部署配置、路由、404、缓存和响应头要求。

暂不绑定唯一提供商，不维护两套不必要的部署程序。

如需要创建配置，只添加最小必要内容，并记录平台差异。

不得修改应用架构以迎合某一个平台。

不执行真实生产部署，不要求用户提前配置域名、Token 或账户密钥。

### 3.3 Caching

确认：

- 带内容哈希的 JS/CSS 可以使用长期缓存。
- HTML 更新后能够正确重新验证。
- 新版本不会错误引用旧的 Chunk。
- 音频诊断页和字体可正确获取。
- 静态资源具有正确的 MIME Type。

避免加入不必要的 Service Worker 或复杂版本缓存系统。

## 4. Website & SEO Readiness

核查预渲染的 HTML：

- Title
- Description
- Canonical URL
- Open Graph
- Twitter Card
- robots / sitemap 的必要性
- HTML lang
- Favicon
- 作品名称与 LibreCosta 署名

Canonical 目标使用项目已有的 `https://sofaraway.librecosta.com/`，但不自行修改 DNS。

若缺少最终 OG 预览图，可记录为 D0 发布素材任务，不为了 C0-D 制作低质量占位图。

首页必须在 JavaScript 未执行或 WebGL 不可用时，仍能展示基本作品信息。

不创建无实际内容的 SEO 页面。

## 5. UI & Accessibility Smoke

仅针对现有 UI 做发布级基础检查。

至少覆盖：

- 桌面与移动菜单操作
- 键盘焦点
- Settings 对话框
- 暂停与恢复
- 结果页
- Loading / Error / Unsupported
- Fullscreen
- 音量与静音
- 触摸操作区
- 竖屏、横屏及安全区域

检查基本语义、按钮标签、焦点恢复和错误信息可理解性。

只修复明确的可用性问题。

不在 C0-D 中重新设计菜单、HUD 或移动交互。

## 6. Failure & Recovery

重点执行完整异常流程：

- WebGL2 不可用
- Shader 初始化失败
- PostFX 降级
- AudioContext 启动失败
- 明确选择无声模式
- WebGL Context Lost / Restored
- 页面进入后台并恢复
- 长帧触发安全暂停
- 游戏途中返回菜单
- 连续重试与切换 Volume

验证每种失败都有可理解、可操作的结果。

失败恢复后不得出现：

- 重复 RAF
- 重复 Audio Scheduler
- 残留 Run Bus
- 关卡状态被错误重置
- 资源持续累积
- 无法退出的错误界面

## 7. Repository & License Readiness

核查当前分支结构和文档。

当前 `main` 与 `dev` 存在内容差异，且许可证不一致。

本阶段必须：

1. 确认 `dev` 为当前开发与构建基准。
2. 明确记录 `main` 尚未完成正式发布集成。
3. 核查 README、package.json、LICENSE 和 GitHub 仓库元数据的一致性。
4. 检查第三方依赖及随仓发布字体的许可信息。
5. 明确最终正式发布所需的分支集成步骤。

**不得擅自选择或修改项目许可证。**

MIT / BSD-3-Clause 的最终统一需要项目维护者确认。

不得自动合并 `dev` 到 `main`，也不得修改仓库默认分支或分支保护设置。

### 7.1 Documentation

README 应简洁说明：

- 项目定位
- 技术栈
- 本地启动
- 生产构建
- 测试
- 游戏操作
- 零预生成资产理念
- 当前开发状态
- License

不要重复堆放历次审计报告的全部内容。

保留 A0–C0 的原始报告作为工程记录。

## 8. Release Verification

建立一个统一、轻量的发布检查入口，例如：

`npm run test:release`

它应验证：

- TypeScript Strict
- 生产构建
- 静态产物完整性
- SSG 页面和元数据
- 静态服务器核心路由
- Hydration
- 一次基本游戏启动
- 必要的错误回退

不要把四首真实时间歌曲、20 轮 Soak 和全部浏览器矩阵强制串到每一次快速发布检查中。

完整测试仍通过已有的独立命令执行。

不得为了统一命令创建复杂的测试平台。

## 9. Regression

C0-D 必须确认：

- A0 关卡正确性保持
- B0 游戏 Runtime 与 UI 正常
- C0-A 兼容性没有回归
- C0-B 资源与性能基线没有明显恶化
- C0-C 音频调度和游戏同步保持
- 四个 Volume × 三种难度的测试通过
- SSG 构建和纯静态运行正常

若本阶段没有修改图形、音频及游戏规则，不需要再次重复完整性能审计或四卷真实时长音频测试。

采用与修改范围相称的回归验证。

## 10. Outstanding Device Validation

保留以下未完成项目：

- Android Chrome 真机
- iOS Safari 真机
- macOS Safari
- 真实设备音频中断
- 人工完整听音
- 真实声画延迟测量
- 其他 GPU 的高画质表现

其中，物理声画延迟测量不作为 C0 工程关闭的强制条件，但在公开宣称精确音画同步前必须有相应证据。

真人听音与目标设备的基本操作验收应列为正式公开发布前的检查项。

无法完成的测试必须继续标记 BLOCKED，不得自动视为通过。

## 11. Acceptance Gates

### Engineering Ready

满足以下条件可以关闭 C0-D：

1. TypeScript 与静态生产构建正常。
2. 静态部署产物完整。
3. 关键页面和错误恢复通过。
4. 基础 SEO 与网站元数据得到核查。
5. 许可证和分支发布风险已明确记录。
6. 没有遗留确认的工程 P0。
7. 相关 A0–C0-C 回归通过。
8. 生成完整发布前检查清单。
9. 记录仍需人工及真实设备验证的内容。

### Public Release Ready

需要后续额外满足：

- D0 美术与音乐打磨验收
- 真人听音
- 目标设备基本运行验收
- 最终作品介绍和分享素材
- License 统一
- 生产部署及域名验证

C0-D 完成并不意味着自动取得 Public Release Ready 状态。

## 12. Deliverables

提交：

`docs/contracts/C0-D-release-readiness.md`

`docs/audits/C0-D-release-readiness-report.md`

必要的发布检查测试和 npm 脚本。

报告应包括：

- 基准 Commit
- 构建与静态部署检查
- SEO / UI 基础检查
- 错误恢复和回归结果
- License 与分支风险
- 发布前人工待办
- Engineering Ready 结论
- D0 准入建议

不创建大量重复发布文档。

## 13. Git Delivery

本阶段必须：

1. 基于当前 `dev` 工作。
2. 检查本地与远程 HEAD。
3. 完成必要修改与测试。
4. 提交全部有效改动。
5. 普通推送到 `origin/dev`。
6. 再次查询远程 HEAD，确认 SHA 一致。
7. 不修改 `main`。
8. 不强推、不自动合并、不发布 Release。
9. 推送失败时如实报告。

本地完成但未推送，不视为交付完成。

## 14. Final Principle

C0-D 的任务是确认 SoFarAway 的技术工程已经稳定、可构建、可部署和可维护。

不以完成工程验收为理由仓促公开发布作品。

C0-D 结束后，正式进入 D0 — Art, Music & Gameplay Experience。
