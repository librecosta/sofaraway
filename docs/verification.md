# Verification and static hosting

## Default checks

From the repository root, use Node 24 LTS and install the locked dependencies and the default Playwright browser.

```sh
npm ci
npx playwright install chromium
npm run typecheck && npm test
```

`typecheck` generates route types and runs strict TypeScript. `npm test` runs Vitest, builds the prerendered site and a separate browser harness, and runs the main Playwright regression suite. Use the scripts in [`package.json`](../package.json) when calling these checks locally or from CI. For a documentation-only change, validate the paths, links and commands you edited, and record any checks you did not run.

## Focused checks

| Area | Command and setup |
| --- | --- |
| Pure rules | `npm run test:unit`. Run a specific file with `npm run test:unit -- tests/core/spatial.test.ts`. |
| Main browser suite | After `npm run build` and `npm run build:harness`, use `npm run test:b0 -- tests/browser/fidelity.spec.ts` for a focused run. Set `A0_BROWSER_CHANNEL=chrome` to use installed Chrome. |
| Preview ownership | `npm run test:b0 -- tests/browser/preview-surface.spec.ts tests/browser/explorer-laboratories.spec.ts` checks failed setup, repeated restoration, iframe teardown and navigation with live resources. |
| Static output and release | `npm run test:release`. Includes strict types, production build and static-site checks. `RELEASE_CHROMIUM_CHANNEL=chrome` selects installed Chrome. |
| Browser compatibility | Run `npx playwright install chromium firefox webkit`, then `npm run test:compat`. Use `COMPAT_CHROMIUM_CHANNEL=chrome` for installed Chrome. The mobile profiles are emulations. |
| Audio | `npm run test:sync` uses Chromium, Firefox and WebKit for transport, lifecycle and signal tests. The Chromium full-song tests run in real time. Use `SYNC_CHROMIUM_CHANNEL=chrome` for installed Chrome. |
| Audio Inspector | After the production and harness builds, run `npm run test:b0 -- tests/browser/audio-inspector.spec.ts tests/browser/audio-inspector-stems.spec.ts tests/browser/static.spec.ts`. The Playwright tests compare four-volume stem and master PCM, validate complete stem WAV exports and chunk seams, exercise live mixing and cleanup, and capture aligned waveforms at four viewport sizes. |
| CONTROL export failures | `npm run test:b0 -- tests/browser/descent-export.spec.ts` injects failures into the real offline exporter and checks cancellation, cleanup and retry. |
| Rendering and resources | `npm run test:perf` runs the main browser performance cases. `npm run test:stability` runs the extended benchmarks, resource lifecycle and full-song soak. `STABILITY_CHROMIUM_CHANNEL=chrome` selects installed Chrome. |

For baseline comparisons, check out the reference commit in a separate worktree and run `npm ci`, `npm run build`, and `npm run build:harness` there. Set `STABILITY_REFERENCE_DIR` to its absolute `build` directory, which must contain `client` and `harness`. Run `npm run test:stability` in the candidate worktree. For a narrow scenic comparison, use `npm run test:stability -- --grep @scenic-perf`, with optional `STABILITY_SCENES` and `STABILITY_SCENIC_FRAMES` overrides. Record the browser, renderer, resolution, DPR, quality, and repeated CPU/GPU samples. Report unavailable GPU timers separately from frame intervals. Use the [Technical Explorer laboratories](../app/routes.ts) and fixed-time captures to review visuals with the same inputs and quality.

The original A0 suite is a historical comparison against the old static game. Use `git worktree add --detach ../sofaraway-a0 88a4adb533e2c5ec6f8e77a166ca11e75794be58`, set `A0_APP_ROOT` to that worktree's absolute path, then run `npm run test:a0` or `npm run test:a0:perf`. Historical reports and their original baselines are indexed in [milestone history](history.md).

## Hosting the production build

Build the same artifact for both providers from the selected source revision with Node 24 LTS:

```sh
npm ci
npm run build
```

Run `npm start` to preview at `http://127.0.0.1:8080`. Upload the contents of `build/client`, including the `.well-known` directory, with `index.html` and `404.html` at the upload root. Serve at the origin root over HTTPS. Each host should resolve prerendered route directories to their own `index.html` and serve the root `404.html` with status 404 for missing paths. Use static routing without a catch-all rewrite.

| Target | Host configuration |
| --- | --- |
| Cloudflare Pages, international | Use Pages Direct Upload with `build/client`. For an existing Git-connected Pages project, use repository root, no framework preset, `NODE_VERSION=24.22.1`, `SKIP_DEPENDENCY_INSTALL=1`, build command `npm ci && npm run build`, and output directory `build/client`. Assign `sofaraway.librecosta.com` during F6. The generated `_headers` contains exact one-year immutable rules for emitted fingerprints and revalidation rules for mutable paths. Pages derives its 404 behavior from the top-level `404.html`. [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/) · [Build image](https://developers.cloudflare.com/pages/configuration/build-image/) · [Serving Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/) |
| EdgeOne Pages, China | Use a prebuilt Direct Upload to the China project with the contents of `build/client`. The generated `edgeone.json` configures revalidation for HTML and mutable public files. EdgeOne's built-in hashed-file policy supplies the one-year browser TTL. Use the static/SSG output and let Pages detect the root `404.html`. The host domain and compliance settings are F6 decisions. [Direct Upload](https://pages.edgeone.ai/document/direct-upload) · [Cache rules](https://pages.edgeone.ai/document/configuring-cache) · [Static 404 behavior](https://edgeone.ai/document/192123212580007936) |

The root [`wrangler.jsonc`](../wrangler.jsonc) is for the existing Workers Static Assets configuration. Pages consumes the `_headers` generated by [`build-static.mjs`](../tools/build-static.mjs) inside the artifact. Avoid zone or dashboard cache rules that give HTML, mutable public files or 404 responses a long browser lifetime.

Before public release, verify the exact artifact on both target hosts. Check direct routes with and without trailing slashes, query preservation, custom 404 status, assets and their MIME types, cache behavior across updates and the public discovery files. Check input and audible playback on the target devices. The local release tests verify the static artifact. See the [F5 checklist](audits/F5-release-readiness.md) for the remaining host and release decisions.
