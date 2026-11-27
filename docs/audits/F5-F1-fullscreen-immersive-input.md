# F5-F1 fullscreen and immersive mouse

## Interaction

Settings and the main-menu shortcut share the Fullscreen API. The application's main element contains the canvas, HUD, menus and dialogs. Both controls reflect `fullscreenchange`. Fullscreen stays independent of the mouse preference. The browser owns F11 and its exit controls. The Interface Studio shows both settings using local preview state. [Fullscreen API](https://fullscreen.spec.whatwg.org/)

Immersive Mouse defaults to on and respects preferences already stored under `sofaraway.immersiveMouse`. Mouse-capable browsers expose the switch. Interactive Start, Retry and Resume gestures request Pointer Lock before audio or graphics preparation yields. The game runtime owns the lock. A blocked request leaves ordinary input available and keeps the preference. The runtime releases the mouse on pause, loss of focus, suspension, context loss, results, disposal or when the preference is disabled. An unexpected unlock uses the normal pause flow and waits for an explicit Resume gesture before requesting lock again.

The input controller integrates relative mouse movement into a bounded screen reticle and then uses the existing target mapping. It seeds that reticle from the current flight steering target, preserves normalized position on resize, and keeps keyboard steering and Boost in the same input frame. The simulated cursor has no bearing on the browser's exit mechanisms. [Pointer Lock specification](https://w3c.github.io/pointerlock/)

## Verification

- On Windows 10 with Node 24.22.1, `npm run typecheck` and `npm run build` passed. Two earlier builds timed out during prerendering on different Explorer routes. The final build generated all 11 route documents.
- Chromium passed 15 focused Playwright checks across `immersive-mouse.spec.ts`, `interaction.spec.ts` and `ui-state-studio.spec.ts`. Coverage includes unlocked and relative steering, clamping, resize, Boost, touch, persistence, unsupported and denied requests, late acquisition, pause, resume, retry, results, backgrounding, context restoration and disposal.
- All eight static release checks passed. They cover fullscreen on the app root, exit through Settings, rejected and unavailable requests, and prerendered pages with JavaScript disabled.
- One headed Chrome 158 check passed with `F5_HEADED_POINTER_LOCK=1`. Trusted Start and Resume clicks acquired real Pointer Lock. Mouse Boost, pause on external release and intentional release through the existing pause shortcut worked.

The default-on follow-up passed type checking, the production build, all 15 focused cases, all eight static release cases in Chrome, and the headed Chrome test without changing Settings. Four additional unlocked regression checks passed. The Web Audio compatibility test reported zero run buses after switching volumes on both the previous commit and the follow-up.

## Browser chrome

Chromium checks Pointer Lock before showing its mouse-triggered fullscreen exit control. Physical F11 and the visibility of the native exit overlay on the intended desktop setup remain manual checks. Browser chrome behavior may vary across browsers. [Chromium fullscreen control implementation](https://chromium.googlesource.com/chromium/src/+/HEAD/chrome/browser/ui/views/fullscreen_control/fullscreen_control_host.cc)
