# Pilot Backlog — Story 5-1 (History Filter/Pagination)

Friction points encountered while authoring `features/history-filter-pagination.feature`
as a first-time operator (add-only, read-only). Doc-caused items close in-story via
doc edits; framework-caused items escalate to `deferred-work.md` as their own later
story. Entries follow the deferred-work entry format (`source_spec` / `summary` / `evidence`).

## Framework-caused → escalate to deferred-work.md

- source_spec: `_bmad-output/implementation-artifacts/spec-5-1-history-filter-pagination.md`
  summary: No way to share a parameter value (e.g. the list of assets in the History Assets filter) across scenarios. A `TestPlan` scenario is only `{ id, steps }` with `{ stateId, contractId }` steps (`model/schemas.ts`), so a value used by several scenarios — the lifecycle keyed by a contract — must be duplicated inline in every scenario. The Escalating intent is a data-parameter slot shared across scenarios ("check every asset in the list"), which the current model cannot express.
  evidence: Scenario discussion (2026-09-07): user proposed "Then a list of assets with checkboxes is shown" followed by a later scenario "When I check asset for every one in the list then the app shows just the right asset items" — the list is meant to be wired once and reused. Live probe confirms the filter is a contract within `historyMain` (URL unchanged); `ScenarioStep`/`ScenarioPath`/`TestPlan` in `model/schemas.ts` carry no parameter field, and `model/contracts.ts` `DialogContract` has no parameterized contract shape. Gherkin `Scenario Outline`/`Examples` would be silently skipped by `reporter/gherkin-snapshot.ts` `extractScenario` (already a latent gap in deferred-work.md). Escalate: parameterized scenarios / data parameters shared across scenarios, when framework capabilities can be built.