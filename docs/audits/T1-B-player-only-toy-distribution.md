# T1-B — Player-only Toy distribution

The standalone Toy release uses `cn / bilibili / zh-CN`. The INTL and CN Web builds continue to use `intl / web / en` and `cn / web / zh-CN`. Player locale is a saved preference. The CN Web adapter alone supplies the registration footer and badge. Both Web builds retain the international canonical URL.

## Implementation

- The [Web adapter](../../app/web/WebGame.tsx) owns React Router, the volume query and history, sharing, external links and Web diagnostics. The [Toy entry](../../toy/ToyPlayer.tsx) selects Volume through React state. Both mount the same viewport and use the shared runtime, simulation, renderer, soundtrack, translations and settings. Toy Credits render local text and the archive carries the BSD-3-Clause, SIL OFL and dependency notices.
- The Toy Vite build strips recorder imports, fixed-time driving, forced seeds, debug output, God Mode and alignment overrides at compile time. Its build check rejects rendered imports from Web routes, Explorer, debug, tests, the registration footer and Toy Development. Showcase keeps its ordinary pilot and route policy. [Build configuration](../../vite.toy.config.ts) · [Run policy](../../app/game/core/run-policy.ts)
- Settings use `sofaraway.bilibili.sofaraway.*` in Toy Release. Best and Last reuse the V1 parser and write to `sofaraway.bilibili.sofaraway.records.v1`. The IndexedDB handoff database and Web Lock both use that key plus `.write`. Toy Development uses the `.dev` suffix on the namespace before appending keys. Web retains its existing `sofaraway.*` keys and lock. Storage access failures fall back to in-memory play. [Record store](../../app/game/runtime/records.client.ts)
- Toy Development mounts an offline console and an unchanged player iframe. The typed adapter exposes device, orientation, immersive state, dimensions and safe areas. Changes resize the same frame. The unavailable state uses browser defaults. The release preview serves the built files from a nested static mount. [Development and preflight commands](../toy-development.md)

## Release artifacts

| Build | Files | Contents |
| --- | ---: | --- |
| INTL Web, `build/client/` | 111 | 1,948,603 bytes. English prerender, international canonical, Explorer and Debug routes, static 404, Web metadata, regional hosting configuration and fingerprinted assets. |
| CN Web, `build/client/` | 111 | 1,950,104 bytes. Chinese prerender and the same Web routes and tools. The player route includes both registration links and the inline public security badge in either language. |
| Toy Release, `build/toy/` | 14 | 1,357,408 bytes. Root `index.html`, three JavaScript chunks, one stylesheet, five WOFF2 files and four license notices. |

The Toy ZIP is `build/packages/sofaraway-toy.zip`. It contains all 14 release files at the expected relative paths and weighs **462,994 bytes**. Repacking produced the same SHA-256, `62a9b6b91f83dd9fd9bd76080ac79d1d5eea7feaee3e301ebaa1b1be09356147`. The official Doctor pinned at `f418536cc463ad598a775bc1ad6cfb0505905ab7` returned `{"ok":true,"findings":[]}` for slug `sofaraway`. The cached official CLI reported `v0.6.6` (`c760fd2`).

## Verification

Tests ran with Node 24.22.1 and Chrome 158.0.8127.37 on Windows. Mobile browser checks used emulation.

- `npm run typecheck` and 49 focused unit tests passed across run policy, engine characterization and routes.
- Both Web production builds passed. Intermittent Windows prerender connection timeouts required a local Node loader that bound the prerender preview to IPv4 and retried loopback requests. The repository's build command, routing and hosting configuration were kept as published.
- Web release checks passed 11 INTL cases and all four CN regional cases. The CN-only case was skipped for INTL. Tests covered default language and hydration, the Canonical, real 404s, history navigation, WebGL retry, the CN registration links and badge after switching language, and fixed-time diagnostics with the R and Shift+R shortcuts. Three additional browser cases checked manual versus automatic Boost, fixed-time diagnostic Boost and same-origin record coordination.
- `npm run test:toy` passed all six cases. It verified a real HMR update and container changes during a flight, the nested player entry, all four Volumes, Standard, Sightseeing and Showcase, bilingual settings, touch steering and orientation changes with Auto Boost, a real Best and Last write plus the scoped handoff and lock, and play with storage blocked.
- The Toy build checked 137 rendered modules. Bundle scans found no Debug, recorder, Harness, Mock, Dev Console or registration markers. The two Web artifacts had no Toy namespace or Dev Console markers. The Toy browser smoke loaded JavaScript, CSS and fonts from the nested mount with no external requests. Vite flagged the lazy runtime chunk at 914 kB minified (262 kB gzip).

## Remaining platform checks

Hosted package delivery and actual Android and iOS Bilibili WebViews still need verification. Check WebGL2 and shader support, audio activation and recovery, rotation, safe areas, immersive presentation and storage persistence after reopen. Creator-preview service permissions and isolation from live data remain prerequisites for later SDK work. T1-B ran local CLI help and package preflight without a publisher session.
