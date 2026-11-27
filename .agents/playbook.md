# Working together on SoFarAway

Start at [AGENTS.md](../AGENTS.md). Use this playbook for taking over work, coordinating concurrent changes and preparing a handoff.

## Take over a change

1. Run `git status --short --branch`. Inspect existing edits and staged paths before making changes. Use the requested revision for comparisons, or the starting revision when none is specified. Record any local edits that affect your verification and preserve them.
2. Identify the affected behavior and the test or fixture that protects it. Use [engineering architecture](../docs/engineering.md) to find the owner and the relevant contract. Historical audits describe their tested revision. The [history index](../docs/history.md) marks proposals and links current references.
3. When a task changes a published contract, identify the player-facing effect and the compatibility impact. Keep public URLs, record IDs, music/generated assets, authored charts and regional artifact boundaries where the task preserves them. Update the current guide when the behavior changes. Record a decision in history when future maintainers need the rationale.

## Coordinate work and verification

- When multiple contributors share a worktree, assign non-overlapping files or subsystems. Agree on edits to shared contracts and fixtures before either contributor changes them. At handoff, identify which changes are yours and which are pre-existing.
- Build the production site before the browser harness. Parallel builds of regions or revisions replace fixed output directories. Use separate worktrees or preserve completed artifacts before rebuilding. Playwright configs also bind fixed local ports. Run suites that share a port or output directory sequentially.
- Run the [verification path](../docs/verification.md) for the affected behavior. Keep measurements, screenshots and probe scripts in `.local/` or the ignored test output. Preserve fixture inputs and record the browser, GPU or device when they matter. Distinguish emulation, physical-device results and checks that could not run.
- Treat Git and hosting as separate actions. Keep staged changes scoped to the task. Follow its authorization for commits, pushes and PRs. A merge into a connected production branch can deploy. Use [the hosting guide](../docs/verification.md#hosting-the-production-build) for local artifact checks and provider settings.

## Hand off

Summarize the outcome, changed areas and any product or compatibility decisions. Include the baseline and resulting revision when relevant. List the exact checks run with their results, skipped or blocked checks, and any known pre-existing failures or worktree edits that matter to the next contributor. For external actions, report what happened and link the resulting PR or deployment only if it exists.
