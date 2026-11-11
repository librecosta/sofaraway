# D0-A1 — ELSEWHERE 门型与玩法验收

远程开发基准为 `3d8c1e20c8127aa33faae8998bf172e49b461546`。视觉对照包含已单独提交的远门渐显修复 `41ff126`。本阶段按[冻结契约](../contracts/D0-A1-vol1-gate-gameplay.md)验收，附件用于核对形状和结构线。

## 门型与分布

Iris 沿用原有八方向和实体 Hub。Square 与 Diamond 的中心都是 `(0, 0)`，内部为实际开口，边界和外部为玻璃。两种门沿用现有玻璃色彩、节拍、双层绘制、渐显与碰撞闪色。Chart 将类型分配到每一道门，Simulation 与 Graphics 消费同一门型，中央门的判定和目标点均独立于原谱面的 Sector。

| 章节 | Iris | Square | Diamond |
| --- | ---: | ---: | ---: |
| INTRO | 0 | 0 | 0 |
| A | 20 | 0 | 0 |
| B | 12 | 4 | 0 |
| BUILD | 9 | 0 | 2 |
| DROP | 25 | 8 | 8 |
| BREAK | 3 | 2 | 1 |
| A2 | 14 | 4 | 4 |
| FINALE | 17 | 6 | 5 |
| Normal / Hard | 100 | 24 | 20 |
| Easy | 99 | 24 | 20 |

Easy 先继承完整谱面的分配，再滤掉第 384 拍的 Iris。现有 12 组谱面的 Beat、Sector、Section 摘要全部匹配历史值。摘要测试显式投影这三个字段，门型序列和跨难度稳定性由独立断言覆盖。

## 可达性与通关

测试以 60 Hz 逐步向 Simulation 输入键盘轴 `-1/0/1`。过门后预留 150 ms，再按方向键朝下一开口的目标移动。每道门由实际相机阻尼、门到拍插值及 `canPass` 判定。三难度均零碰撞通关，覆盖八个 Iris 方向、四种中央与外围的转换、Iris → Iris，以及跨章节相邻门。

- 最短含中央门的间隔为 2.33 拍，约 1092 ms。三种难度均通过，包括 DROP 194.33→196.66 拍的 Iris → Square。
- Normal 和 Hard 的 383→384 拍为 468.75 ms。键盘在过门 152.083 ms 后开始移动，分别完成 E → N 和 W → NW。第 384 拍的插值判定点约为 `(0.467, 1.703)` 与 `(-1.553, 1.482)`。冻结序列与 Iris 方向均得到保留。
- Playwright 在碰撞开启下自动对准并到达结算，Easy、Normal、Hard 分别为 143/143、144/144、144/144，均为 S。原积分基准 `67701 / 107726 / 160426` 仍匹配。键盘轨迹测试也达到这些积分。

## 基准与许可

ELSEWHERE 的历史截图比较改到 A 段第 36 秒，验证原有 Iris；其他三卷继续使用第 83 秒。原 12 组通关分数预期保留。新的 GPU 回读采样区分 Shader 玻璃片元与后处理发光。方窗覆盖四边内外，菱窗覆盖四个顶点与四条斜边内外，Iris 覆盖八方向、扇区分界和 Hub 内外。CPU 单测另外检查严格等号边界。

根 `LICENSE` 与 `origin/main` 中的 BSD-3-Clause 正文逐字节相同，版权为 `Copyright (c) 2026, LibreCosta`。README、包元数据、锁文件根包及静态产物 `licenses/SoFaraway.txt` 已统一。随仓字体的 OFL 和生成的第三方依赖许可继续随构建提供。历史 C0-D 报告保留当时的许可核查记录。

## 回归结果

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck`、`npm test`、`npm run test:release` | Strict 与 SSG 通过，31 项 Vitest、30 项浏览器回归、6 项发布用例通过。 |
| `npm run test:compat -- --grep "actual gate shader\|prerender, four volumes\|core shader failure"` | 15 项通过。Chrome、Firefox、WinCairo WebKit 及两个移动模拟项目的 GPU 回读均为零差异、零 WebGL 错误。 |
| `npm run test:stability -- --grep "fixed-time visual\|prewarming\|mixed gates"` | 3 项通过。四卷选定时刻的 Canvas 与对照逐像素相同，108 个预热 Shader Handle 全数释放。三轮往返混合门与 DRIFT 后保持 18 个 Geometry、9 个 Texture、10 个 Program。 |
| `npm run test:sync -- --grep-invert "completes the full song"` | 9 项 Transport 单测、16 项浏览器用例完成。四卷离线音乐事件摘要匹配历史值，音频和时间模型沿用现有实现。 |

自动化环境为 Windows 10、Node 24.22.1、Chrome 157.0.8103.38、Firefox 151 和 WinCairo WebKit 26.5。移动项目为视口及输入模拟。WinCairo 的有声音频和 Firefox 的离线暂停测试受浏览器 API 限制，记为 `BLOCKED`。本轮使用针对性的资源与同步检查。

资源对照中，两版都在首次进入 DRIFT 后多持有一份 Three.js 天空 Geometry 和 Program，之后持有量相同。稳定性测试先预热天空资源再比较三个往返周期。第 50.34 秒和第 78.94 秒的高画质画面分别复核了两种中央开口及外侧结构线。

## 人工试玩

仍需人工试玩确认中央门的远处可辨性、从外围回到中央的体感和 FINALE 的节奏。150 ms 的确定性输入证明存在可行轨迹，真人反应和移动设备的操作手感留待后续试玩。
