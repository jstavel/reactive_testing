---
title: 'Story 2.7: Capture the before-state, failed-step evidence, URL, and selected view'
type: 'feature'
created: '2026-08-30'
status: 'done'
review_loop_iteration: 0
baseline_commit: '917bb3ee94fe91f752193825ef9b541c9d7e8573'
context:
  - _bmad-output/implementation-artifacts/epic-2-context.md
  - _bmad-output/implementation-artifacts/epic-2-retro-08-29-2026.md
---

## Intent

**Problem:** The corpus is *after-only* and *only-when-successful*. `executeScenario` runs the action and settle wait first, and only then invokes the four collectors (`orchestrator.ts:216-298`). Two consequences for the offline validators Epic 3 builds:

1. **No before-state.** Every step records only the *post*-action state, so a validator cannot check a precondition ("did X hold *before* the action ran?") or diff what an action changed.
2. **Failed steps leave no evidence.** When the action or settle throws/times out, the function-level catch (`orchestrator.ts:301-307`) returns `{ passed: false, error }` and writes nothing. The failure is only an in-memory `ScenarioResult.error` string — the corpus validators read contains zero trace of it. A validator cannot distinguish "the app reached a wrong state" from "the locator was stale / the action timed out", because the page at the failure moment was never captured.
3. **Machine predicates lack their evidence.** Story 3.1 turns postconditions into machine predicates such as `url-is` and `view-selected`, but today's snapshot records neither the page URL nor which sub-view is selected — so those predicates would have nothing to check. The collectors must be extended *first* (human decision) so the evidence exists before validators are built.

**Approach:** Make the capture leg record both ends of a step, and the evidence the predicates need. Capture a **pre-step snapshot** before each action (the "before" state); record the **page URL** in every snapshot (a new `url` field); capture the **selected sub-view** via the probe collector; and on action/settle failure, **best-effort capture the page at failure** (snapshot + screenshot) and record a **step failure** entry the future reporter/validators can read. This is still pure collection — no assertion is added (FR-4); the run phase continues to perform no verification.

## Boundaries & Constraints

**Always:**
- Every step writes a pre-step snapshot **before** the action runs, using the `SnapshotRecord` shape with the step's own `stateId` (the state it starts *from*). The **post-action** snapshot records the transition's *target* state (`transition.to` from `fsm.ts`), not `step.stateId` — correcting today's mislabeling so Story 3.1's `state-is` predicate compares against the right state.
- Every snapshot (pre, post, and failure) records the **page URL** — a new `url` field on `SnapshotRecord`, populated from `page.url()` at capture time. `url` is **required** (no prior corpus exists, so no backward-compat concern; the URL is primary evidence for Story 3.1's `url-is`).
- The **selected sub-view** is captured as machine-checkable evidence via the existing probe collector (a probe whose selector targets the active view marker), so the `view-selected` predicate has a value to check. No new collector; the plan config gains the probe(s). The probe targets nav surfaces only — its absence on non-nav steps (home/dialog) is expected and is **not** a recorded gap.
- When the action or settle wait throws/times out, the step loop best-effort captures the page at failure (snapshot + screenshot) and records a **step failure**; the scenario still returns `passed: false` exactly as today.
- Step failures are recorded in the run manifest under a new `failures` array — **distinct** from `errors` (collector gaps, AD-16). Each entry carries `{ stepIndex, contractId, stateId, error }`; `stepIndex` is the same **global** index used by `errors.stepIndex` (across scenarios). `failures: []` means no step failed.
- Pre vs post snapshots are distinguishable by filename, and every file (pre, post, failure) appears in the manifest `files` list (AD-15).
- Failure-capture errors must never themselves abort the run: a failing failure-capture is swallowed, and the `failures` entry is still recorded.
- The pre-step snapshot uses the same isolation boundary as the post-action collectors (AD-16): a throw becomes a gap in `errors`, a timeout fails the scenario — no special case.
- NFR-2 gate: `tsc --noEmit` clean and `npm test` green before done.

**Ask First (resolved — defaults accepted):**
- Pre-step capture is **snapshot-only** (no network/probe/screenshot before the action) — the before-state is used to check preconditions and diffs, which need only the DOM/aria snapshot; a full 4-collector pre-capture would double corpus size for little validator value.
- Failure capture excludes network events — the network collector needs a settle window, and the page is mid-transition at failure. Failure evidence = snapshot + screenshot only.

**Never:**
- Do not embed any assertion or pass/fail judgment in the capture leg (FR-4). Capturing "here is the DOM at the failure moment" is collection, not verification.
- Do not change collector isolation (AD-16), timeout semantics, `ScenarioResult`/`RunResult` happy-path fields, corpus namespacing, or CDP-attach behavior.
- Do not build validators or a reporter (Epic 3). This story only makes the *evidence* available; nothing consumes `failures` yet.
- Do not reuse `errors` for step failures, or vice versa — a step failure and a collector gap are different axes and stay in different manifest arrays.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH | All steps succeed | Pre-step snapshot + post-action corpus written per step; manifest `failures: []` | N/A |
| ACTION_THROWS | Action throws/timeouts mid-step | Pre-step snapshot already written; failure snapshot + screenshot best-effort; manifest gains `{stepIndex, contractId, stateId, error}`; scenario `passed:false` | error captured into `failures`, not `errors` |
| SETTLE_TIMEOUT | Settle wait times out | Same as ACTION_THROWS | Same |
| FAILURE_CAPTURE_THROWS | Failure snapshot/screenshot itself throws | That capture error is swallowed; the `failures` entry is still recorded; run finalizes | best-effort, non-fatal |
| COLLECTOR_GAP (regression) | A collector throws post-action | `errors` gains a gap record as today; `failures` unaffected; scenario `passed:true` | unchanged (AD-16) |
| CORPUS_IO_FAILURE | `writeCorpusFile` rejects | Run fails as today | NOT isolated |

## Code Map

- `orchestrator/orchestrator.ts` — `executeScenario` `:202-308`: insert pre-step snapshot capture **before** the action call `:220` (`stateId` = `step.stateId`); change the post-action snapshot's `stateId` from `step.stateId` to the transition's `to` state (`fsm.ts`); wrap the action + settle wait (`:220-222`) so a throw/timesout triggers best-effort failure capture (snapshot + screenshot) and records a `StepFailure` with the step's `contractId`/`stateId`/`stepIndex`, then rethrows to preserve the existing `passed:false` outcome. Thread a `stepFailures: StepFailure[]` list alongside the existing `collectorErrors` (`:82`, passed to `executeScenario` and `finishRun`). `executeScenario` currently takes `errors: CollectorError[]` — it must also take the failure list.
- `model/schemas.ts` — add `url: string` to `snapshotRecordSchema` (`:10`); add `stepFailureSchema` (`stepIndex: number`, `contractId: string`, `stateId: string`, `error: string`) and `failures: StepFailure[]` on `runManifestSchema` (`:230-241`) with `.default([])` — mirroring `errors` so legacy manifests still parse (AD-13). Pre-step snapshots reuse the widened `snapshotRecordSchema`.
- `collectors/collect-snapshot.ts` — record `page.url()` into the snapshot `url` field (alongside the existing `stateId`/`snapshot`/`capturedAt`).
- `bin/run-smoke.ts` (or plan config) — add the selected-view probe(s) whose values the `view-selected` predicate will read.
- `orchestrator/corpus.ts` — `writeCorpusFile` `:20-34` generalize the filename stem so a call can write `0.pre.json` / `0.json` / `0.failure.json` (default stem stays `String(stepIndex)`); `finishRun` `:41-58` accepts and always writes `failures` (like `errors`).
- `orchestrator/orchestrator.test.ts` — new coverage: pre-step snapshot written before the action runs; action throw → failure evidence + `failures` entry + `passed:false`; settle timeout → same; failure-capture throw is swallowed and non-fatal; collector gap still lands in `errors` (not `failures`).
- `orchestrator/corpus.test.ts` — manifest round-trip with populated `failures`; pre/post filename distinction.

## Tasks & Acceptance

**Execution:**
- [x] `model/schemas.ts` — add `url: string` (**required**) to `snapshotRecordSchema`; add `stepFailureSchema` + `failures: StepFailure[]` on `runManifestSchema` with `.default([])` (AD-13).
- [x] `collectors/collect-snapshot.ts` — record `page.url()` into the snapshot `url` field.
- [x] `orchestrator/corpus.ts` — `writeCorpusFile` accepts an optional filename stem (phase-tagged pre/failure); `finishRun` accepts the failure list and writes `failures` (always present).
- [x] `orchestrator/orchestrator.ts` — capture a pre-step snapshot before each action (`stateId` = `step.stateId`); change the post-action snapshot's `stateId` to the transition's `to` state; on action/settle throw/timesout, best-effort capture snapshot + screenshot and record a `StepFailure` (contractId/stateId/stepIndex/error), then rethrow so `passed:false` is preserved; thread the failure list through to `finishRun`.
- [x] `bin/run-smoke.ts` — selected-view probe slot documented (the mechanism already exists via the probe collector); the concrete selector is deferred to live DOM discovery (never guessed — AD-4), same as the 2.6 nav locators.
- [x] `orchestrator/orchestrator.test.ts` — pre-step-before-action, action-failure evidence, settle-failure, failure-capture-swallowed, gap-vs-failure separation tests.
- [x] `orchestrator/corpus.test.ts` — manifest round-trip with populated `failures`; pre/post naming.
- [x] Update existing snapshot fixtures (`collectors/collectors.test.ts`, `orchestrator/corpus.test.ts`) to include the required `url` field.

**Acceptance Criteria:**
- Given a step that succeeds, when the run executes, then a pre-step snapshot is written before the action and the post-action corpus is written after, every snapshot carries the page `url`, the selected-view probe value is recorded, and the manifest `failures` is `[]`.
- Given a step whose action throws or times out, when the run executes, then the pre-step snapshot is retained, a best-effort failure snapshot + screenshot are written, the manifest gains a `failures` entry `{stepIndex, contractId, stateId, error}`, and the scenario records `passed:false`.
- Given a failure capture that itself throws, when the run executes, then the run still finalizes with a manifest and the `failures` entry is recorded (best-effort, non-fatal).
- Given a collector that throws after a successful action, when the run executes, then it records a gap in `errors` (not `failures`) and the scenario records `passed:true` (AD-16 unchanged).
- Given `npm run typecheck` / `npm test`, when run, then exits 0.

## Spec Change Log

- **2026-08-30** — Initial draft. Motivated by the Epic 2 retrospective discussion: the corpus is after-only and only-when-successful, so Epic 3 validators would have no before-state and no evidence of failed steps. Scoped as a capture-leg story (Epic 2), not a verification story (Epic 3): it makes evidence available; nothing consumes `failures` yet.
- **2026-08-30 (scope extension)** — Human decision: "extend collectors first." Story 3.1's postconditions become machine predicates (`state-is`, `url-is`, `view-selected`, …), which need their evidence captured. Scope now also records the page URL on every snapshot and the selected sub-view via the probe collector, so the predicates have values to check before validators are built.
- **2026-08-30 (review fixes)** — bmad-review (adversarial + edge-case) folded in: post-action snapshot `stateId` corrected to the target state; `url` made required (no prior corpus); failure snapshot pinned to the `SnapshotRecord` shape; `failures.stepIndex` pinned to the global index; selected-view probe scoped to nav surfaces; pre-step isolation boundary stated; existing fixture-update task added.
- **2026-08-30 (implementation)** — Implemented and verified. Pre-step + post-action snapshots with the target-state fix; required `url` on every snapshot; best-effort failure capture (snapshot + screenshot, phase-tagged `failure`) recorded as a `failures` manifest array distinct from `errors`; `writeCorpusFile` stem generalization. `npm run typecheck` clean; 93 tests pass (87 → 93). The selected-view probe selector is deferred to live DOM discovery — the mechanism is in place, the slot is documented in `bin/run-smoke.ts`.
- **2026-08-30 (probe discovery)** — Selected-view probe selector discovered live against the authenticated Kraken browser (CDP `:9222`): the active sub-view tab is `<a role="tab" aria-current="page">` (verified "Ledger", "Overview", "Futures" across History/Portfolio). Wired into `run-smoke.ts` as `{ name: "selected-view", selector: 'a[role="tab"][aria-current="page"]', optional: true }`. To honor the "absence is not a gap" decision, `Probe` gained an `optional` flag — an optional probe whose selector matches nothing records an empty value instead of a `ProbePartialError`. 94 tests pass.

## Design Notes

- **Collection, not verification.** A pre-step snapshot and a failure snapshot are evidence, not assertions — FR-4's "no assertions embedded in the run" is untouched. The step failure *entry* is a fact ("this step failed, here is why"), not a pass/fail judgment; the judgment stays with Epic 3 validators and the future reporter.
- **`failures` ≠ `errors`.** Collector gaps (AD-16) mean "the step executed but a collector missed evidence"; step failures mean "the step did not execute to completion". They are different axes and must not share an array, or the reporter cannot tell "partial evidence" from "no evidence".
- **Best-effort failure capture.** The failure path must not introduce new failure modes: a failure-capture that throws is swallowed, so the run always reaches `finishRun` and writes a manifest.
- **Why not full 4-collector pre-capture.** The before-state's only consumer is precondition/diff validators, which read the DOM/aria snapshot. Network/probe/screenshot pre-capture would double corpus size without a consumer — flagged as Ask First, default snapshot-only.
- **Predicates need evidence first.** `url-is`/`view-selected` (Story 3.1) can only check what the corpus records. Recording the URL (snapshot `url` field) and the selected view (probe) here — *before* validators — closes the "predicate with no evidence" gap. This is still collection, not verification (FR-4).
- **Bootstrap is not captured.** The first step's pre-step snapshot is the earliest evidence; the `goto` + `readySelector` bootstrap itself has no snapshot. Documented, not fixed — the pre-step baseline is sufficient for precondition/diff checks.

## Verification

- `npm run typecheck` — expected: exit 0
- `npm test` — expected: existing suites + new pre-step/failure-capture tests pass
