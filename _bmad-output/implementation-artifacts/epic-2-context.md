# Epic 2 Context: Scenario Collection Pipeline

## Goal

Jan can run a scenario against the live app and produce a recorded corpus with no assertions embedded. The orchestrator is offline and deterministic; collectors receive the page from the orchestrator and capture data independently.

## Stories

- 2.1 — Orchestrator executes a Test Plan deterministically
- 2.2 — Collectors capture page data
- 2.3 — Scenario run produces a namespaced corpus with no embedded assertions
- 2.4 — Collector errors are isolated
- 2.5 — Connect to an existing authenticated browser via CDP
- 2.6 — Specify the real per-contract actions against the live Kraken Pro home page (AI-assisted)

## Requirements & Constraints

**Orchestrator (Story 2.1):**
- Reads a Test Plan (TypeScript file) and executes it deterministically. No AI calls during execution.
- Verifies `modelVersion` (SHA-256 content hash of `fsm.ts`, `contracts.ts`, `schemas.ts`) matches the current Model before execution; aborts with a clear error on mismatch.
- Drives the browser via Playwright/CDP, passes the page to Collectors, and triggers Validators.

**Live Connection (Story 2.5):**
- Connects to an already-authenticated browser over CDP (`chromium.connectOverCDP`) — the only viable mode for Kraken Pro's 2FA; a fresh launch can never authenticate.
- Opens a new tab in the authenticated context and navigates it to the app home (same-app navigation preserves login).
- Detaches on completion — never closes the human's browser.

**Collectors (Story 2.2):**
- Multiple specialized collectors: SnapshotCollector, NetworkCollector, ScreenshotCollector, DOM Probe Collector.
- The orchestrator passes the page object to each collector; the collector captures data (page in → corpus data out).
- All produced data must conform to corpus types defined in `schemas.ts`.

**Corpus Output (Story 2.3):**
- Corpus files follow the pattern `collectorType/run-id/stepIndex.ext`.
- A `run-manifest.json` is written per run containing: run-id, timestamp, and file list.
- The orchestrator assigns the run-id (UUID) and stepIndex; collectors never choose filenames.
- The run phase performs no verification — collection and verification are strictly separated.

**Error Isolation (Story 2.4):**
- Each collector runs in a try/catch. On failure, partial corpus is written and remaining collectors still run.
- The failed collector records `status=error`. The reporter flags the collection gap in output.

## Technical Decisions

**Stack:** TypeScript 5.9.3, Node 24.19.0, Playwright 1.62.1, Zod ^4 for schema definitions and type inference. `tsc --noEmit` clean is a precondition for any generated code.

**Type Contracts:** `schemas.ts` is the single home for every shared shape type: corpus data types (SnapshotRecord, NetworkEvent, ProbeResult, ScreenshotRef, ValidationResult) and plan/artifact types (PlanId, TestPlan). No player introduces a shared data shape outside `schemas.ts`. Types are inferred from Zod schemas (`z.infer<typeof schema>`).

**File Separation:** One format per file. Runtime data (snapshots, network events, probes, screenshots) lives in separate plain-data files, never embedded in TypeScript code.

**Naming Conventions:**
- Collectors: `collect-*.ts` (e.g., `collect-snapshot.ts`, `collect-network.ts`)
- Corpus structure: `corpus/snapshots/`, `corpus/network/`, `corpus/screenshots/`, `corpus/probes/`
- Test plans: `*.test-plan.ts` — one file per plan (smoke, regression, acceptance), each declaring `planId` + `modelVersion`

**Model Versioning:** Every Test Plan embeds the Model version it was derived from — a SHA-256 content hash of the three committed model files (`fsm.ts`, `contracts.ts`, `schemas.ts`). One deterministic scheme, no alternatives.

**State-Reuse Invariant:** One navigation funds N Validators. New validators must not multiply navigation cost. If a validator needs data from a state no existing path reaches, it is flagged as blocked until the FSM grows a reachable path.

## Cross-Story Dependencies

- Stories 2.1–2.4 form a linear pipeline: 2.1 (orchestrator) → 2.2 (collectors) → 2.3 (corpus output), with 2.4 (error isolation) cross-cutting 2.2.
- The orchestrator depends on Test Plans from Epic 1 (the offline authoring phase that produces `*.test-plan.ts` files).
- Corpus output from this epic feeds validators in Epic 3 (Verification & Gherkin Governance), which reads corpus data as pure functions.
- Corpus data types in `schemas.ts` must exist before collector implementation begins.
- Read-only v1 scope applies: only order History, order book, and portfolio views are in the seed model.
