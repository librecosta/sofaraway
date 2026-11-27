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
| Pure rules | `npm run test:unit`. Run a specific file with `npm run test:unit -- tests/core/spatial.test.ts`. The [engine characterization tests](../tests/core/engine-characterization.test.ts) freeze authored charts, projected routes and fixed-step run outcomes. |
| Main browser suite | After `npm run build` and `npm run build:harness`, use `npm run test:b0 -- tests/browser/fidelity.spec.ts` for a focused run. Set `A0_BROWSER_CHANNEL=chrome` to use installed Chrome. |
| Input and run lifecycle | With those same builds, use `npm run test:b0 -- tests/browser/mobile-orientation.spec.ts tests/browser/immersive-mouse.spec.ts tests/browser/runtime.spec.ts`. The [record tests](../tests/browser/records.spec.ts) also exercise same-origin tab coordination. |
| Preview ownership | `npm run test:b0 -- tests/browser/preview-surface.spec.ts tests/browser/explorer-laboratories.spec.ts` checks failed setup, repeated restoration, iframe teardown and navigation with live resources. |
| Static output and release | `npm run test:release`. Includes strict types, production build and static-site checks. `RELEASE_CHROMIUM_CHANNEL=chrome` selects installed Chrome. |
| Browser compatibility | Run `npx playwright install chromium firefox webkit`, then `npm run test:compat`. Use `COMPAT_CHROMIUM_CHANNEL=chrome` for installed Chrome. The mobile profiles are emulations. |
| Audio | After installing the browsers for the compatibility matrix, run `npm run test:sync`. Chromium runs the full sync suite, Firefox skips the full-song cases, and WebKit runs lifecycle cases. The Chromium full-song tests run in real time. Use `SYNC_CHROMIUM_CHANNEL=chrome` for installed Chrome. |
| Audio Inspector | After the production and harness builds, run `npm run test:b0 -- tests/browser/audio-inspector.spec.ts tests/browser/audio-inspector-stems.spec.ts tests/browser/static.spec.ts`. The Playwright tests compare four-volume stem and master PCM, validate complete stem WAV exports and chunk seams, exercise live mixing and cleanup, and capture aligned waveforms at four viewport sizes. |
| CONTROL export failures | `npm run test:b0 -- tests/browser/descent-export.spec.ts` injects failures into the real offline exporter and checks cancellation, cleanup and retry. |
| Rendering and resources | `npm run test:perf` runs the main browser performance cases. `npm run test:stability` runs the extended benchmarks, resource lifecycle and full-song soak. `STABILITY_CHROMIUM_CHANNEL=chrome` selects installed Chrome. |

## Performance comparisons

Check out the reference commit in a separate worktree and run `npm ci`, `npm run build`, and `npm run build:harness` there. Set `STABILITY_REFERENCE_DIR` to its absolute `build` directory, which must contain `client` and `harness`. Run `npm run test:stability` in the candidate worktree. For a narrow scenic comparison, use `npm run test:stability -- --grep @scenic-perf`, with optional `STABILITY_SCENES` and `STABILITY_SCENIC_FRAMES` overrides. Record the browser, renderer, resolution, DPR, quality, and repeated CPU/GPU samples. Report unavailable GPU timers separately from frame intervals. Use the [Technical Explorer laboratories](../app/routes.ts) and fixed-time captures to review visuals with the same inputs and quality.

The [original A0 comparison](history.md#reproducing-the-original-a0-comparison) uses a historical prototype. Use it when comparing against that baseline.

## Web diagnostics

The game reads query parameters on startup. Reload a fully specified URL when reproducing a capture. See the [settings parser](../app/game/runtime/settings.client.ts), [viewport](../app/components/GameViewport.tsx) and [effective run policy](../app/game/core/run-policy.ts) for scope and record eligibility.

| Example | Effect |
| --- | --- |
| `?vol=daybreak` | Select `elsewhere`, `daybreak`, `descent` or `orbit`. Legacy `drift` selects DAYBREAK. |
| `?t=24.4` | Simulate to a fixed time in seconds and render the resulting scene. Use `diff` and `mode` to choose capture rules. `route=left`, `center` or `right` selects a physical branch side. |
| `?t=24.4&god=0` | Enable collision judgment in a fixed capture. Captures default to god mode. |
| `?mode=showcase&route=bonus&seed=1` | Reproduce a Showcase run with a chosen route and seed. Route values are `main`, `challenge` and `bonus`. A player gesture starts playback. |
| `?q=low` | Use the Low profile. `q=auto` and `q=high` select the other presets. `q=mobile` forces the mobile quality profile selector. |
| `?t=24.4&lights=true` | Enable Dynamic Lights for the capture without changing the saved preference. |
| `?rec=1` | Open the flight recorder. `R` toggles the overlay and `Shift+R` downloads the log. |
| `?dbg=1` | Expose read-only timing, target and resource metrics in `#errbox`. |
| `?ui=0` or `?panel=1` | Hide the UI or open Settings at startup. |

The parser also accepts `auto`, `align`, `god`, `boost`, `cur`, `post` and `dof`. Use a separate browser context for captures that need clean settings and record storage.

## Hosting the production build

Build both regions from the same `main` revision with Node 24 LTS. Vite reads
`VITE_REGION` at build time. Unset and `intl` select the international build.
`cn` adds the ICP and public security registrations to the prerendered game
menu. The badge is inlined as a PNG in the China build. The international
prerender and bundles omit the registration data and badge. Both builds retain
the same international canonical URL and game behavior. [Vite environment variables](https://vite.dev/guide/env-and-mode.html) · [Vite asset inlining](https://vite.dev/guide/assets.html)

```sh
npm ci
VITE_REGION=intl npm run build  # Cloudflare Workers Static Assets
VITE_REGION=cn npm run build    # EdgeOne Pages
```

On PowerShell, set `$env:VITE_REGION = 'intl'` or `$env:VITE_REGION = 'cn'`
before running `npm run build`. Each build replaces `build/client`. Keep any
artifacts you need to retain in separate directories. Run `npm start` to preview
the latest build at `http://127.0.0.1:8080`. Both hosts serve `build/client` at
the HTTPS origin root. Preserve `.well-known/`, the prerendered route directories,
`index.html` and `404.html`. Missing pages and missing assets should return the
custom 404 with HTTP status 404.

After each regional build, keep the same `VITE_REGION` value when running
`npx playwright test --config playwright.release.config.ts tests/release/region.spec.ts`.
The checks inspect the local artifact and prerendered links. The CN run also
checks touch layouts and the footer's removal when Standard or Showcase starts.

### International / Cloudflare Workers Static Assets

The assets-only Worker is `sofaraway`. The root [`wrangler.jsonc`](../wrangler.jsonc) selects `./build/client`, `auto-trailing-slash` for prerendered directories and `404-page` for missing URLs. Workers reads the generated `_headers` in the asset directory. Exact emitted fingerprints receive one year of immutable browser caching. HTML and mutable public assets revalidate. Keep zone cache rules consistent with these policies. [Static routing](https://developers.cloudflare.com/workers/static-assets/routing/static-site-generation/) · [Static asset headers](https://developers.cloudflare.com/workers/static-assets/headers/)

Validate the artifact without uploading it:

```sh
npx --yes wrangler@4.168.0 deploy --dry-run --config wrangler.jsonc
```

For Workers Builds, use the repository root and `main` as the production branch. Set `NODE_VERSION=24.22.1` and `SKIP_DEPENDENCY_INSTALL=1`. Use `npm ci && VITE_REGION=intl npm run build` as the build command and `npx --yes wrangler@4.168.0 deploy --config wrangler.jsonc` as the deploy command. Bind `sofaraway.librecosta.com` as a Worker Custom Domain in the LibreCosta Cloudflare zone. A merge into `main` triggers a deployment once Workers Builds is connected with those settings. [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/) · [Build image](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/) · [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)

### China / EdgeOne Pages

For prebuilt Direct Upload, check out the production `main` revision, run
`VITE_REGION=cn npm run build` after installing dependencies, and upload the
contents of `build/client` to the China project. If using a Git-connected
project, set production to `main`, use Node 24, install with `npm ci`, set
`VITE_REGION=cn` in the build command or build environment, and set the output
directory to `build/client`. The generated `edgeone.json` configures revalidation
for HTML and mutable public files. EdgeOne's hashed-file policy supplies the
one-year browser TTL. Use the static output with the root `404.html`.
[Direct Upload](https://pages.edgeone.ai/document/direct-upload) · [Project settings](https://pages.edgeone.ai/document/project-management) · [Cache rules](https://pages.edgeone.ai/document/configuring-cache) · [Static 404 behavior](https://edgeone.ai/document/192123212580007936)

When publishing an approved Web revision, smoke-test the exact artifact on each target host. Check direct routes with and without trailing slashes, query preservation, 404 status for unknown pages and chunks, MIME types, cache behavior, public discovery files and input and audible playback on target devices. Local release checks cover the artifact before deployment. The [F5 release record](audits/F5-release-readiness.md) preserves the initial preparation and release notes draft.
