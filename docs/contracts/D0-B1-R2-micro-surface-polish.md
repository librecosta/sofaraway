# D0-B1-R2 — Micro-surface and high-speed readability

Scope is ELSEWHERE's Iris, Square and Diamond. The implementation baseline was `ae98ebe63f8ac70b1cf5102f415b8118531f280e`. [Milestone history](../history.md) links the original validation evidence.

Keep the micro-line period `0.055`, duty cycle `0.18`, `lineIntegral()` and `fwidth` footprint integration. Subtract the average coverage `0.18` before modulating line contrast. R2 evaluated deterministic local modulation `M(p) = 1 + ε(2n(p) − 1)` with `ε` between `0.04` and `0.08`. The final parameter choice is in [`glass-optics.ts`](../../app/game/graphics/glass-optics.ts).

Use the actual longitudinal speed `v` for a continuous contrast factor `V(v) = 1 − κ × smoothstep(v₀, v₁, v)`. Attenuate the centered micro-line signal only. Preserve average face energy, tint, transparency, opening, seams, outer rim, three edge levels, halo, hit and fade, real thickness and bevel. The lower Sightseeing speed retains micro detail. Use the existing analytic shader without added texture resources or passes.

Compare near and far views at multiple DPRs, in cruise and sustained Boost. Verify the opening and CPU/GPU collision agreement, including the dense Bonus route. Compare GPU P95, draw calls, shader programs, geometries and textures at matched settings. Use F2 fixed world stations during these checks.
