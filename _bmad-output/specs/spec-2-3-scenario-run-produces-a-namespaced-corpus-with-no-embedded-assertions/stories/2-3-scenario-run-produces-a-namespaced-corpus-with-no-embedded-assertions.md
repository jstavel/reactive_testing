---
title: 'Story 2.3: Scenario run produces a namespaced corpus with no embedded assertions'
type: 'feature'
created: '2026-08-28'
baseline_commit: '1c6f0490e63497c0a2468797f56a4aa3bc3db398'
status: 'done'
review_loop_iteration: 0
context:
  - _bmad-output/specs/spec-2-3-scenario-run-produces-a-namespaced-corpus-with-no-embedded-assertions/SPEC.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 2.1 drives the browser deterministically and Story 2.2 collectors capture page data in-memory, but nothing persists a run's evidence to disk. A run produces no namespaced corpus, so Story 3.x validators (which read the corpus as pure functions) have nothing to read, and collection/verification separation is not yet demonstrable.

**Approach:** Wire the orchestrator to invoke Story 2.2 collectors after each executed step and persist their in-memory output into a namespaced plain-data corpus (`collectorType/run-id/stepIndex.ext`), writing a per-run `run-manifest.json` (run-id, timestamp, file list). The orchestrator assigns the run-id (UUID) and stepIndex; collectors never choose filenames. The run performs no verification and embeds no assertions (FR-4).

## Boundaries & Constraints

**Always:** Orchestrator assigns run-id (UUID) and stepIndex; collectors never choose filenames (AD-15). Corpus files follow `collectorType/run-id/stepIndex.ext` with a per-run `run-manifest.json` (AD-15). Run phase performs no verification and no assertions (FR-4). Corpus is plain data files, one format per file, never embedded in TS (AD-13); screenshots stay file references (`ScreenshotRef`), not bytes in corpus data. All shared shapes (manifest, extended config, probe list) live only in `schemas.ts` (AD-13). Orchestrator is offline/deterministic, no AI in the loop (AD-4). `tsc --noEmit` clean; English-only identifiers (NFR-4); `import type` for type-only imports (verbatimModuleSyntax); Node `crypto.randomUUID()` for run-id.

**Ask First:** HALT if any of these decisions surfaces and is not already specified: (1) how probe definitions reach the probe collector (recommend adding a `probes: Probe[]` field to `OrchestratorConfig`; on-disk probe config file is an alternative — needs approval); (2) the exact on-disk corpus root path (structural seed shows `corpus/`, but a configurable output-dir on `OrchestratorConfig` is the alternative — needs approval); (3) whether ALL collectors run after every step in this story (recommend yes; AD-6 validator-driven selective collection is Story 3.2, out of scope here).

**Never:** Write validators, assertions, or any verification logic (Epic 3). Write collector capture/return logic (Story 2.2). Error isolation / partial-corpus on collector failure (Story 2.4). Gherkin parsing (AD-9). Choose a filename or run-id inside any collector. Add a shared data shape outside `schemas.ts` (AD-13). Modify the `TestPlan` schema's `ScenarioStep` shape for this story.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path | Valid run; steps execute; collectors return data | Files under `corpus/{kind}/{runId}/{stepIndex}.{ext}` + a `run-manifest.json` at run root | N/A |
| Multiple steps / scenarios | Run with >1 step | stepIndex increments monotonically, no two files collide | N/A |
| Empty collector result (e.g. no network events) | `collectNetwork` returns `[]` | An empty JSON array is still persisted; step file exists | N/A |
| Run-id uniqueness | Two runs in the same corpus | Different UUIDs; manifest namespaced per run, never overwritten | N/A |
| Screenshot capture | Collector returns in-memory PNG bytes | Corpus module writes PNG to namespaced path and records it (manifest lists the `.png`); `ScreenshotRef.filePath` is corpus-relative; ref is not the bytes | Passed-through collector error |
| Manifest write | Run completes (success or failure) | `run-manifest.json` lists run-id, timestamp, and every corpus file written | Write failure thrown from orchestrator run |

</frozen-after-approval>

## Code Map

- `orchestrator/orchestrator.ts:25` — `runTestPlan(plan, config)`: pre-validation, browser lifecycle, per-scenario loop; wiring point for collection after each step
- `orchestrator/orchestrator.ts:145` — `executeScenario(...)`: per-step `action({ page })` then `waitForSelector` settling; insert collector invocation + persistence here
- `orchestrator/orchestrator.ts:170` — `withTimeout(...)` helper reused to bound each collector call
- `collectors/collect.ts:19` — `collectors` record keyed by concern (snapshot/network/screenshot/probe); the registry the orchestrator consumes
- `collectors/collect-snapshot.ts:15` — `collectSnapshot(page, { stateId })` → `SnapshotRecord`; pass `step.stateId`
- `collectors/collect-network.ts:14` — `collectNetwork(page)` → `NetworkEvent[]`; detaches its listener
- `collectors/collect-screenshot.ts:15` — `collectScreenshot(page)` → `ScreenshotCapture { buffer, capturedAt }`; returns in-memory PNG bytes (no disk write); corpus module names/persists the file
- `collectors/collect-probe.ts:14` — `collectProbe(page, probes)` → `ProbeResult[]`; needs a probe list (config)
- `model/schemas.ts:9-51` — corpus record schemas + inferred types (SnapshotRecord, NetworkEvent, ProbeResult, ScreenshotRef); conformance target
- `model/schemas.ts:53-69` — shared collector input shapes (`Probe`, `SnapshotCollectorOptions`) per AD-13
- `model/schemas.ts:125-136` — `OrchestratorConfig` interface (extend with corpus/probe fields as approved)
- `orchestrator/orchestrator.test.ts:1` — existing mocked-Page test style (`vi.fn()` stubs, `vi.clearAllMocks` per afterEach); reuse for wiring tests
- `collectors/collectors.test.ts:21` — PNG signature + temp-dir-with-teardown pattern for screenshot assertions
- `vitest.config.ts` — `include: ["**/*.test.ts"]`; `npm test` runs vitest; `npm run typecheck` = `tsc --noEmit`

## Tasks & Acceptance

**Execution:**
- [x] `model/schemas.ts` -- ADD `runManifestSchema` (run-id, timestamp, file list) + inferred `RunManifest` type per AD-13; extend `OrchestratorConfig` with corpus output-dir and `probes: Probe[]` as approved; export types -- shared shapes live only in schemas.ts
- [x] `orchestrator/corpus.ts` (NEW) -- Create a persistence module: `startCorpusRun()` assigns a run-id via `crypto.randomUUID()`; `writeCorpusFile(kind, runId, stepIndex, data)` writes plain data (string or raw bytes, e.g. PNG buffers) to `corpus/{kind}/{runId}/{stepIndex}.{json|png}` and records the corpus-relative path; `finishRun(manifest)` writes `corpus/{runId}/run-manifest.json` -- the single owner of file naming, never the collectors
- [x] `orchestrator/orchestrator.ts` -- Wire `runTestPlan`/`executeScenario` to invoke each collector after a step action + settling, pass collector-specific args (snapshot: `{ stateId: step.stateId }`; probe: `config.probes`), and persist each collector's returned data via the corpus module; the screenshot collector returns in-memory PNG bytes and the corpus module writes+names the `.png` and a relative `ScreenshotRef`; assign one global stepIndex across the run so files never collide -- CAP-1, CAP-2, CAP-3, CAP-4
- [x] `orchestrator/orchestrator.ts` -- Write `run-manifest.json` when the run completes (success or failure), listing run-id, timestamp, and every corpus file written -- CAP-2
- [x] `orchestrator/corpus.test.ts` (NEW) + extend `orchestrator/orchestrator.test.ts` -- unit tests with a mocked Page + mocked `collectors` registry: (a) happy path writes `stepIndex.ext` per kind and a manifest listing them; (b) stepIndex increments across steps/scenarios with no collisions; (c) empty `NetworkEvent[]` still writes a file; (d) two runs get distinct run-ids; (e) no assertion/validator invoked during the run; (f) each persisted value validates against its schema -- cover every I/O matrix row
- [x] Verify: `npm run typecheck` clean, `npm test` passes

**Acceptance Criteria:**
- Given a scenario run with collector output, when the run executes, then corpus files are written under `collectorType/run-id/stepIndex.ext` and a `run-manifest.json` records run-id, timestamp, and the file list (AD-15).
- Given a run where each path derives from orchestrator-assigned run-id and stepIndex, when persisted, then no collector-invented filename appears (CAP-3).
- Given a scenario run, when it executes, then no validator or assertion logic runs and corpus files contain only captured plain data (FR-4).
- Given `npm run typecheck` / `npm test`, when run, then exits 0.

## Review Findings

_Code review 2026-08-29 (story-2-3, baseline `1c6f049`, diff to `277e887`)._

- [x] [Review][Patch] Move the shared shapes `ScreenshotCapture` (declared in `collect-screenshot.ts`) and `CorpusRun` (declared in `corpus.ts`) into `schemas.ts` — AD-13 requires every shared shape to live only there, mirroring the loop-1 `Probe`/`SnapshotCollectorOptions` correction [collectors/collect-screenshot.ts:6] [orchestrator/corpus.ts:7]
- [x] [Review][Patch] Round-trip an orchestrator-emitted `ScreenshotRef` through `screenshotRefSchema` and add a negative absolute-path case (conformance-as-contract-test for the wiring path) [orchestrator/orchestrator.ts:245]
- [x] [Review][Patch] Test that `finishRun` writes the manifest after a step/scenario failure — the "success or failure" matrix row is untested (code does write it; nothing pins it) [orchestrator/orchestrator.ts:111]
- [x] [Review][Defer] `run-manifest.json` has no completeness marker, so a run with timeout-skipped scenarios is indistinguishable at the manifest level — not in spec; add in a later story [orchestrator/corpus.ts:44]
- [x] [Review][Defer] `writeCorpusFile` doesn't sanitize `kind`/`runId`/`stepIndex`, so a misbehaving future caller could escape the corpus root (path traversal) — not reachable at current internal call sites [orchestrator/corpus.ts:25]
- [x] [Review][Defer] Per-step execution is bounded per operation (worst case ~6× stepTimeout), not per whole step — still bounded; tightening is a deliberate behavior choice for a future story [orchestrator/orchestrator.ts:215]

## Spec Change Log

- **2026-08-28** — During Step 3 implementation, corrected the screenshot collector dir to be run/step-namespaced (`screenshots/{runId}/{stepIndex}`) instead of run-only, so per-step PNGs (fixed `screenshot.png` basename) never collide across steps. This matches the frozen task text "screenshot: run/step-namespaced dir" and the matrix row "no two files collide", and resolves the deferred-work screenshot-overwrite item. No frozen intent changed.
- **2026-08-28** — **Human renegotiation (Option A):** the corpus module becomes the full owner of screenshot persistence too. `collectScreenshot(page)` now returns in-memory PNG bytes (`{ buffer, capturedAt }`) with no disk write and no filename choice; the orchestrator hands the bytes to `writeCorpusFile(..., "png", buffer)`, which writes `screenshots/{runId}/{stepIndex}.png` and records it in `run.files`/the manifest; the persisted `ScreenshotRef.filePath` is corpus-relative (validated by `screenshotRefSchema`). Collectors now never touch disk at all. Supersedes the earlier "collector writes into the handed-over dir" design (and the Story 2.2 screenshot-collector mechanism).

- **2026-08-29 (code review)** — Full review (blind-hunter, edge-case-hunter, verification-gap, acceptance-auditor; edge-case-hunter layer returned empty). Patches applied: shared in-memory shapes `ScreenshotCapture` and `CorpusRun` moved into `schemas.ts`, closing the AD-13 deviation flagged by the acceptance auditor (they were declared in `collect-screenshot.ts`/`corpus.ts`); added a wiring round-trip test — the orchestrator-emitted `ScreenshotRef` validates against `screenshotRefSchema`, plus a negative absolute-path case; added a test pinning that `finishRun` writes the manifest after a failed scenario ("success or failure" matrix row). The auditor's manifest-not-written-on-failure claim was downgraded — the code does write it (step errors are caught in `executeScenario`); only the test was missing. Deferred: manifest completeness marker, unsanitized corpus paths, per-op vs per-step timeouts. Verification: `tsc --noEmit` clean, 61/61 tests pass.

## Design Notes

- **The corpus module is the single owner of file naming and persistence.** All run-id/stepIndex/path computation and every disk write (including screenshot PNGs, written from in-memory bytes) lives in `orchestrator/corpus.ts`. Collectors return typed in-memory data and never touch disk or filenames (AD-15); the screenshot collector returns PNG bytes and the ref the orchestrator persists is corpus-relative.
- **stepIndex is a global monotonic counter across the whole run**, not per-scenario — so `snapshots/<runId>/0.json`, `…/1.json` never collide across multiple scenarios. AD-15's per-step index is satisfied; the exact global vs per-scenario ordinal is an implementation detail the reviewer can confirm.
- **All collectors run after every step in this story.** AD-6 (validator-declared collection planning) is Story 3.2 and out of scope; 2-3 persists the full per-concern evidence.
- **Manifest stores corpus-relative paths** (`snapshots/<runId>/0.json`, …) so the corpus is portable and validators can resolve them independent of the absolute working directory.

## Verification

**Commands:**
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: new corpus + wiring unit tests pass along with existing suites

**Manual checks (if no CLI):**
- Run `runTestPlan` against the smoke plan; confirm `corpus/{kind}/{runId}/{stepIndex}.ext` files and `corpus/{runId}/run-manifest.json` appear, and that no `.ts` file embeds runtime corpus data.

## Suggested Review Order

**Corpus persistence (new module — single owner of file naming)**

- Starts a run: assigns a unique run-id and an empty file list
  [`corpus.ts:15`](../../../../orchestrator/corpus.ts#L15)

- Owns every corpus path: writes `kind/runId/stepIndex.ext` and records the corpus-relative path
  [`corpus.ts:24`](../../../../orchestrator/corpus.ts#L24)

- Emits `run-manifest.json` listing run-id, timestamp, and every written file
  [`corpus.ts:43`](../../../../orchestrator/corpus.ts#L43)

**Orchestrator wiring (run lifecycle + per-step collection)**

- runTestPlan starts a corpus run, threads a global stepIndex, and writes the manifest on completion
  [`orchestrator.ts:32`](../../../../orchestrator/orchestrator.ts#L32)

- After each step it invokes all four collectors and persists each result via the corpus module
  [`orchestrator.ts:177`](../../../../orchestrator/orchestrator.ts#L177)

**Shared shapes (AD-13: all shared shapes live in schemas.ts)**

- OrchestratorConfig gains `corpusDir` and `probes` to configure collection/persistence
  [`schemas.ts:125`](../../../../model/schemas.ts#L125)

- `runManifestSchema` defines the per-run manifest contract
  [`schemas.ts:143`](../../../../model/schemas.ts#L143)

**Tests (supporting)**

- Unit-tests the corpus module against a real temp filesystem
  [`corpus.test.ts:37`](../../../../orchestrator/corpus.test.ts#L37)

- Verifies orchestrator wiring: one file per kind per step, global stepIndex, corpus-written per-step PNGs + relative refs, and no voiding/assertion logic
  [`orchestrator.test.ts:312`](../../../../orchestrator/orchestrator.test.ts#L312)
