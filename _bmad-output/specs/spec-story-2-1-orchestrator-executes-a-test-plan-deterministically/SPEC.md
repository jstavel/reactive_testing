---
id: SPEC-story-2-1-orchestrator-executes-a-test-plan-deterministically
companions:
  - expanded-testplan-schema.md
sources:
  - ../../planning-artifacts/epics/epics.md
  - ../../planning-artifacts/architecture/architecture-reactive-testing-2026-08-17/ARCHITECTURE-SPINE.md
  - ../../planning-artifacts/prds/prd-reactive-testing-2026-08-15/prd.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Story 2.1: Orchestrator Executes a Test Plan Deterministically

## Why

The model (FSM + contracts + schemas) and a generated test plan exist, but there is no runtime to execute a plan against a live app. The Orchestrator closes the gap between plan on disk and browser execution.

## Capabilities

- **CAP-1**
  - **intent:** The orchestrator reads a generated test plan and executes the declared path through the FSM states, driving the browser deterministically.
  - **success:** Given the smoke test plan, when the orchestrator runs it against a live Kraken Pro session, then it navigates through every scenario's declared state path and completes without hanging or crashing.

- **CAP-2**
  - **intent:** The orchestrator verifies the test plan's modelVersion matches the current model before execution, aborting on mismatch.
  - **success:** Given a test plan with a stale modelVersion, when the orchestrator starts execution, then it aborts immediately with an error naming the expected and actual hashes and no browser navigation occurs.

- **CAP-3**
  - **intent:** The orchestrator supplies a Playwright Page to each step's contract action, replacing the placeholder actions with real browser interactions.
  - **success:** Given a contract whose action was a placeholder, when the orchestrator executes the step, then the corresponding Playwright page interaction (click, navigation, etc.) is performed against the live browser.

- **CAP-4**
  - **intent:** The orchestrator manages the Playwright browser lifecycle (launch, connect, close) for a test plan run.
  - **success:** Given a test plan run, when it completes (success or failure), then the browser is closed and no orphan processes remain.

## Constraints

- No AI calls during execution — the orchestrator is offline and deterministic (AD-4).
- modelVersion must match before execution; mismatch is a hard abort (AD-17).
- TypeScript only; `tsc --noEmit` clean.
- Read-only flows only — no order-execution or mutating contracts (NFR-3).
- English-only identifiers and artifacts (NFR-4).
- The orchestrator does NOT write corpus data — collection is owned by Story 2-2/2-3.
- The orchestrator does NOT run validators — verification is owned by Epic 3.
- The `ContractAction` signature is `(context: { page: Page }) => Promise<void>` — typed, not `unknown`.

## Non-goals

- Collectors (snapshot, network, screenshot, probe) — Story 2-2.
- Corpus writing and run-manifest generation — Story 2-3.
- Collector error isolation — Story 2-4.
- Validator execution — Epic 3.
- Reporter output — Epic 3.
- Gherkin parsing — never (AD-9).
- Invariant-checking scenarios (declarative, no contractId) — verified by Epic 3 validators.

## Assumptions

- Playwright is available as a dependency (will be added as part of this story's implementation).
- Kraken Pro is accessible at a configurable base URL for the Playwright browser session.
- The browser target (Chromium headless or headed) is configurable; default is headless.

## Decisions

- Per-scenario path embedded in `TestPlan` schema via `scenarios` field — no separate scenario files. See `expanded-testplan-schema.md` companion for the concrete shape.
- ContractId → Playwright action resolved via a static lookup map in `orchestrator/action-map.ts`.
- Orchestrator public API: `runTestPlan(plan: TestPlan, config: OrchestratorConfig): Promise<RunResult>`.
- Configuration via `OrchestratorConfig`: `baseUrl`, `headless` (default true), `readySelector`, `stepTimeout` (default 30000ms), `runTimeout` (default 300000ms).
- File structure: `orchestrator/orchestrator.ts` (core), `orchestrator/action-map.ts` (lookup), `orchestrator/browser.ts` (lifecycle).
- Initial-state bootstrapping: navigate to `baseUrl`, wait for `readySelector`, verify `initialStateId` reached.
- Post-action settling: wait for target state's URL pattern or configurable `settlingSelector`.
- Failure propagation: step timeout → abort current scenario, record error, continue next. Run timeout → abort all.
- Hash computation: UTF-8, LF-normalized, alphabetical filename order, SHA-256 hex digest.
- Pre-execution validation: Zod parse, FSM state/contract existence, path validity from `initialStateId`. Fail fast.
- Test strategy: unit tests with mocked Playwright; integration test against minimal HTML fixture; live Kraken Pro is manual acceptance.
