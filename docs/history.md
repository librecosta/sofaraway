# Milestone history

[Engineering architecture](engineering.md) and [verification](verification.md) describe the current repository. The [collaboration playbook](../.agents/playbook.md) covers the contribution workflow. Milestone documents capture the decisions, measurements and open issues of the revision they tested. Use the pinned originals when comparing a new build to those results.

## Decisions that shape current work

| Decision | Current reference | Evidence |
| --- | --- | --- |
| React owns the UI and consumes snapshots from an independent game runtime | [Engineering architecture](engineering.md) | [B0 contract](https://github.com/librecosta/sofaraway/blob/d98cbcaf5d720258f2d6192e71e82ef62acf0929/docs/contracts/B0-application-game-runtime-architecture.md), [B0 regression](https://github.com/librecosta/sofaraway/blob/d98cbcaf5d720258f2d6192e71e82ef62acf0929/docs/audits/B0-regression-report.md) |
| Music authors spacing and visual cues. Actual crossings judge gates, pickups and routes. A monotonic run timeline allows bounded catch-up and audio recovery. | [World-space and recovery contract](contracts/D0-B2-F2-world-space-gameplay-graceful-recovery.md) | [F2 validation](audits/D0-B2-F2-validation-report.md) |
| ELSEWHERE glass has real thickness, matching CPU/GPU openings and analytic micro-lines | [Glass optics](contracts/D0-B1-procedural-glass-optics.md), [Micro-surface](contracts/D0-B1-R2-micro-surface-polish.md) | [R1 validation](https://github.com/librecosta/sofaraway/blob/d98cbcaf5d720258f2d6192e71e82ef62acf0929/docs/audits/D0-B1-glass-optics-report.md), [R2 validation](https://github.com/librecosta/sofaraway/blob/d98cbcaf5d720258f2d6192e71e82ef62acf0929/docs/audits/D0-B1-R2-report.md) |
| ELSEWHERE surfaces use procedural height fields and world-scale UVs | [Material foundation](contracts/D0-B3-M0-material-surface-dressing.md) | [M0 validation](audits/D0-B3-M0-material-validation.md) |
| ELSEWHERE pairs its single-hue lighting score with fixed corridor installations and a real S-curve | [Long corridor lighting and S-curve](contracts/D0-B3-A1-F2-long-corridor-lighting-s-curve.md) | [F2 validation](audits/D0-B3-A1-F2-validation.md) |
| ELSEWHERE rewards early main completion with fixed Encore gates and a streamed light-only ending | [Encore and Afterglow](contracts/D0-B3-A1-F3-encore-afterglow.md) | [F3 validation](audits/D0-B3-A1-F3-validation.md) |
| ELSEWHERE offers Impossible and the menu tracks local results per volume and difficulty | [Impossible and local records](contracts/D0-B3-A1-F4-impossible-local-records.md) | [F4 validation](audits/D0-B3-A1-F4-validation.md) |
| Main and Encore share geometry-based Precision and Near Miss. Scores use the isolated `precision-v2` ruleset. | [Scoring and record contract](audits/T1-D1-precision-near-miss-scoring.md) | [T1-D1 verification](audits/T1-D1-precision-near-miss-scoring.md#verification-and-artifacts) |
| The shared player UI uses borderless controls, an optional score-driven lighting layer and isolated Debug fixtures | [Interface and UI State Studio](contracts/D0-C1-borderless-interface-motion-state-studio.md) | [C1 validation](audits/D0-C1-validation.md) |
| BSD-3-Clause applies to the project. Static hosting serves the prerendered artifact. | [License](../LICENSE), [Hosting](verification.md#hosting-the-production-build) | [D0-A1 license reconciliation](https://github.com/librecosta/sofaraway/blob/d98cbcaf5d720258f2d6192e71e82ef62acf0929/docs/audits/D0-A1-gameplay-report.md), [C0-D release audit](https://github.com/librecosta/sofaraway/blob/d98cbcaf5d720258f2d6192e71e82ef62acf0929/docs/audits/C0-D-release-readiness-report.md) |

## Recent milestones

- [F3 Technical Explorer acceptance](audits/F3-D-explorer-acceptance.md)
- [F4 cross-volume architecture audit](audits/F4-A-cross-volume-architecture-audit.md) and [four-volume performance baseline](audits/F4-P0-performance-baseline.md)
- F4 performance results for [ELSEWHERE streaming](audits/F4-P1-A-elsewhere-streaming-optimization.md), [shared PostFX](audits/F4-P1-B-elsewhere-gpu-postfx-optimization.md), [DAYBREAK](audits/F4-P2-daybreak-atmosphere-optimization.md), [DESCENT](audits/F4-P3-descent-facility-optimization.md) and [ORBIT](audits/F4-P4-orbit-procedural-cosmic-optimization.md)
- [F5 release preparation](audits/F5-release-readiness.md)
- [F5-F1 fullscreen and Immersive Mouse](audits/F5-F1-fullscreen-immersive-input.md). Immersive Mouse is opt-in by default in the current code.
- [F6-M1 mobile orientation](audits/F6-M1-mobile-orientation.md) and [F6-B1 regional artifact isolation](https://github.com/librecosta/sofaraway/commit/5aafe3c). Use the [current hosting guide](verification.md#hosting-the-production-build) for Web release checks.
- [T1-A bilingual player UI and Auto Boost](audits/T1-A-shared-localization.md).

## Proposals

- T0 evaluated a third distribution for Bilibili Toy. The [compatibility audit](audits/T0-toy-platform-compatibility.md) records the local probe and remaining host checks. The [distribution and localization design](contracts/T0-distribution-localization-proposal.md) and [player features design](contracts/T0-toy-player-features-proposal.md) are proposals. The production build described by the hosting guide covers the two Web regions.

## Reproducing the original A0 comparison

Use the historical browser suite when comparing against the old static prototype. From the current worktree, run `git worktree add --detach ../sofaraway-a0 88a4adb533e2c5ec6f8e77a166ca11e75794be58`. Set `A0_APP_ROOT` to the reference worktree's absolute path and run `npm run test:a0` or `npm run test:a0:perf` from the current worktree. Install Playwright Chromium first. Today's browser regression suite uses the production and harness builds in the [verification guide](verification.md).

## Archive index

The original milestone files are preserved at commit [`d98cbca`](https://github.com/librecosta/sofaraway/tree/d98cbcaf5d720258f2d6192e71e82ef62acf0929/docs). The links pin the original language, formulas, baselines and measured results. To read an original locally, use `git show d98cbcaf5d720258f2d6192e71e82ef62acf0929:<repository-relative-path>`.

| Milestone | Original contract | Original report |
| --- | --- | --- |
| A0 · Prototype correctness | [Contract](https://github.com/librecosta/sofaraway/blob/d98cbcaf5d720258f2d6192e71e82ef62acf0929/docs/contracts/A0-architecture-correctness-audit.md) | [Report](https://github.com/librecosta/sofaraway/blob/d98cbcaf5d720258f2d6192e71e82ef62acf0929/docs/audits/A0-audit-report.md) |
| B0 · Framework and runtime migration | [Contract](https://github.com/librecosta/sofaraway/blob/d98cbcaf5d720258f2d6192e71e82ef62acf0929/docs/contracts/B0-application-game-runtime-architecture.md) | [Report](https://github.com/librecosta/sofaraway/blob/d98cbcaf5d720258f2d6192e71e82ef62acf0929/docs/audits/B0-regression-report.md) |
| C0-A · Browser and device compatibility | [Contract](https://github.com/librecosta/sofaraway/blob/d98cbcaf5d720258f2d6192e71e82ef62acf0929/docs/contracts/C0-A-cross-browser-device-compatibility.md) | [Report](https://github.com/librecosta/sofaraway/blob/d98cbcaf5d720258f2d6192e71e82ef62acf0929/docs/audits/C0-A-compatibility-report.md) |
| C0-B · Performance and memory | [Contract](https://github.com/librecosta/sofaraway/blob/d98cbcaf5d720258f2d6192e71e82ef62acf0929/docs/contracts/C0-B-performance-memory-stability.md) | [Report](https://github.com/librecosta/sofaraway/blob/d98cbcaf5d720258f2d6192e71e82ef62acf0929/docs/audits/C0-B-performance-report.md) |
| C0-C · Audio synchronization | [Contract](https://github.com/librecosta/sofaraway/blob/d98cbcaf5d720258f2d6192e71e82ef62acf0929/docs/contracts/C0-C-audio-gameplay-synchronization.md) | [Report](https://github.com/librecosta/sofaraway/blob/d98cbcaf5d720258f2d6192e71e82ef62acf0929/docs/audits/C0-C-audio-sync-report.md) |
| C0-D · Release readiness | [Contract](https://github.com/librecosta/sofaraway/blob/d98cbcaf5d720258f2d6192e71e82ef62acf0929/docs/contracts/C0-D-release-readiness.md) | [Report](https://github.com/librecosta/sofaraway/blob/d98cbcaf5d720258f2d6192e71e82ef62acf0929/docs/audits/C0-D-release-readiness-report.md) |
| D0-A1 · ELSEWHERE gate shapes and license | [Contract](https://github.com/librecosta/sofaraway/blob/d98cbcaf5d720258f2d6192e71e82ef62acf0929/docs/contracts/D0-A1-vol1-gate-gameplay.md) | [Report](https://github.com/librecosta/sofaraway/blob/d98cbcaf5d720258f2d6192e71e82ef62acf0929/docs/audits/D0-A1-gameplay-report.md) |
| D0-A2 · Floating pickups | [Contract](https://github.com/librecosta/sofaraway/blob/d98cbcaf5d720258f2d6192e71e82ef62acf0929/docs/contracts/D0-A2-floating-pickups.md) | [Report](https://github.com/librecosta/sofaraway/blob/d98cbcaf5d720258f2d6192e71e82ef62acf0929/docs/audits/D0-A2-pickup-report.md) |
| D0-A3 · Three-way branch | [Contract](https://github.com/librecosta/sofaraway/blob/d98cbcaf5d720258f2d6192e71e82ef62acf0929/docs/contracts/D0-A3-three-way-branch.md) | [Report](https://github.com/librecosta/sofaraway/blob/d98cbcaf5d720258f2d6192e71e82ef62acf0929/docs/audits/D0-A3-branch-report.md) |
| D0-B1-R1 · Glass optics | [Original contract](https://github.com/librecosta/sofaraway/blob/d98cbcaf5d720258f2d6192e71e82ef62acf0929/docs/contracts/D0-B1-procedural-glass-optics.md) | [Report](https://github.com/librecosta/sofaraway/blob/d98cbcaf5d720258f2d6192e71e82ef62acf0929/docs/audits/D0-B1-glass-optics-report.md) |
| D0-B1-R2 · Micro-surface | [Original contract](https://github.com/librecosta/sofaraway/blob/d98cbcaf5d720258f2d6192e71e82ef62acf0929/docs/contracts/D0-B1-R2-micro-surface-polish.md) | [Report](https://github.com/librecosta/sofaraway/blob/d98cbcaf5d720258f2d6192e71e82ef62acf0929/docs/audits/D0-B1-R2-report.md) |
| D0-B2 · Sightseeing | [Contract](https://github.com/librecosta/sofaraway/blob/d98cbcaf5d720258f2d6192e71e82ef62acf0929/docs/contracts/D0-B2-sightseeing-mode.md) | [Report](https://github.com/librecosta/sofaraway/blob/d98cbcaf5d720258f2d6192e71e82ef62acf0929/docs/audits/D0-B2-sightseeing-report.md) |
| D0-B2-F1 · Camera and gate stability | — | [Report](https://github.com/librecosta/sofaraway/blob/d98cbcaf5d720258f2d6192e71e82ef62acf0929/docs/audits/D0-B2-F1-camera-gate-stability.md) |
| D0-B2-F2 · World-space gameplay | [Original contract](https://github.com/librecosta/sofaraway/blob/d98cbcaf5d720258f2d6192e71e82ef62acf0929/docs/contracts/D0-B2-F2-world-space-gameplay-graceful-recovery.md) | [Report](audits/D0-B2-F2-validation-report.md) |
| D0-B3-M0 · Material foundation | [Original contract](https://github.com/librecosta/sofaraway/blob/d98cbcaf5d720258f2d6192e71e82ef62acf0929/docs/contracts/D0-B3-M0-material-surface-dressing.md) | [Original report](https://github.com/librecosta/sofaraway/blob/d98cbcaf5d720258f2d6192e71e82ef62acf0929/docs/audits/D0-B3-M0-material-validation.md) |
| D0-B3-A0 · Structural kit and props | [Contract](https://github.com/librecosta/sofaraway/blob/d98cbcaf5d720258f2d6192e71e82ef62acf0929/docs/contracts/D0-B3-A0-structural-kit-and-props.md) | [Report](https://github.com/librecosta/sofaraway/blob/d98cbcaf5d720258f2d6192e71e82ef62acf0929/docs/audits/D0-B3-A0-validation.md) |
| D0-B3-A1 · Scenic composition and prop removal | [Contract](https://github.com/librecosta/sofaraway/blob/d98cbcaf5d720258f2d6192e71e82ef62acf0929/docs/contracts/D0-B3-A1-illumination-scenic-composition.md) | [Report](https://github.com/librecosta/sofaraway/blob/d98cbcaf5d720258f2d6192e71e82ef62acf0929/docs/audits/D0-B3-A1-validation.md) |
| D0-B3-A1-F1 · Architectural order and rhythmic color | [Contract](contracts/D0-B3-A1-F1-architectural-order-rhythmic-color.md) | [Report](audits/D0-B3-A1-F1-validation.md) |
