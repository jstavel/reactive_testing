---
title: 'Shared CLI outcome module'
type: 'refactor'
created: '2026-09-11'
status: 'done'
review_loop_iteration: 0
baseline_commit: 900a183131402dee5d463dd58d4c50efd65e7a2f
context:
  - '_bmad-output/specs/spec-report-gherkin-corpus-links/SPEC.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `validate:smoke` and `report:smoke` hand-duplicate the operator-CLI surface — outcome types, `errorOutcome`/`unknownRunOutcome`, the "No recorded run found" family, `--corpus-dir` flag parsing, and the corpus-run resolution + raw-manifest plan-version guard — and `report:smoke` imports several of them from `validate:smoke` (`bin/report-smoke.ts:56-62`), so the two CLIs can silently drift and one carries the other's baggage.

**Approach:** Extract the shared surface into a neutral `bin/cli-shared.ts` that both CLIs import — a pure, zero-behavior-change refactor: move (don't copy) each shared member, keep validate-specific contract filtering and report-specific builders where they live, and let the full test suite (525 tests) gate correctness.

## Boundaries & Constraints

**Always:**
- Pure extraction: **no logic edits**. Every moved function keeps its exact behavior, message strings, exit codes, and signature. The full suite + the operator flows (`validate:smoke example`, `report:smoke example`, `generate:sample` determinism) must stay green.
- New module `bin/cli-shared.ts` owns the cross-CLI surface: outcome types + error helpers (`errorOutcome`, `unknownRunOutcome`, `noRecordedRunOutcome`), `extractCorpusDir`/`CorpusDirArgs`, `isKnownRun`, `readRawRunManifest` + `readPlanModelVersion`, `resolveLatestRun` + the newest-run cluster (`newestKey`, `newestManifestRun`, `KIND_DIRS`), `planVersionRefusal`, and `DEFAULT_CORPUS_DIR = "corpus"`. It must not import from `validate:smoke` or `report:smoke` (no cycles; it may import from `../orchestrator/handlinks.js`, `../model/*`, `node:*`).
- `validate:smoke` keeps its validate-specific surface: `USAGE`, `ParsedArgs`/`parseArgs`, `planContractIds`/`resolveContractIds`, `ValidateOutcome` → alias of the shared outcome type, `ValidateOptions`, `validateSmoke`, `formatResult`/`formatSummary`; it re-exports the shared members it needs to keep its public/test surface stable.
- `report:smoke` drops its `./validate-smoke.js` import entirely (all borrowed members now come from `cli-shared`); it keeps `report-smoke`-specific exports (`USAGE`, `ReportOutcome` alias, `ReportOptions`, `reportSmoke`, `deriveScenarioResults`, `buildStepEvidence`).
- Every import site is updated (the two bins, plus tests that import `resolveLatestRun` and friends from `./validate-smoke.js`). If a shared name has a public test surface, re-export it for compatibility rather than breaking tests.

**Ask First:** None.

**Never:**
- No behavior/string/exit-code changes anywhere (not even "while I'm in there" cleanups to the moved code).
- No new dependencies, no renames of shipped CLI flags/messages, no changes to `package.json` scripts.
- No moving validate-specific or report-specific logic (contract filtering stays with validate; scenario derivation/buildStepEvidence stays with report).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| EXTRACTED_SURFACE | shared members imported by both CLIs from `cli-shared` | report:smoke has no `validate-smoke` import; both compile; no cycles | N/A |
| ZERO_BEHAVIOR | full suite + operator flows run | all prior tests pass unchanged (525); validate/report example + determinism green | N/A |
| TEST_IMPORTS | tests previously importing from `validate-smoke` | imports resolvable (re-export) or updated to `cli-shared` — suite green | N/A |
| VALIDATE_ONLY | `parseArgs`/contract filtering/`format*` | still exported from `validate-smoke` (unmoved) | N/A |

</frozen-after-approval>

## Code Map

- `bin/cli-shared.ts` (NEW) — the neutral home for: `CliOutcome` (`{ exitCode: 0 | 1; out: readonly string[]; err: readonly string[] }`), `errorOutcome`, `unknownRunOutcome`, `noRecordedRunOutcome`, `CorpusDirArgs`/`extractCorpusDir`, `isKnownRun`, `readRawRunManifest` (+ `readPlanModelVersion`), the newest-run cluster moved verbatim from `bin/validate-smoke.ts:201-277` (`newestKey`, `newestManifestRun`, `KIND_DIRS`, `resolveLatestRun` with its fan handling), `planVersionRefusal` (from `bin/validate-smoke.ts:184`), `DEFAULT_CORPUS_DIR`. Imports only `../orchestrator/handlinks.js`, `../model/…`, `node:*` — never the other bins.
- `bin/validate-smoke.ts` — delete the moved members locally; import from `./cli-shared.js` and re-export them (public/test surface stability); keep `ParsedArgs`/`parseArgs` (`:61-74`), `planContractIds`/`resolveContractIds` (`:104-133`), `formatResult`/`formatSummary` (`:282-299`), `ValidateOutcome` → `CliOutcome`, `ValidateOptions`, `validateSmoke`.
- `bin/report-smoke.ts` — replace the `./validate-smoke.js` import block (`:56-62`) with `./cli-shared.js` imports (`extractCorpusDir`, `isKnownRun`, `readRawRunManifest`, `planVersionRefusal`, `resolveLatestRun`, `unknownRunOutcome`, `noRecordedRunOutcome`, `errorOutcome`, `DEFAULT_CORPUS_DIR`); remove local duplicates (`errorOutcome` `:119`, `unknownRunOutcome` `:124`); `ReportOutcome` → `CliOutcome`.
- `bin/*.test.ts` — update imports that reference `resolveLatestRun` (etc.) from `./validate-smoke.js` to `./cli-shared.js` (or rely on re-exports); no test-logic changes.
- `bin/generate-sample-report.ts` — unchanged (imports `buildStepEvidence`/`deriveScenarioResults` from `report-smoke`, which stay).

## Tasks & Acceptance

**Execution:**
- [x] `bin/cli-shared.ts` (new) -- move the shared outcome/error/corpus-dir/run-resolution/planVersion surface verbatim -- one neutral home for both CLIs.
- [x] `bin/validate-smoke.ts` -- consume + re-export from `cli-shared`; keep the validate-specific surface -- no behavior drift.
- [x] `bin/report-smoke.ts` -- drop the `validate-smoke` import, import from `cli-shared`, remove local duplicates -- report stands on its own.
- [x] Tests -- update shared-name imports across the suites -- suite green against the new module layout.

**Acceptance Criteria:**
- Given the refactor, when the two CLIs compile, then neither `validate:smoke` nor `report:smoke` holds a private copy of `errorOutcome`, `unknownRunOutcome`, `unknownRun`, `extractCorpusDir`, `resolveLatestRun`, `readRawRunManifest`, or `planVersionRefusal` — each exists exactly once in `cli-shared`.
- Given the refactor, when `report:smoke` is read, then it contains **no** `./validate-smoke.js` import (it depends on the neutral module, not its sibling).
- Given the full suite, when `npm run typecheck` + `npm test` run, then they are green with the same case set as before the refactor (no test was changed to accommodate the move beyond its import line).
- Given the operator flows, when `validate:smoke example` (18/18) and `report:smoke example` (14/14) run, then behavior and output are identical to pre-refactor, and `generate:sample` determinism stands (run twice → `git diff` empty).

## Design Notes

The previous shape had `report:smoke` importing from `validate:smoke` — a sibling-CLI dependency that made "validate" the accidental home of shared logic. `cli-shared` is that logic's neutral home; both CLIs become peers of it. Because this is a pure move, the existing 525 tests are the acceptance gate rather than any new unit coverage — new tests would be testing the extraction, not the system.

## Verification

**Commands:**
- `npm run typecheck` — expected: no errors
- `npm test` — expected: 29 files / 525 tests green (only import lines touched)
- `npm run validate:smoke -- example --corpus-dir corpus` — expected: 18/18, exit 0
- `npm run report:smoke -- example --corpus-dir corpus` — expected: 14/14, both reports written, exit 0
- `npm run generate:sample` twice + `git diff --exit-code -- corpus/example corpus/snapshots/example corpus/probes/example` — expected: empty

**Manual checks (if no CLI):**
- `grep -c "validate-smoke" bin/report-smoke.ts` → 0 (the sibling import is gone).

## Spec Change Log

<!-- Append-only -- populated by step-04 on review loopback. -->


## Suggested Review Order

**The neutral home**

- One module owns the whole shared operator-CLI surface — outcome, error helpers, flag parsing, run resolution, plan-version refusal
  [`cli-shared.ts:1`](../../../../bin/cli-shared.ts#L1)

- The newest-run cluster + fan fallback moved verbatim (byte-identical vs baseline)
  [`cli-shared.ts:233`](../../../../bin/cli-shared.ts#L233)

- The plan-version refusal semantics (LEGACY/MISMATCH) now live in one place
  [`cli-shared.ts:143`](../../../../bin/cli-shared.ts#L143)

**Consumers**

- validate:smoke consumes + re-exports; the validate-specific surface (contract filtering, format*) stays home
  [`validate-smoke.ts:40`](../../../../bin/validate-smoke.ts#L40)

- report:smoke now depends on cli-shared only — the sibling import is gone
  [`report-smoke.ts:imports`](../../../../bin/report-smoke.ts#L56)

**Supporting**

- Single-home topology pin — the 8 shared names exist as definitions exactly once
  [`cli-shared.test.ts`](../../../../bin/cli-shared.test.ts)

- Import-line-only test updates (validate/report/generate suites)
  [`validate-smoke.test.ts:12`](../../../../bin/validate-smoke.test.ts#L12)
