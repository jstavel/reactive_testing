---
title: 'Story 2.1: Orchestrator executes a Test Plan deterministically'
type: 'feature'
created: '2026-08-26'
status: 'done'
review_loop_iteration: 0
baseline_commit: 'e89ad8487f3c5a0ed064288d4e6134f57013246c'
context:
  - _bmad-output/specs/spec-story-2-1-orchestrator-executes-a-test-plan-deterministically/SPEC.md
  - _bmad-output/specs/spec-story-2-1-orchestrator-executes-a-test-plan-deterministically/expanded-testplan-schema.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** There is no runtime to execute a generated test plan against a live app. The model and plan exist on disk, but nothing drives the browser.

**Approach:** Build an orchestrator module that reads a TestPlan, expands `scenarioIds` into per-scenario execution paths, validates against the FSM, and drives Playwright step-by-step through each scenario's declared state path with no AI in the loop.

## Boundaries & Constraints

**Always:** No AI calls during execution (AD-4); `modelVersion` must match before execution or abort (AD-17); `tsc --noEmit` clean; read-only flows only (NFR-3); English-only identifiers (NFR-4); `ContractAction` typed as `(context: { page: Page }) => Promise<void>`.

**Ask First:** HALT if a decision surfaces not covered by the spec (e.g. settling strategy ambiguity, new invariant-only scenario exclusion).

**Never:** Write corpus data (Story 2-3); run validators (Epic 3); parse Gherkin (AD-9); execute invariant-only scenarios (no contractId — Epic 3 validators); add a test framework without user confirmation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path | Valid TestPlan + matching modelVersion + reachable states | `RunResult` with all scenarios passed | N/A |
| modelVersion mismatch | TestPlan with stale hash vs current FSM+contracts+schemas | Abort immediately, error names expected vs actual hash | No browser navigation |
| Step timeout | Contract action exceeds `stepTimeout` (default 30s) | Abort current scenario, record error, continue next | Scenario marked `passed: false` with error message |
| Run timeout | Total run exceeds `runTimeout` (default 300s) | Abort remaining scenarios | Partial RunResult returned |
| Invalid stateId in step | Step references non-existent FSM state | Pre-execution validation fails fast | Error before browser launch |
| Invalid contractId in step | Step references non-existent contract or action-map entry | Pre-execution validation fails fast | Error before browser launch |
| Path not reachable from initialStateId | Steps don't form valid FSM traversal | Pre-execution validation fails fast | Error before browser launch |
| Browser launch failure | Playwright cannot launch/connect | Propagate error | No scenarios executed |

</frozen-after-approval>

## Code Map

- `model/schemas.ts:77-84` — current `testPlanSchema` (expand `scenarioIds` → `scenarios`)
- `model/contracts.ts:5` — `ContractAction` type (widen from `unknown` to `{ page: Page }`)
- `model/contracts.ts:8-19` — `DialogContract` interface (action field uses `ContractAction`)
- `model/contracts.ts:26-28` — placeholder action (replace with real impl in action-map)
- `model/contracts.ts:30-133` — 10 seed contracts with stable camelCase IDs
- `model/contracts.ts:136` — `allContracts` export
- `model/fsm.ts:8-15` — `FsmState` interface
- `model/fsm.ts:18-27` — `FsmTransition` interface (links stateId → contractId)
- `model/fsm.ts:30-35` — `FsmModel` interface
- `model/fsm.ts:80-84` — `homePageModel` (10 states, 12 transitions, initialStateId: "homePage")
- `model/smoke.test-plan.ts:7-36` — generated smoke plan (18 scenarioIds, needs regeneration)
- `orchestrator/orchestrator.ts` — core: `runTestPlan(plan, config): Promise<RunResult>`
- `orchestrator/action-map.ts` — contractId → Playwright action lookup
- `orchestrator/browser.ts` — Playwright browser lifecycle
- `tsconfig.json` — ES2023, NodeNext, strict, `verbatimModuleSyntax: true`

## Tasks & Acceptance

**Execution:**

- [x] `package.json` — add `playwright` as devDependency, run `npm install`
- [x] `model/schemas.ts` — expand `testPlanSchema`: replace `scenarioIds` with `scenarios` array; add `ScenarioStep`, `ScenarioPath`, `ScenarioResult`, `RunResult`, `OrchestratorConfig` types
- [x] `model/contracts.ts` — widen `ContractAction` to `(context: { page: Page }) => Promise<void>`; import `Page` from `playwright`
- [x] `orchestrator/browser.ts` — implement `launchBrowser(config)`, `closeBrowser()` for Playwright lifecycle
- [x] `orchestrator/action-map.ts` — create `Record<string, (context: { page: Page }) => Promise<void>>` mapping all 10 contract IDs to Playwright actions
- [x] `orchestrator/orchestrator.ts` — implement `runTestPlan`: pre-execution validation (Zod parse, FSM state/contract existence, path validity), initial-state bootstrapping, step-by-step execution with settling, failure handling (step timeout → abort scenario, run timeout → abort all)
- [x] `model/smoke.test-plan.ts` — regenerate with expanded schema (18 scenarios with step paths for executable ones; skip invariant-only scenarios or mark with empty steps)
- [x] `orchestrator/orchestrator.test.ts` — unit tests with mocked Playwright Page for core logic
- [x] Verify: `npx tsc --noEmit` clean

**Acceptance Criteria:**
- Given a valid test plan and matching modelVersion, when `runTestPlan` is called, then it navigates every scenario's declared path and returns `RunResult` with all scenarios passed.
- Given a test plan with stale modelVersion, when `runTestPlan` starts, then it aborts immediately with expected vs actual hash error and no browser navigation occurs.
- Given a contract action in the plan, when the orchestrator executes the step, then the corresponding Playwright page interaction is performed.
- Given a test plan run (success or failure), when it completes, then the browser is closed and no orphan processes remain.
- Given `npx tsc --noEmit`, when run, then exits 0.

## Spec Change Log

## Design Notes

- **ContractId → Playwright mapping is static.** The action-map is a plain `Record` — no dynamic dispatch, no reflection. New contracts require a manual entry. This is intentional for determinism.
- **Invariant-only scenarios excluded.** Scenarios like `main-navigation-is-visible` have no `contractId` and cannot be executed by the orchestrator. They are excluded from the `scenarios` array in the test plan (Epic 3 validators handle them).
- **modelVersion hash algorithm.** UTF-8 encode, LF-normalize, sort filenames alphabetically, SHA-256 hex digest. Same algorithm as Story 1-6.
- **Settling strategy.** After each action, wait for `readySelector` (configurable) before proceeding to next step.

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: exit 0
- `npx playwright test` (or equivalent) -- expected: unit tests pass

**Manual checks (if no CLI):**
- Run `runTestPlan` against live Kraken Pro with smoke plan — all executable scenarios complete without hanging

## Suggested Review Order

**Core orchestrator logic**

- Entry point: pre-validation, browser lifecycle, scenario loop with settling
  [`orchestrator.ts:25`](../../orchestrator/orchestrator.ts#L25)

- FSM state/contract/path validation before execution
  [`orchestrator.ts:96`](../../orchestrator/orchestrator.ts#L96)

- Step execution with timeout and post-action settling
  [`orchestrator.ts:145`](../../orchestrator/orchestrator.ts#L145)

**Schema expansion**

- New types: ScenarioStep, ScenarioPath, ScenarioResult, RunResult, OrchestratorConfig
  [`schemas.ts:76`](../../model/schemas.ts#L76)

- TestPlan.scenarios replaces scenarioIds
  [`schemas.ts:136`](../../model/schemas.ts#L136)

**Playwright integration**

- Browser launch/close lifecycle with session guard
  [`browser.ts:12`](../../orchestrator/browser.ts#L12)

- Static contractId → Playwright action lookup
  [`action-map.ts:7`](../../orchestrator/action-map.ts#L7)

**Contract type widening**

- ContractAction typed to { page: Page }
  [`contracts.ts:5`](../../model/contracts.ts#L5)

**Model version hashing**

- SHA-256 over LF-normalized model files
  [`model-version.ts:12`](../../model/model-version.ts#L12)

**Test plan regeneration**

- 10 executable scenarios with step paths
  [`smoke.test-plan.ts:7`](../../model/smoke.test-plan.ts#L7)

**Tests**

- 11 unit tests: happy path, timeouts, validation, exhaustiveness, settling
  [`orchestrator.test.ts:1`](../../orchestrator/orchestrator.test.ts#L1)
