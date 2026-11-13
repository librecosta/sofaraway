# D0-C1 — Borderless interface, motion & UI State Studio

Baseline: `a77d09f272f2517efa72d4cfd09fe8881c899082`. Scope: the shared interface and an optional lighting layer in all four volumes. Gameplay, spatial assets, course records and soundtrack arrangements retain their existing contracts.

## Interface

The brand reads **PROCEDURAL RUNNER / SOFARAWAY / MUSIC IN MOTION**. Volume identities belong in the wheel. The player interface uses type, spacing, color and transparent surfaces. Stroked SVG icon shapes and the symmetric two-line ornaments at the sides of result titles are intentional. Keyboard focus uses a short highlight; touch controls retain a generous target. The native pointer handles menus and dialogs, and the reticle belongs to gameplay.

The volume wheel keeps a continuous, cyclic index independent of the loaded volume. A 56 px drag moves it by one track; neighboring items move in perspective (260 px, about 20° tilt, .90 local scale and .38 opacity). Release predicts a target with `round(position + velocity / 14)`, where velocity is filtered, bounded, and discarded after a hold. The analytic damped spring uses ζ = .85 and ω = 15 rad/s. Click, local wheel/trackpad, drag, touch swipe and Up/Down all feed the same target. The runtime changes course only after the target settles. External URL changes reconcile with the committed course. An explicit Start during settling commits the intended target, then starts that course after its load succeeds.

Mode and difficulty use a 420 ms horizontal transition. WAAPI starts from the current visual position if interrupted; the committed selection immediately drives game settings, lives and displayed records. Sightseeing collapses difficulty, shows five lives and one-third speed, and retains the chosen Standard difficulty. The existing `sofaraway.records.v1` data and qualification rules are unchanged.

Hover, press, panels, switches, toast and result reveal use 200, 120, 380, 240, 220 and 500 ms respectively. Reduced Motion removes the spring, selector translation and decorative reveals. Music details take the selected definition's style, BPM and duration and dismiss with the note button, Escape or an outside press. Share uses a top live region and reports the real clipboard result; a repeated request refreshes its lifetime. Settings use native keyboard and touch semantics behind custom range and switch styling; acrylic and scrollable dialogs use an opaque fallback without blur support. Credits link to librecosta and HelloRun.

## Dynamic Lights

The menu icon and Settings switch read one runtime field; the persisted setting is `sofaraway.dynamicLights`, initially false. The graphics layer receives a linear 280 ms enable/disable blend and the current beat. It does not start audio or change the simulation. At amount zero, all existing light levels and colors pass through exactly.

The synth and light envelope use the same authored sixteenth-note kick, snare and fill rules. The hats play as before and do not drive lights. Each recent event contributes

```text
E(age) = (1 - exp(-age / 0.045)) * exp(-age / 0.205)
P(t)   = clamp(sum((1.70*kick + 0.62*snare + 0.24*fill) * E(age)), 0, 1)
gain   = 1 + mix * 0.30 * sectionEnergy * buildRamp * closingTaper * P(t)
```

Age is in seconds at the selected song's BPM. The lookback is .8 seconds; BUILD rises from .55 to 1 and the final twelve beats taper. The rhythm layer follows the run timeline with or without audible output. Pause freezes the phase. Reduced Motion disables the extra pulses and preserves the baseline. The gain modulates existing emission and fixture uniforms only. No light, pass, texture or shader program is allocated for toggling it.

## UI State Studio

`/debug/#ui-states` uses the production menu, HUD, results, fallback, settings, credits, music and toast components. A curated catalog groups menu, gameplay, results, overlays, recovery and responsive fixtures. The controls act on isolated snapshots. The preview cannot save scores or settings, start a run, write the clipboard, navigate away or induce a real failure.

The preview document lays out at 1920×1080, 1280×720, 960×540, 390×844, 320×568 or 667×375, with an optional fit transform applied after layout. The static backdrop is labeled. The optional rendered backdrop reuses one game renderer across fixtures and releases it when disabled or closed. Modal autofocus is suppressed in passive previews. Blocking dialogs retain focus containment; transient graphics recovery remains a status and leaves the underlying layout intact.
