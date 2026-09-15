---
title: 'Wire cross-view invariants into live and offline smoke verification'
story_id: '4-3-cross-view-live-wiring'
type: 'feature'
created: '2026-09-15'
status: 'done'
review_loop_iteration: 1
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `runCrossViewInvariants` and its seed `portfolio-value` invariant are implemented and unit-tested, but no runner invokes them and live smoke runs record no `portfolio-value` probe. FR-13 therefore cannot validate the portfolio value across Home and Portfolio Summary on a real corpus.

**Approach:** Compose cross-view results into the existing offline validation runner and extend the dependency registry (Option A) so invariant probe names are derived from declarations, automatically require the `probe` collector, and fail preflight when the configured runner lacks `portfolio-value`. Add the live-discovered hero-value probe to smoke/verify configurations, then prove the full record → offline-validate path against a fresh CDP corpus.

## Boundaries & Constraints

**Always:** `runValidatorsOffline` keeps its existing per-contract results and appends one result per registered cross-view invariant for a known run. Unknown runs retain Story 2's empty-result behavior so CLI run-resolution guards remain authoritative. Cross-view remains pure/offline and reads only corpus evidence. `portfolio-value` is declared once by the invariant registry; selectors remain runner configuration. The probe is optional on surfaces without the element, recording an empty value so the invariant reports honest missing evidence. Existing contract dependency derivation and all 18 contract checks remain unchanged.

**Ask First:** Any new cross-view invariant beyond the existing portfolio-value registry entry; any change to `TestPlan`/`schemas.ts` or model-version inputs; any choice to hard-code a portfolio amount rather than compare the value shape/content captured by the live probe.

**Never:** No browser access from validators, no invariant-specific selectors in `cross-view.ts`, no model/FSM/contracts changes, no manual `portfolio-value` list duplicated in `model/schemas.ts`, no suppression of a cross-view failure when a surface or probe is absent, and no changes to the invariant's agreement normalization in this story.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| CONTRACT_AND_INVARIANT_PASS | Known corpus with 18 contract checks and equal values on Home + dialog | Offline runner returns 19 results: 18 contract results + one passing invariant | N/A |
| INVARIANT_DIVERGES | Known corpus records different normalized values per surface | Final invariant result fails and names both surfaces/values | exit 1 via CLI |
| INVARIANT_MISSING | Known corpus has no value on one declared surface | Final invariant result fails naming the missing surface | never silently passes |
| NORMALIZE | values differ in formatting only (e.g. "5,034.89 USD" vs "5034.89 USD", pending vs settled same amount) | agreed once `normalize` maps them equal — no false positive | N/A |
| UNMODELED_SURFACE | invariant.surfaces contains a stateId not in `homePageModel.states` | throws at entry, naming the bad stateId | declaration gap, nothing validated |
| NO_OBSERVATIONS | corpus has no step landing on any declared surface | one result, `passed: false`, `details` names every missing surface | N/A |
| UNKNOWN_RUN | No run manifest | Runner returns `[]`, preserving Story 2 CLI guard behavior | existing no-recorded-run outcome |
| PROBE_NOT_CONFIGURED | Live plan requires `portfolio-value`, config omits it | Preflight throws before CDP/browser launch | named missing-probe error |
| OPTIONAL_SURFACE | A step lands on a surface without the hero selector | Probe records empty value; other checks continue; invariant reports missing evidence if that surface is required | collector does not throw |

</frozen-after-approval>

## Code Map

- `validators/cross-view.ts:37-84` -- canonical invariant interface, registry, and pure `runCrossViewInvariants`; remains browser-free and owns the `portfolio-value` declaration.
- `validators/dependencies.ts:14-50` -- contract dependency derivation and probe-name preflight; extend this layer with registry-derived cross-view probe requirements (Option A).
- `validators/offline-runner.ts:15-53` -- existing per-contract offline runner; append cross-view results for known runs without changing unknown-run behavior.
- `orchestrator/orchestrator.ts:22,290-323` -- `planCollectors` and `validateProbeDependencies`; ensure invariant-derived probe requirements cause probe collection and preflight coverage.
- `bin/run-smoke.ts:23-48` -- live CDP smoke configuration; add optional hero-value `portfolio-value` probe.
- `bin/verify-actions.ts:6-17` -- isolated live action verification configuration; keep it compatible with the same required probe set.
- `validators/cross-view.test.ts:93-600` -- existing hand-written invariant matrix; add runner-composition coverage over a recorded corpus.
- `validators/dependencies.test.ts` -- dependency/preflight derivation tests; pin registry-derived `portfolio-value` and collector requirement.
- `validators/offline-runner.test.ts` -- offline runner tests; add 19-result composition, divergence, missing-surface, and unknown-run preservation cases.
- `orchestrator/orchestrator.test.ts` -- preflight/planned-collector tests; prove a configured invariant probe causes the probe collector to run and an omitted probe fails before launch.
- `bin/validate-smoke.test.ts` -- CLI summary/count regression; committed fixture behavior must be updated deliberately if the invariant is included in it.

## Tasks & Acceptance

**Execution:**
- [x] `validators/dependencies.ts` -- derive cross-view probe names from `crossViewInvariants` and expose the collector requirement without duplicating `portfolio-value` in model config -- Option A dependency ownership.
- [x] `validators/offline-runner.ts` -- append `runCrossViewInvariants` results after per-contract validation for known runs; preserve unknown-run `[]` -- activate FR-13 at the existing offline entry point.
- [x] `orchestrator/orchestrator.ts` -- include registry-derived invariant probe requirements in planned collectors and preflight checks -- record the evidence the invariant consumes.
- [x] `bin/run-smoke.ts` and `bin/verify-actions.ts` -- add optional `portfolio-value` probe using the confirmed hero selector -- make live runs collect the seed fact.
- [x] Tests in `validators/dependencies.test.ts`, `validators/offline-runner.test.ts`, `orchestrator/orchestrator.test.ts`, and `bin/validate-smoke.test.ts` -- cover the matrix and count changes -- pin composition, planning, and CLI behavior.
- [x] Live CDP verification -- record a fresh smoke corpus and run `npm run validate:smoke` -- prove 14/14 scenarios and 19/19 checks, with the cross-view result explicitly present.

**Acceptance Criteria:**
- Given a known corpus with equal portfolio values on Home and Portfolio Summary, when `runValidatorsOffline` runs, then it returns 18 contract results plus one passing cross-view result.
- Given divergent or missing cross-view evidence, when offline validation runs, then the appended invariant fails naming the offending surface/value and the CLI exits non-zero.
- Given the smoke plan and no `portfolio-value` probe configuration, when preflight runs, then it fails before CDP launch with a named missing-probe error.
- Given the smoke plan with the configured optional hero-value probe, when recording completes, then the manifest includes probe collection and the relevant Home/dialog steps contain `portfolio-value` results.
- Given the fresh live corpus, when `npm run validate:smoke` runs, then all 18 contract checks and the cross-view invariant pass (19/19 total).
- Given an unknown run, when offline validation runs, then it still returns `[]` and existing CLI no-recorded-run behavior is unchanged.

## Spec Change Log

- 2026-09-15 (bad_spec loop 1) — Review found several gaps in the spec's coverage of cross-view composition, filtering, and reporting. The original spec incorrectly relied on a holistic `planIncludesInvariantSurfaces` gate which was too restrictive and could lead to silent skips or misleading errors. Filtering of cross-view invariants was all-or-nothing, rather than exact. The spec also failed to address how invariant failures are attributed in the HTML/JSON reports, potentially leading to false-green summaries. Fixture generation was hardcoded to a passing state for `toggleEyeIcon`, not reflecting live behavior. Amended spec now clarifies these aspects, ensuring correct filtering, explicit reporting of invariant failures, and realistic fixture generation.

## Design Notes

The dependency layer remains the single source of truth: it imports the invariant registry and derives the union of invariant probe names. The orchestrator uses that union in two places — preflight configuration validation and collector planning — so a configured name cannot be accidentally omitted from corpus capture. The offline runner invokes cross-view validation only after the known-run guard; this preserves Story 2's distinction between "no run" and "run failed validation".

The live probe selector is `[data-testid="overview-portfolio-hero-value-text"]`, confirmed in the fresh smoke snapshots on both `homePage` and `portfolioSummaryDialog`. It is optional because the same configured probe runs on navigation surfaces where the hero is absent; the invariant's surface-specific latest-observation logic, not the collector, owns the missing-evidence verdict.

## Verification

**Commands:**
- `npm run typecheck` -- expected: exit 0.
- `npm test` -- expected: all suites green.
- `npm run lint` -- expected: exit 0.
- `npm run run:smoke` -- expected: fresh live corpus, 14/14 scenarios passed.
- `npm run validate:smoke` -- expected: 19/19 checks passed, including `current-portfolio-value-agrees-across-surfaces`.

## Suggested Review Order

**Composition & honest check counts**

- Offline entry point: cross-view results appended for known runs, named failures on invalid/malformed corpora — never a silent count shrink.
  [`offline-runner.ts:31`](../../validators/offline-runner.ts#L31)

- Invariant selection by id, registry-error guard unchanged.
  [`cross-view.ts:76`](../../validators/cross-view.ts#L76)

**Dependency derivation & preflight**

- Registry-derived probe names are the single source of truth; collector requirement derived from it.
  [`dependencies.ts:54`](../../validators/dependencies.ts#L54)

- Planned collectors and preflight both consume the registry, so a missing probe fails before CDP launch.
  [`orchestrator.ts:304`](../../orchestrator/orchestrator.ts#L304)

**Live probe configuration**

- The one shared optional hero-value probe definition.
  [`smoke-config.ts:1`](../../bin/smoke-config.ts#L1)

- Live smoke and action-verification runners both configure it.
  [`run-smoke.ts:37`](../../bin/run-smoke.ts#L37)
  [`verify-actions.ts:11`](../../bin/verify-actions.ts#L11)

**Offline CLI surfaces**

- The report attributes a failing invariant to an explicit synthetic scenario so the HTML/JSON can never go green on a diverged run.
  [`report-smoke.ts:100`](../../bin/report-smoke.ts#L100)

- Contract filters now accept invariant ids (unknown ones still throw).
  [`validate-smoke.ts:105`](../../bin/validate-smoke.ts#L105)

- Sample generator records the probe keyed by post state, matching live optionality.
  [`generate-sample-report.ts:248`](../../bin/generate-sample-report.ts#L248)

**Tests & docs**

- Offline-runner composition matrix incl. divergence, manifest-invalid, plan-malformed.
  [`offline-runner.test.ts:132`](../../validators/offline-runner.test.ts#L132)

- Preflight omission pin and planner coverage.
  [`orchestrator.test.ts:92`](../../orchestrator/orchestrator.test.ts#L92)

- Report failing-invariant path (summary/HTML/JSON) and count regressions.
  [`report-smoke.test.ts:436`](../../bin/report-smoke.test.ts#L436)

- Fixture regenerated to 19/19; docs synced.
  [`probes/example/10.json`](../../corpus/probes/example/10.json)
