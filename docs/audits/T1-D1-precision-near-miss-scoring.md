# T1-D1 — Precision and near-miss scoring

Baseline `f774c70`. INTL Web, CN Web and Toy use the same simulation, gate geometry and scoring constants. The Technical Explorer renders the classifier's regions in Gate Lab.

## Crossing contract

The simulation judges at the interpolated crossing of a fixed world station. The original collision predicate still determines success. A failed, shielded, invulnerable collision or recovery-neutralized crossing earns no quality bonus. A blocked crossing forced through by the Web diagnostic can still receive its ordinary award under that diagnostic. It earns no quality bonus.

Let the target be the production lane target and let the clearance of a polygon face be its signed distance into the opening. Precision includes the inner 20% of the opening's linear scale about the target. Near Miss includes the inner 5% at a solid obstacle edge. Normal covers the remaining legal area. The thresholds include equality, subject to the existing strict or inclusive collision rule of the specific gate. The comparison has a world-space-independent floating-point tolerance of `1e-10` around the normalized thresholds.

| Family | Precision | Near Miss |
| --- | --- | --- |
| ELSEWHERE square and diamond | Divide the maximum absolute coordinate by the square half-side or divide the Manhattan distance by the diamond extent. Accept up to 0.20. | Accept from 0.95 to the original collision edge. |
| ELSEWHERE Iris | Expand the offset from the lane target by 5×. The sample must stay in the cabin and original open annular sector. | Compare radial clearance from the round hub and perpendicular clearance from the sector spokes to their respective target clearances. The cabin contributes no bonus edge. |
| DAYBREAK | Divide each signed gap face clearance by its clearance at the production target. Require all ratios to be at least 0.80. This gives a homothetic polygon. | At least one physical rim face has a ratio of 0.05 or less. Cabin-only faces still delimit the gap. |
| DESCENT Matrix | Normalize both offsets by the opening half-extents and retain the cabin-clipped shape. | A face must be within 5% of its half-extent, with a blocked sample just beyond it inside the cabin. |
| DESCENT Slice and Weave | Normalize the perpendicular distance from the formal band's centerline by its half-width. | Use the same 5% test on an edge with real laser collision immediately outside. The probe extends half an outline-beam radius beyond the nominal edge. Inter-beam slits retain their original passability and ordinary score. |
| ORBIT single, dual and triple | Normalize each hole's clearance by its shape's center clearance. This is the circle radius, square half-side or diamond extent divided by √2. The greatest clearance across holes decides the quality. | A 5% rim can win only when there is no deeper legal opening at that point. The shipped apertures within each preset are disjoint. |

### Area and reachability

Measured a 0.025-world-unit grid against the unexpanded input envelope with the existing 0.34 steering margin. The percentages are relative to legal sampled crossing area, including legal laser slits. This includes all eight Iris and Crystal rotations, both axes of all laser directions, and every ORBIT preset. All 92 combinations had reachable samples for both awards, and each sampled classification agreed with the original pass predicate.

| Family | Precision | Near Miss |
| --- | ---: | ---: |
| Iris | 5.00–5.23% | 5.64–7.90% |
| Square | 4.15% | 10.80% |
| Diamond | 4.10% | 10.18% |
| Crystal | 5.10–5.42% | 5.38–7.52% |
| Vertical | 4.07% | 9.40% |
| Horizontal | 4.00% | 9.38% |
| Matrix | 0.62–0.74% | 0.84–1.34% |
| Slice | 7.84–8.84% | 1.65–2.53% |
| Weave | 7.69–9.76% | 1.88–2.53% |
| ORBIT single | 3.81–4.05% | 8.05–10.18% |
| ORBIT dual | 3.81–4.73% | 8.47–10.64% |
| ORBIT triple | 4.01–4.35% | 9.66–11.47% |

The grid approximates area. For an unclipped, fully enclosed homothetic opening, the exact areas are 4% for Precision and 9.75% for Near Miss. Laser slits enlarge the denominator without enlarging either reward region. Fixed-step fixtures cover exact thresholds, collisions and interpolation separately from the grid.

## Scoring and results

Main gate quality adds 0, 150 or 225 base points. Difficulty, route and active Resonance scale the award. Boost and ordinary Combo continue to affect the base gate award. Travel, pickups, lives, rank and accuracy retain their existing rules. The short green or amber HUD message reports the extra integer score credited by the award, using the same floor as the live score.

Encore uses the same quality judge and awards 200, 300 or 350 points independently of main-track multipliers. Its special HUD messages display the extra 100 or 150 points. The result stores main and Encore counts separately. Results displays the sum for both sections and labels its scope. Ordinary passes remain derivable from the success totals. Showcase retains its score-free autopilot and its existing result screen. Sightseeing retains its own rules and Last Visit.

## Records and competition

`precision-v2` versions the rules independently of the V1 record document. LocalStorage uses `<namespace>.records.v1.precision-v2`. Its Web Lock and IndexedDB database both append `.write`, and the handoff row uses the same versioned document key. Previous V1 documents and handoffs remain at their original names. The four current chart record identities and all player settings retain their existing semantics.

Toy rejects settlements from a different ruleset before testing eligibility. The submission uses integer main score plus earned Encore. T1-D1 kept the four board slots and the original T1-D eligibility. The historical Main-route ceilings below budgeted boosted travel across the complete song, a capped Combo and maximum Near Miss award with Resonance on every main gate, a Normal Lumen pickup, and 350 points for every planned Encore gate. T1-E-F2 added Challenge and Bonus eligibility. [Current eligibility and score ceilings](../toy-development.md#leaderboards-and-competitive-records)

| Board | Volume | Conservative score ceiling |
| ---: | --- | ---: |
| 1 | ELSEWHERE | 228,524 |
| 2 | DAYBREAK | 194,835 |
| 3 | DESCENT | 257,124 |
| 4 | ORBIT | 154,506 |

The SDK score ceiling is 16,777,215. Board rows contain no ruleset field. Before release, verify whether the hosted slots contain any old scores. Local validation used offline fixtures without accessing hosted standings.

## Verification and artifacts

- Type checking passed. The 40 core suites passed all 388 tests, including the special reward boundaries, the SDK score contract and the crossing-time interpolation fixture.
- Separate motion and scoring fingerprints retained all 20 fixed-step baseline trajectories. Event timing, branch selection, camera positions, gate outcomes and endings match the original revision.
- Both Web production builds passed with the existing local Windows IPv4 prerender shim. The regional artifact suites passed three INTL checks and four CN checks. The ten focused Web browser checks covered the gate maps, bilingual HUD and results, narrow landscape layout and cross-tab records while the previous scoring lock was held.
- The Toy build audited 147 rendered modules. The ten targeted Toy browser checks passed on the packaged build, including leaderboard reads and submissions with offline adapters, independent records and handoff, and artifact isolation from Debug, the Gate Lab visualizer and Mock.
- `build/packages/sofaraway-toy.zip` contains 14 files and is 474,969 bytes. SHA-256 `c5221050d3505f7b1099d32cbc4b48cf5f56f4d6aadbca1bb89266788762fbea`. The pinned official Toy Doctor passed the `sofaraway` slug with zero findings.
- Capture sources are the Web Gate Lab and UI State Studio. Run the `crossing-quality.spec.ts` browser test with `CAPTURE_CROSSING_QUALITY=1` to reproduce the five gate maps, four HUD images and two bilingual result images in `.local/t1-d1/`.

Full-length real-time flights, performance runs and hosted App verification were outside this verification pass.
