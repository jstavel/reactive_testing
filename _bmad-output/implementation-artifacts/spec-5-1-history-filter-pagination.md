---
title: 'Pilot Story 1 — History Filter/Pagination Scenario'
type: 'feature'
created: '2026-09-07'
status: 'done'
baseline_commit: '1747fe7ff7274a8df21ae5604e020227c72acf13'
review_loop_iteration: 0
context:
  - docs/authoring-example.md
  - docs/usage.md
  - docs/project-map.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Reactive Testing framework is built and documented, but no new user has yet proven they can onboard and extend the test suite by following the docs alone. The pilot validates the onboarding path and surfaces doc gaps.

**Approach:** Jan acts as the first-time operator, follows `README.md` and `docs/*` to understand the project, then authors a History filter/pagination scenario under framework conventions (add-only, read-only). Every friction point is captured as a backlog issue; doc gaps are closed in-story.

## Boundaries & Constraints

**Always:** Authoring is add-only — new scenario extends files it needs but never fixes or edits existing model states, features, contracts, or behavior. New tests carry a valid `@plan:<PlanId>` tag and corresponding FSM/contract entries. Read-only scope (NFR-3). English strictly; "shared validator" never "aspect" (NFR-4).

**Ask First:** Concrete asset filter and pagination contracts for the History page (pin with Jan at kickoff — the seed model has `historyMain` and `clickHistoryMenuMain` but no filter/pagination contracts yet).

**Never:** Fixing existing model states, features, contracts, or behavior. Building new framework capabilities. Implementing open retro items (epic-3 item-7/8/10, epic-4 item-5). FR-10/FR-11 (graph queries / reachability).

</frozen-after-approval>

## Code Map

- `model/fsm.ts` -- FSM states (`homePage`, `historyMain`, etc.) and transitions; `historyMain` is the seed History state reached via `clickHistoryMenuMain`
- `model/contracts.ts` -- all seeded `DialogContract` entries (`clickHistoryMenuMain`, `clickHistoryMenuFutures`, etc.); new filter/pagination contracts go here
- `model/relations.ts` -- maps scenario IDs to FSM states and contracts; new scenario relation entry needed
- `model/schemas.ts` -- shared Zod schemas (`ContractPredicate`, `ScenarioStep`, `TestPlan`, `PlanId`)
- `model/smoke.test-plan.ts` -- derived test plan; regenerated after model changes (never hand-edited)
- `model/model-version.ts` -- `computeModelVersion()` SHA-256 of contracts+fsm+schemas; plan must match
- `orchestrator/action-map.ts` -- Playwright locator entries keyed by `contractId`; new actions for filter/pagination go here
- `features/home-page-history-menu.feature` -- existing History navigation scenarios; new feature file for filter/pagination
- `docs/authoring-example.md` -- canonical 7-step walkthrough for adding a new scenario
- `docs/usage.md` -- daily workflow: record, inspect, re-validate
- `docs/project-map.md` -- directory and file naming conventions

## Tasks & Acceptance

**Execution:**

- [x] `features/history-filter-pagination.feature` -- Create new Gherkin feature with `@plan:smoke` tag containing asset-filter and paginate-next scenarios -- primary deliverable of the pilot authoring exercise (authored with human during scenario discussion)
- [x] `model/contracts.ts` -- Add `filterHistoryByAsset` and `paginateHistoryNext` contracts with preconditions (state-is historyMain), postconditions, and invariants -- extend the model add-only
- [x] `orchestrator/action-map.ts` -- Add Playwright locator entries for `filterHistoryByAsset` and `paginateHistoryNext` -- drive the new contracts against the live app
- [x] `model/relations.ts` -- Add `ScenarioRelation` entries mapping the three new scenario IDs to `[historyMain]` states and their contracts -- keep relations in sync with model
- [x] `model/smoke.test-plan.ts` -- Regenerate to include the three new scenarios with correct step sequences -- modelVersion must match `computeModelVersion()`
- [x] Pilot backlog -- Record every friction point encountered during authoring as a backlog issue in `_bmad-output/implementation-artifacts/pilot-backlog.md` with enough context for a later story to act on; framework-caused items escalated to `deferred-work.md`
- [x] Doc updates -- No doc-caused gaps found during pilot; `docs/authoring-example.md` accurately covers the 7-step workflow as validated by the pilot run

**Acceptance Criteria:**

- Given the authoring-example.md walkthrough, when a new user follows it to add the History filter/pagination scenario, then the scenario is authored successfully with valid Gherkin, correct `@plan:smoke` tag, matching FSM/contract entries, and action-map locators
- Given the new contracts in `contracts.ts`, when `npm run typecheck` runs, then it exits 0
- Given the regenerated `smoke.test-plan.ts`, when `npm test` runs, then it exits 0 and `modelVersion` matches `computeModelVersion()`
- Given the pilot run, when friction points are encountered, then each is recorded in the pilot backlog with what failed and why
- Given doc gaps discovered during the pilot, when the story completes, then each gap is either closed by a doc edit or explicitly recorded as won't-fix

## Spec Change Log

- 2026-09-07: Reframed the pinned filter use case from filter-by-type to filter-by-asset to match the agreed pilot scenario and implemented contracts.

## Verification

**Commands:**
- `npm run typecheck` -- expected: exits 0, no type errors
- `npm test` -- expected: exits 0, all tests pass including modelVersion match

**Manual checks:**
- Open `features/history-filter-pagination.feature` and verify Gherkin syntax and `@plan:smoke` tag
- Verify `model/smoke.test-plan.ts` includes the three new scenario entries with correct `{ stateId, contractId }` steps
- Verify `_bmad-output/implementation-artifacts/pilot-backlog.md` exists and contains at least one entry
