# D0-B1-R2 — Micro-surface & High-speed Readability Polish

基准：`dev@ae98ebe63f8ac70b1cf5102f415b8118531f280e`。范围仅为 ELSEWHERE 的 Iris、Square、Diamond。

- 保留 R1 微细线的周期 `0.055`、占空比 `0.18`、`lineIntegral()` 与 `fwidth` 像素足迹积分。对积分结果扣除 `0.18` 后的细线信号，试验固定在玻璃局部坐标的低频平滑确定性调制 `M(p) = 1 + ε(2n(p) − 1)`，`ε` 取 `0.04–0.08`。若未改善微观层次或有持续性能代价，可以撤掉噪声。不得引入逐帧随机、粗条纹、纹理资源或 `CanvasTexture`。
- 使用仿真实际纵向速度 `v`，以连续函数 `V(v) = 1 − κ·smoothstep(v₀, v₁, v)` 只压低微细线对比，`κ` 从 `0.20` 起试。观光低速应保留细节。保持面材底色、平均能量和透明度基本不变；开口、拼缝、外轮廓、三级高光、Gaussian Halo、Hit、Fade、真实厚度和倒角沿用 R1。
- 保留 F2 的世界站位、实际空间碰撞、Boost、Sightseeing、三岔路、道具、歌曲及玩法。DRIFT、DESCENT、ORBIT 的玻璃不修改。本轮不调整 Hull、Normal Map、Sky 或其他纹理，也不增加材质系统、Shader Pass 或渲染资源。
- 验收近远景、DPR、巡航与持续 Boost 的细线稳定性、开口亮度及 CPU/GPU 判定。同机对照单门和密集 Score 的 GPU P95、Draw Calls、Shader Program、Geometry、Texture。明显持续退化不能保留。
- 运行 `npm run typecheck`、`npm test`、`npm run test:release` 及相关浏览器和视觉回归。记录参数、对照、保留的改动和未验项目。只提交和普通推送 `dev` 并验证远程 SHA；不发布、不部署，维持 BSD-3-Clause。
