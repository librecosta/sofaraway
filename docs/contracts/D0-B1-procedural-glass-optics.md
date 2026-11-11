# D0-B1 — Procedural Glass Material & Optical Contract

项目 LibreCosta / SoFarAway · R1 · 冻结 · 基准 `dev@88a2dfdf3229fc51007c4c4dd70f651769a6293f`。

R1 范围为 ELSEWHERE 的 Iris、Square、Diamond。三种门共享局部截面距离、光学响应和程序化门体构造。截面使用现有八边形。Iris 保持半径 `1.02` 的实体 Hub 和原有八向扇区。Square 与 Diamond 分别使用 `max(|x|, |y|) < 1.35` 和 `|x| + |y| < 1.91`。几何、Shader、碰撞共同遵循原通行域。门体固定，保留现有色彩、节拍、Hit 和 Fade。

| R1 交付 | 验收 |
|---|---|
| L1 开口边、L2 拼接线、L3 外框细节 | 局部空间距离、窄 Gaussian 核心和柔和 Halo。边缘能量依次降低，复用现有 Bloom。 |
| 高频全息细线 | `fwidth` 估计屏幕像素覆盖，细线在未解析前平滑降低对比。验证近处响应及远处时序稳定性。 |
| Iris 实体 Hub | 去除 Hub 内部辐射缝及其光晕，保留面材、实体边界及缺扇开口圆弧。 |
| 三维玻璃 | 前后面、实际厚度、连接侧壁、轻量倒角。验证两个中央开口内缘及 Iris 两条径向边与暴露 Hub 圆弧。 |
| 资源 | Volume 共享重复几何，单门负责自身材质。检查 Score 密集区、重开、切卷、上下文恢复及销毁。 |
| 回归 | 实际 GPU 像素与 CPU 碰撞边界对照，同设备固定时间图像、Draw Calls、CPU/GPU 与资源对比，兼容性、玩法、音频与 SSG 回归。 |

技术仍为 Three.js、WebGL2 与 GLSL。R1 使用 SDF、Gaussian 覆盖和程序化倒角，现有全局画质与 Bloom 参数保留。物理折射、SSR、新 PBR 或渲染框架在本轮范围之外。新的运行时生成纹理留给 R2。项目保留零预制图像、模型和音乐素材原则。DRIFT、DESCENT、ORBIT 保留现有门材质，玩法、谱面、音频、道具及三岔路保持既定行为。

交付包含此契约、含可复跑证据的 R1 验收报告及必要测试。项目许可为 BSD-3-Clause。提交使用 `dev`，普通推送后核对远程 SHA。`main`、GitHub Release 与生产部署在本轮交付范围之外。
