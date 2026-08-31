---
title: 'Story 3.2: Validator declares corpus dependencies; one navigation funds N validators'
type: 'feature'
created: '2026-08-30'
status: 'done'
review_loop_iteration: 0
baseline_commit: '4de6d25f46b7dec23b2116e231a0cfc7839cdcbb'
context:
  - _bmad-output/planning-artifacts/epics/epics.md
  - _bmad-output/planning-artifacts/architecture/architecture-reactive-testing-2026-08-17/ARCHITECTURE-SPINE.md
  - _bmad-output/implementation-artifacts/spec-3-1-validators-are-pure-functions-over-the-corpus.md
---

## Intent

**Problem:** Story 3.1 delivered validators but only as fixture-fed pure functions — a `Validator` runs against a hand-built `ContractEvidence`, and the corpus loader / `contractId → stepIndex` mapping was explicitly deferred to 3.2. On the collection side, the orchestrator still runs **all four collectors** on every step (`orchestrator.ts` `executeScenario`), regardless of what any validator actually reads — a nav contract that only needs a snapshot + a probe still pays for network + screenshot. And nothing checks whether a validator's contract is even reachable in the FSM, so a validator targeting a state no scenario can reach would fail invisibly.

**Approach:** Make the corpus dependencies a *derived, declared property* of each contract — from its predicates: `state-is`/`url-is` read the snapshot, `view-selected` reads the `selected-view` probe; `dialog-open`/`dialog-closed` are not yet evaluatable (Story 3.1) and therefore declare **no** dependency until the dialog-surface story implements them. Then:
1. **Declared dependencies** (AD-6): a pure `corpusDependenciesFor(contractId)` returns the collector names a contract's validators need.
2. **Collector planning** (AD-6/NFR-5): the orchestrator plans which post-step collectors to run from the union of dependencies across the plan's contracts, so one navigation collects only what the plan's validators consume — and records the planned set in the run manifest so the corpus is self-describing.
3. **Reachability blocking** (AD-18/NFR-5): a contract is flagged **blocked** when *no* transition bearing it starts from a state reachable from the FSM `initialStateId` — i.e. it is exercisable if at least one of its transitions' `from` states is reachable.

Reuse was already inherent to 3.1's offline validators; 3.2 makes it *operational* — declared dependencies let the orchestrator plan exactly which collectors a run needs (AD-6), and reachability flags a validator no path can exercise (AD-18).

## Boundaries & Constraints

**Always:**
- `corpusDependenciesFor(contractId)` is a **pure** function of the contract's predicates (no browser, no IO) returning a subset of `CollectorName` (`snapshot`/`network`/`screenshot`/`probe`). Deterministic: same contract → same dependencies.
- Reachability is computed by a **pure** BFS over `homePageModel` transitions from `initialStateId`; a contract is **blocked** when *all* of its transitions start from unreachable states (exercisable if *any* transition's `from` is reachable) — flagged, never silently treated as valid.
- The orchestrator plans collectors from the declared dependencies and skips collectors no validator in the plan needs. The planned post-step set is recorded in the run manifest (`collectors`), so a skipped collector is distinguishable from a failed one. Collection is still *collection* — no assertion is embedded (FR-4); the dependency info only decides *which evidence to record*.
- The pre-step snapshot (Story 2.7) is **always** captured on every step, independent of the dependency union; the union governs only the *post-step* collectors. The manifest `collectors` therefore records the post-step planned set — the pre-step snapshot is self-evident via its `.pre.json` files.
- NFR-2 gate: `tsc --noEmit` clean and `npm test` green before done.

**Ask First (HALT):**
- **Dependency source.** Default: **derived** from the predicate vocabulary (`state-is`/`url-is` → `snapshot`; `view-selected` → `probe`; `dialog-open`/`dialog-closed` → *none* until evaluatable), not an explicit per-validator field — one source of truth, no drift. Alternative: an explicit `deps` field on each validator.
- **Orchestrator integration depth.** Default: the orchestrator computes the union of dependencies for the plan's contracts and skips collectors not in that union. Alternative (lighter): only ship the pure `corpusDependenciesFor` + reachability functions now, and defer the orchestrator skip to a later story. (The acceptance names the orchestrator, so the default includes it.)
- **Blocked representation.** Default: a pure `blockedContractIds(model)` (or `isContractBlocked(id)`) exposed for a future planner/reporter to consume — 3.4 owns surfacing it. It is not yet a manifest/result field.
- **Corpus loader scope.** Story 3.1's "fixture-only" note defers the *real* corpus loader (`contractId → stepIndex` mapping from a run's files). Default: 3.2 still does **not** build that loader — it stays with the dependency/reachability/orchestrator-planning scope; the loader is a follow-up.

**Never:**
- No `Page`/browser reaches a validator or the dependency/reachability functions (FR-5, NFR-1).
- Do not build the reporter or Gherkin rendering (Story 3.4) or the adjudication flow (Story 3.5).
- Do not embed assertions in the run (FR-4) — the orchestrator's collector skip is a *collection plan*, not verification.
- Do not re-navigate: validators still read the already-recorded corpus (NFR-5).
- Do not change validator purity semantics, the predicate vocabulary, or the `failures`/`errors` manifest axes from 2.7/3.1.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| NAV_CONTRACT_DEPS | `clickHistoryMenuMain` | `["snapshot", "probe"]` (state-is/url-is + view-selected) | N/A |
| EARN_CONTRACT_DEPS | `clickPortfolioMenuEarn` | `["snapshot"]` (url-is only, no probe) | N/A |
| DIALOG_CONTRACT_DEPS | `closePortfolioSummary` (dialog-open/dialog-closed) | `[]` — dialog predicates not yet evaluatable | N/A |
| UNKNOWN_CONTRACT_DEPS | unknown contractId | `[]` — no dependencies declared | explicit empty, not a throw |
| ORCHESTRATOR_PLANS | plan with only snapshot+probe contracts | network + screenshot collectors are **not** run | N/A |
| MISSING_PROBE_CONFIG | plan declares `view-selected` but no `selected-view` probe configured | fail fast with a clear error before navigation | pre-flight, not a validator failure |
| ALL_REACHABLE | current homePage model | every contract reachable; `blockedContractIds` empty | N/A |
| BLOCKED_STATE | synthetic model with an unreachable state | that state's contract flagged blocked | flagged, not silently valid |
| DETERMINISM | same model twice | identical dependencies + identical blocked set | N/A |

## Code Map

- `validators/dependencies.ts` (NEW) — pure `corpusDependenciesFor(contractId): CollectorName[]` derived from `allContracts` predicates, plus `requiredProbeNames(contractId)` for the pre-flight check; `CollectorName` already in `model/schemas.ts:130`.
- `validators/reachability.ts` (NEW) — pure `blockedContractIds(model: FsmModel): string[]` via BFS over `model.transitions` from `model.initialStateId`; `FsmModel` already in `model/fsm.ts`.
- `model/schemas.ts` — `runManifestSchema` gains `collectors: CollectorName[]` (the planned collector set; `.default([])` so legacy manifests still parse). Model-file edit → `modelVersion` bump.
- `orchestrator/corpus.ts` — `finishRun` accepts and writes `collectors` (always present).
- `orchestrator/orchestrator.ts` — `executeScenario` `:202-308` currently runs snapshot/network/screenshot/probe unconditionally; change it to run only the collectors in the plan's dependency union (a **per-run** union computed once in `runTestPlan` from the plan's `contractId`s) and pass that set to `finishRun`. Add a pre-flight check that declared probe dependencies are covered by `config.probes` (fail fast on a missing `selected-view` probe).
- `orchestrator/orchestrator.test.ts` — extend the `corpus wiring` block: a plan whose contracts only declare `snapshot`+`probe` must not call `collectors.network`/`collectors.screenshot`, and the manifest records `collectors: ["snapshot", "probe"]`.
- `validators/dependencies.test.ts` (NEW) — nav deps, earn deps (snapshot-only), unknown-contract `[]`, determinism.
- `validators/reachability.test.ts` (NEW) — all current contracts reachable; a synthetic unreachable state is flagged blocked.

## Tasks & Acceptance

**Execution:**
- [x] `validators/dependencies.ts` (NEW) — `corpusDependenciesFor(contractId)` derived from predicates; `requiredProbeNames(contractId)` for the pre-flight check.
- [x] `validators/reachability.ts` (NEW) — `blockedContractIds(model)` via BFS.
- [x] `model/schemas.ts` — add `collectors: CollectorName[]` to `runManifestSchema` (`.default([])`).
- [x] Regenerate `model/smoke.test-plan.ts` `modelVersion` after the `runManifestSchema` change (enforced by `model-version.test.ts`).
- [x] `orchestrator/corpus.ts` — `finishRun` accepts and writes `collectors`.
- [x] `orchestrator/orchestrator.ts` — plan the collectors from the dependency union; skip unneeded collectors in `executeScenario`; pass the planned set to `finishRun`; pre-flight check that declared probe dependencies are covered by `config.probes`.
- [x] `orchestrator/orchestrator.test.ts` — a snapshot+probe-only plan skips network/screenshot and records `collectors`.
- [x] `validators/dependencies.test.ts` + `validators/reachability.test.ts` (NEW).

**Acceptance Criteria:**
- Given a validator whose contract declares only snapshot + probe dependencies, when the orchestrator plans a run, then it runs only those collectors, not network or screenshot (AD-6), and the run manifest records `collectors` as that planned set.
- Given a plan whose contracts declare `view-selected` but whose `config.probes` lacks a `selected-view` probe, when the orchestrator plans the run, then it fails fast with a clear error rather than a late "missing evidence".
- Given a validator whose contract's `from` state is unreachable from the FSM initial state, when the model is queried, then that contract is flagged blocked until the FSM grows a reachable path (AD-18, NFR-5).
- Given a contract with no dependencies (or an unknown id), when queried, then it yields an empty dependency set, not an exception.
- Given `npm run typecheck` / `npm test`, when run, then exits 0.

## Spec Change Log

- **2026-08-30** — Initial draft. Derived from `epics.md` Story 3.2 (AD-6, AD-18, NFR-5). Builds on 3.1's validators; the real corpus loader remains deferred (a follow-up), so the collector-planning concern is handled via the dependency union over the plan's contracts rather than the full `contractId → stepIndex` mapping.
- **2026-08-30 (review)** — bmad-review (adversarial + edge-case) folded in: A1 FR-6/AD-6 complementary; A2 `collectors` on the manifest; A3 `dialog-*` no dependency; A4 blocked = no reachable `from`; A5 pre-step always captured, `collectors` = post-step set; A6 forward-declared; A7 modelVersion semantics; A8 per-run union; A9 collector-granular; A10 pre-flight probe check; A11 intent reworded; E1 `[]` = pre-step only; E2 degenerate reachability; E3 unknown-id two-layer.
- **2026-08-30 (implementation)** — Implemented and verified. `validators/dependencies.ts` (`corpusDependenciesFor` + `requiredProbeNames`) and `validators/reachability.ts` (`blockedContractIds`); `runManifestSchema.collectors` + `finishRun` writes it; the orchestrator plans the per-run dependency union, skips unplanned post-step collectors, and fails fast on a missing `selected-view` probe. Regenerated the smoke plan hash — the `model-version.test.ts` guard caught the stale hash first (retro item-4 working as designed). `npm run typecheck` clean; 114 tests pass (104 → 114).

## Design Notes

- **Dependencies derived, not declared twice.** The predicate vocabulary already encodes what a contract reads — deriving `corpusDependenciesFor` from it keeps one source of truth (the same principle 3.1 applied to declarations vs. interpreters). No per-validator `deps` field to drift.
- **Collector-granular dependencies.** Dependencies name collectors, not individual probes — `view-selected` declares `probe` (the collector runs as one unit), even though the interpreter reads only the `selected-view` probe by name. Per-probe granularity is out of scope.
- **Empty dependencies = pre-step only.** `corpusDependenciesFor` returning `[]` means the step collects only the always-on pre-step snapshot — no post-step collectors run (e.g. the dialog contracts after A3a).
- **Unknown id is a two-layer case.** `corpusDependenciesFor` returns `[]` for an unknown id (a safe pure lookup), but the orchestrator path is gated by `validatePlan`, which rejects unknown `contractId`s before planning — so `[]` from an unknown id is only reachable via a direct call to the pure function.
- **Collector skip is planning, not verification.** Skipping network/screenshot when nothing reads them is an efficiency decision made *before* collection, not an assertion made *after* — FR-4's "no assertions in the run" is untouched.
- **FR-6 and AD-6 are complementary, not conflicting.** `corpusDependenciesFor` prunes collection to what the plan's validators declare (AD-6). A future rule whose dependencies are already collected runs offline against the recorded corpus (FR-6); a rule needing a *new* collector declares a new dependency and triggers a fresh collection — rare, and expected. AD-6 avoids over-collecting for validators that don't exist yet; FR-6 only promises offline re-validation for rules whose evidence already exists.
- **Self-describing corpus.** The manifest records the planned `collectors` set, so "no network file" means "not planned" — never "silently missing". The skip reason is implicit: a collector absent from the set has no validator that declared it.
- **Reachability is a model property, not a validator one.** A blocked contract is a gap in the FSM (no path reaches its state), so the fix is growing the FSM, not touching the validator — AD-18's "until the FSM grows a reachable path" phrasing is literal.
- **`blockedContractIds` is forward-declared.** It is computed and tested in 3.2 as the AD-18 deliverable, and surfaced by the 3.4 reporter — not dead code (unlike retro F1's vestigial `action` field, it has a documented future consumer).
- **Degenerate reachability is safe.** A malformed model (empty `states`, or an `initialStateId` absent from `states`) makes the BFS visit nothing, so every contract is flagged blocked — the safe default, never silently valid. No special-case needed.
- **`modelVersion` semantics.** The `collectors` manifest field is a shared shape (AD-13), so editing `runManifestSchema` correctly bumps the hash; `validators/dependencies.ts` + `validators/reachability.ts` live outside the hash (like `action-map.ts`), so editing the interpreter/reachability never invalidates a plan.
- **Per-run union, not per-step.** The dependency set is a single union over all the plan's contracts, applied to every step. This over-collects slightly (a network-needing contract runs network on all steps), but it keeps the manifest `collectors` one clean set. Revisit per-step granularity only if a collector's output grows out of limits (e.g. network) — not now.
- **One navigation, N validators.** With dependencies declared and collectors planned, adding validator N+1 never re-navigates; it re-collects only when it declares a dependency the recorded corpus lacks (rare — see FR-6/AD-6 above), and otherwise just re-uses the recorded corpus.

## Verification

- `npm run typecheck` — expected: exit 0
- `npm test` — expected: existing suites + new dependencies/reachability/orchestrator-planning tests pass
