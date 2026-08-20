# Epic 1 Context: Model Foundation & Recording

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 1 establishes the Model as the single source of truth for the application's behavior, expressed as executable TypeScript. It makes the model scaffolded, typed, and queryable so a QE (Jan) can define the FSM/contracts, record newly discovered states from a live session, dedup proposals, and assign each scenario to a named test plan. Everything downstream — collection, verification, repro — reads from this model; without it there is nothing to build against.

## Stories

- Story 1.1: Scaffold the executable model (Zod + type-safety gate)
- Story 1.2: Seed the read-only critical-path model
- Story 1.3: Discover-and-record a state in-session
- Story 1.4: Dedup query against the corpus
- Story 1.5: AI proposes, QE owns
- Story 1.6: Assign a scenario to a test plan

## Requirements & Constraints

- The model is the single source of truth; Gherkin is a human input layer, never the source of truth.
- The model is TypeScript only — FSM, contracts, schemas. No other languages for the model itself.
- `tsc --noEmit` must pass clean; types are the contract, and the model is verified by the compiler.
- English strictly for all identifiers, vocabulary, and comments; use "shared validator", never "aspect".
- v1 models read-only flows only (order History, order book, portfolio views); no order-execution or mutating contracts.
- States are scarce (~12), scenarios abundant (~20+); a scenario is a path through states, never a new state.
- Test plans are a fixed taxonomy — `smoke`, `regression`, `acceptance` — typed as a closed union; a scenario carries exactly one QE-assigned plan.

## Technical Decisions

- **Zod ^4** is the schema library; `schemas.ts` exports Zod schemas and TypeScript types are inferred (`z.infer`).
- Model files: `fsm.ts` (states, transitions, guards, initial state), `contracts.ts` (preconditions, action, postconditions, invariants), `schemas.ts` (all shared shape types).
- `schemas.ts` is the single home for every shared shape: corpus types (`SnapshotRecord`, `NetworkEvent`, `ProbeResult`, `ScreenshotRef`, `ValidationResult`) and plan types (`PlanId`, `TestPlan`).
- State classification (from `state-granularity.md`): URL change or main-panel change → new state; modal blocking dialog → nested state; action within a screen → contract; data value → parameter; tooltip/hover/focus → ignore.
- Naming: FSM states are camelCase screen names; contracts are camelCase verb phrases; validators `validate-` prefix; scenarios kebab-case slugs.
- The AI agent (OpenCode/MCP) proposes model updates; a human reviews and adjudicates before anything lands. Dedup happens in conversation against the committed `fsm.ts`/`contracts.ts`, not conversation history.
- Every test plan embeds the model version (SHA-256 of the three model files) and declares `planId` + scenario membership.

## Cross-Story Dependencies

- Story 1.2 seeds the model, so it requires Story 1.1's scaffold and `schemas.ts` types.
- Stories 1.3, 1.4, 1.5 operate on an existing model, so they follow Story 1.2.
- Story 1.6 needs `PlanId`/`TestPlan` from `schemas.ts` (Story 1.1) and authored `.feature` scenarios.
- Epics 2–4 read this model; the Model-as-SSOT invariant means any downstream build starts here.
