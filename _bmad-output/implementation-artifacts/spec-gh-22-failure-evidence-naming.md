---
title: 'Per-step failure evidence naming (gh-22)'
type: 'bugfix'
created: '2026-09-09'
baseline_commit: '6c764e74516d5f3e94c3be87bfe86ee081cb3b5a'
status: 'done'
review_loop_iteration: 0
context:
  - _bmad-output/implementation-artifacts/deferred-work.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Every failed step writes its failure evidence to the same fixed names — `snapshots/<runId>/failure.json` and `screenshots/<runId>/failure.png` (+ `failure.json` ref) — so when several steps fail in one run, later failures silently overwrite earlier ones. Run `353dbf5a…` (issue #22) recorded four step failures, and the manifest's three screenshot references all resolve to one final image; the earlier failure evidence is unrecoverable.

**Approach:** Name failure evidence per step, reusing the corpus's existing stem conventions: scenario-step failures write `<stepIndex>.failure.*` and bootstrap-step failures write `b.<scenarioId>.<stepIndex>.failure.*` — the same phase-tagging scheme the pre-step snapshots already use (`0.pre.json`, `b.<scenarioId>.<stepIndex>.pre.json`). Each failed step then keeps its own snapshot + screenshot.

## Boundaries & Constraints

**Always:**
- Failure evidence is phase-tagged and per-step: scenario steps → stem `<stepIndex>.failure`; bootstrap steps → stem `b.<scenarioId>.<stepIndex>.failure` (snapshot JSON, screenshot PNG, and screenshot-ref JSON each get the matching stem + their own extension).
- The manifest `files[]` keeps recording every written path, so each failure's evidence is individually addressable via the manifest and `corpus/@last-fail`.
- `writeCorpusFile`'s stem behavior is unchanged — the orchestrator simply stops passing the fixed `"failure"` stem and passes the per-step one instead.
- Offline consumers stay untouched: `validators/corpus-loader.ts` reads only `{stepIndex}.pre.json` / `{stepIndex}.json`; the failure.feature / adjudication reporters consume the manifest `failures[]`, not failure stems.

**Ask First:** none — the change is mechanical and covered by the existing `0.failure` naming precedent in `corpus.test.ts`.

**Never:**
- No change to `StepFailure`, `ScreenshotRef`, `RunManifest` schemas, collector behavior, or the failure.feature / adjudication artifacts.
- No fix here for the live smoke timeouts themselves (Earn navigation, History ledger actions) — that investigation is a separate deferred item under issue #22.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| MULTI_STEP_FAIL | two scenario steps fail in one run | evidence at `<i>.failure.*` per failing step; no overwrites; manifest lists both | N/A |
| BOOTSTRAP_FAIL | a bootstrap step fails | evidence at `b.<scenarioId>.<stepIndex>.failure.*`, disjoint from scenario-step names | N/A |
| MIXED_SAME_STEP | pre-snapshot and failure capture for the same step | `<i>.pre.json` and `<i>.failure.json` coexist (different stems, same index) | N/A |
| BEST_EFFORT_FAIL | failure-capture itself throws (e.g. screenshot fails) | that artifact is absent (swallowed, per Story 2.7); other evidence unaffected | gap stays best-effort, never aborts the run |

</frozen-after-approval>

## Code Map

- `orchestrator/orchestrator.ts` -- `recordStepFailure` (lines ~671-720) writes three artifacts with the fixed stem `"failure"` (lines 688, 698, 706); the call site in `executeScenario`'s catch (line ~534) has `phase` and `scenario.id` in scope but does not pass them. `corpusStem` (line ~640) already defines the `<stepIndex>.pre` / `b.<scenarioId>.<stepIndex>.<suffix>` conventions to mirror.
- `orchestrator/corpus.ts` -- `writeCorpusFile(corpusDir, run, kind, stepIndex, ext, data, stem?)`: stem override is the only mechanism needed; no changes expected.
- `orchestrator/orchestrator.test.ts` -- lines ~939-941 (and the CDP-path failure tests) assert stems `"failure"`; they pin the NEW per-step stems after the change.
- `orchestrator/corpus.test.ts` -- line ~109 already pins the `0.failure` stem convention this story adopts for real failure captures.
- `validators/corpus-loader.ts` / `reporter/*` -- read-only confirmation: nothing consumes failure stems (grep `\.failure` shows only orchestrator-internal writes and the separate `failure.feature` reporter artifact).

## Tasks & Acceptance

**Execution:**
- [x] `orchestrator/orchestrator.ts` -- extend `corpusStem` (or thread a stem through `recordStepFailure`) so failure evidence uses `<stepIndex>.failure` for scenario steps and `b.<scenarioId>.<stepIndex>.failure` for bootstrap steps; pass `phase`/`scenario.id` from the catch site -- close the overwrite loop
- [x] `orchestrator/orchestrator.test.ts` -- update the two `"failure"` stem assertions to the per-step stems; add multi-failure and bootstrap-failure tests proving distinct evidence paths -- pin the no-overwrite guarantee
- [x] `orchestrator/corpus.test.ts` -- extend the `0.failure` naming test to cover the bootstrap form `b.<scenarioId>.<stepIndex>.failure` -- keep the writer contract aligned

**Acceptance Criteria:**
- Given a plan where two steps fail, when the run completes, then the manifest lists two distinct failure snapshot paths and two distinct screenshot paths (no shared `failure.*` name).
- Given a bootstrap step failure, when evidence is captured, then its stems carry the `b.<scenarioId>.<stepIndex>.failure` prefix and never collide with scenario-step failure names.
- Given a step whose failure capture itself fails, when the run finishes, then that artifact is simply absent (best-effort preserved) and the run still finalizes.
- Given the offline pipeline, when validators and the reporter run over a corpus recorded after this change, then their behavior is unchanged (they never read failure stems).

## Spec Change Log

<!-- Append-only. Populated by step-04 during review loops. Do not modify or delete existing entries. -->

- **2026-09-09 (review round 1)** — Verification-gap review required direct coverage for actual bootstrap failure evidence, not only the writer contract. Added an orchestrator test that fails a `navigateHome` bootstrap action and asserts the `b.<scenarioId>.<stepIndex>.failure` stem; frozen intent unchanged.

## Design Notes

- The repo already solved this class of bug once for pre-step snapshots (retro F1 introduced `{stepIndex}.pre.json`); this story applies the identical treatment to failure captures. `corpus.test.ts:109` even pinned the `0.failure` stem in anticipation.
- Keep `recordStepFailure` swallowing capture errors (AD-16-style best-effort): a missing artifact for one step must never fail the run.

## Verification

**Commands:**
- `npm run typecheck` -- expected: exits 0
- `npm test` -- expected: exits 0, including the updated failure-stem assertions and the new multi-failure no-overwrite test

**Manual checks:**
- Inspect `corpus/@last-fail` after a failing live run: per-step `*.failure.png` files exist for each failed step, and the manifest's screenshot references point to distinct paths.

## Suggested Review Order

**Failure stem generation**

- Per-step failure stems mirror existing pre-snapshot naming and distinguish bootstrap phases.
  [`orchestrator.ts:640`](../../orchestrator/orchestrator.ts#L640)

- The failure capture writes snapshot, screenshot, and sidecar under the computed stem.
  [`orchestrator.ts:671`](../../orchestrator/orchestrator.ts#L671)

**Regression coverage**

- Two failed scenario steps prove no shared `failure.*` path remains.
  [`orchestrator.test.ts:965`](../../orchestrator/orchestrator.test.ts#L965)

- A real bootstrap failure proves the phase-specific stem reaches orchestrator output.
  [`orchestrator.test.ts:602`](../../orchestrator/orchestrator.test.ts#L602)

- The corpus writer's generic stem contract includes the bootstrap form.
  [`corpus.test.ts:100`](../../orchestrator/corpus.test.ts#L100)

**Pipeline boundary**

- Existing loaders/readers remain unchanged and continue ignoring failure stems.
  [`corpus-loader.ts:115`](../../validators/corpus-loader.ts#L115)