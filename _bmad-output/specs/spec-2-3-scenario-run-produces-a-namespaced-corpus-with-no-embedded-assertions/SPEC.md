---
id: SPEC-2-3-scenario-run-produces-a-namespaced-corpus-with-no-embedded-assertions
companions: []
sources:
  - ../../planning-artifacts/epics/epics.md
  - ../../planning-artifacts/architecture/architecture-reactive-testing-2026-08-17/ARCHITECTURE-SPINE.md
  - ../../implementation-artifacts/epic-2-context.md
---

> **Canonical contract.** This SPEC is the complete, preservation-validated contract for what to build, test, and validate. Source documents in frontmatter are for traceability — consult only for narrative context this contract intentionally omits.

# Story 2.3: Scenario Run Produces a Namespaced Corpus with No Embedded Assertions

## Why

Story 2.1 drives the browser deterministically; Story 2.2 collectors capture page data in-memory but write nothing. Story 2.3 closes the gap: it persists collector output into a namespaced, plain-data corpus with no assertions embedded, so collection and verification stay strictly separate (FR-4).

## Capabilities

- **CAP-1** — Scenario run persists collector output into a namespaced corpus of plain-data files.
  - **intent:** A scenario run writes in-memory collector output to disk under `collectorType/run-id/stepIndex.ext` as plain data.
  - **success:** Given a scenario run whose collectors return in-memory corpus data, when the run persists each item, then files are written under `collectorType/run-id/stepIndex.ext` with no assertions embedded.

- **CAP-2** — A run-manifest.json records each run's identity and files.
  - **intent:** Every run writes a `run-manifest.json` capturing run-id, timestamp, and the list of corpus files written.
  - **success:** Given a completed run, when it finishes, then a `run-manifest.json` exists listing run-id, timestamp, and every corpus file written.

- **CAP-3** — Orchestrator-assigned run-id and stepIndex; collectors never choose filenames.
  - **intent:** The run derives every corpus path from an orchestrator-assigned unique run-id (UUID) and incrementing stepIndex.
  - **success:** Given a run, when corpus data is persisted, then each path derives its run-id/stepIndex solely from orchestrator-assigned values and no collector-invented name appears.

- **CAP-4** — The run performs no verification and embeds no assertions.
  - **intent:** A scenario run only collects and persists evidence; it never runs validators or embeds assertions.
  - **success:** Given a scenario run, when it executes, then no validator/assertion logic runs and the corpus files contain only captured plain data (FR-4).

## Constraints

- Corpus files follow `collectorType/run-id/stepIndex.ext`; a `run-manifest.json` (run-id, timestamp, file list) is written per run (AD-15).
- The run phase performs no verification — collection and verification are strictly separated; no assertions embedded in the run (FR-4).
- The orchestrator assigns the run-id (UUID) and stepIndex; collectors never choose filenames (AD-15).
- Corpus stored as plain data files, one format per file, never embedded in TypeScript — `corpus/snapshots/`, `corpus/network/`, `corpus/screenshots/`, `corpus/probes/` (AD-13).
- Screenshots stored as file references (ScreenshotRef), not image bytes in corpus data (AD-13).
- The orchestrator is offline and deterministic — no AI calls during execution (AD-4); read-only v1 scope, no mutating contracts (NFR-3).
- `tsc --noEmit` clean; TypeScript-only; English-only identifiers; `import type` for type-only imports (verbatimModuleSyntax).

## Non-goals

- Collector capture/return — Story 2.2.
- Collector error isolation and partial-corpus writes — Story 2.4.
- Validator execution and reporter output — Epic 3.
- Gherkin parsing — never (AD-9).

## Assumptions

- Story 2.2 collectors already return typed in-memory corpus data to the orchestrator; Story 2.3 persists that output rather than re-capturing the page.
- The corpus output directory is writable and located under the project (architecture structural seed); the exact on-disk location and CI wiring are configured during implementation.

## Decisions

- Story 2.3 is the storage/wiring layer over Story 2.2: it consumes in-memory collector output (not browser pages) and persists it; integration wiring is this story.
- `run-manifest.json` is the per-run record: run-id (UUID), timestamp (ISO-8601), and the list of corpus file paths written (AD-15).
- Corpus root uses the fixed folders `corpus/snapshots`, `corpus/network`, `corpus/screenshots`, `corpus/probes`; stepIndex is the per-step ordinal within the run.
