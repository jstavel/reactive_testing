---
title: 'Operator CLI generates the report from a recorded run'
type: 'feature'
created: '2026-09-10'
status: 'done'
review_loop_iteration: 0
baseline_commit: 848e4da64146e5f6d5b7a2f6abdd66457bddadd8
context:
  - '_bmad-output/specs/spec-test-run-report/SPEC.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The HTML report generator (`reporter/html-report.ts`) is implemented and tested but no operator path produces a report — `emitHtmlReport` only runs in its own unit tests, so no corpus run ever contains a `report.html` (SPEC-test-run-report CAP-6; wiring half of epic-4 retro item-5).

**Approach:** Add a `report:smoke` CLI (`bin/report-smoke.ts`) that — offline, over a recorded corpus run — re-derives per-scenario results through the offline validator runner and writes the self-contained report to `{corpusDir}/{runId}/report.html` via `emitHtmlReport`. Argument/error surface mirrors `bin/validate-smoke.ts`.

## Boundaries & Constraints

**Always:**
- Offline-only: reads recorded corpus evidence plus `model/` and `features/`; never launches a browser or executes actions. Sole side effect: writing `report.html` into the resolved run dir.
- Positional-only args `[<runId>]`; `-`/`--` flags rejected; runId shape-guarded via the shared `RUN_ID_PATTERN` before any fs access.
- Write the report regardless of check outcomes (a failing report is the most valuable one); exit 1 when any check failed, 0 only when all passed.
- Per-scenario results derive deterministically from validation results consumed in plan-step order per contractId (SPEC assumption; demo-verified on corpus `efcb749d`).

**Ask First:**
- Changes to `reporter/html-report.ts`, `reporter/gherkin-snapshot.ts`, `validators/offline-runner.ts`, `orchestrator/handlinks.ts` (read-only reuse points); adding step evidence to the report; new CLI flags.

**Never:**
- Re-running scenarios, browser, CDP, AI in the loop (NFR-1).
- `report` variants of other plans — smoke plan only (mirrors `validate:smoke`).
- Dashboard, server, or multi-file output (SPEC non-goal: single self-contained file).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path | no args → latest run; or explicit known `<runId>` | report written to `{corpusDir}/{runId}/report.html`; path + scenario/check summary on stdout; exit 0 iff all checks passed | N/A |
| Failing checks | some validators fail | report still written (FAIL bar); exit 1; failed scenarios red | N/A |
| Unknown run | unknown runId | no report; `Unknown run …` + usage on stderr; exit 1 | mirrors `unknownRunOutcome` |
| No recorded run | no args, empty corpus | `No recorded run found …` on stderr; exit 1 | mirrors validate-smoke |
| Zero checks | known run, unreadable manifest / stepless plan | report NOT written; `no checks ran …` on stderr; exit 1 | mirrors zero-results guard |
| Flag misuse | `--run xyz` | `Invalid argument(s) …` + usage on stderr; exit 1 | mirrors positional-only guard |

</frozen-after-approval>

## Code Map

- `reporter/html-report.ts:62` -- `emitHtmlReport({corpusDir, run, plan, results, relations, gherkinSource, stepEvidence})` writes `{corpusDir}/{runId}/report.html`. READ-ONLY reuse; omit `stepEvidence` in v1.
- Report inputs: `buildGherkinSnapshot('features', relations)` (`reporter/gherkin-snapshot.ts:28`), `relations` (`model/relations.ts:33`), run `{runId, timestamp}` parsed from `{corpusDir}/{runId}/run-manifest.json`. All READ-ONLY.
- `model/smoke.test-plan.ts:15` -- `smokeTestPlan` (planId `"smoke"`).
- `validators/offline-runner.ts:25` -- `runValidatorsOffline(corpusDir, runId, plan, contractIds?)` → `ValidationResult[]` in plan-step order, never throws. READ-ONLY; call unfiltered.
- `bin/validate-smoke.ts` -- mirror surface: `CORPUS_DIR`/env override (:29,:241), `USAGE` (:30), flag guard (:237), `RUN_ID_PATTERN`/`isKnownRun` gate (:286), exported `resolveLatestRun` (:166 — import, don't duplicate), pure `validateSmoke(argv, options) → {exitCode, out, err}` + `errorOutcome`, `import.meta.url === pathToFileURL(...)` main-guard.
- `orchestrator/handlinks.ts:23` -- shared `RUN_ID_PATTERN`. READ-ONLY.
- `bin/validate-smoke.test.ts:385-410` -- process-test pattern: temp corpus fixture (`writeRunManifest` + snapshots), spawn `npm run --silent <script>` with `CORPUS_DIR` env, assert stdout + exit; :410 expiry-pinned 18/18 pattern.
- `package.json:10-18` -- scripts block; add `"report:smoke": "tsx bin/report-smoke.ts"`.
- Prototype `/tmp/opencode/report-demo.ts` -- verified derivation: per-contractId queues consumed by first referencing scenario; 18/18 checks → 14/14 scenarios on corpus `efcb749d`.

## Tasks & Acceptance

**Execution:**
- [x] `bin/report-smoke.ts` -- new CLI mirroring validate-smoke's skeleton (Code Map): positional runId defaulting to `resolveLatestRun`, the four error guards, manifest timestamp, unfiltered `runValidatorsOffline`, `ScenarioResult[]` via exported pure `deriveScenarioResults(plan, results)`, `emitHtmlReport` + relations + Gherkin snapshot, print report path + summary, exit code -- core deliverable.
- [x] `bin/report-smoke.test.ts` -- unit tests for `deriveScenarioResults` (same-contract multi-step consumption, order, aggregation); process-level spawn tests for every I/O-matrix scenario, mirroring validate-smoke test patterns.
- [x] `package.json` -- add the `report:smoke` script.

**Acceptance Criteria:**
- Given the latest recorded corpus run, when `npm run report:smoke` runs, then `{corpusDir}/{runId}/report.html` exists, opens standalone, and shows a green PASS bar with 14/14 scenarios on corpus `efcb749d`.
- Given a run whose validators fail, when the CLI runs, then the report is still written with a red FAIL bar and the CLI exits 1.
- Given an unknown runId, no recorded run, an unreadable manifest, or a flag argument, then the CLI prints the same class of stderr error + usage as `validate:smoke` and exits 1 without writing any file.
- Given `npm test`, then the new tests pass and the full suite stays green.

## Spec Change Log

## Design Notes

Derivation (demo-verified): one queue of validation results per contractId; each scenario consumes its steps' contracts' queues in plan order — every result lands in exactly one scenario (the first referencing it). Scenario passes iff no consumed check failed; zero-checks guard still fails the run when nothing ran. Report write precedes the exit-code decision: the operator always gets the artifact, CI sees failure via exit code.

Implemented-as notes (2026-09-10, story 6 build):

- Queue semantics implemented as ownership of failures: a contract's results are consumed whole by the first scenario (plan order) referencing it in a step, so `deriveScenarioResults` maps each failed result to that one owning scenario — observationally identical to the prototype's `splice(0)` drain, expressed immutably. A scenario with zero consumed checks passes (no veto), matching the demo.
- "Positional-only `[<runId>]`" is enforced exactly: any `-`-prefixed arg AND any second positional is rejected with `Invalid argument(s): … — only positional [<runId>] is accepted.` + usage (extra positionals have no meaning here and are never silently dropped).
- Stdout format: `Report written: {corpusDir}/{runId}/report.html` then `X/Y scenarios passed (N checks)` (e.g. `14/14 scenarios passed (18 checks)`); stderr mirrors validate-smoke's message families verbatim (unknown run / no recorded run / no checks ran / invalid arguments), each with `Usage: npm run report:smoke -- [<runId>]`.
- Unreadable manifest resolves to the zero-checks guard before any write (the offline loader also yields zero results for one), so no report is ever written without a readable manifest.
- Spawn fixtures reconstruct a fully-valid 18-step corpus for the real smoke plan (pre/post snapshots + view-selected probes incl. `selected-board-tab` for `selectOrderBookTab`); the failing-path test corrupts step 1's post URL so exactly one check fails → 13/14 scenarios, exit 1, red bar.
- Added an expiry-pinned spawn test against the latest recorded corpus run (mirrors validate-smoke's 18/18 pin; degrades to a skip where no corpus exists).

## Verification

**Commands:**
- `npm run report:smoke` -- expected: writes `corpus/efcb749d-…/report.html`, prints path + `14/14 scenarios passed (18 checks)`, exit 0.
- `npx tsx bin/report-smoke.ts unknown-run` -- expected: stderr `Unknown run "unknown-run" …` + usage, exit 1, no file written.
- `npm test` -- suite green including new tests; `npm run typecheck` -- 0 errors.

## Suggested Review Order

**Derivation — the spec's core decision**

- Queue-consumption derivation: a contract's results owned by its first referencing scenario; pure and exported for unit pinning.
  [`report-smoke.ts:58`](../../../../bin/report-smoke.ts#L58)

**CLI surface — mirror of validate:smoke**

- Whole CLI as a pure function over argv + corpus state; guards in spec order (flags → unknown run → no run → zero checks).
  [`report-smoke.ts:135`](../../../../bin/report-smoke.ts#L135)

- Lenient manifest read; unreadable/timestamp-less both map to the zero-checks error family.
  [`report-smoke.ts:117`](../../../../bin/report-smoke.ts#L117)

**Report write + exit contract**

- Report written even when checks fail; write failures land in the error family, never a raw stack trace.
  [`report-smoke.ts:184`](../../../../bin/report-smoke.ts#L184)

- Exit code reads ALL validation results (frozen "any check failed"), not just scenario-owned ones.
  [`report-smoke.ts:208`](../../../../bin/report-smoke.ts#L208)

**Tests**

- Hoisted ghost-contract toggle: exit 1 for an unowned failing result while stdout stays scenario-derived.
  [`report-smoke.test.ts:26`](../../../../bin/report-smoke.test.ts#L26)

- Derivation unit pins: whole-queue consumption, plan order, shared-contract second-consumer failure.
  [`report-smoke.test.ts:216`](../../../../bin/report-smoke.test.ts#L216)

- EISDIR-backed write-failure test and the strengthened only-report.html mutation assertion.
  [`report-smoke.test.ts:371`](../../../../bin/report-smoke.test.ts#L371)

- Process-level operator surface + expiry-pinned 14/14 regression against the real corpus.
  [`report-smoke.test.ts:516`](../../../../bin/report-smoke.test.ts#L516)

**Peripherals**

- The script that makes the CLI reachable.
  [`package.json:15`](../../../../package.json#L15)
