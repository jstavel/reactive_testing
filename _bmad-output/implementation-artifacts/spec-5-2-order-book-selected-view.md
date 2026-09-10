---
title: 'Pilot Story 2 — Order Book / Selected View Scenario (BTC/USD)'
type: 'feature'
created: '2026-09-10'
status: 'done'
baseline_commit: '7f9507d830d5e380845ab17cd3ea973eecf2cf39'
review_loop_iteration: 0
context:
  - _bmad-output/implementation-artifacts/epic-5-context.md
  - _bmad-output/implementation-artifacts/spec-5-1-history-filter-pagination.md
  - docs/usage.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The pilot (Epic 5) needs a second read-only scenario on a different surface; the order-book / selected-view surface is named but never modeled. Jan discovered at kickoff that the add-order-book action is not idempotent, so the scenario must use the deterministic half of the interaction.

**Approach:** Author an add-only, BTC/USD-only scenario on the Trade page: the Order Book is a tab in the "Favorites" tab bar; the scenario selects the existing Order Book tab and asserts it becomes the selected view. The non-idempotent "+"-add action becomes an operator run-protocol precondition (docs/usage.md) and is escalated to deferred-work.md as a framework gap (same class as `toggleEyeIcon` and the parked state-loading concern). Live CDP discovery pins the concrete locators/labels; the story runs all three pilot caps (CAP-1 author, CAP-2 backlog, CAP-3 docs).

## Boundaries & Constraints

**Always:** Authoring is ADD-ONLY — new FSM state `orderBook` + nav contract + view-select contract; never fix existing model states, features, contracts, or behavior. Read-only scope (NFR-3); no order execution, no numeric bid/ask value assertions. BTC/USD pair only, English only, valid `@plan:smoke` tag. Scenario step must be the idempotent action (select the Order Book tab); the "+"-add step is never a plan step.

**Ask First:** HALT if live discovery contradicts the pinned use case — wrong surface (Trade page absent / differently labeled), no "Favorites" tab bar with an Order Book tab, a `selected-view` probe value that is not the Order Book tab, or a URL path that is not `/app/trade…` (accept the discovered value, then confirm ladder). Also confirm the discovered tab label value used as the `view-selected` view string.

**Never:** "+"-add as an executable step; fixing/deleting existing model entries; new framework capabilities (runtime branching, state establishment, conditional steps); new predicate types or validator code; asserting bid/ask prices or magnitudes; Gherkin `Scenario Outline`/`Examples` (silently skipped by the reporter); implementing the open retro items (epic-3 item-7/8/10, epic-4 item-5).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH | Trade page, Order Book tab present in Favorites bar | clicking the Order Book tab → selected view reads "Order Book", URL stays on `/app/trade…`, post snapshot records the board | N/A |
| TAB_ABSENT | Order Book tab not in Favorites bar (operator precondition violated) | scenario FAILs fast at the select action with an actionable message | message names the run-protocol precondition (add the tab via "+" then re-run) — deterministic failure, never a silent pass |
| NAV_DRIFT | `clickTradeMenu` locator stale / menu renamed | bootstrap (setup) fails; scenario marked setup-failed, run continues | setup failure surfaced via `[SETUP FAIL]`; spec-treated as app/locator drift to investigate, not adjudicated silently |
| VIEW_PROBE_EMPTY | active tab lacks `aria-current="page"` match | `view-selected` check fails with clear details | record actual probe value in details ("selected view is …") |
| MULTI_PATH | homePage → orderBook has >1 shortest path | no — only the seed nav contract exists today; if a review adds another, `resolveBootstrapPath` rejects and forces a `route` override | reject, do not guess |

</frozen-after-approval>

## Renegotiation Overrides (approved 2026-09-10)

Renegotiated by Jan during implementation (decision [B]); recorded so the frozen block reads consistent with reality without editing it.

- **Frozen Never ("new predicate types or validator code")** → approved exception: `view-selected` gained an optional `probe?` field and `validator-map.ts`/`dependencies.ts` changed to honor per-predicate probe binding. Fully documented in the Spec Change Log (2026-09-10 implementation entry).
- **Frozen matrix row `VIEW_PROBE_EMPTY`** → the row was written against the pre-discovery `a[role="tab"][aria-current="page"]` assumption, which live discovery disproved (flexlayout divs, `--selected` class). Corrected meaning: the bound `selected-board-tab` probe yields empty/none (or is unpopulated) → the `view-selected` check fails with the actual probe value in the details ("selected view is …"). Behavior unchanged; wording now matches the pinned reality.

## Code Map

- `model/fsm.ts` -- states `:41-56` + transitions `:58-91`; ADD a new state `{ stateId: "orderBook", label: … }` and transitions `{ from: "homePage", to: "orderBook", contractId: "clickTradeMenu" }` + `{ from: "orderBook", to: "homePage", contractId: "navigateHome" }` (navigateHome transition already exists at `:58-91` per target — add the orderBook→homePage row). Model edit → `computeModelVersion()` bumps → plan must be regenerated (`model/model-version.test.ts` guard).
- `model/contracts.ts` -- `DialogContract` shape `:17-26`; `homePageContracts` array `:32-142`. ADD nav contract `clickTradeMenu` (preconditions `[{state-is, homePage}]`, postconditions `[{state-is, orderBook}, {url-is, "/app/trade/btc-usd"}]`, invariants `["main navigation is visible", "board displays the selected market view"]`) and self-loop `selectOrderBookTab` (preconditions `[{state-is, orderBook}]`, postconditions `[{state-is, orderBook}, {url-is, "/app/trade/btc-usd"}, {view-selected, view: "Order book", probe: "selected-board-tab"}]`, invariants same). The `view-selected` predicate gained an optional `probe?` binding field (decision [B], 2026-09-10) so each view surface reads its own probe: `selected-view` (sidebar, default) vs `selected-board-tab` (flexlayout board). URL-hidden board shape is recorded evidence (snapshot), never asserted numerically.
- `orchestrator/action-map.ts` -- register `clickTradeMenu` (sidebar button, `getByRole("button", { name: "Trade", exact: true })`, live-verified single match) and `selectOrderBookTab` (`.flexlayout__tab_button` scoped by `{ hasText: "Order book" }`, live-discovered 2026-09-10). Locators are OUTSIDE the model hash — no version bump on edit. Live-discovered, never guessed (AD-4).
- `orchestrator/bootstrap.ts` `resolveBootstrapPath :12-89` -- auto-navigates `homePage → orderBook` via `clickTradeMenu` for the scenario's `givenStateId` (no plan change needed for bootstrap).
- `bin/run-smoke.ts` -- `config.probes` ships `selected-view: a[role="tab"][aria-current="page"]` (optional, unchanged — load-bearing for the Portfolio `view-selected` contracts) PLUS the new `selected-board-tab: .flexlayout__tab_button--selected .flexlayout__tab_button_content` probe (live-discovered 2026-09-10: the Trade board tabs are flexlayout divs, no `role=tab`/`aria-current`). The orchestrator's dependency planning (`validators/dependencies.ts`) maps `view-selected` → probe by name.
- `model/schemas.ts` `:229-250,347-374` -- `ScenarioPath`/`ScenarioStep`; scenario entry uses `givenStateId: "orderBook"` + one step `{ stateId: "orderBook", contractId: "selectOrderBookTab" }`; `route` override only if `resolveBootstrapPath` reports a multi-path (it won't today).
- `model/relations.ts` -- add `ScenarioRelation` for the new scenario (scenarioId, `feature: "trade-order-book"`, featureTitle, scenarioTitle, `states: ["orderBook"]`, `contracts: ["clickTradeMenu", "selectOrderBookTab"]`). Keep scenarioId = kebab of scenarioTitle (deferred-work F4 note).
- `model/smoke.test-plan.ts` -- REGENERATE (never hand-edit); header `:1-6` documents that; `modelVersion` must equal `computeModelVersion()` (test guard).
- `features/trade-order-book.feature` -- NEW Gherkin, `@plan:smoke`; notes carry the operator precondition + the idempotency rationale (pattern: `features/history-filter-pagination.feature:8-11`).
- `docs/usage.md` -- §1 "Record a corpus (live)": add the order-book run-protocol precondition (Order Book tab present in Favorites bar before the run).
- `_bmad-output/implementation-artifacts/pilot-backlog.md` -- add Story 5-2 section recording the "+"-add non-idempotency friction (CAP-2).
- `_bmad-output/implementation-artifacts/deferred-work.md` -- add the escalation for conditional/non-idempotent view actions, referencing the parked state-loading entry at `:87-90`.

## Tasks & Acceptance

**Execution:**

- [x] Live CDP discovery (against authenticated browser) -- pin the Trade sidebar menu locator/label, the `/app/trade…` URL, the Favorites-bar Order Book tab locator/label, and the active-tab `selected-view` probe value; record findings in the spec change log -- never guess locators (AD-4)
- [x] `model/fsm.ts` -- ADD `orderBook` state + `clickTradeMenu` transition (homePage→orderBook) + `navigateHome` row (orderBook→homePage) -- add-only seed extension
- [x] `model/contracts.ts` -- ADD `clickTradeMenu` + `selectOrderBookTab` DialogContract entries with the pinned predicates -- machine-typed behavioral contract
- [x] `orchestrator/action-map.ts` -- ADD live-discovered locators for both contracts -- locate/act on the real DOM
- [x] `features/trade-order-book.feature` -- NEW feature: single scenario "Selecting the Order Book tab shows the BTC/USD board", `@plan:smoke`, with precondition NOTE -- CAP-1 primary deliverable
- [x] `model/relations.ts` -- ADD ScenarioRelation for the new scenario -- keep relation↔model sync
- [x] `model/smoke.test-plan.ts` -- REGENERATE with `givenStateId: "orderBook"` step -- modelVersion must match `computeModelVersion()`
- [x] `docs/usage.md` -- ADD order-book run-protocol precondition under §1 -- CAP-3 doc close
- [x] `pilot-backlog.md` -- ADD Story 5-2 friction entry (CAP-2)
- [x] `deferred-work.md` -- ADD escalation: non-idempotent/conditional view actions need a state-establishment or runtime-branching mechanism; link to parked state-loading item -- framework gap filed, not papered over

**Acceptance Criteria:**

- Given the authoring-example walkthrough, when a new user authors the Trade/order-book scenario, then it carries a valid `@plan:smoke` tag, read-only `orderBook` FSM/contract entries, and live-discovered action-map locators (add-only)
- Given the new model entries, when `npm run typecheck` runs, then it exits 0
- Given the regenerated plan, when `npm test` runs, then it exits 0 and `modelVersion` equals `computeModelVersion()`
- Given the operator precondition (Order Book tab present), when `npm run run:smoke` runs live, then the scenario records a `PASS` selection of the Order Book tab with `view-selected` and URL evidence in the corpus
- Given the precondition is violated (tab absent), when the scenario runs, then it FAILs fast with the precondition named in the message — never silently passes
- Given the pilot run, when friction is encountered, then it is recorded in `pilot-backlog.md`; the conditional-action gap is escalated in `deferred-work.md`; the doc gap (precondition) is closed in `docs/usage.md`

## Spec Change Log

- 2026-09-10: Pinned the concrete use case with Jan (Path C): Trade page, BTC/USD, deterministic tab-select scenario; "+"-add escalated as a framework gap and documented as an operator precondition. Live DOM discovery in-story will pin exact locators/labels and may adjust the predicate values (Ask First).
- 2026-09-10 (implementation): Live discovery diverged from the Code Map assumption — the Trade board tabs are flexlayout DIVs (`.flexlayout__tab_button`, label in `.flexlayout__tab_button_content`, active marked `.flexlayout__tab_button--selected`), NOT `a[role="tab"][aria-current="page"]`. Jan chose decision **[B] per-predicate probe binding**: `view-selected` gained an optional `probe?` field (default `selected-view`); `selectOrderBookTab` binds `view-selected "Order book"` → probe `selected-board-tab` (new config probe). Portfolio `view-selected` contracts keep the untouched `selected-view` probe. Verified live: run:smoke 14/14 PASS incl. `selecting-the-order-book-tab-shows-the-btc-usd-board`; validate:smoke 11/18 (dialog-failures are the known runway gap), `selectOrderBookTab` PASS.
- 2026-09-10 (review): Review round 2 on the corrected diff raised five code/doc issues, all patched: (1) `validateContract` accounted `view-selected` evidence against the hardcoded `probe:selected-view` even for bound predicates — now names the per-predicate probe (`predicate.probe ?? "selected-view"`); (2) `selectOrderBookTab` gained a `url-is "/app/trade/btc-usd"` postcondition so the feature's "URL remains on the Trade page" step is machine-backed; (3) duplicate-tab guard added (`count > 1` → deterministic fail) alongside TAB_ABSENT; (4) Trade-contract invariants corrected to the verified surface ("board displays the selected market view" — the header portfolio-value claim was carried over unverified); (5) relation now lists both `clickTradeMenu` and `selectOrderBookTab` (matches the Code Map). New coverage: bootstrap orderBook seed path, multi-match guard, bound-probe `corpusRefs`, and `clickTradeMenu` validator pass/fail. modelVersion `7ce88b30… → 832c258f35…`. Smoke plan regenerated; 340/340 tests pass. Re-verified live on the new modelVersion: run:smoke 14/14 PASS (corpus `437ef5c5`); validate:smoke 11/18 (`selectOrderBookTab` PASS; dialog-failures remain the known runway gap).

## Design Notes

- **Deterministic half only.** Jan confirmed `+` → "Order Book" is offered only when the tab is absent, so a create-or-affirm step is non-deterministic. The scenario clicks the *existing* tab (idempotent: clicking the active tab leaves it selected) and asserts `view-selected`. Operator establishes the precondition per the run protocol.
- **Same gap as eye-toggle and portfolio value.** All three are state-dependent outcomes the static `{stateId, contractId}` model cannot control or branch on; the escalation joins the parked state-loading item (deferred-work.md:87-90) rather than inventing a framework change mid-pilot.
- **Value-agnostic board evidence.** No bid/ask price assertions (prices drift); the post snapshot records the board shape and the URL/tab predicates carry the contract.

## Verification

**Commands:**
- `npm run typecheck` -- expected: exits 0, no type errors
- `npm test` -- expected: exits 0, all pass incl. `model-version.test.ts` hash match
- `npm run run:smoke` -- expected (precondition met): `[PASS] selecting-the-order-book-tab-…`, corpus under a new runId, `@last-run` fan re-pointed
- `npm run validate:smoke` -- expected: selects `selectOrderBookTab` + `clickTradeMenu` contracts pass on the fresh corpus

**Manual checks:**
- `features/trade-order-book.feature` -- Gherkin syntax, `@plan:smoke`, precondition NOTE present
- `model/smoke.test-plan.ts` -- new scenario with `givenStateId: "orderBook"` and the single select step; plan regenerated, not hand-edited
- `deferred-work.md` / `pilot-backlog.md` / `docs/usage.md` -- escalation + friction + precondition edits present

## Suggested Review Order

**Entry point — the interaction the story adds**

- nav + board-select contracts: probe binding, `url-is` pin, verified invariants
  [`contracts.ts:119`](../../model/contracts.ts#L119)

**Decision [B] — per-predicate probe binding**

- `view-selected` gains optional `probe?` field, default stays `selected-view`
  [`schemas.ts:154`](../../model/schemas.ts#L154)

- evaluator reads the bound probe; Portfolio contracts untouched by default
  [`validator-map.ts:53`](../../validators/validator-map.ts#L53)

- evidence accounting names the real probe, not the hardcoded default
  [`validator-map.ts:103`](../../validators/validator-map.ts#L103)

- dependency planner resolves `view-selected` → bound probe name
  [`dependencies.ts`](../../validators/dependencies.ts)

- new optional probe on the live board's selected flexlayout tab
  [`run-smoke.ts:43`](../../bin/run-smoke.ts#L43)

**Orchestrator actions — live-discovered, deterministic**

- Trade sidebar button: exact-name, single-match, URL wait
  [`action-map.ts:126`](../../orchestrator/action-map.ts#L126)

- Order Book tab: flexlayout locator, TAB_ABSENT + duplicate-tab guards
  [`action-map.ts:134`](../../orchestrator/action-map.ts#L134)

**Model wiring**

- `orderBook` state + loop + nav transitions
  [`fsm.ts:56`](../../model/fsm.ts#L56)

- scenario relation lists nav + select contracts
  [`relations.ts:117`](../../model/relations.ts#L117)

- regenerated plan hash (never hand-edited)
  [`smoke.test-plan.ts:17`](../../model/smoke.test-plan.ts#L17)

**Tests — pinned behavior**

- bound `corpusRefs` names the bound probe, not the default
  [`validator-map.test.ts`](../../validators/validator-map.test.ts)

- absent + duplicate-tab deterministic failures
  [`action-map.test.ts`](../../orchestrator/action-map.test.ts)

- orderBook seed path bootstraps through `clickTradeMenu`
  [`bootstrap.test.ts`](../../orchestrator/bootstrap.test.ts)

**Story artifacts**

- new `@plan:smoke` Gherkin with operator-precondition NOTE
  [`trade-order-book.feature`](../../features/trade-order-book.feature)