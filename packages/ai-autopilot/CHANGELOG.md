# @gemstack/ai-autopilot

## 0.2.0

### Minor Changes

- 7fde5fc: Add the personas layer: stack-aware roles that make autopilot opinionated about the GemStack stack (Vike + universal-orm) instead of generic. `definePersona()` builds a role from a system prompt + skills (composed over `@gemstack/ai-skills`) + tools; `personaAgent()`/`personaWorkers()` materialize personas into Supervisor workers; `personaRoster()` describes them to a planner so plans route to the right role. Ships three built-ins: `vikePageBuilder`, `universalOrmModeler`, and `uiIntentDesigner` (the "declare intent, decouple implementation" UI guardrail). First child (#98) of the ai-autopilot end-to-end epic (#97).
- b0c0647: Add the runner seam: a pluggable `Runner` execution environment (workspace filesystem + shell + optional preview URL), shaped after Flue's `sandbox` contract so WebContainer, Docker, and Flue sandboxes drop in behind one interface. Ships the interface plus `FakeRunner` (the runner analog of `ai-sdk`'s `AiFake`) for infra-free testing, and `runnerTools(session)` to expose a booted session to an agent as sandbox tools (`read_file`, `write_file`, `list_files`, `exec`, `preview`). Real adapters (FlueRunner, WebContainer, Docker) land separately. Interface-first slice of the runner child (#99) of the ai-autopilot epic (#97).
- d261873: Add surfaces: run the same autopilot in the terminal, an in-page UI, or a background process, all over the Supervisor's `onEvent` stream. `terminalSink()` prints events inline (`formatEvent()` renders one event as a line); `EventStream` is a replayable multi-consumer transport with offset/tail replay (borrowing Flue's Durable-Streams `tail=N`); `launchAutopilot(start)` runs a Supervisor detached and returns an `AutopilotHandle` (`status()`, `events(offset)`, live async `stream()`, `result()`) that backs both the background and in-page (SSE) surfaces. Verified end-to-end against a real Supervisor. Closes the surfaces child (#100) of the ai-autopilot epic (#97).

## 0.1.2

### Patch Changes

- Updated dependencies [dbc8b3a]
- Updated dependencies [1b2ba93]
  - @gemstack/ai-sdk@0.5.0

## 0.1.1

### Patch Changes

- 81fe17b: Quality + docs pass for ai-autopilot:

  - `Supervisor` now validates its options at construction (`plan` must be a function, `workers` is required, `concurrency`/`maxSubtasks` must be positive integers) and `run()` rejects an empty task, so misconfiguration fails fast with a clear message instead of deep in a planner call.
  - An `onEvent` callback that throws is now isolated (logged and swallowed) so an observer bug can no longer abort a supervised run.
  - Corrected the `SupervisorRun.usage` docs: it aggregates dispatched-subtask usage only (the `Planner`/`Synthesizer` contracts return data, not usage, so planning/synthesis spend isn't observable).
  - Clarified that `maxSubtasks` and `budget` are optional, marked the internal `runPool` helper `@internal`, and added JSDoc examples.

- Updated dependencies [e784b5d]
- Updated dependencies [97ed299]
- Updated dependencies [4fa5820]
- Updated dependencies [cf28664]
- Updated dependencies [035050e]
- Updated dependencies [3cb13db]
  - @gemstack/ai-sdk@0.4.0

## 0.1.0

### Minor Changes

- 8796ae4: Initial release. Orchestration for `@gemstack/ai-sdk` agents — the control-policy layer over many agent runs. Seed slice: the supervisor/worker topology.

  - `Supervisor` — **plan → dispatch → synthesize**: decompose a task into subtasks, dispatch each to a worker agent (bounded concurrency, optional token budget, per-subtask error isolation), and synthesize the results.
  - `agentPlanner(agent)` — turn a planning agent into a `Planner` via `ai-sdk`'s `Output.array` (JSON subtask decomposition).
  - `agentSynthesizer(agent)` / `defaultSynthesize` — combine subtask results (LLM pass, or deterministic concatenation).
  - Pluggable stages (`plan` / `workers` / `synthesize`), guardrails (`concurrency`, `maxSubtasks`, `budget.maxTotalTokens`), and progress events.

  Scope boundary: `ai-sdk` owns the single-agent loop + handoff/subagent primitives; `ai-autopilot` owns orchestrating multiple runs under a policy. The seed runs autonomous workers; durable pause/resume, more topologies, and queue-backed execution are deferred behind optional seams. Depends on `@gemstack/ai-sdk`.

### Patch Changes

- Updated dependencies [9da9b29]
  - @gemstack/ai-sdk@0.3.0
