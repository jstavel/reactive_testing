---
title: 'Story 1.2: Seed the read-only critical-path model (Home Page)'
type: 'feature'
created: '2026-08-25'
status: 'done'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The model scaffold (Story 1.1) declares types but contains no data. The FSM is empty, contracts are empty. There is nothing to query, nothing to seed recording from.

**Approach:** Seed `fsm.ts` and `contracts.ts` with the Home Page critical-path model — states, transitions, and contracts derived from `features/*.feature` files. Classification follows `state-granularity.md`. History/Main/Ledger contracts are deferred to a follow-up story.

## Boundaries & Constraints

**Always:** English-only identifiers and artifacts (NFR-4); `tsc --noEmit` clean; classification follows `state-granularity.md` (URL change → state, action → contract, data value → parameter); only read-only flows modeled (NFR-3); no Playwright import; the `action` field uses a placeholder replaced by the Orchestrator in Epic 2.

**Ask First:** HALT and ask the user if a decision surfaces that is not covered by this spec.

**Never:** Model mutating or order-execution contracts (NFR-3); use the term "aspect"; embed corpus data inside TS files.

</frozen-after-approval>

## Code Map

- `model/fsm.ts` -- FSM types + seed data: 10 states, 12 transitions, `homePageModel` export.
- `model/contracts.ts` -- DialogContract type + seed data: 10 contracts indexed by `contractId`, `allContracts` export.
- `features/*.feature` -- Gherkin input layer (6 files) from which the seed was derived.
- `_bmad-output/specs/spec-reactive-testing/state-granularity.md` -- classification rules.
- Reference: `_bmad-output/planning-artifacts/epics/epics.md` -- Story 1.2 acceptance criteria (scoped down).

## Tasks & Acceptance

**Execution:**
- [x] `model/fsm.ts` -- seed states, transitions, initial state; export `homePageModel`.
- [x] `model/contracts.ts` -- seed contracts with placeholder actions; export `allContracts`.
- [x] `npx tsc --noEmit` -- passes clean.

**Acceptance Criteria:**
- Given `model/fsm.ts`, when inspected, then it exports `homePageModel` with states for Home Page, Portfolio Summary dialog (nested), History (2 states), Portfolio (4 states), and Earn.
- Given `model/contracts.ts`, when inspected, then it exports `allContracts` with contracts for all Home Page navigation, dialog open/close, and eye toggle.
- Given the model, when `npx tsc --noEmit`, then it exits 0 with no diagnostics.
- Given the features and the model, when compared, then every feature scenario maps to a contract in the model and every contract traces back to at least one feature scenario.
- Given the model, when inspected, then all identifiers are English and "aspect" never appears.

## Spec Change Log

## Design Notes

- **Scoped down from epics.md:** Story 1.2 originally required History/Main/Ledger contracts (filter-by-type, paginate, clear-filters). Those are deferred to a follow-up story. This story covers the Home Page as the application's initial state.
- **States:** 10 total. `homePage` is the initial state. `portfolioSummaryDialog` is a nested state (`parentStateId: "homePage"`). The remaining 8 are page states reached via navigation menu clicks.
- **Transitions:** 12 total. 7 navigation transitions (Home → page), 2 dialog transitions (open/close), 1 dialog self-loop (eye toggle), 2 implicit (not modeled: page → Home via back navigation — deferred).
- **Contracts:** 10 total. Each has a `placeholder` action — the Orchestrator replaces this with Playwright calls in Epic 2. Preconditions, postconditions, and invariants are derived from feature scenarios and the home-page-invariants feature.
- **Hover abstraction:** Menu hover is an implementation detail, not a model concern. Features use `When I open the X menu` and `When I click "Y" in the X menu` — the automation layer handles hover reveal.
- **Global state deferred:** Eye toggle persistence and portfolio value as global accumulator states are deferred to Epic 2. The `toggleEyeIcon` contract asserts only the immediate UI effect.
- **Earn breaks the URL convention:** `/app/earn` is a standalone page, not `/app/portfolio/earn`. Modeled as a separate state with a direct transition from `homePage`.

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: exit 0, no output.

**Manual review:**
- Compare `homePageModel.states` against `features/*.feature` Given/Then steps.
- Compare `allContracts` against feature When steps.
- Verify no contract has a mutating action (NFR-3).
- Verify `state-granularity.md` classification: URL changes are states, clicks are contracts, hover is ignored.

## Suggested Review Order

**FSM model**

- States and transitions — 10 states, 12 transitions, initial state `homePage`.
  [`fsm.ts:42`](../../model/fsm.ts#L42)

- Nested dialog state — `portfolioSummaryDialog` with `parentStateId: "homePage"`.
  [`fsm.ts:47`](../../model/fsm.ts#L47)

**Contracts**

- Navigation contracts — 7 contracts for History/Portfolio/Earn menu clicks.
  [`contracts.ts:28`](../../model/contracts.ts#L28)

- Dialog contracts — open/close/toggleEye with preconditions and postconditions.
  [`contracts.ts:100`](../../model/contracts.ts#L100)

**Features (input layer)**

- 6 feature files covering invariants, history menu, layout menu, portfolio menu, dialog, portfolio value.
  [`features/`](../../features/)
