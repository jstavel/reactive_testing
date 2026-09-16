---
title: 'Wire the two-phase network capture into the orchestrator step lifecycle'
type: 'feature'
created: '2026-09-16'
status: 'done'
baseline_commit: '7584539436eea556fd5d16c6a49a5de3026a4152'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The collector half of decision 1a shipped (`collectors/collect-network.ts` exposes `startNetworkCapture(page)` → `{ finish(), close() }`), but the orchestrator still calls the one-shot `collectors.network(page)`, which attaches its listeners AFTER the action — so traffic that finished during the action is missing from the corpus. The step lifecycle starts the capture too late and has no failure-path detach.

**Approach:** In `runTestPlan`'s step loop, when the plan declares `network`, attach `startNetworkCapture(page)` BEFORE the action and settle; after the settle succeeds, call `handle.finish()` under the existing collector isolation boundary and persist its events exactly as today; on the action/settle failure path, call `handle.close()` before rethrowing so the shared page never accumulates dangling listeners. A start-time failure becomes a recorded collector gap with no corpus write.

## Boundaries & Constraints

**Always:** The handle is created only when `planned.has("network")` and only once per step, after the pre-step snapshot write and before the action. The capture span covers action + settle + the handle's own bounded networkidle — strictly wider than today's one-shot window. `finish()` runs inside the SAME `isolateCollector("network", …)` boundary as today (a throw → gap; exceeding `stepTimeout` → scenario failure, unchanged), and on success its events are persisted via `writeCorpusFile("network", …)` byte-identically. On the action/settle failure path (the catch that calls `recordStepFailure` and rethrows) the handle is `close()`d; `finish()` must NOT have run. A `startNetworkCapture` throw is recorded as a `network` collector gap in the manifest `errors` (AD-16), the handle is treated as absent, and the step continues — no corpus write and no scenario failure for an attach hiccup. The one-shot `collectnNetwork` export is unchanged for other callers. Behavior for plans WITHOUT a network dependency is byte-identical (no handle created, `finish`/`close` never called).

**Ask First:** Any change to capture-window semantics (where listeners attach/detach), failing the scenario on a start-time gap instead of recording it, calling `finish()` outside `isolateCollector`, or altering the one-shot `collectNetwork` API.

**Never:** No changes to `collectors/collect-network.ts` or its handle contract; no schema/model changes (no modelVersion impact); no changes to the one-shot collectors map keys (`collect.js` unchanged); no browser/network access in tests; no changes to non-network collectors' isolation or persistence.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| NETWORK_PLANNED | Once-per-step: `startNetworkCapture` called after pre-snapshot write, BEFORE the action; `finish()` after settle | Events persisted under `network/<runId>/<index>.json`; handle not leaked | N/A |
| FULL_PATH | Action succeeds → settle succeeds → `finish()` → corpus write | Same persisted JSON as today's one-shot (send the same event shape) | N/A |
| ACTION_FAILURE | Action or settle throws | `recordStepFailure` runs, then `close()`; `finish()` NOT called; no network corpus write for the step | rethrow (scenario fails) |
| START_GAP | `startNetworkCapture` throws (e.g. page closed) | `network` gap appended to manifest `errors`; no handle; step continues; no network write | gap, never scenario-fail |
| FINISH_THROW | `finish()` rejects | `isolateCollector` records a `network` gap; remaining collectors run; no network write | gap, scenario continues |
| NETWORK_UNPLANNED | Plan declares no network dependency | No handle created; `startNetworkCapture`/`finish`/`close` never called; behavior byte-identical | N/A |
| CLOSE_IDEMPOTENT | `close()` after `finish()` (double assurance) | No error (handle detach is idempotent) | N/A |

</frozen-after-approval>

## Code Map

- `collectors/collect-network.ts:14-97` -- the shipped handle: `startNetworkCapture(page)` + `finish()` (bounded networkidle + idempotent detach) + `close()` (immediate idempotent detach). UNCHANGED; read-only.
- `orchestrator/orchestrator.ts:5` -- add `import { startNetworkCapture } from "../collectors/collect-network.js";` (type `NetworkCaptureHandle` for the local).
- `orchestrator/orchestrator.ts:543-559` -- pre-step snapshot write: the attach point is AFTER this write, BEFORE `const targetStateId` (`:563`) / the action try (`:568`).
- `orchestrator/orchestrator.ts:567-586` -- action+settle try/catch: in the catch (after `recordStepFailure(...)`, before `throw err`), call `netHandle?.close()`.
- `orchestrator/orchestrator.ts:610-625` -- the `planned.has("network")` block: replace the `collectors.network(page)` isolated call with `() => netHandle!.finish()` (guard: if the handle is absent due to a START_GAP, skip to a gap-only path). Keep the `status === "ok"` → `writeCorpusFile("network", stepIndex, "json", …)` persistence identical.
- `orchestrator/orchestrator.ts:530` -- `const planned = new Set(plannedCollectors);` is in scope at the step loop; add `let netHandle: NetworkCaptureHandle | undefined;` per step before the action.
- `orchestrator/orchestrator.test.ts:84-97` -- the `vi.mock("../collectors/collect.js")` block (four collector fns, e.g. `network` currently asserted at `:791`). Add `vi.mock("../collectors/collect-network.js")` exporting `startNetworkCapture: vi.fn(() => ({ finish: vi.fn(async () => []), close: vi.fn() }))`. Because NO contract declares a network dependency today, wiring tests must also make `planned.has("network")` true: `vi.mock("../validators/dependencies.js", …)` so `corpusDependenciesFor` returns `["network"]` for one test contract (keep `requiredProbeNames`/cross-view intact) — or hoist a plan fixture over a contract whose mocked dependencies declare `network`.
- `validators/dependencies.ts:15-36` -- `corpusDependenciesFor` (mocked in tests only; production unchanged).

## Tasks & Acceptance

**Execution:**
- [ ] `orchestrator/orchestrator.ts` -- import `startNetworkCapture`; per-step handle create-after-pre-snapshot (only when `planned.has("network")`), wrapped so a start throw appends a `network` gap to `errors`; failure path closes the handle before rethrow; network block uses `netHandle.finish()` under `isolateCollector` and persists identically.
- [ ] `orchestrator/orchestrator.test.ts` -- update the `collect.js` mock usage for network assertions; add the `collect-network.js` mock and a dependencies mock that declares `network` for a test contract; tests: start-before-action ordering, finish-after-settle persistence (writeCorpusFile network kind + stem), action-failure ⇒ close + no finish + no write, start-gap ⇒ `errors` gap + step continues, finish-throw ⇒ gap, unplanned ⇒ never touched, close-vs-finish idempotence.
- [ ] `_bmad-output/implementation-artifacts/deferred-work.md` -- mark L84 `RESOLVED (2026-09-17)` and reconcile the sweep-triage bundle line.

**Acceptance Criteria:**
- Given a plan whose contract declares a network dependency, when a step runs, then `startNetworkCapture(page)` has been called after the pre-snapshot write and before the action, `finish()` runs after the settle, and the returned events are persisted under `network/<runId>/<index>.json`.
- Given the action or settle throws, when the failure path runs, then `close()` is called, `finish()` is not, and the step records no network corpus write.
- Given `startNetworkCapture` throws, then a `network` gap is recorded in the manifest `errors` and the step/scenario continues (no scenario failure, no write).
- Given a plan with no network dependency, then the handle is never created and existing behavior is byte-identical.
- Given `npm run typecheck && npm test && npm run lint`, then all pass with `computeModelVersion()` unchanged and no changes to `collectors/` or the model.

## Spec Change Log

- 2026-09-17: Review rework added finally-based close cleanup with a finish guard, a whitelist dependency mock, exact lifecycle ordering coverage, failure and multi-step tests, persistence-fidelity assertions, a shared collector-gap helper, removal of stale one-shot assertions, and collector-level idempotence documentation.

## Design Notes

Handle idempotence is already pinned by the collector unit tests in `collectors/collectors.test.ts`; orchestrator tests deliberately do not duplicate that mock-vacuous assertion.

The attach point is deliberately the pre-snapshot-write moment (not scenario start): the pre-step snapshot is legal before-state evidence and must not be moved; the capture window begins right before the action so action-time exchanges are recorded. Because `isolateCollector` already owns throw→gap and stepTimeout→scenario-failure semantics, the `finish()` call drops into the exact same boundary the one-shot used, so gap/failure behavior is preserved while the window widens. START_GAP is recorded but never fails the scenario — matching AD-16's collector philosophy (an evidence-gathering hiccup is a gap, a broken action is a failure) — and a missing handle downgrades the network block to gap-only. Testing note: since no production contract declares `network`, the wiring's observable behavior is pinned with mocked dependencies (fabricating a network-declaring contract), which is also how a future network contract will light the path up end-to-end. This story does NOT add a real network-declaring contract — that is a live-app/model decision outside this bundle.

## Verification

**Commands:**
- `npm run typecheck` -- expected: exit 0.
- `npm test` -- expected: all suites green (existing 675 + new wiring tests), `computeModelVersion()` unchanged.
- `npm run lint` -- expected: exit 0.
## Suggested Review Order

**Lifecycle wiring (entry point)**

- The handle attaches after the pre-snapshot write, before the action; a start throw becomes a recorded gap.
  [`orchestrator.ts:565`](../../orchestrator/orchestrator.ts#L565)

- One `finally` closes the handle on every non-finished failure exit (action/settle, recordStepFailure throw, finish timeout) — never on the happy path.
  [`orchestrator.ts:579`](../../orchestrator/orchestrator.ts#L579)
  [`orchestrator.ts:709`](../../orchestrator/orchestrator.ts#L709)

- `finish()` runs under the existing isolation boundary and its events persist byte-for-byte.
  [`orchestrator.ts:625`](../../orchestrator/orchestrator.ts#L625)

- The gap-record shape lives in one helper used inside and outside `isolateCollector`.
  [`orchestrator.ts:831`](../../orchestrator/orchestrator.ts#L831)

**Regression coverage**

- Exact lifecycle ordering: snapshot write → start → action → settle → finish.
  [`orchestrator.test.ts:845`](../../orchestrator/orchestrator.test.ts#L845)

- Action and settle failures close without finishing or writing.
  [`orchestrator.test.ts:895`](../../orchestrator/orchestrator.test.ts#L895)
  [`orchestrator.test.ts:990`](../../orchestrator/orchestrator.test.ts#L990)

- Start-gap continues without a write (and persists through a later step failure); finish failure is isolated.
  [`orchestrator.test.ts:922`](../../orchestrator/orchestrator.test.ts#L922)
