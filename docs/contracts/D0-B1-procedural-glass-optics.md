# D0-B1 — Procedural glass optics

Scope is ELSEWHERE's Iris, Square and Diamond. The R1 implementation baseline was `88a2dfdf3229fc51007c4c4dd70f651769a6293f`. [Milestone history](../history.md) links the original validation evidence.

All three gates share the local octagonal section. Iris keeps its solid `1.02` hub and eight radial sectors. Square uses `max(|x|, |y|) < 1.35`, and Diamond uses `|x| + |y| < 1.91`. The geometry, shader and CPU collision agree on the playable opening. Keep the fixed shape, chapter tint, rhythm, hit and fade semantics.

| Feature | Contract |
| --- | --- |
| Edge light | L1 is the opening edge, L2 the seams and L3 the outer rim and small details. Use local-space distance, a narrow Gaussian core and a soft halo with the existing bloom. |
| Micro-lines | Use `fwidth` to estimate the screen footprint and smoothly integrate unresolved lines. Verify both near detail and far temporal stability. |
| Iris hub | Keep the glass body and exposed opening arc. Radial seams and their halo stop outside the solid hub. |
| Thickness | Use front and back faces, real side walls and a small bevel. Include the inner walls of Square and Diamond and both radial edges and the exposed hub arc on Iris. |
| Ownership | The volume shares recurring geometries. Each gate owns its material instance. Verify dense Bonus sections, retry, volume switches, restoration and disposal. |

Keep the effect procedural in the existing Three.js, WebGL2 and GLSL pipeline. Check actual GPU pixels against CPU openings. Use matched fixed views, CPU and GPU timing, draw calls and resource counts to check changes. The [R2 contract](D0-B1-R2-micro-surface-polish.md) covers the refinement to the micro-lines.
