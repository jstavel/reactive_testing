---
title: 'Gherkin is never the SSOT'
type: 'feature'
created: '2026-09-01'
baseline_commit: 'f566272b9d327fcb96002a45044c8548bf01446d'
status: 'done'
review_loop_iteration: 0
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
  - '_bmad-output/implementation-artifacts/spec-3-5-adjudicated-spec-change-only.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** FR-9 ("Gherkin is never the SSOT") is stated but not enforced: `model/smoke.test-plan.ts` is a derived artifact, yet nothing verifies that the `stateId`/`contractId` values its scenarios reference resolve to the Model. A behavior change recorded only in Gherkin (or a hand-edited plan) pointing at an unmodeled state or contract would silently survive — the machine consumes a plan whose references no Model declares.

**Approach:** Add a deterministic, pure SSOT guard over the derived smoke test plan: every scenario step's `stateId` and `contractId` must resolve against `model/fsm.ts` (states + transitions) and `model/contracts.ts` (allContracts). The guard is model-owned (`model/`), testable offline, and proves the Model is the single place behavior is recorded — Gherkin stays the query/input layer, never machine truth (FR-9, AD-9).

## Boundaries & Constraints

**Always:**
- Read-only over the corpus pipeline: the guard consumes the committed `smoke.test-plan.ts` (`TestPlan`), `homePageModel` (`FsmModel`), and `allContracts` — it never writes anywhere and never runs in the browser.
- The guard asserts four resolutions per plan scenario: `stateId` exists in the FSM states; `contractId` exists in `allContracts`; the `(stateId, contractId)` pair is a declared FSM transition (`from === stateId`, `contractId` matches); and scenario `id`s are unique across the plan.
- Deterministic (NFR-1): identical inputs → identical pass/fail; no AI, no network, no timestamps.
- `npm run typecheck` stays clean; every guard rule is exercised by a unit test, including negative cases.

**Ask First:**
- Tightening `testPlanSchema` (`model/schemas.ts:304-322`) into a discriminated union over Model state/contract ids — a Schema/Model change that bumps `modelVersion`.
- Guarding additional derived artifacts (e.g. adjudication/FailureGherkin outputs) beyond the test plan in this story.

**Never:**
- No Gherkin parsing or `.feature` file reading (AD-9: no parser, no processing layer). The guard inspects the derived plan and the Model — never `features/*.feature`.
- No auto-editing of the plan, the Model, or any artifact — the guard only reports/throws; regeneration stays human/AI-owned.
- No changes to validator, orchestrator, or reporter behavior.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| RESOLVES | smokeTestPlan as committed | every step's stateId in FSM states, contractId in allContracts, pair is a declared transition, ids unique — all pass | N/A |
| UNKNOWN_STATE | step references `stateId` absent from FSM states | guard flags the offending scenario id + stateId | reported as a resolution failure |
| UNKNOWN_CONTRACT | step references `contractId` absent from `allContracts` | guard flags the offending scenario id + contractId | reported as a resolution failure |
| UNKNOWN_TRANSITION | (stateId, contractId) pair matches no FSM transition | guard flags the missing transition | reported as a resolution failure |
| DUPLICATE_ID | two scenarios share an `id` | guard flags the duplicated id | reported as a resolution failure |

</frozen-after-approval>

## Code Map

- `model/smoke.test-plan.ts` (READ-ONLY, primary input) — the derived `TestPlan` under guard; `planId: "smoke"`, 10 scenarios, 12 step entries. Its `modelVersion` is already pinned by `model-version.test.ts:11-12`.
- `model/fsm.ts:41-57,59-77` (READ-ONLY) — `states` array (`stateId` strings incl. `homePage`, `portfolioSummaryDialog`, `historyMain`, `portfolioOverview`, `earn`, etc.) and `transitions` (`from`/`contractId`); `homePageModel` export at `:80`.
- `model/contracts.ts:122` (READ-ONLY) — `allContracts` export, the authoritative 10 contract ids (`clickHistoryMenuMain`, `clickHistoryMenuFutures`, `clickPortfolioMenuOverview`, `clickPortfolioMenuMain`, `clickPortfolioMenuFutures`, `clickPortfolioMenuLoans`, `clickPortfolioMenuEarn`, `openPortfolioSummary`, `closePortfolioSummary`, `toggleEyeIcon`).
- `model/schemas.ts:304-322` (READ-ONLY) — `testPlanSchema`/`TestPlan`: scenario = `{ id, steps: [{ stateId, contractId }] }`; steps are open `z.string()` — this openness is exactly what the guard closes.
- `model/model-version.test.ts` (READ-ONLY) — existing derived-artifact guard precedent (`smokeTestPlan.modelVersion === computeModelVersion()`) to extend in the same style.
- `model/fsm.ts` + `model/contracts.ts` exports form the guard's validation dictionaries.

## Tasks & Acceptance

**Execution:**
- [x] `model/ssot-guard.ts` (NEW) — export `resolveTestPlanAgainstModel(plan: TestPlan, fsm: FsmModel, contracts: readonly DialogContract[]): ModelResolutionIssue[]` returning every violation (`{ scenarioId, kind: 'unknown-state' | 'unknown-contract' | 'unknown-transition' | 'duplicate-id', message }`) or `[]`; a thin `assertTestPlanResolvesToModel(...)` throws on non-empty issues. Pure, no side effects.
- [x] `model/ssot-guard.test.ts` (NEW) — unit tests: committed `smokeTestPlan` resolves cleanly (RESOLVES); each negative case (UNKNOWN_STATE / UNKNOWN_CONTRACT / UNKNOWN_TRANSITION / DUPLICATE_ID) using a synthetic `TestPlan` triggers exactly the right issue kind; duplicate-id detection covers both id-is-taken and id-is-seen-once.

**Acceptance Criteria:**
- Given `smoke.test-plan.ts` as committed, when the SSOT guard runs against `homePageModel` and `allContracts`, then it reports zero issues — every scenario step resolves to a modeled state, modeled contract, and declared transition (FR-9).
- Given a derived plan whose step references an unmodeled `stateId`, an unmodeled `contractId`, or an undeclared `(stateId, contractId)` transition, when the guard runs, then each violation is reported with the offending scenario id — the Model is the single place behavior is recorded.
- Given a derived plan with duplicate scenario ids, when the guard runs, then the duplicated id is reported.
- Given `npm run typecheck` and `npm test`, when run, then both exit 0.

## Spec Change Log

- **2026-09-01** — Initial draft.

## Design Notes

- **Why the plan, not the `.feature` files.** AD-9 bans parsing Gherkin, and QE-authored features are deliberately loose prose. The plan is the *machine-consumed* artifact — the only place behavior references exist in a form the pipeline executes (`orchestrator/offline-runner` consume `step.contractId`). Guarding it is the enforceable version of "behavior changes are recorded in the Model, never in Gherkin."
- **The transition check is the teeth.** A step may cite a real state and a real contract independently, yet still be a behavior the Model never declared (e.g. `homePage` + a contract that only fires from `portfolioSummaryDialog`). Requiring the exact `(stateId, contractId)` transition closes that; the seed `toggleEyeIcon` self-loop (`fsm.ts:76`) verifies the pair rule against a non-navigation contract.
- **Golden shape of an issue:**
  ```ts
  { scenarioId: "clicking-earn-navigates-to-the-standalone-earn-page",
    kind: "unknown-transition",
    message: 'no transition from state "homePage" driven by contract "clickPortfolioMenuEarn"' }
  ```
- **Named return, not throw, is the API.** `resolveTestPlanAgainstModel` returns issues so a future plan *generator* (Story 1.5 / AI-Agent) can reuse the same dictionary without try/catch; the throw wrapper exists for the guard-tool use case.

## Verification

**Commands:**
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: exit 0, new `model/ssot-guard.test.ts` tests pass

**Manual checks (if no CLI):**
- _None._

## Suggested Review Order

**Guard core**

- Entry point: resolve every plan scenario step against the Model's states, contracts, and declared transitions (FR-9).
  [`ssot-guard.ts:20`](../../model/ssot-guard.ts#L20)

- The transition pair rule is the teeth — a real state plus a real contract still fail unless the Model declared that exact pair fires.
  [`ssot-guard.ts:64`](../../model/ssot-guard.ts#L64)

- Named-issue return (not throw) keeps the guard reusable by a future plan generator; the throw wrapper serves guard-tool use.
  [`ssot-guard.ts:24`](../../model/ssot-guard.ts#L24)

- `\u0000`-joined transition keys can't collide; duplicate scenario ids are reported once per repeat.
  [`ssot-guard.ts:26`](../../model/ssot-guard.ts#L26)

- Typed `readonly DialogContract[]` — callers can't hand-roll a loose contract list past typecheck.
  [`ssot-guard.ts:23`](../../model/ssot-guard.ts#L23)

**Tests**

- Live RESOLVES: the committed smoke plan must resolve against the real model in CI, or Gherkin drift fails the build.
  [`ssot-guard.test.ts:13`](../../model/ssot-guard.test.ts#L13)

- Negative matrix: unknown state/contract/transition and duplicate id, each with the exact issue kind asserted.
  [`ssot-guard.test.ts:102`](../../model/ssot-guard.test.ts#L102)

- Edge inputs: empty plan/steps pass clean; empty-string ids are flagged; the seen-once duplicate direction is covered.
  [`ssot-guard.test.ts:47`](../../model/ssot-guard.test.ts#L47)