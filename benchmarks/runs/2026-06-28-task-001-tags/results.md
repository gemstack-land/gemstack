# Phase 0 run — task-001-tags

Date: 2026-06-28
Task: [`spec/task-001-tags.md`](../../spec/task-001-tags.md) — add tagging to notes (data model + HTTP contract + UI).
Gate: [`tasks/task-001-tags/accept.mjs`](../../tasks/task-001-tags/accept.mjs), objective contract check, exit 0 = pass.

This is the first end-to-end Phase 0 run. Its purpose (per [#78](https://github.com/gemstack-land/gemstack/issues/78)) is to prove the method and the rubric are runnable, not to draw a final conclusion.

## Method

- One autonomous AI coding agent per app, same agent type and model on both sides (fair-harness rule). Each was handed the same task spec verbatim and run fully autonomously — no human in the loop.
- Each agent reset its DB for a clean seed, started its own dev server on the app's fixed port, and iterated against `accept.mjs` until exit 0 or a 30-minute / 5-intervention cap.
- Wall clock was stamped by each agent with `date +%s` around its own run.
- **Harness validated first:** both committed baselines were run against the gate before any code was written — both failed identically (the same 5 checks: `?tag` filtering and the `tags` array), confirming a real, symmetric gap to measure.
- **Independently re-verified:** after both agents reported PASS, the gate was re-run by hand against fresh DBs + freshly restarted servers on both apps. Both passed (exit 0), reproducible.

## Results

| App | Status | Time | Interventions | Notes |
|---|---|---|---|---|
| `bench-app-next` (vanilla Next.js) | PASS | 139s | 0 | first-run green, no server restart needed |
| `bench-app-gemstack` (Vike + React + `@gemstack/ai-sdk`) | PASS | 145s | 0 | first-run green after one server restart (server-code change) |

Both passed all 14 contract checks. Diffs were comparable in size (Next: 6 files / ~130 lines; GemStack: 5 files / ~150 lines). The agents' full solutions are saved as patches under [`solutions/`](./solutions) for audit and reproduction; they are intentionally **not** applied to the committed baseline apps, which stay the pristine Phase 0 starting point.

## Reading

The rubric runs end to end and the gate is objective and reproducible — Phase 0's goal is met.

The signal this task produces is "both frameworks build a basic CRUD-extension feature in roughly equal time with zero interventions." That is expected: a plain tags feature does not exercise the orchestration layer the benchmark exists to measure. The intervention metric only differentiates on tasks where the layer is in reach — AI-integration, multi-step, and refactor tasks where an agent on the vanilla side has to be unblocked. Phase 1 ([#79](https://github.com/gemstack-land/gemstack/issues/79)) should weight the task set toward those.

## Reproduce

```bash
# from the repo root
pnpm install
pnpm --filter @gemstack/ai-sdk build

# baseline should FAIL the gate (proves the gap)
cd examples/bench-app-next && rm -f data/notes.db* && pnpm_config_verify_deps_before_run=false pnpm dev   # :4311
cd examples/bench-app-gemstack && rm -f data/bench.sqlite* && PORT=3100 pnpm dev                          # :3100
BASE_URL=http://localhost:4311 node benchmarks/tasks/task-001-tags/accept.mjs   # FAIL on baseline
BASE_URL=http://localhost:3100 node benchmarks/tasks/task-001-tags/accept.mjs   # FAIL on baseline

# apply an agent's solution to re-check a PASS
git apply benchmarks/runs/2026-06-28-task-001-tags/solutions/next.patch
git apply benchmarks/runs/2026-06-28-task-001-tags/solutions/gemstack.patch
```
