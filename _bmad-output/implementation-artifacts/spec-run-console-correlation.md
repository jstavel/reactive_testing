---
title: 'Correlate a console run with its corpus: log runId and start timestamp at plan start'
type: 'feature'
created: '2026-09-16'
status: 'done'
baseline_commit: '101017e743d789c53431e8cff062390bb345734a'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `bin/run-smoke.ts` logs the plan id and model version at startup but not the `runId`. The corpus directory is named by the runId (a UUID), so the operator cannot tell which run produced which directory without opening `run-manifest.json`, and UUIDs carry no temporal information.

**Approach:** Let the runner supply a `runId` that the orchestra must use for the corpus, log it with a human-readable ISO timestamp when the plan starts, and validate an explicit runId early in preflight (reusing the path-trust `assertSafeRunId`). Default behavior (orchestrator generates the runId) stays byte-identical.

## Boundaries & Constraints

**Always:** The runId override is additive and lives in the `runTestPlan` signature at `orchestrator/orchestrator.ts` (`OrchestratorConfig & { runId?: string }`) — never in `model/schemas.ts` (a config-only extension must not bump the model hash). When `config.runId` is provided, the corpus run object and every downstream write use it and `startCorpusRun()` is NOT called; when absent, current behavior is unchanged. A provided runId is shape-checked in preflight via the exported `assertSafeRunId` (before any scenario/collector work), with the same deterministic `Invalid runId` error the corpus writer would raise. The console log at plan start shows the runId and `new Date().toISOString()`; the operator-facing line is added only to `bin/run-smoke.ts`.

**Ask First:** Logging from inside the orchestrator instead of the runner; accepting a non-`randomUUID` runId source (the override is for the runner to pass a UUID it generated); changing `startCorpusRun` semantics.

**Never:** No `model/schemas.ts` edits (no modelVersion change); no changes to `verify-actions.ts` or other `runTestPlan` callers' behavior; no new generated-runId source inside the orchestrator; no browser/network work; no changes to corpus writer guards or manifest shape.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| RUN_START_LOG | `npm run run:smoke` with a valid UUID | Console shows the runId + ISO timestamp at startup; corpus lands under that runId and `run-manifest.json.runId` matches | N/A |
| DEFAULT_GENERATED | `runTestPlan` without `config.runId` | `startCorpusRun()` is used; behavior byte-identical (all existing tests) | N/A |
| PROVIDED_RUNID | `config.runId = <uuid>` | Corpus + manifest use the provided id; `startCorpusRun` not called | N/A |
| EVIL_RUNID | `config.runId = "../evil"` or `run/x` | Preflight rejects with `Invalid runId …` before any session/corpus work | throw |
| PROVIDED_EMPTY | `config.runId = ""` | Preflight rejects (shape guard), same error path | throw |

</frozen-after-approval>

## Code Map

- `orchestrator/orchestrator.ts:44-48` -- `runTestPlan` signature: widen `config` to `OrchestratorConfig & { runId?: string }` and add an `if (config.runId) assertSafeRunId(config.runId);` preflight line beside `validateProbeDependencies` (`:65`), before browser launch.
- `orchestrator/orchestrator.ts:32,97` -- import `assertSafeRunId` from `./corpus.js` (already exported, corpus.ts:15); replace `const corpus = startCorpusRun();` with `config.runId ? { runId: config.runId, files: [] } : startCorpusRun()`.
- `bin/run-smoke.ts:1-20,24-58` -- import `randomUUID` from `node:crypto`; generate the runId before the config; add `runId` to the config object; add the start log beside the existing plan/modelVersion line (`:60-66`): `console.log(\`Run ${runId} — started ${new Date().toISOString()}\`);`.
- `orchestrator/orchestrator.test.ts` -- runTestPlan harness (mocks `startCorpusRun`/playwright): home for the new `PROVIDED_RUNID`/`EVIL_RUNID`/`DEFAULT_GENERATED` tests.
- Model-hash note: `model/model-version.ts:6` hashes only `contracts.ts`/`fsm.ts`/`schemas.ts` — this change touches none of them, so no plan/fixture regeneration.

## Tasks & Acceptance

**Execution:**
- [x] `orchestrator/orchestrator.ts` -- widen the config type by intersection; early `assertSafeRunId(config.runId)` preflight; honor `config.runId` instead of `startCorpusRun()`.
- [x] `bin/run-smoke.ts` -- generate a UUID, add the start log (runId + ISO timestamp), pass `runId` in the config.
- [x] `orchestrator/orchestrator.test.ts` -- tests: provided runId is used for the corpus (startCorpusRun not called) and appears in the written manifest; evil/empty runId fails preflight before launch; default path still calls `startCorpusRun`.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- mark L184 `RESOLVED (2026-09-16)` and reconcile the sweep-triage bundle line.

**Acceptance Criteria:**
- Given `npm run run:smoke`, when a run starts, then the console shows the run's UUID and an ISO timestamp, and the corpus directory + manifest carry exactly that UUID.
- Given `runTestPlan` without a runId, when it runs, then behavior is identical to today (existing tests unchanged, `startCorpusRun` used).
- Given a malformed `config.runId` (`../`, empty), when `runTestPlan` runs, then it rejects in preflight with `Invalid runId …` before any browser/session/corpus work.
- Given `npm run typecheck && npm test && npm run lint`, then all pass with `computeModelVersion()` unchanged.

## Spec Change Log

- 2026-09-16 (review loop 1) — Blind-hunter, edge-case, and verification-gap review of the runner/orchestrator diff amended the non-frozen sections. `startCorpusRun` became the single owner of the corpus-run shape with an optional `runId` parameter (the inline `{ runId, files }` literal was the only duplicate of the shape). Guard conditions unified to `config.runId !== undefined` (the mixed truthy/`!== undefined` pair was a latent reorder trap). RunId shape, typeof, and corpus-existence collision checks now run above the modelVersion gate so bad overrides reject deterministically. Early `RunResult` returns surface a provided runId. Tests now exercise the REAL `assertSafeRunId` (mock spreads `importOriginal`), and a real-fs round-trip pins the provided id across on-disk artifacts and the manifest. Runner timestamp unified to `startedAt`. Docs + JSDoc updated. Known-bad avoided: divergent-guard divergence, silent corpus merge on id reuse, mocked-guard drift, and untested operator startup line.
- KEEP: config type widened by intersection (never schemas.ts), default behavior byte-identical, preflight-before-launch, real-guard-testing convention.

## Design Notes

The override deliberately lives outside the model: `OrchestratorConfig` is declared in `model/schemas.ts`, which is part of `computeModelVersion` (AD-17), so widening the type in the `runTestPlan` signature (a pure intersection at the call boundary) preserves the model hash and avoids a plan/fixture regeneration cascade. The orchestrator stays the single owner of corpus-run creation — `config.runId` only substitutes the id, never the `files` bookkeeping. Early shape validation reuses `assertSafeRunId` from the path-trust story, so a bad override fails deterministically in preflight instead of mid-run, and the fix cost of the whole bundle stays offline-pure. `bin/run-smoke.ts` is a live top-level runner (not unit-testable), so the log path is verified by typecheck + manual live run; all logic it exercises is pinned in `orchestrator.test.ts`. The override accepts any `RUN_ID_PATTERN`-safe id; the runner's UUID is a convention, not an enforced source. The provided id is collision-checked and validated before the modelVersion gate, and `startCorpusRun(runId?)` remains the single owner of the corpus-run shape.

## Verification

**Commands:**
- `npm run typecheck` -- expected: exit 0.
- `npm test` -- expected: all suites green (existing 660 + new runId tests), `computeModelVersion()` unchanged.
- `npm run lint` -- expected: exit 0.

**Manual checks (if no CLI):**
- `npm run run:smoke` -- expected: startup log shows `Run <uuid> — started <ISO timestamp>` and the resulting `corpus/<uuid>/run-manifest.json` records that same runId.
## Suggested Review Order

**RunId contract (entry point)**

- The named `RunTestPlanConfig` intersection keeps the override out of the model-hashed schemas.ts.
  [`orchestrator.ts:40`](../../orchestrator/orchestrator.ts#L40)

- Shape + existence checks run above the modelVersion gate; one `!== undefined` condition throughout.
  [`orchestrator.ts:60`](../../orchestrator/orchestrator.ts#L60)

- `startCorpusRun(runId?)` owns the corpus-run shape; the orchestrator delegates, never re-assembles.
  [`corpus.ts:43`](../../orchestrator/corpus.ts#L43)

- A provided runId is surfaced in early failure results too.
  [`orchestrator.ts:74`](../../orchestrator/orchestrator.ts#L74)

**Operator logging**

- One timestamp source (`startedAt`), runId from the same UUID that becomes the corpus directory.
  [`run-smoke.ts:65`](../../bin/run-smoke.ts#L65)

**Regression coverage**

- Real `assertSafeRunId` in the suite; provided id asserted across corpus writes.
  [`orchestrator.test.ts:142`](../../orchestrator/orchestrator.test.ts#L142)

- Existence-collision rejection and evil/empty preflight cases.
  [`orchestrator.test.ts:191`](../../orchestrator/orchestrator.test.ts#L191)

- Real-fs round-trip: the provided id namespaces the on-disk artifacts and manifest.
  [`offline-roundtrip.test.ts:131`](../../orchestrator/offline-roundtrip.test.ts#L131)

