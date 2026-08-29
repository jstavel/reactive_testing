# Epic 2 Context: Scenario Collection Pipeline

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Jan can run a scenario against the live app and produce a recorded corpus with no assertions embedded. The orchestrator is offline and deterministic — no AI in the execution loop — and drives the browser via Playwright/CDP; specialized collectors receive the page from the orchestrator and capture evidence per concern. This epic builds the online/execution leg of the pipeline: it turns a generated Test Plan (path + collection + validators) into namespaced plain-data corpus files that pure validators and the reporter consume later, with verification kept strictly separate from collection.

## Stories

- Story 2.1: Orchestrator executes a Test Plan deterministically
- Story 2.2: Collectors capture page data
- Story 2.3: Scenario run produces a namespaced corpus with no embedded assertions
- Story 2.4: Collector errors are isolated
- Story 2.5: Connect to an existing authenticated browser via CDP
- Story 2.6: AI-assisted action specification

## Requirements & Constraints

- A scenario run produces a recorded corpus (DOM/aria snapshots, network events, DOM probes) with no assertions embedded; the run phase performs no verification, and corpus data is plain-data files, never embedded in TS code (FR-4).
- Orchestrator is offline and deterministic: reads a Test Plan (TypeScript file) and executes it with no AI calls during execution; drives the browser via Playwright/CDP, passes the page to collectors, and triggers validators (AD-4).
- Collectors are specialized and page-driven: the orchestrator passes the page; the collector captures data (page in → corpus data out). MVP collectors: snapshot, network, screenshot, DOM probe. Collectors never own browser connections (AD-5).
- Corpus is runtime evidence, not truth — evidence collected against the Model, never a source of truth; validators read it and never write to the Model (AD-2).
- Every shared data shape lives in `schemas.ts`: canonical corpus types (SnapshotRecord, NetworkEvent, ProbeResult, ScreenshotRef, ValidationResult) and plan types (PlanId, TestPlan). Collector output must conform to the corpus types (AD-13).
- Corpus files are namespaced by run: `collectorType/run-id/stepIndex.ext` plus a run-manifest.json (run-id, timestamp, file list). The orchestrator assigns the run-id (UUID) and stepIndex; collectors never choose filenames (AD-15).
- Collector errors are isolated: each runs in a try/catch; on failure partial corpus is written, remaining collectors still run, and the reporter flags the collection gap (AD-16).
- A Test Plan embeds the Model version it was derived from — a SHA-256 content hash of the committed `fsm.ts`, `contracts.ts`, `schemas.ts`; the orchestrator verifies it matches the current Model before execution and aborts with a clear error on mismatch (AD-17).
- Determinism: runtime is pure TypeScript; the browser may be closed after collection (NFR-1). `tsc --noEmit` clean is a precondition for any generated code (NFR-2). Corpus vocabulary and artifacts are English-only (NFR-4). One navigation funds N validators; new validators must not multiply navigation cost (AD-18, NFR-5).
- v1 scope is read-only flows only (order History, order book, portfolio); no mutating or order-execution contracts (NFR-3).

## Technical Decisions

- Stack: TypeScript 5.9.3, Node.js 24.19.0, Playwright 1.62.1, Zod ^4 (schemas exported from `schemas.ts`, types inferred via `z.infer`), CDP via Playwright.
- Pipeline shape: Gherkin → Model (SSOT) → Test Plans → Orchestrator → Collectors → Corpus → Validators → Reporter. Epic 2 owns the Orchestrator → Collectors → Corpus leg; authoring (AI agent) is offline and separate from execution.
- A Test Plan is a `*.test-plan.ts` file declaring the path (FSM states), collection, and validators; one file per plan (smoke/regression/acceptance). One format per file — runtime data lives in plain-data files under `corpus/snapshots/`, `corpus/network/`, `corpus/screenshots/`, `corpus/probes/`, never in TS.
- Naming: collectors `collect-*.ts` (e.g. `collect-snapshot.ts`); FSM states camelCase; contracts camelCase verb phrases; scenarios deterministic kebab-case slugs.
- Orchestrator must attach to an already-authenticated browser over CDP (`http://127.0.0.1:9222`) rather than launch a fresh anonymous one, because 2FA makes a machine-launched browser unable to reach Kraken Pro. A CDP-attached run opens a new tab in the authenticated context, navigates to the app home, and waits on the confirmed `readySelector`. On completion it only disconnects — `browser.close()` on the CDP handle never terminates the human's browser — and resets `activeSession` so a later run can re-attach. No reachable CDP endpoint → fail fast with an actionable error and no partial corpus.
- Contract `actionMap` entries must be static, deterministic, strict-mode single-target locators that satisfy the contract's postconditions/invariants, with no AI call at runtime; locators with no discoverable stable target are flagged and deferred, never fabricated.

## Cross-Story Dependencies

- Depends on Epic 1: the model files (`fsm.ts`, `contracts.ts`, `schemas.ts`) whose version test plans must match (AD-17), and the generated `*.test-plan.ts` files the orchestrator executes (Story 1.6). Corpus types in `schemas.ts` must exist before collectors are implemented.
- Story 2.5 (CDP attach) is a prerequisite for Story 2.6, which targets the live authenticated Kraken Pro home page; Story 2.6 additionally depends on contract `actionMap` entries from Epic 1 to have real locators.
- Stories 2.1–2.4 form a linear pipeline (orchestrator → collectors → namespaced corpus), with error isolation (2.4) cross-cutting the collectors (2.2).
- The corpora produced here feed Epic 3 (Verification & Gherkin Governance): validators read the corpus as pure functions, and their declared corpus dependencies drive which collectors the orchestrator runs.