# T1-E — Cloud save, result sharing and flight assist

Baseline `23ec6cd`. The three distributions keep the current `precision-v5` rules with a 50% Precision zone and a 30% Near Miss band.

## Flight assist

**Center Reticle** is off by default and stored with each distribution's device settings. It uses the same display bounds as the canvas and renders above Standard and Sightseeing flights. Its center is independent of HUD safe areas, device pixel ratio and cursor position. Settings can change it during a pause without reconstructing the Runtime. The Studio includes an enabled Settings state.

`playerViewOffset` scales the simulated position by 0.88 and clamps the optical camera offset. The reticle marks the projected center of that view. Scoring still evaluates the interpolated collision position at the actual gate crossing. The preference never enters the run policy or the score and leaderboard eligibility checks.

## Personal cloud scores

The Toy's existing SDK loader and session epoch serve the leaderboard and cloud adapter. A player explicitly authorizes a sync. A stable, Toy-scoped `toyOpenId` is required and rechecked before imports and remote writes. The adapter discards profile fields other than the identifier. Local account storage uses a hashed identifier in a separate scope. Account changes clear the displayed scores and the active run's authorization. Pending results can be synced only after confirming the same originating account.

The key `sofaraway_toy_v1` stores one JSON string with the schema version, scoring version, and current course identifiers and Best values by Volume and difficulty. Invalid, incompatible or duplicate entries fail validation before an import or remote write. The account store accepts the greater Best through the existing RecordStore write queue, Web Locks and IndexedDB handoff. Device Best, Last and settings retain their existing storage. Cloud accepts new Bests from eligible, interactive Standard runs started in the authorized session. Leaderboard submissions continue to originate exclusively from the live settlement.

Sync is manual. Remote writes require a new or higher Best. Repeated clicks coalesce into one operation, and a deadline and backoff keep the controls responsive. The shared `307044` cooldown applies to both cloud and leaderboard requests. A timeout cancels a write still waiting to dispatch. An already-dispatched SDK write can settle after the deadline. Concurrent writes across devices can race because the SDK takes no account or compare-and-set token on a write. A later sync reconciles the preserved account-local Bests.

## Result cards

The Toy Results action receives the immutable settlement of a genuine interactive run. A localized Canvas PNG includes the full score with earned Encore bonus, outcome, grade, accuracy, both quality counts including Encore, and a Volume-specific motif. The Toy probes `sharePicture`, `saveImageToAlbum` and `share` independently. Picture actions use the locally rendered PNG. Link sharing uses the internal `index.html` entry without game parameters. The card remains visible in PC Web and standalone preview when native actions are unavailable.

The public SDK returns a key/value map from `getCloudStorage(keys)`, accepts a key/value map in `setCloudStorage(items)` and can provide `toyOpenId` in an authorized `getUserProfile()` response. The SDK routes native picture sharing and album saving to the App. Bilibili publishes a shared Toy-wide request budget without a public fixed quota. [SDK reference](https://www.bilibili.com/toy/publish/sdk) · [Public SDK](https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js) · [Request guidance](https://github.com/bilibili/toy/blob/main/skills/toy/references/content-checklist.md#7-用了云存储--排行榜调用节奏上线后才爆的那类)

## Local verification

- Node 24.22.1 type checking and 31 focused unit tests passed. They cover cloud validation, account changes and late responses, score and Best semantics, shared cooldown, and SDK request shapes.
- CN and INTL Web production builds passed with the existing local Windows IPv4 prerender shim. Three Chrome checks per region covered the centered and persistent reticle, regional/static boundaries and existing Web diagnostics. Web artifacts excluded Toy cloud and sharing.
- The Toy build checked 154 rendered modules and excluded the development console, Mock services and debug renderer. Fifteen Chrome 158.0.8127.37 tests passed across nested release, offline Mock, and intercepted SDK paths. They cover an actual settled run opening the local card, account storage and IndexedDB handoff, portrait and landscape reticle alignment, and the existing leaderboard and container contracts.
- Local captures under `.local/t1-e/` show the portrait reticle and cloud panel and the desktop result card. The card and simulated native actions were captured with the offline fixture.
- `build/packages/sofaraway-toy.zip` contains 14 files and is 481,000 bytes. SHA-256 `663050bdac2c8982caf26498a261160ad5c7743c73d297a17ba52dcdd2e47ccf`. The pinned official Toy Doctor passed with zero findings for slug `sofaraway`.

## Hosted verification after the promotional video

- Confirm publisher authorization and stable Toy-scoped IDs on PC Web, Android and iOS. Verify cloud read and write access, session change behavior, concurrent device reconciliation and host error messages with isolated accounts and genuine runs.
- Confirm the native image encoding, first-use album permissions, share-sheet targets and foreground return on current App versions. Verify preview fallback and the visual reticle with actual device safe areas.
