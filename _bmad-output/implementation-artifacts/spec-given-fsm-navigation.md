---
title: 'Compile Given into deterministic FSM bootstrap navigation'
type: 'feature'
created: '2026-09-08'
baseline_commit: '33b86c23e26cc67f3ec8c1c7b604851de0e54955'
status: 'done'
review_loop_iteration: 0
context:
  - _bmad-output/implementation-artifacts/epic-2-context.md
  - _bmad-output/implementation-artifacts/spec-3-2-validator-declares-corpus-dependencies-one-navigation-funds.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A scenario's `Given` state is currently documentation text, not an executable precondition. Running `open-the-assets-filter` in isolation (or in an order where a preceding scenario leaves the page elsewhere) fails, because the runner bootstraps only to `/app/home` and never reaches the scenario's required state via the model.

**Approach:** Compile every scenario's `Given` into deterministic FSM navigation: before a scenario, compute a bootstrap path from the current FSM state to the scenario's first-step state via model transitions and execute it with contracts. Because a full run's consecutive scenarios can be disconnected, make `homePage` the single ground state — every non-home state gets a chain back home via a new `navigateHome` contract, so the next scenario always boots from `home` into its required state.

## Boundaries & Constraints

**Always:**
- `givenStateId`-first bootstrap: before a scenario's first action, if the current FSM state differs from the scenario's first-step stateId, navigate the shortest model-transition path from current → required state using contracts (`actionMap`), never direct URL `page.goto`. When they are equal, nothing is bootstrapped.
- `homePage` is the single resettable (`initialStateId`) state. Every non-home state that is a declared `homePageModel` state has a model transition back to `homePage`, driven by a new `navigateHome` contract.
- Bootstrap steps are recorded in the corpus and report marked `bootstrap`, share the same collector machinery, are validated against their contracts' pre/postconditions, and appear as `setup`, never as scenario-scoped run results.
- Decision: multi-path/no-path at plan-validation time. No path current → required → reject with a clear error. Multiple distinct paths → reject with a clear error unless the scenario/plan explicitly declares a priority route override (new `givenStateId`/route field). Standalone overrides are `<frozen>` design decisions; `givenStateId` is auto-derived from the scenario's first step stateId by default per Q2(c).
- `navigateHome` is a model-level contract: it must live in `model/contracts.ts`, declare `from != homePage → homePage` transition in `model/fsm.ts`, and its `action-map` locator must be discovered live. The page must be settled to `homePage` after it runs (`settleSelector` still applies) and the URL must match `/app/home` (or home route) so `url-is`/`state-is` postconditions hold.
- Path computation, validation, and preference are deterministic (NFR-1). No AI at runtime.

**Ask First:**
- `navigateHome` locator discovery procedure against the live authenticated Kraken Pro (follow the 2.6 live-discovery pattern; a "Home"/logo side-nav button). If live discovery is blocked, HALT and ask before choosing the locator.
- Whether `givenStateId` is a full `ScenarioPath` + `givenStateId` schema change (Q2(b)) vs. deriving at run time from the first step's stateId only (Q2(a/c)). Recommend: add the optional `givenStateId`/`route` field to `ScenarioPath`, default-derived from the first step, so the feature is explicit yet backward-compatible.
- Scope of the runtime guard: enforce only that the bootstrap completes before first action, or verify expected state before every contract action (Q4 runtime guard). Recommend: verify before every step using the pre-step snapshot/probe compare; a mismatch is a scenario `setup` failure.

**Never:**
- Direct `page.goto` for within-session navigation; only `navigateHome` uses the accepted pattern (per Q2/RFC "bootstrap via contracts, not direct URL manipulation").
- Editing existing model states, features, contracts, or behaviors. Only add `navigateHome` and the non-home → home transitions; do not change existing `homePage → X` transitions, contracts, or the plan itself.
- No AI at runtime, no order-dependent scenarios. Scenario independence and determinism (NFR-1) are the goal, not a best-effort nicety.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_ISOLATED | `open-the-assets-filter`, plan starts at `homePage` | oracle: `homePage → clickHistoryMenuMain → historyMain`, then `filterHistoryByAsset`; scenario passes, bootstrap marked | no special handling |
| SAME_STATE | first-step stateId == current state | no bootstrap steps; run continues from the shared page | none (no-op) |
| DISCONNECTED_FULL_RUN | scenario 1 ends `historyMain`, scenario 2 starts `homePage` | bootstrap computes `historyMain → navigateHome → homePage`, then `homePage → …` | missing `navigateHome` locator → hard-fail with clear error, never a silent guess |
| NO_PATH | required state unreachable from current state | preflight failure before browser launch | reject in `validatePlan` with a useful path error; no URL nav attempted |
| MULTI_PATH | two shortest paths of equal length to required state | reject unless the scenario carries an override; with override, honor it deterministically | override with unknown state/route → validation error |
| NAV_FAIL ⇒ SETUP | action-map lookup missing at bootstrap time | bootstrap action failure recorded as setup, scenario fails | gap → StepFailure, not silent pass/no-op; no partial run of scenario actions |

</frozen-after-approval>

## Code Map

- `model/fsm.ts` -- `homePageModel`: `states`, `transitions`, `initialStateId`. Add `navigateHome` transition `X → homePage` for every state `X != homePage`; this is the **single resettable ground** enabling `Given` resolution from any entry state.
- `model/contracts.ts` -- `allContracts`: add `navigateHome` contract declaring `from != homePage` pre / `state-is homePage` post; `url-is`/`view-selected` analogues to the other nav contracts.
- `model/schemas.ts` -- `ScenarioPath` (interface) + `testPlanSchema` scenarios element: add optional `givenStateId?` and `route?` (path/route override) fields; default-derived from the scenario's first step stateId. This is a model change → bumps `computeModelVersion()` (model-version.ts hashes `contracts.ts`, `fsm.ts`, `schemas.ts`).
- `model/smoke.test-plan.ts` -- derived plan; regenerate **after** the model+schemas change so `plan.modelVersion` matches. Scenarios starting off-home (e.g. `open-the-assets-filter`) still list only their test steps (bootstrap is derived at run time, not baked into the plan).
- `orchestrator/orchestrator.ts` -- `validatePlan` (currently orchestrator.ts:194-241): add current-state resolution, multi-path/no-path rejection, and `givenStateId`/route consistency checks. Execution loop (>243): compute per-scenario bootstrap path, execute bootstrap contracts + capture evidence (`phase:bootstrap`), then run scenario steps. Add a resolution module (pure, exported, unit-testable) alongside.
- `orchestrator/action-map.ts` -- add `navigateHome` entry: discovered live; `page.getByRole(...)` for a static Home/logo button in the side-nav, `waitForURL("**/app/home")`. Mirrors existing nav action pattern (action-map.ts:22-32).
- `orchestrator/corpus.ts` -- `writeCorpusFile` already phase-tags via `stem` (`0.pre`, `0.failure`); bootstrap evidence uses the same stem convention (`b` prefix or an out-of-band `phase` marker so `loadCorpusSteps` ignores/keeps it).
- `validators/corpus-loader.ts` + `validators/offline-runner.ts` -- must keep validating scenario steps only, and validate bootstrap explicitly only when the manifest marks them; the loader's `planSteps` walks the plan — extend to skip `route`/`givenStateId` metadata.
- `repro/repro-generator.ts` -- `validatePath` currently demands `steps[0].stateId === initialStateId` and rejects off-home starts (repro-generator.ts:266-271). Change to: accept a `givenStateId`/`route` in `ReproPath`, and have the emitted script compute and run the bootstrap path (mirroring the orchestrator) before the bug repro steps.
- `model/model-version.ts` -- hashes the three model files; any schema/contract/fsm edit requires the plan to be regenerated, else `npm run run:smoke` fails on the modelVersion check (orchestrator.ts:51-57).

## Tasks & Acceptance

**Execution:**
- [x] `model/fsm.ts` -- add `navigateHome` transitions `X → homePage` for every non-home state -- provide the universal return-to-init edge
- [x] `model/contracts.ts` -- add `navigateHome` contract (pre `from != homePage`, post `state-is homePage`) -- declare the return behavior
- [x] `model/schemas.ts` -- add optional `givenStateId?: string` and `route?: RouteStep[]` to `ScenarioPath`/testPlan scenario element -- explicit, backward-compatible `Given` + override hook
- [x] `orchestrator/orchestrator.ts` -- add a pure `resolveBootstrapPath` module (current state, `givenStateId`, FSM) with multi/no-path rejection, wire it into `validatePlan` preflight and the execution loop with `bootstrap` evidence capture -- compile `Given` into deterministic navigation
- [x] `orchestrator/action-map.ts` -- add `navigateHome` action with live-discovered locator + `waitForURL("**/app/home")` -- execute the return contract
- [x] `orchestrator/corpus.ts` -- phase-mark bootstrap evidence (`b`/`bootstrap` stems) so the loader/manifest can distinguish it -- record bootstrap without polluting scenario steps
- [x] `validators/offline-runner.ts` + `validators/corpus-loader.ts` -- make the offline validator skip-only-bootstrap evidence by default; validate bootstrap when the manifest marks it -- keep offline checks aligned with the scenario contract
- [x] `repro/repro-generator.ts` -- accept `givenStateId`/`route`, emit bootstrap computation+execution in the repro script replacing the hard `initialStateId` check -- repros runnable from off-home start
- [x] `model/smoke.test-plan.ts` -- regenerate (post-model change) so `plan.modelVersion === computeModelVersion()` -- SSOT guard passes, plan reflects new schema
- [x] Tests -- `orchestrator.test.ts`: isolated-filter bootstrap (home→history→filter) passes; `same-state` no-op; disconnected full-run scenario; no-path/multi-path preflight rejection; bootstrap evidence recorded/validated and kept out of scenario results; `navigateHome` action-map + contract + FSM entries exist for every non-home state; `repro-generator.test.ts`: off-home-start repro with bootstrap
- [x] `orchestrator/bootstrap.test.ts` -- new unit tests for `resolveBootstrapPath` (isolated History bootstrap, same-state no-op, return-via-home, unreachable, multi-path, route override) -- pin the resolver's deterministic contract
- [x] `bin/run-smoke.ts` -- log per-scenario setup (bootstrap) results -- operator distinguishes bootstrap from scenario failures

**Acceptance Criteria:**
- Given an off-home scenario like `open-the-assets-filter`, when I run just that scenario (after a run that left a different state), then the orchestrator computes and executes the bootstrap path to `historyMain` before the filter action, and the scenario passes.
- Given a full smoke plan whose consecutive scenarios are disconnected, when any scenario starts from a state other than its predecessor's end state, then the orchestrator's bootstrap computes a `navigateHome` return to `homePage` and boots into the required state — no `URL`-only reset, deterministic order.
- Given a scenario whose `givenStateId` is unreachable, when `validatePlan` runs, then it fails with a clear path error, before any browser session.
- Given multiple possible bootstrap paths, when no explicit `route` override exists, then the plan fails preflight deterministically (and with an override it follows the override).
- Given a bootstrap step fails, when its action-map action throws, then the scenario reports a `setup` failure `passed: false` with the step recorded, and no scenario action ran.
- Given a recorded corpus with bootstrap evidence, when the offline validator runs, then bootstrap-only evidence is either skipped or validated per the manifest, and scenario steps are validated exactly as before.

## Spec Change Log

<!-- Append-only. Populated by step-04 during review loops. Do not modify or delete existing entries. -->

## Design Notes

- **Bootstrap algorithm (deterministic BFS).** From the FSM, compute the shortest transition path from the scenario's start state to `givenStateId`. When a scenario starts at `homePage` (the common case), the path is empty — no bootstrap. Multi-path resolution: lexicographically-smallest contractId (NFR-1) unless a `route` override pins the sequence.
- **Why home is the single ground.** `navigateHome` gives every state a return edge to `homePage`; consecutive scenarios are therefore always connected, and the "reset" point is `homePage`'s `settleSelector`, not a raw `goto`. This is the general rule you asked for: features always return to init.
- **Golden path for `open-the-assets-filter`:** `homePage → clickHistoryMenuMain → historyMain` then `filterHistoryByAsset`; bootstrap steps are marked, e.g. `0.b` / `b.0` in corpus files, with a `phase: bootstrap` in the manifest; offline validation checks them only when the manifest marks them.
- **Corpus/loader interplay.** `corpus-loader.ts` walks the plan by step index; bootstrap steps must either (a) live in the plan as explicit `bootstrap:true` steps the loader skips for scenario-scoped validators, or (b) be phase-stemmed so the loader's `planSteps` and `loadCorpusSteps` both skip them unless a caller opts in. Keep it deterministic and index-aligned: bootstrap steps do not consume scenario step indices.

## Verification

**Commands:**
- `npm run typecheck` -- expected: exits 0, no type errors
- `npm test` -- expected: exits 0, all tests pass including the new bootstrap/orchestrator/repro tests and `modelVersion === computeModelVersion()` (model-version test)

**Manual checks:**
- `npm run run:smoke` against the live CDP session: `open-the-assets-filter` alone now passes; a full smoke plan passes regardless of scenario order; `navigateHome` appears in `corpus/<run>/run-manifest.json` with `phase: bootstrap`.

## Suggested Review Order

**Model — home as the single ground state**

- Every non-home state gains a contract-driven return edge to `homePage`.
  [`fsm.ts:80`](../../model/fsm.ts#L80)

- `navigateHome` declares the return behaviour (post: home state + home URL).
  [`contracts.ts:134`](../../model/contracts.ts#L134)

- `actionMap` entry clicks the side-nav Home control and waits for the home URL.
  [`action-map.ts:98`](../../orchestrator/action-map.ts#L98)

**Bootstrap resolution (the design intent — read this first)**

- Pure shortest-path resolver: no-path and multi-path rejection, route overrides.
  [`bootstrap.ts:12`](../../orchestrator/bootstrap.ts#L12)

**Orchestrator wiring**

- Per-scenario bootstrap loop: resolve, execute, record, then run the scenario.
  [`orchestrator.ts:169`](../../orchestrator/orchestrator.ts#L169)

- Unknown-state recovery: re-ground at home via `navigateHome` after a failure.
  [`orchestrator.ts:116`](../../orchestrator/orchestrator.ts#L116)

- Preflight walks state across scenarios so bootstrap is validated before launch.
  [`orchestrator.ts:320`](../../orchestrator/orchestrator.ts#L320)

- Collector/probe planning covers only scenario steps + real bootstrap contracts.
  [`orchestrator.ts:403`](../../orchestrator/orchestrator.ts#L403)

- Manifest carries one record per bootstrap step with its own evidence files.
  [`corpus.ts:56`](../../orchestrator/corpus.ts#L56)

**Schema**

- Optional `givenStateId`/`route` on a scenario; bootstrap records in the manifest.
  [`schemas.ts:248`](../../model/schemas.ts#L248)

**Repro generator**

- Emitted repro resolves and runs bootstrap, and re-validates an explicit route.
  [`repro-generator.ts:206`](../../repro/repro-generator.ts#L206)

**Runner output**

- Setup (bootstrap) results are logged per scenario, distinct from step failures.
  [`run-smoke.ts:64`](../../bin/run-smoke.ts#L64)

**Tests**

- Resolver contract: isolated, same-state, via-home, unreachable, multi-path, route.
  [`bootstrap.test.ts:6`](../../orchestrator/bootstrap.test.ts#L6)

- Orchestrator: isolated History bootstrap and home recovery after a failure.
  [`orchestrator.test.ts:278`](../../orchestrator/orchestrator.test.ts#L278)

- Emitted repro: off-home path bootstraps before its own steps at run time.
  [`repro-verify.test.ts:181`](../../repro/repro-verify.test.ts#L181)