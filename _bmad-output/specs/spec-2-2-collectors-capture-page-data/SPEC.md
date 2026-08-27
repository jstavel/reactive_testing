---
id: SPEC-2-2-collectors-capture-page-data
companions: []
sources:
  - ../../planning-artifacts/epics/epics.md
  - ../../planning-artifacts/architecture/architecture-reactive-testing-2026-08-17/ARCHITECTURE-SPINE.md
  - ../../implementation-artifacts/epic-2-context.md
---

> **Canonical contract.** This SPEC is the complete, preservation-validated contract for what to build, test, and validate. Source documents in frontmatter are for traceability — consult only for narrative context this contract intentionally omits.

# Story 2.2: Collectors Capture Page Data

## Why

The orchestrator (Story 2.1) drives a Playwright browser deterministically but captures nothing. Dedicated collectors each capture one concern of page-derived evidence — snapshot, network, screenshot, probe — cleanly, so a later story can persist per-concern corpus data.

## Capabilities

- **CAP-1** — SnapshotCollector captures serialized DOM/aria as a SnapshotRecord.
  - **intent:** SnapshotCollector receives a live page and captures its serialized structure into a SnapshotRecord.
  - **success:** Given a loaded page, when the snapshot collector runs, then it returns a SnapshotRecord with the page's serialized structure and a capturedAt timestamp.

- **CAP-2** — NetworkCollector records HTTP request/response events as NetworkEvent objects.
  - **intent:** NetworkCollector observes network activity on a live page and returns it as NetworkEvent records.
  - **success:** Given a page performing requests, when the network collector runs, then it returns NetworkEvent records with url, method, status, and capturedAt.

- **CAP-3** — ScreenshotCollector captures a screenshot and returns a ScreenshotRef.
  - **intent:** ScreenshotCollector captures a viewport screenshot of a live page and returns a file reference.
  - **success:** Given a loaded page, when the screenshot collector runs, then it returns a ScreenshotRef pointing at a saved PNG with a capturedAt timestamp.

- **CAP-4** — ProbeCollector extracts named DOM values and returns ProbeResult objects.
  - **intent:** ProbeCollector takes a live page and probe definitions, extracts each value via a DOM selector, and returns ProbeResult records.
  - **success:** Given a probe definition, when the probe collector runs, then it returns ProbeResult with the extracted value and capturedAt.

- **CAP-5** — Every collector returns data conforming to its schemas.ts corpus type and is invocable with a Playwright Page.
  - **intent:** Each collector is a function receiving a Playwright Page (and optional collector-specific options) and returns its matched corpus type.
  - **success:** Given any collector, when invoked with a Page, then its return value validates against the matching schema in schemas.ts.

## Constraints

- Each collector is page-in → corpus-data-out (AD-5).
- Produced data must conform to corpus types in schemas.ts (AD-13): SnapshotRecord, NetworkEvent, ProbeResult, ScreenshotRef — one format per file.
- Corpus folder structure: `corpus/snapshots/`, `corpus/network/`, `corpus/screenshots/`, `corpus/probes/`. Collectors named `collect-*.ts` (`collect-snapshot.ts`, `collect-network.ts`, `collect-screenshot.ts`, `collect-probe.ts`).
- Runtime data is serialized as plain data, never embedded in TypeScript; screenshots stored as file references (ScreenshotRef), not bytes.
- No corpus writing, naming, or run-manifest — Story 2.3 owns storage, run-id, and stepIndex. Collectors return captured data in-memory to the orchestrator in this story.
- `tsc --noEmit` clean; TypeScript-only; English-only identifiers; `import type` for type-only imports (verbatimModuleSyntax).

## Non-goals

- Corpus writing/naming and run-manifest — Story 2.3.
- Error isolation (a failing collector must not abort others) — Story 2.4.
- Orchestrator changes or validation — Epic 3.
- Gherkin parsing — never (AD-9).

## Assumptions

- Collectors run one-per-call; the orchestrator invokes each collector separately after a step (integration wiring is Story 2.3).

## Decisions

- Collector contract: each collector is a function accepting a Playwright Page (and optional collector-specific options) returning its corpus type.
- ScreenshotCollector persists PNG bytes; returns the ref — final storage policy deferred to Story 2.3.
- ProbeCollector accepts an array of probe definitions `{ name, selector }` and returns `ProbeResult[]`.
