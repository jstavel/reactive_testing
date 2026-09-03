---
title: 'Epic 4 fix-now hardening (repro continuity, repro timeouts, cross-view normalize boundary)'
type: 'bugfix'
created: '2026-09-03'
status: 'done'
review_loop_iteration: 1
baseline_commit: '479bf3d334f77f2cbdfb3f8de5b58e42368b5dab'
context:
  - '_bmad-output/implementation-artifacts/epic-4-retro-09-02-2026.md'
---

## Intent

**Problem:** The Epic 4 retrospective flagged three fix-now defects: the emitted repro validates each step in isolation but never whole-path runnability (a disjoint-but-valid path emits a repro that cannot execute — FR-12 boundary, retro item-1); the emitted repro has no timeout discipline, so a hung navigation or action hangs forever (item-2); and the cross-view `normalize` has no exception boundary, so a throwing normalizer aborts the whole run and an empty `invariantId`/`probeName` is accepted (item-3).

**Approach:** Make `repro-generator.ts` enforce whole-path continuity (first step starts at `initialStateId`; each next step's `stateId` equals the previous transition's `to`) at generation time AND in the emitted runtime guard, and add timeout discipline (goto timeout + a `STEP_TIMEOUT_MS` race around each action). Harden `validators/cross-view.ts`: wrap `normalize` in an exception boundary returning a failed result, treat normalized-empty as missing evidence, and reject empty `invariantId`/`probeName` at registry declaration.

## Boundaries & Constraints

**Always:**
- Continuity rule (accepted: "reproduces the failure" = whole-path runnability): step 1 starts at `homePageModel.initialStateId`; for every step `i`, `homePageModel.transitions` must map step `i`'s `(stateId, contractId)` to a `to` that equals step `i+1`'s `stateId` — mirrored in `validatePath` (throw = gap, FR-12c) and in the emitted runtime guard (throw naming the step).
- Timeout discipline mirrored from the Orchestrator's `withTimeout` (`orchestrator/orchestrator.ts:503`): `page.goto(BASE_URL, { timeout: STEP_TIMEOUT_MS })` and each `await action({ page })` raced against `STEP_TIMEOUT_MS`.
- Cross-view: a throwing `invariant.normalize` yields a FAILED `ValidationResult` (never a throw) naming the invariant + surface; a raw value that normalizes to empty is missing evidence (fails loudly); `assertRegistryEntryGaps` rejects empty `invariantId` and empty `probeName`.
- Reporter/validator conventions respected: failures are results, never throws at run time; entry-time declaration gaps may throw.

**Ask First:**
- Whether "reproduces the failure" (FR-12) includes whole-path runnability. Assumed YES per the user's "go #1" after the retro's fix-now proposal; confirm at checkpoint. **RESOLVED (2026-09-03):** confirmed at checkpoint — "reproduces the failure" includes whole-path runnability; the continuity + initial-state rule is the accepted definition.

**Never:**
- No conduit/capture changes: this story does not make the runner measure timing or capture screenshots for the tested report feature.
- No change to the Orchestrator's own `validatePlan` (it already enforces continuity) or to `withTimeout`.
- No new public API surface beyond the existing `generateReproScript`/`writeReproScript` and `runCrossViewInvariants`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| DISJOINT_PATH | `steps` where step1 leads elsewhere but step2 starts elsewhere | throw naming the step pair | gap: `step N leads to "X" but next step starts from "Y"` |
| NOT_STARTING_AT_INITIAL | first step `stateId` != `initialStateId` | throw naming it | gap: `repro must start at initial state "homePage"` |
| VALID_CONTINUOUS_PATH | step1 from initial + each next = previous `to` | emits; runtime guard additionally enforces continuity | N/A |
| HUNG_ACTION | an action that never resolves | the action promise races `STEP_TIMEOUT_MS` and rejects as a step failure | error names the step + timeout |
| NORMALIZE_THROWS | `normalize` throws on a recorded value | FAILED result naming invariant + surface; run continues | not a throw — a failed `ValidationResult` |
| NORMALIZE_EMPTY | raw value non-empty but `normalize` returns `""` | treated as missing evidence for that surface | fails loudly |
| EMPTY_INVARIANT_ID | registry entry with `invariantId: ""` | entry-time throw naming it | declaration gap throw |
| EMPTY_PROBE_NAME | registry entry with `probeName: ""` | entry-time throw naming it | declaration gap throw |
| EQUAL_CAPTURED_AT | two candidate observations, same `capturedAt` | ties keep first-in-plan-order (deterministic) | N/A |

## Code Map

- `repro/repro-generator.ts` -- `validatePath` (lines 188-223) currently checks per-step only; add first-step-initial + next-step-`to` continuity. Emitted script template (lines 66-158): `page.goto(BASE_URL)` (line 101) has no timeout; `await action({ page })` (line 130) is awaited bare; add goto timeout, a local `withTimeout`-style race, and a runtime continuity guard (build `transition → to` map from `homePageModel.transitions`, mirror `orchestrator/orchestrator.ts:219-239`). `homePageModel.initialStateId` (`model/fsm.ts:83`) = "homePage".
- `repro/repro-generator.test.ts` -- add DISJOINT_PATH, NOT_STARTING_AT_INITIAL, VALID_CONTINUOUS gap tests; assert emitted script contains goto timeout, a step-timeout race on the action, and a runtime continuity + initial-state guard. Existing fixtures already use a continuous path starting at homePage, so `validPath()` continues to pass.
- `validators/cross-view.ts` -- `checkInvariant` (lines 137-203) calls `invariant.normalize(observation.value)` (line 183) bare; wrap in try/catch → failed `ValidationResult`; treat normalized-empty as missing evidence. `assertRegistryEntryGaps` (lines 93-125) add empty `invariantId`/`probeName` rejection.
- `validators/cross-view.test.ts` -- add NORMALIZE_THROWS, NORMALIZE_EMPTY, EMPTY_INVARIANT_ID, EMPTY_PROBE_NAME, EQUAL_CAPTURED_AT tests. Follow the existing push/pop registry mutation pattern used throughout this file.

## Tasks & Acceptance

**Execution:**
- [x] `repro/repro-generator.ts` -- add whole-path continuity + first-step-initial to `validatePath`; add goto timeout, per-action timeout race, and continuity/initial runtime guard to the emitted template -- closes retro item-1 (generation + runtime).
- [x] `repro/repro-generator.test.ts` -- unit-test the new gap rules and assert the emitted script's timeout + continuity guards -- pins the fix.
- [x] `validators/cross-view.ts` -- normalize exception boundary (failed result) + normalized-empty-as-missing; extend `assertRegistryEntryGaps` for empty `invariantId`/`probeName` -- closes retro item-3.
- [x] `validators/cross-view.test.ts` -- unit-test the matrix rows -- pins the fix.

**Acceptance Criteria:**
- Given a disjoint or non-initial repro path, when `generateReproScript` runs, then it throws a gap naming the offending step (never emits).
- Given a valid continuous path, when the repro is emitted, then its runtime guard enforces the same continuity + initial-state rule and races the goto and each action against `STEP_TIMEOUT_MS`.
- Given a cross-view invariant whose `normalize` throws for a recorded value, when `runCrossViewInvariants` runs, then it returns a failed `ValidationResult` naming the invariant and surface and does not abort the run.
- Given a raw value whose `normalize` yields empty, when checked, then that surface is missing evidence and the invariant fails loudly.
- Given a registry entry with empty `invariantId` or `probeName`, when `runCrossViewInvariants` runs, then it throws at entry naming the field.
- `npm run typecheck` and `npm test` exit 0.

## Spec Change Log

## Design Notes

Continuity is a stricter, repro-specific rule than the Orchestrator's `validatePlan` (which never requires the first step to be the initial state — plan scenarios may start mid-path after loading home). The repro is generated for a fresh `page.goto(BASE_URL)` → homePage, so first-step-initial is a correct requirement here. The disjoint step-pair and initial-state checks are mirrored verbatim between `validatePath` (generation, throw = gap) and the emitted runtime guard (throw naming step), keeping the emitted script honest against a later spec edit that retires a transition.

TODO: normalize-empty. The seed invariant's normalize only trims whitespace. To make NORMALIZE_EMPTY reachable and tested without changing the seed's semantics, the test injects a throw/empty-normalizing registry entry via the existing push/pop pattern.

## Verification

**Commands:**
- `npm run typecheck` -- expected: exits 0
- `npm test` -- expected: all tests pass (240 existing + new)

**Manual checks (if no CLI):**
- Generated repro for the existing `validPath()` still typechecks under the project tsconfig.
