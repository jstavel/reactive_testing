# Pilot Backlog — Story 5-1 (History Filter/Pagination)

Friction points encountered while authoring `features/history-filter-pagination.feature`
as a first-time operator (add-only, read-only). Doc-caused items close in-story via
doc edits; framework-caused items escalate to `deferred-work.md` as their own later
story. Entries follow the deferred-work entry format (`source_spec` / `summary` / `evidence`).

## Framework-caused → escalate to deferred-work.md

- source_spec: `_bmad-output/implementation-artifacts/spec-5-1-history-filter-pagination.md`
  summary: No way to share a parameter value (e.g. the list of assets in the History Assets filter) across scenarios. A `TestPlan` scenario is only `{ id, steps }` with `{ stateId, contractId }` steps (`model/schemas.ts`), so a value used by several scenarios — the lifecycle keyed by a contract — must be duplicated inline in every scenario. The Escalating intent is a data-parameter slot shared across scenarios ("check every asset in the list"), which the current model cannot express.
  evidence: Scenario discussion (2026-09-07): user proposed "Then a list of assets with checkboxes is shown" followed by a later scenario "When I check asset for every one in the list then the app shows just the right asset items" — the list is meant to be wired once and reused. Live probe confirms the filter is a contract within `historyMain` (URL unchanged); `ScenarioStep`/`ScenarioPath`/`TestPlan` in `model/schemas.ts` carry no parameter field, and `model/contracts.ts` `DialogContract` has no parameterized contract shape. Gherkin `Scenario Outline`/`Examples` would be silently skipped by `reporter/gherkin-snapshot.ts` `extractScenario` (already a latent gap in deferred-work.md). Escalate: parameterized scenarios / data parameters shared across scenarios, when framework capabilities can be built.

# Pilot Backlog — Story 5-2 (Order Book / Selected View)

Friction points encountered while authoring `features/trade-order-book.feature`
as a first-time operator (add-only, read-only). Doc-caused items close in-story via
doc edits; framework-caused items escalate to `deferred-work.md` as their own later
story. Entries follow the deferred-work entry format (`source_spec` / `summary` / `evidence`).

## Framework-caused → escalate to deferred-work.md

- source_spec: `_bmad-output/implementation-artifacts/spec-5-2-order-book-selected-view.md`
  summary: The "+"-add action (adding the Order Book tab to the Favorites bar) is non-idempotent — it creates the tab only when absent and has no effect when the tab already exists. The current `{stateId, contractId}` model has no mechanism to express conditional or state-dependent actions (create-or-affirm), so the "+"-add step cannot be a plan step. The scenario must use only the idempotent half (selecting the existing tab), and the "+"-add becomes an operator run-protocol precondition documented in `docs/usage.md`.
  evidence: Spec discovery (2026-09-10): Jan confirmed the "+"-add is offered only when the tab is absent, making it non-deterministic for the static model. The scenario selects the existing Order Book tab (idempotent) and asserts `view-selected`. This is the same class of gap as the eye-toggle (`toggleEyeIcon`) and the parked state-loading concern (deferred-work.md:87-90) — all three are state-dependent outcomes the framework cannot control or branch on. Escalation filed in deferred-work.md.