# Bilibili Toy development

Use Node 24 and run `npm ci` from the repository root. The Toy entry shares the Web player's game code. Its distribution is `cn / bilibili / zh-CN` by default and it keeps its own settings and records. Both languages are available in Settings.

| Task | Command | Output or address |
| --- | --- | --- |
| Develop with HMR | `npm run dev:toy` | [Toy Dev Console](http://127.0.0.1:5174/) |
| Build Toy Release | `npm run build:toy` | `build/toy/` |
| Preview the release build | `npm run preview:toy` | [Nested player entry](http://127.0.0.1:4174/toy/sofaraway/index.html) |
| Build and package for upload | `npm run package:toy` | `build/packages/sofaraway-toy.zip` |
| Run focused browser checks | `npm run test:toy` | `test-results/toy/` |
| Check the competitive score contract | `npm run test:unit -- tests/core/toy-competition.test.ts tests/core/run-policy.test.ts` | Local unit checks |

Stop either interactive server with Ctrl+C in its terminal. The tests start and stop their own servers and build the release first. Install Chromium with `npx playwright install chromium`, or set `TOY_CHROMIUM_CHANNEL=chrome` to use installed Chrome. Set environment variables with `$env:TOY_CHROMIUM_CHANNEL = 'chrome'` in PowerShell.

The Dev Console runs offline. Select Android or iOS and Portrait, then use **Play Landscape** in the player to request landscape and immersion together. Use Settings to select portrait or landscape, or exit immersion from the player. The console shows the requested and confirmed modes alongside the simulated viewport.

Set the safe-area insets, capsule width and height, and bottom bar height to exercise the menu, HUD, and modal layout. **Mode response** can accept, reject, or acknowledge without a state change. **Request delay** controls when a successful state change arrives. **SDK unavailable** restores browser behavior. **Suspend**, **Resume**, and **Close container** exercise the runtime lifecycle. **Reset simulation** clears the console state and reopens a closed mock session. The iframe retains its canvas during display changes. The host browser provides WebGL, audio and input. Dev player settings and records use a separate `.dev` namespace.

Preview serves exactly `build/toy/` with real static 404s. To simulate another mount, run `node tools/serve-static.mjs build/toy 4174 /your/nested/path/` and open `/your/nested/path/index.html`. Web builds may clean the shared `build/` directory, so run Toy packaging after the Web builds when preparing all three artifacts.

## Native container behavior

Toy Release loads the official SDK asynchronously on a Bilibili HTTPS Toy path, reusing `window.toy` if present. App container controls require the App user-agent marker and their own capability probes. Desktop Bilibili Web can use the leaderboard with browser display controls. The standalone nested preview stays offline. A failed script, capability probe, or unsupported method leaves the game playable. A supported mode change is confirmed by a matching reported state. The player starts a flight with a separate gesture after preparing the display.

The SDK reports viewport dimensions and edge insets in CSS pixels. The canvas uses the container's available dimensions and the safe-area variables pad the UI. The inspected SDK's container type has no capsule rectangle. In the App layout, the top menu controls stay left and the touch Pause button moves away from the upper-right corner. The Mock uses its explicit capsule and bar dimensions to test occlusion. [Official SDK reference](https://www.bilibili.com/toy/publish/sdk) · [Public SDK client](https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js)

## Leaderboards and competitive records

Open **Leaderboards** from the player menu to view all-time and weekly standings for the current Volume. Both periods request the public SDK maximum of 100 entries per board. The board slots are ELSEWHERE 1, DAYBREAK 2, DESCENT 3 and ORBIT 4. Slot 5 is reserved.

A live interactive Standard Normal run can qualify on Main, Challenge or Bonus. It must escape with a valid recorded route, use the current scoring rules and ordinary random seed policy, and have zero recovery-neutralized gates in the main course and Encore. Boost, pause and muted play follow the ordinary rules. Results submits the existing integer main score plus earned Encore points on request. Each route keeps its scoring multiplier, and all three routes share the same Volume board.

| Volume | Main | Challenge | Bonus |
| --- | ---: | ---: | ---: |
| ELSEWHERE | 228,524 | 252,524 | 239,924 |
| DAYBREAK | 195,535 | 221,035 | 198,385 |
| DESCENT | 258,174 | 270,174 | 251,049 |
| ORBIT | 155,556 | 169,056 | 148,956 |

The table shows conservative ceilings for the current rules. The test weights only branch gates by their route multiplier and budgets maximum Boost travel, capped Combo, maximum crossing bonuses, Resonance, a Lumen pickup and Encore at the shortest allowed spacing. Each ceiling fits within the SDK's positive limit of 16,777,215. The submission boundary validates the settled total against the SDK range. [Competition contract](../toy/leaderboard-contract.ts) · [Ceiling test](../tests/core/toy-competition.test.ts)

In `npm run dev:toy`, use **Mock leaderboards** to switch accounts, hide the seeded rows, vary response delays and trigger network failures, timeouts or rate limits. Choose **Mock result route** and open **Show mock results** to preview an eligible development-only settlement. A successful mock submission updates that account's high-water score in both mock periods. Change account and refresh to verify personal ranks. **Reset mock ranks** clears the in-memory service and fixture. The console works without a Bilibili session or network connection to the platform. For local images, set `TOY_CAPTURE_RANKS=1` and run `npm run test:toy`. Images are saved under `.local/t1-d/`.

The inspected public SDK blocks writes under `/toy/preview`. Test submissions locally and keep simulated scores out of live boards. Verify App and PC availability, first-submit consent, account changes, weekly rollover and physical-device layout only in the appropriate publisher-authorized environment. The release schedule depends on the promotional video. [T1-D implementation report](audits/T1-D-leaderboard-competitive-records.md) · [Official request guidance](https://github.com/bilibili/toy/blob/main/skills/toy/references/content-checklist.md#7-用了云存储--排行榜调用节奏上线后才爆的那类)

## Cloud save and result cards

Open **Cloud Save** from the menu and select **Authorize and Sync** to grant access and read your account's Best scores. The publisher must enable the profile capability that returns a stable `toyOpenId`. Flights started after authorization can contribute account-owned Standard Bests. Return to the panel and select **Sync Best Scores** to publish them. The game keeps the device scoreboard and Last independent from the account scoreboard. Anonymous device history is outside the cloud flow. An unsynced flight is still available in the ordinary device records if you close the page.

Select **Share Result** after a player flight to preview a 1440 × 1080 Flight Archive PNG. Each Volume has its own Canvas 2D optical motif. The nickname is requested through the SDK when the card opens, with the localized Bilibili player label available if the request fails. Native buttons appear for supported SDK abilities. Standalone preview and PC Web can display the local card.

Use the **Mock leaderboards** account, response and delay controls with **Mock cloud and sharing**. The seeded conflict provides different Bests per account. Switch to **Incompatible scoring version** to check that sync preserves both stores, or use the response control to exercise failures and cooldown. Choose **Mock result volume**, then select **Show mock results** and open the sharing preview. The share capability control simulates all native actions, Toy link sharing only, or the local card by itself. The fixture remains offline.

```sh
npm run test:unit -- tests/core/toy-player-services.test.ts
npm run test:toy -- tests/toy/player-services.spec.ts
```

Set `TOY_CAPTURE_ARCHIVE=1` to export both locales and all four Volume cards directly from the preview canvas into `.local/t1-e-f1/`. Set `TOY_CAPTURE_SERVICES=1` for the cloud panel capture under `.local/t1-e/`. Hosted cloud authorization, storage and native sharing are release-phase checks. See the [T1-E implementation report](audits/T1-E-cloud-save-result-sharing-flight-assist.md) and [official SDK](https://www.bilibili.com/toy/publish/sdk).

## Official preflight

T0 cached the verified CLI, Agent Skill and Doctor under the ignored `.local/t0-toy/`. The checked Windows CLI is `v0.6.6` (`c760fd2`). On a clean machine, use the [official CLI installation guide](https://github.com/bilibili/toy/blob/f418536cc463ad598a775bc1ad6cfb0505905ab7/skills/toy/references/installation.md) and the [official Agent Skill](https://github.com/bilibili/toy/blob/f418536cc463ad598a775bc1ad6cfb0505905ab7/skills/toy/SKILL.md). Keep local tools in an ignored directory or on your user PATH.

```sh
toy version
toy --help-json --json
npm run package:toy
python .local/t0-toy/toy_doctor.py build/packages/sofaraway-toy.zip --slug sofaraway --json
```

On Windows, use `.local/t0-toy/toy.exe` in place of `toy` if using the cached binary. If the Doctor is missing, save the [pinned official script](https://raw.githubusercontent.com/bilibili/toy/f418536cc463ad598a775bc1ad6cfb0505905ab7/skills/toy/scripts/toy_doctor.py) as `.local/t0-toy/toy_doctor.py`. Use `python3` where Python is installed under that command. These checks can run without a Bilibili account.

## Hosted preview

When the publisher authorizes an upload, use `toy login` with the creator account that has Toy permissions. Run `toy create --help-json --json` or `toy update --help-json --json` first, since the accepted arguments depend on the installed CLI. In the verified CLI, `toy create build/packages/sofaraway-toy.zip --slug sofaraway --visibility link-only --json` creates a preview upload for a new Toy, and `toy update <id> build/packages/sofaraway-toy.zip --json` previews a package for an existing Toy. Both commands upload the ZIP. Keep `--yes` out of preview commands, since it submits for review. Supply publisher-approved metadata and any required poster or icon according to the current CLI help.

Open the returned `preview_url` in a browser and, where supported, on physical Android and iOS Bilibili clients. Follow the [T1-C device checklist](audits/T1-C-native-container-integration.md#bilibili-app-checklist). Verify creator-preview permissions and the separation of preview and live records before any authorized service check. Use test accounts and isolated data for service checks. [T0 platform compatibility audit](audits/T0-toy-platform-compatibility.md)
