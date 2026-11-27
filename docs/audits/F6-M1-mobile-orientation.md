# F6-M1 mobile orientation and adaptive viewport

Compact touch devices default to Landscape. The game checks for a coarse primary pointer and a screen short edge of 600 CSS pixels or less. The screen measurement is independent of viewport width and stable across rotation. Settings saves Landscape or Portrait in `sofaraway.orientation`. A mismatch shows a prompt with a button for the current orientation. Desktop and larger touch devices keep their existing viewport behavior.

The game requests an orientation lock after its fullscreen action succeeds and updates the lock when the player changes preference in fullscreen. API absence and rejection leave the manual prompt usable. Fullscreen exit and page teardown release the app's lock. An obsolete completion is released when no newer request owns it. [Screen Orientation specification](https://www.w3.org/TR/screen-orientation/)

The compact viewport follows dynamic viewport height and uses the canvas size for rendering and touch normalization. The existing resize path updates the camera and PostFX targets. A portrait–landscape transition clears held input and pauses active flight. Resume continues through the existing runtime and audio transport at the paused offset. Toolbar-only resize updates the viewport without pausing. The short landscape layout keeps menu actions visible and uses two columns in Settings. Results and dialogs respect the safe-area insets.

## Verification

Production browser checks cover both orientations, mocked lock outcomes and fullscreen cleanup, emulated rotation during live Web Audio playback, held-touch cleanup, and portrait steering after resume. Menu and Settings were checked at 640×360, 740×360, 844×390, 932×430, 360×640, 390×844 and 430×932 CSS pixels. Results were checked at 640×360 and 390×844.

- Node 24.22.1 passed type checking. The production and harness builds completed. Two production build attempts timed out prerendering unrelated Explorer routes before the successful run.
- Twenty-two focused Chromium checks passed across orientation, touch and desktop input, Immersive Mouse, WebGL recovery and cached navigation. The separate headed Chromium test passed native Pointer Lock acquisition, release and gesture-driven resume.
- Three static release checks passed, covering the artifact, the no-script response, and game hydration with volume navigation.
- The three Chromium mobile compatibility cases passed. WinCairo WebKit lacks Web Audio on this machine. Its DPR 3 silent run passed, and two DAYBREAK silent-start cases failed to reach the HUD on both `78a8aba` and this change.

After `npm run build` and `npm run build:harness`, run `npm run test:b0 -- tests/browser/mobile-orientation.spec.ts` for the orientation cases. Set `F6_MOBILE_SCREENSHOTS=1` to capture the responsive evidence in ignored Playwright output. The mobile compatibility cases use `npx playwright test mobile.spec.ts --config playwright.compat.config.ts`.

Physical Android and iOS checks remain open. In particular, browser-level orientation permissions, native fullscreen controls, physical notches, home indicators and toolbar motion require hardware verification. The native-lock cases exercise the browser API contract with mocks.
