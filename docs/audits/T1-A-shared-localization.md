# T1-A shared localization and Auto Boost

2026-11-28 · SoFarAway `dev` · Baseline `af0d64c`

## Implementation

- The Web game prerenders in English for INTL and Simplified Chinese for CN. Both builds hydrate with that same default, then apply a valid saved language. The locale selector also defines Simplified Chinese for the future Toy entry. Changing the language updates the player UI, accessible labels and document language on the current canvas and runtime. Explorer defaults to English. Its UI State Studio can preview either language without writing game preferences.
- English defines the dictionary keys and interpolation fields. The Chinese dictionary checks both at compile time. Runtime messages carry identifiers and values. The UI formats numbers and maps modes, difficulties, routes, pause reasons and outcomes. Soundtrack and chapter names and in-world signage retain their authored lettering. Chinese labels use system CJK fallbacks and a short reveal that respects Reduced Motion.
- Auto Boost is off by default and saved through Settings. Start and Retry capture the setting for Standard. Runtime applies it through the same `InputFrame.boosting` used by Shift and the mouse, including during resumed play. Settings explains why the option is locked while a run is paused. The existing Standard score and record eligibility rules apply. Future Toy leaderboard eligibility should treat Auto Boost as ordinary Standard input.
- The Web home route supplies the CN registration footer independently of locale. The international canonical URL, static output and provider configuration are unchanged. Fixed-time captures still use `?boost=1`. This milestone keeps the two Web targets and their existing Explorer and diagnostic capabilities.

## Verification

Use Node 24.22.1 and Chrome 158.0.8127.37 on Windows. Set `A0_BROWSER_CHANNEL=chrome` for the main browser tests and `RELEASE_CHROMIUM_CHANNEL=chrome` for the release tests.

- `npm run typecheck` and `npm run test:unit` passed. Vitest ran 371 tests.
- The CN and INTL production builds passed with Node's IPv4-first DNS option. The region spec passed all three CN cases and both applicable INTL cases. The checks cover static language, hydration, persisted overrides, filing links, the badge, the international canonical URL and the English Explorer.
- `npm run build:harness` passed. Fifteen focused Playwright cases passed across localization, keyboard focus, UI State Studio, orientation, runtime recovery and records. The locale switch preserved the canvas, simulation and audio transport of a paused run. WebGL restoration, cached-page return and rotation preserved Auto Boost. A Standard run with Auto Boost wrote its regular local record.
- The fixed-step test drove the same steering and seed through continuous Shift and Auto Boost. It matched movement, lens response, collision, gates and score. It also checked Sightseeing and Showcase at their existing speeds. A fixed-time capture used the explicit diagnostic flag only.

## Captures

Set `T1_SCREENSHOTS=1` when running `npm run test:b0 -- tests/browser/localization-boost.spec.ts` to write the menu, Settings, HUD and results PNGs under ignored `.local/t1-a/screenshots/`. The 16 captures cover both languages at 1280×720 and Chinese at 640×360 and 390×844. Results use the fixed DAYBREAK ending fixture.

Touch checks used Chrome emulation. In probes, Chrome suppressed the first compatibility click after a raw CDP drag. The touch regression exercises rotation and menu taps before the raw steering gesture. Physical devices were outside this run.
