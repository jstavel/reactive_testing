---
stepsCompleted: ["step-01-validate-prerequisites", "step-02-design-epics", "step-03-create-stories", "step-04-final-validation"]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-reactive-testing-2026-08-15/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-reactive-testing-2026-08-17/ARCHITECTURE-SPINE.md
  - _bmad-output/specs/spec-reactive-testing/SPEC.md
  - _bmad-output/implementation-artifacts/spec-2-5-connect-to-an-existing-authenticated-browser-via-cdp.md
  - _bmad-output/implementation-artifacts/spec-2-6-ai-assisted-action-specification.md
---

# Reactive Testing — Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Reactive Testing, decomposing the requirements from the PRD, Architecture, and SPEC into implementable stories.

## Requirements Inventory

### Functional Requirements

FR-1: Record a state into the corpus in the same session — a state discovered in a live session lands in the corpus and is immediately queryable by the agent.
FR-2: AI proposes, QE owns — candidate states, Gherkin scenarios, and contracts are proposed by the AI; nothing enters the corpus without the QE's adjudication.
FR-3: Dedup query against the corpus — Jan can ask "is this already in the specification?" and receive a verdict of existing (with reference) or new.
FR-4: Scenario run produces a corpus — running a scenario produces a recorded corpus (DOM/aria snapshots, network events, DOM probes) with no assertions embedded in the run.
FR-5: Verification reads only the corpus — shared validators are pure functions from corpus → result, with no browser access.
FR-6: New validation rule without re-running the scenario — a newly written validation rule can be executed against previously recorded corpora.
FR-7: Failure surfaces as reviewable Gherkin — a failing verification produces a Gherkin scenario a QE can read and a PM/PO can review.
FR-8: Adjudicated spec change only — spec changes occur only through human adjudication; no silent edits.
FR-9: Gherkin is never the SSOT — Gherkin is a query/input layer; FSM/contracts are the machine truth.
FR-10: Propose missing edges — [DEFERRED to v1.1] from the corpus alone, produce a proposed edge/shortcut with reasoning.
FR-11: Standing reachability invariant — [DEFERRED to v1.1] a pass/fail check that one critical task remains reachable from every important state.
FR-12: Standalone repro from the model — a reported bug path yields a runnable standalone script that reproduces the failure, generated from the FSM/contracts.
FR-13: Cross-view standing invariant — a validation rule that one fact agrees across every modeled surface that shows it.
FR-14: Test plan assignment — test plans are named, plural artifacts from a fixed traditional taxonomy (`smoke`, `regression`, `acceptance`); the QE specifies which plan covers a scenario, and the assignment is recorded and regenerable.

### NonFunctional Requirements

NFR-1: Determinism — runtime verification is pure TypeScript; the browser may be closed after collection.
NFR-2: Type-safety gate — `tsc --noEmit` clean is a precondition for any generated code; types are the contract.
NFR-3: Read-only v1 scope — in v1 the agent automates read-only flows only (order History, order book, portfolio views); order-execution deferred.
NFR-4: English strictly — corpus vocabulary and generated artifacts are English-only; the term "aspect" is banned (use "shared validator").
NFR-5: State-reuse efficiency — one navigation funds N Validators; new validators must not multiply navigation cost.

### Additional Requirements (from Architecture)

Zod: Schema library — schemas.ts exports Zod schemas; TypeScript types are inferred (`z.infer<typeof schema>`).
AD-1: Model is the SSOT — FSM/contracts/schemas are the sole authority; Gherkin is input, test plans derived, corpus evidence.
AD-2: Corpus is runtime evidence, not truth — validators read the corpus and never write to the Model.
AD-3: Validators are per-contract pure functions — corpus in → pass/fail out; cross-state invariants emerge from implementation.
AD-4: Orchestrator is offline and deterministic — no AI in runtime; drives the browser via Playwright/CDP.
AD-5: Collectors are specialized and page-driven — the Orchestrator passes the page; the collector captures data.
AD-6: Validator declares corpus dependencies — the Orchestrator plans which collectors to run.
AD-7: Repro Generator emits standalone scripts — reads the Model, emits a standalone Playwright script, no framework dependency.
AD-8: Reporter is separate from Orchestrator — reads the corpus, emits human reports and xunit/JSON.
AD-9: Gherkin Interface is a file convention — `.feature` files, no parser, never the SSOT.
AD-10: AI Agent proposes, human reviews — no silent Model edits.
AD-11: Graph queries deferred to v1.1 — FR-10, FR-11 out of v1 scope.
AD-12: Dedup for Model updates — conversation-time dedup against committed fsm.ts/contracts.ts.
AD-13: Corpus data shape defined by schemas.ts — canonical corpus types and plan/artifact types.
AD-14: Validator returns typed results — every validator returns ValidationResult.
AD-15: Corpus files namespaced by run — `collectorType/run-id/stepIndex.ext` plus run-manifest.json.
AD-16: Collector errors are isolated — partial corpus written, remaining collectors run, reporter flags the gap.
AD-17: Test Plan references Model version — SHA-256 of model files; Orchestrator verifies and aborts on mismatch.
AD-18: State-reuse invariant — one navigation funds N validators.
AD-19: Test plans named and QE-assigned — `smoke`/`regression`/`acceptance`, `@plan:<id>` tag.

### UX Design Requirements

N/A — UX Design deferred to later sprint.

### FR Coverage Map

FR-1 → Epic 1: Model Foundation & Recording — Record state into corpus
FR-2 → Epic 1: Model Foundation & Recording — AI proposes, QE owns
FR-3 → Epic 1: Model Foundation & Recording — Dedup query
FR-4 → Epic 2: Scenario Collection Pipeline — Scenario run produces corpus
FR-5 → Epic 3: Verification & Gherkin Governance — Pure validators
FR-6 → Epic 3: Verification & Gherkin Governance — New rule without re-run
FR-7 → Epic 3: Verification & Gherkin Governance — Failure as Gherkin
FR-8 → Epic 3: Verification & Gherkin Governance — Adjudicated change only
FR-9 → Epic 3: Verification & Gherkin Governance — Gherkin not SSOT
FR-10 → DEFERRED v1.1
FR-11 → DEFERRED v1.1
FR-12 → Epic 4: Repro Generation & Cross-View — Standalone repro
FR-13 → Epic 4: Repro Generation & Cross-View — Cross-view invariant
FR-14 → Epic 1: Model Foundation & Recording — Test plan assignment

## Epic List

### Epic 1: Model Foundation & Recording
Jan can define the FSM/contracts as Zod schemas, record new states from live sessions, query for dedup, and assign each scenario to a named test plan. The model is the SSOT; everything else depends on it.
**FRs covered:** FR-1, FR-2, FR-3, FR-14
**ADs covered:** Zod, AD-1, AD-10, AD-12, AD-13, AD-17, AD-19

### Epic 2: Scenario Collection Pipeline
Jan can run a scenario against the live app and produce a recorded corpus with no assertions embedded. The orchestrator is offline and deterministic; collectors receive the page from the orchestrator.
**FRs covered:** FR-4
**ADs covered:** AD-2, AD-4, AD-5, AD-13, AD-15, AD-16, AD-17
**NFRs covered:** NFR-5

### Epic 3: Verification & Gherkin Governance
Jan can run pure validators against corpora, see failures as reviewable Gherkin, and adjudicate spec changes. Verification is deterministic; Gherkin is never the SSOT.
**FRs covered:** FR-5, FR-6, FR-7, FR-8, FR-9
**ADs covered:** AD-1, AD-2, AD-3, AD-6, AD-8, AD-9, AD-10, AD-14, AD-18

### Epic 4: Repro Generation & Cross-View Validation
Jan can generate standalone repro scripts from the model and run cross-view invariants over recorded corpora. Bug repros are automated; stale-view bugs are caught offline.
**FRs covered:** FR-12, FR-13
**ADs covered:** AD-3, AD-7, AD-13, AD-14

## Epic 1: Model Foundation & Recording

Jan can define the FSM/contracts as Zod schemas, record new states from live sessions, query for dedup, and assign each scenario to a named test plan. The model is the SSOT; everything else depends on it.

### Story 1.1: Scaffold the executable model (Zod + type-safety gate)

As a QE,
I want the model scaffolded as TypeScript with Zod schemas (`fsm.ts`, `contracts.ts`, `schemas.ts`) and a clean `tsc --noEmit` gate,
So that the spec is machine-verifiable from day one.

**Acceptance Criteria:**

**Given** a fresh TypeScript project with Zod ^4
**When** I run `tsc --noEmit`
**Then** it passes clean and types are inferred from Zod schemas (`z.infer`)
**And** `schemas.ts` exports the corpus types (SnapshotRecord, NetworkEvent, ProbeResult, ScreenshotRef, ValidationResult) and the plan types (`PlanId`, `TestPlan`)
**And** identifiers and artifacts are English-only (NFR-4)

### Story 1.2: Seed the read-only critical-path model

As a QE,
I want the seed FSM and contracts for order History, order book, and portfolio defined per `state-granularity.md`,
So that recording starts from a grounded model rather than an empty corpus.

**Acceptance Criteria:**

**Given** the model scaffold
**When** I model the History/Main/Ledger state and its contracts (filter-by-type, paginate, clear-filters)
**Then** classification follows `state-granularity.md` — URL change → state, action → contract, data value → parameter
**And** only read-only flows are modeled (no mutating or order-execution contracts) (NFR-3)

### Story 1.3: Discover-and-record a state in-session

As a QE,
I want to record a newly observed state or contract from the live browser into the model within the same session,
So that the corpus grows without leaving the session.

**Acceptance Criteria:**

**Given** a live authenticated session
**When** the AI reads the DOM/aria and I adjudicate a new state
**Then** it lands in `fsm.ts`/`contracts.ts` and an immediate re-query against the corpus sees it (FR-1)
**And** classification follows `state-granularity.md`

### Story 1.4: Dedup query against the corpus

As a QE,
I want to ask "is this already in the specification?" and receive a verdict of existing (with reference) or new,
So that I do not duplicate states or contracts already in the model.

**Acceptance Criteria:**

**Given** a proposed state or contract
**When** I run the dedup query
**Then** it returns existing (with its location in the model) or new (FR-3)
**And** the answer is sourced from the committed `fsm.ts`/`contracts.ts`, never conversation history (AD-12)

### Story 1.5: AI proposes, QE owns

As a QE,
I want every AI-proposed state, Gherkin scenario, and contract to require my adjudication before entering the corpus,
So that no unreviewed change lands in the model.

**Acceptance Criteria:**

**Given** an AI proposal for a candidate state/contract/scenario
**When** I reject it
**Then** it is never written to the corpus (FR-2)
**And** the corpus `updated` reflects only accepted entries (FR-2)

### Story 1.6: Assign a scenario to a test plan

As a QE,
I want to assign a scenario to one named test plan (`smoke`, `regression`, or `acceptance`) with the assignment recorded and regenerable,
So that each scenario runs in its intended suite.

**Acceptance Criteria:**

**Given** a scenario authored as a `.feature`
**When** I tag it `@plan:<id>` and the AI generates or updates the plan file
**Then** the named `*.test-plan.ts` declares `planId`, `modelVersion` (SHA-256 of the model files, AD-17), and the scenario id, and membership equals the set of scenario tags (FR-14, AD-19)
**And** a tag outside the `PlanId` union, a missing tag, or multiple tags is rejected at authoring (AD-19)

## Epic 2: Scenario Collection Pipeline

Jan can run a scenario against the live app and produce a recorded corpus with no assertions embedded. The orchestrator is offline and deterministic; collectors receive the page from the orchestrator.

### Story 2.1: Orchestrator executes a Test Plan deterministically

As a QE,
I want the orchestrator to read a Test Plan and drive the browser deterministically with no AI in the loop,
So that runs are reproducible.

**Acceptance Criteria:**

**Given** a generated test plan
**When** the orchestrator runs it
**Then** it navigates the declared path and makes no AI call (AD-4)
**And** it verifies `modelVersion` matches the current model before execution, aborting with a clear error on mismatch (AD-17)

### Story 2.2: Collectors capture page data

As a QE,
I want specialized collectors (snapshot, network, screenshot, probe) that receive the page from the orchestrator and capture data,
So that evidence is collected cleanly per concern.

**Acceptance Criteria:**

**Given** a live page handed over by the orchestrator
**When** each collector runs
**Then** it writes page-derived data in its own format (page in → corpus data out) (AD-5)
**And** produced data conforms to the corpus types in `schemas.ts` (AD-13)

### Story 2.3: Scenario run produces a namespaced corpus with no embedded assertions

As a QE,
I want a scenario run to produce a corpus of plain-data files namespaced by run, with no assertions embedded in the run,
So that collection and verification stay separate.

**Acceptance Criteria:**

**Given** a scenario run
**When** it executes
**Then** corpus files follow the `collectorType/run-id/stepIndex.ext` pattern and a `run-manifest.json` (run-id, timestamp, file list) is written (AD-15)
**And** the run phase performs no verification (FR-4)

### Story 2.4: Collector errors are isolated

As a QE,
I want a failing collector to write partial corpus and let remaining collectors run,
So that one failure never aborts the whole run.

**Acceptance Criteria:**

**Given** a collector that throws during a run
**When** the orchestrator runs the suite
**Then** that collector records `status=error`, remaining collectors still run, and the reporter flags the collection gap (AD-16)

### Story 2.5: Connect to an existing authenticated browser via CDP

As a QE,
I want the orchestrator to attach to an already-authenticated browser over CDP instead of launching a fresh anonymous one,
So that a deterministic run can drive Kraken Pro, which 2FA makes unreachable to a machine-launched browser (AD-4).

**Acceptance Criteria:**

**Given** Chromium running with CDP on `http://127.0.0.1:9222` and Kraken Pro logged in
**When** I run the smoke plan
**Then** the orchestrator attaches via CDP, opens a new tab in the authenticated context, navigates to the app home, waits on the confirmed `readySelector`, executes the steps, and writes a namespaced corpus + `run-manifest.json` (AD-4, AD-15)
**And** given a CDP-attached run that finishes (success or failure), the human's browser is left open — only a disconnect occurs (`browser.close()` on the CDP handle, which never terminates the browser), and `activeSession` is reset so a later run can re-attach
**And** given a run with no reachable CDP endpoint, it fails fast with an actionable error and no partial corpus
**And** `npm run typecheck` / `npm test` exit 0

### Story 2.6: AI-assisted action specification

As a QE,
I want every contract's action in the `actionMap` to target the real DOM element on the live authenticated Kraken Pro home page, discovered from the live DOM rather than guessed,
So that smoke-plan scenarios actually drive the app and Epic 2's "run a scenario against the live app" goal is demonstrable end-to-end (AD-4, NFR-1).

**Acceptance Criteria:**

**Given** the authenticated Kraken Pro home page (CDP `:9222`)
**When** I run the smoke plan
**Then** all scenarios PASS — every broken contract's action reaches its postcondition (post-nav URL, ledger/view selected, dialog open, values toggled)
**And** given any contract in `allContracts`, its `actionMap` entry is static, deterministic, strict-mode single-target, and satisfies the contract's `postconditions`/`invariants`, with no AI call at runtime
**And** `npm run typecheck` / `npm test` exit 0
**And** locators with no discoverable stable target are flagged and deferred, never fabricated

## Epic 3: Verification & Gherkin Governance

Jan can run pure validators against corpora, see failures as reviewable Gherkin, and adjudicate spec changes. Verification is deterministic; Gherkin is never the SSOT.

### Story 3.1: Validators are pure functions over the corpus

As a QE,
I want shared validators to be pure functions (corpus → result) with no browser access,
So that verification is deterministic and runnable with the browser closed.

**Acceptance Criteria:**

**Given** a recorded corpus
**When** a validator runs twice on it
**Then** results are identical, and no browser access occurs (FR-5)
**And** the result conforms to `ValidationResult` (`contractId`, `passed`, `details?`, `corpusRefs`) (AD-14)

### Story 3.2: Validator declares corpus dependencies; one navigation funds N validators

As a QE,
I want each validator to declare the corpus data it needs,
So that the orchestrator plans only the required collectors and one navigation funds many validators without multiplying navigation cost.

**Acceptance Criteria:**

**Given** a validator with declared corpus dependencies
**When** the orchestrator plans a run
**Then** it runs only the collectors that validator needs (AD-6)
**And** a validator whose state is unreachable by any existing path is flagged blocked until the FSM grows a reachable path (AD-18, NFR-5)

### Story 3.3: New validation rule without re-running the scenario

As a QE,
I want a newly written validation rule to run against previously recorded corpora,
So that regression checks do not require a live re-run.

**Acceptance Criteria:**

**Given** a previously recorded corpus
**When** I add a rule and run it
**Then** it produces results without launching the scenario or browser (FR-6)

### Story 3.4: Failure surfaces as reviewable Gherkin

As a QE,
I want a failing verification to surface as a Gherkin scenario a QE can read and a PM/PO can review,
So that failures are reviewable rather than buried in logs.

**Acceptance Criteria:**

**Given** a failing validator
**When** the run completes
**Then** a Gherkin artifact is produced naming the failing rule and the recorded corpus it ran against (FR-7)

### Story 3.5: Adjudicated spec change only

As a QE,
I want every spec change to go through a human adjudication of spec-drift vs app-bug,
So that no silent spec edits occur.

**Acceptance Criteria:**

**Given** a failing verification
**When** a spec change is proposed
**Then** it enters only after explicit human adjudication, and the corpus `updated` changes only on approval (FR-8)

### Story 3.6: Gherkin is never the SSOT

As a QE,
I want Gherkin to remain a derived input/query layer,
So that the FSM/contracts stay the single place a behavior change is recorded.

**Acceptance Criteria:**

**Given** a behavior change
**When** it is recorded
**Then** the edit lands in `fsm.ts`/`contracts.ts` and Gherkin is derived/regenerable, never the source of truth (FR-9)

## Epic 4: Repro Generation & Cross-View Validation

Jan can generate standalone repro scripts from the model and run cross-view invariants over recorded corpora. Bug repros are automated; stale-view bugs are caught offline.

### Story 4.1: Standalone repro script from the model

As a QE,
I want a reported bug path to yield a runnable standalone Playwright script generated from the FSM/contracts,
So that I can reproduce a failure without hand-writing it or coupling it to the test framework.

**Acceptance Criteria:**

**Given** a reported bug path expressed as a sequence of FSM states and contracts in the Model
**When** I run the Repro Generator against the Model
**Then** it emits a standalone Playwright script into `scripts/repro-*.ts` that navigates the path (FR-12b, AD-7)
**And** the script runs against the live app with no Reactive Testing runtime dependency — no Orchestrator or Validator, driven by Playwright over CDP (FR-12a, AD-7)
**And** an unmodeled path is reported as a gap rather than silently approximated (FR-12c)

### Story 4.2: Cross-view standing invariant validator

As a QE,
I want to declare a standing invariant once for a fact and have it checked across every modeled surface that shows that fact,
So that stale-view divergence — one fact, different values on different screens — is caught offline.

**Acceptance Criteria:**

**Given** a recorded corpus that spans multiple surfaces showing the same fact (e.g. current balance, open-order state)
**When** I declare a cross-view invariant once for that fact and run it over the corpus
**Then** it checks every modeled surface that shows the fact and passes when they agree (FR-13)
**And** a divergence fails with the offending view named (FR-13)
**And** it runs purely over the corpus with no browser access (FR-13, NFR-1)
**And** agreement semantics are declared per fact, so a legitimate edge-case divergence such as pending vs settled is not a false positive (PRD §4.6 assumption)
