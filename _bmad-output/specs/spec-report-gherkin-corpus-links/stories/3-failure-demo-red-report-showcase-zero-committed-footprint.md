---
title: 'Failure demo — red report showcase, zero committed footprint'
type: 'feature'
created: '2026-09-11'
status: 'done'
review_loop_iteration: 0
baseline_commit: 0feb2159f857a0162a66699ce64f32640774de43
context:
  - '_bmad-output/specs/spec-report-gherkin-corpus-links/SPEC.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The committed storyboard proves the pipeline passes, but the product's real value — a failing check surfaced as a reviewable FAIL report with expected-vs-actual diagnostics — is invisible until something breaks. No failing evidence may live in the repo (a red demo signal poisons the job-search story), so the failure face needs a way to be shown without any committed failing footprint.

**Approach:** Extend the sample generator with a `--fail` mode that deterministically mints a throwaway failing fixture (one deliberately broken contract) under a reserved, gitignored runId (`fail-demo`) and emits the red `report.html`/`report.json` through the same pure emitters — an on-demand red report with zero committed corpus footprint.

## Boundaries & Constraints

**Always:**
- `--fail` output uses runId `fail-demo` (new shared `FAIL_DEMO_RUN_ID`), written only under `corpus/fail-demo/`, `corpus/snapshots/fail-demo/`, `corpus/probes/fail-demo/` — paths git already ignores (the S2 un-ignore exposes only the `example` subtrees). No `@` handoff files, no network/screenshots dirs.
- Deterministic failure: exactly **one** check fails — the url-is postcondition of step 3's contract (`clickPortfolioMenuMain`), by corrupting its post-snapshot url pathname to `/app/portfolio/futures` — so the owning scenario (`clicking-main-opens-the-portfolio-page-with-the-main-view`) fails red. The red report shows `url-is "/app/portfolio/main" but url pathname is "/app/portfolio/futures"`. All other 17 checks pass (13/14 scenarios pass).
- `--fail` self-check asserts the **expected failure signature**: failure-count `1`, that contractId, that detail. Any other outcome (recipe regression, zero checks, wrong count/contract/detail) is an error: exit 1 + full rollback of the fail-demo subtrees. Nothing half-written survives.
- `--fail` exits 0 only when the demo generated as expected (a failing report is the successful demo output) and prints where the throwaway report lives with an explicit "not tracked / not committed" note.
- Cleanup/write machinery is parameterized by runId: `--fail` removes only the `fail-demo` subtrees, never the `example` fixture nor other corpus content (mutual isolation with S2's pass mode).
- Implicit newest-run resolution skips `FAIL_DEMO_RUN_ID` too (alongside `SAMPLE_RUN_ID`), so the throwaway demo never hijacks a machine's default `validate:smoke`/`report:smoke`; an explicit `fail-demo` runId still resolves.
- `report.json` from a `--fail` run is the same contract (`schema: report.v1`, failing scenario `passed:false` + `error`, rest pass) — emitted by the same pure emitters.
- No CI/gate integration — the demo is a manual dev tool; CI stays conclusively green (S4 must not run `--fail`).

**Ask First:** None.

**Never:**
- No failing evidence committed: `corpus/fail-demo/**` stays gitignored.
- No CI/gate integration for the fail demo.
- No browser in the report path (the README screenshot is a deferred follow-up story).
- No real data anywhere — same mock recipe as `example`, with one hand-placed defect.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_DEMO | `generate:sample --fail` over a clean corpus | fail-demo subtree + red report pair; 17p/1f checks, 13/14 scenarios; exit 0; expected failure detail printed | N/A |
| REGEN | second `--fail` on the same root | fail-demo output byte-identical | N/A |
| VALIDATION_SIGNATURE | fail mode sees an unexpected outcome (recipe regression) | exit 1, fail-demo subtrees rolled back, no reports survive | error + exit 1 |
| ISOLATION | `example` fixture + unrelated run present; `--fail` runs | example/unrelated bytes untouched; only fail-demo subtrees written/removed | N/A |
| UNKNOWN_FLAG | `generate:sample --bogus` | Invalid-argument + usage, exit 1 (`--fail` is the only new flag) | guard unchanged |
| NEWEST_SKIP | default (no runId) over a corpus with a real run + fail-demo | real run wins; explicit `fail-demo` still resolves | N/A |

</frozen-after-approval>

## Code Map

- `bin/sample-run-id.ts:17` — `FAIL_DEMO_RUN_ID = "fail-demo"` beside `SAMPLE_RUN_ID` (`:8`).
- `bin/generate-sample-report.ts` — the `--fail` path:
  - `GenerateSampleOptions` (`:182`) gains `readonly fail?: boolean` (`:187`); `main()` (`:518`) parses `--fail` (the only newly accepted flag) before the flag guard — the Invalid-argument error lists only the rejected arguments, never the accepted `--fail` — combining with the positional corpus root.
  - Evidence mint per runId (`fixtureEvidenceFiles(plan, runId, fail)`, `:258`); in fail mode an inline conditional corrupts the defect contract's (`clickPortfolioMenuMain`) post-snapshot `url` → `https://pro.kraken.com/app/portfolio/futures` — the single hand-placed defect, not a mutation table.
  - Self-check flips in fail mode: expect exactly 1 failing result with `contractId === "clickPortfolioMenuMain"` and the url-is detail; success → emit the red `report.html`/`report.json` for run `fail-demo`; any mismatch → rolled-back failure (exit 1).
  - `removeFixtureSubtrees` (`:323`) parameterized by runId (`example` vs `fail-demo`); the catch path uses the fail-demo subtrees in fail mode.
- `bin/validate-smoke.ts:180-209` — `newestManifestRun` filter/fallback excludes `FAIL_DEMO_RUN_ID` (import from `./sample-run-id.js`); `resolveLatestRun` (`:214`) also falls through to manifest resolution when the `@last-run` fan resolves to `fail-demo`.
- `bin/generate-sample-report.test.ts` — fail-mode describe: HAPPY_DEMO, REGEN, manifest pin, ONE_DEFECT delta, VALIDATION_SIGNATURE rollback, ISOLATION (incl. rollback over a seeded corpus), UNKNOWN_FLAG; plus NEWEST_SKIP, fan-bypass, and FAIL_DEMO_E2E (real red consumption) tests in `bin/validate-smoke.test.ts` / `bin/report-smoke.test.ts`.
- `reporter/*`, `validators/*`, `corpus/example` trees — READ-ONLY (reused unchanged).

## Tasks & Acceptance

**Execution:**
- [x] `bin/sample-run-id.ts` -- add `FAIL_DEMO_RUN_ID` -- reserved runIds stay single-sourced.
- [x] `bin/generate-sample-report.ts` -- `--fail` mode: one-defect mint + signature self-check + runId-parameterized rollback + updated USAGE -- the red-report producer.
- [x] `bin/validate-smoke.ts` -- newest-run resolution (`newestManifestRun` filter/fallback + the `@last-run` fan bypass) excludes `fail-demo`; `report:smoke` consumes it via `resolveLatestRun` imported from `bin/validate-smoke.ts` -- the throwaway never hijacks the default.
- [x] `bin/generate-sample-report.test.ts` -- fail-mode tests (HAPPY_DEMO, REGEN determinism, VALIDATION_SIGNATURE rollback, ISOLATION, UNKNOWN_FLAG) -- the demo contract is pinned.
- [x] `bin/validate-smoke.test.ts` / `bin/report-smoke.test.ts` -- NEWEST_SKIP coverage for `fail-demo` -- default resolution stays real-run-first.

**Acceptance Criteria:**
- Given `npm run generate:sample -- --fail`, when it completes, then `corpus/fail-demo/` holds a failing fixture whose fail-mode self-check passed (exactly one check failed with the expected contract + url-is detail), a red `report.html` + `report.json` (`schema: report.v1`, failing scenario `passed:false` + `error`) were written, and the exit code is `0`.
- Given a second `generate:sample --fail` into the same root, when the fail-demo outputs are compared, then they are byte-identical.
- Given both the pass-mode `example` fixture and a `--fail` run on the same corpus, then the `example` trees and any unrelated corpus content are byte-untouched (only fail-demo subtrees written/removed).
- Given a corpus with a real recorded run and the fail-demo run, when default `validate:smoke`/`report:smoke` (no runId) run, then the real run is selected, never `fail-demo`; an explicit `fail-demo` still resolves.
- Given a recipe regression in fail mode (zero checks, wrong contract, wrong detail, extra failures), when `--fail` runs, then it exits 1 and leaves no fail-demo state behind (nothing half-written survives).

## Design Notes

The one-defect recipe keeps the demo deliberate and honest: the deterministic `example` mint plus a single url edit on step 3's post snapshot. The failing scenario's report row reads `url-is "/app/portfolio/main" but url pathname is "/app/portfolio/futures"` — concrete expected-vs-actual diagnostics a headhunter or AI assistant can read without context.

Reserved run ids: `example` (committed) and `fail-demo` (throwaway) are both excluded from implicit newest-run resolution; explicit runIds still work (`npm run validate:smoke -- fail-demo --corpus-dir corpus`). The deferred follow-up story renders this report to a committed README PNG with a browser-free-core dev tool.

## Verification

**Commands:**
- `npm run typecheck` — expected: no errors
- `npm test` — expected: all green (incl. fail-mode + NEWEST_SKIP tests)
- `npm run generate:sample` — expected: exit 0, `example` fixture untouched (pass mode intact)
- `npm run generate:sample -- --fail` — expected: exit 0, red report pair under `corpus/fail-demo/`, failure signature printed; second run byte-identical — compare the fail-demo subtrees directly (`diff -r` or sha256 over `corpus/fail-demo`, `corpus/snapshots/fail-demo`, `corpus/probes/fail-demo`; `git diff` cannot see the gitignored subtree)
- `git status --short` — expected: no `corpus/fail-demo` entries; `git check-ignore corpus/fail-demo/run-manifest.json` → matched

**Manual checks (if no CLI):**
- Open `corpus/fail-demo/report.html` in a browser — red summary bar, one red scenario with the `url-is` error, 13 green, evidence links resolve.

## Spec Change Log

<!-- Append-only — populated by step-04 on review loopback. -->

## Suggested Review Order

**The fail mint — one hand-placed defect**

- The whole --fail path: defected evidence, signature self-check, red report pair, runId-parameterized rollback
  [`generate-sample-report.ts:381`](../../../../bin/generate-sample-report.ts#L381)
- The single mutation (step 3 post url corrupted) — an inline conditional in the mint, not a table
  [`generate-sample-report.ts:258`](../../../../bin/generate-sample-report.ts#L258)
- Cleanup keyed by runId — the backup role example/never touched
  [`generate-sample-report.ts:323`](../../../../bin/generate-sample-report.ts#L323)
- `--fail` option + flag parsing before the guard (the only new accepted flag)
  [`generate-sample-report.ts:187`](../../../../bin/generate-sample-report.ts#L187)

**Reserved-runId isolation**

- FAIL_DEMO_RUN_ID single-sourced beside the sample id
  [`sample-run-id.ts:17`](../../../../bin/sample-run-id.ts#L17)
- newestManifestRun skips both reserved ids (real runs win)
  [`validate-smoke.ts:180`](../../../../bin/validate-smoke.ts#L180)
- resolveLatestRun falls through when the @last-run fan points at fail-demo — the demo can never win an implicit default
  [`validate-smoke.ts:214`](../../../../bin/validate-smoke.ts#L214)

**Supporting — tests + spec-text fixes**

- Fail-mode suite: determinism, signature rollback, isolation, one-defect delta, E2E red consumption, manifest pin, fan bypass
  [`generate-sample-report.test.ts:fail-mode`](../../../../bin/generate-sample-report.test.ts#L440)
- E2E red consumption: real minted fail-demo → validate exit 1 (17/18) and report exit 1 with the red pair
  [`validate-smoke.test.ts:442`](../../../../bin/validate-smoke.test.ts#L442)
- Report-side lone-throwaway NEWEST_SKIP (mirrors the validate-side lone case)
  [`report-smoke.test.ts:410`](../../../../bin/report-smoke.test.ts#L410)
