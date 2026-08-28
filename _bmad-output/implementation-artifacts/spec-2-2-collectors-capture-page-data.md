---
title: 'Story 2.2: Collectors capture page data'
type: 'feature'
created: '2026-08-27'
status: 'done'
review_loop_iteration: 1
baseline_commit: '47537b5ac90be7822cfe255864628ac23b4a61e6'
context:
  - _bmad-output/specs/spec-2-2-collectors-capture-page-data/SPEC.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The orchestrator (Story 2-1) drives the browser but captures nothing. Evidence is collected by four concerns, but no collectors exist yet.

**Approach:** Build four dedicated collectors — snapshot, network, screenshot, probe — each a function receiving a Playwright `Page` and returning page-derived corpus data in its own shape, conforming to the corpus types already in `schemas.ts` (AD-5, AD-13). Collectors return data in-memory; storage and run wiring come later.

## Boundaries & Constraints

**Always:** Page-in → corpus-data-out (AD-5); return values conform to `schemas.ts` corpus types (AD-13) — SnapshotRecord, NetworkEvent, ProbeResult, ScreenshotRef; `tsc --noEmit` clean; English-only identifiers (NFR-4); `import type` for type-only imports (verbatimModuleSyntax); plain-data only, never embedded in TS; screenshots stored as `ScreenshotRef` (file reference, not bytes).

**Ask First:** HALT if a decision surfaces not covered by the spec — e.g. a new corpus type, a new screenshot storage policy, or changing the collector return contract.

**Never:** Write corpus files, choose run filenames, or emit a run-manifest (Story 2-3); error isolation that aborts other collectors (Story 2-4); orchestrator changes; validators (Epic 3); Gherkin parsing (AD-9); add a test framework without user confirmation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Snapshot happy path | Loaded page | `SnapshotRecord` with serialized structure + `capturedAt` | N/A |
| Network capture | Page with observed requests | `NetworkEvent[]` with url/method/status/`capturedAt` | No events → returns empty array |
| Screenshot capture | Loaded page + target dir | `ScreenshotRef` filePath + `capturedAt` | Screenshot failure → throw error |
| Probe extract | Page + probe defs | `ProbeResult[]`, one per probe | Missing selector → throw with probe name |
| Corpus conformance | Any collector return | Value validates against its schema | N/A |

</frozen-after-approval>

## Code Map

- `model/schemas.ts:10-51` — corpus record schemas (SnapshotRecord, NetworkEvent, ProbeResult, ScreenshotRef) + inferred types; source of truth for collector return types
- `model/schemas.ts` (append) — ADD shared collector input shapes here per AD-13: `Probe` (`{name, selector}`) and `SnapshotCollectorOptions` (`{stateId}`). No player introduces a shared data shape outside `schemas.ts`.
- `model/contracts.ts:6` — `ContractAction` pattern: `(context: { page: Page }) => Promise<void>`; collectors mirror this page-in shape
- `orchestrator/action-map.ts` — pattern for static maps and importing `Page`; collectors follow same import style
- `orchestrator/orchestrator.test.ts:9-41` — mocked Playwright `Page` with `vi.fn()` stubs; reuse this mocking style for collector tests (page.on/emit for network)
- `vitest.config.ts` — `include: ["**/*.test.ts"]`; `npm test` runs vitest
- `tsconfig.json` — NodeNext, strict, `verbatimModuleSyntax: true`; `npm run typecheck` = `tsc --noEmit`

## Tasks & Acceptance

**Execution:**
- [x] `model/schemas.ts` -- ADD shared collector input shapes per AD-13: `Probe = { name: string; selector: string }` and `SnapshotCollectorOptions = { stateId: string }` (stateId non-empty). Export inferred types -- shared shapes live only in schemas.ts; no collector file declares a shared shape
- [x] `collectors/collect.ts` -- Create a precise `CollectorFn<T = unknown>` type (typed per-collector, not `(...args: unknown[])` erasure) and a `collectors` record keyed by concern for future orchestrator wiring -- single home for the collector contract
- [x] `collectors/collect-snapshot.ts` -- `collectSnapshot(page: Page, options: SnapshotCollectorOptions): Promise<SnapshotRecord>` capturing `page.locator("body").innerHTML()` as plain serialized text + `capturedAt`; `stateId` is REQUIRED and non-empty (no silent `""` default) -- CAP-1
- [x] `collectors/collect-network.ts` -- `collectNetwork(page: Page): Promise<NetworkEvent[]>` attaching a `response` listener that records url/method/status/`capturedAt` into a local buffer and then DETACHES the listener (`page.off("response", handler)`) so repeated calls never accumulate or double-count events -- CAP-2
- [x] `collectors/collect-screenshot.ts` -- `collectScreenshot(page: Page, dir: string): Promise<ScreenshotRef>` calling `page.screenshot({ path })` and returning the ref; fixed basename is intentional (run/step naming deferred to Story 2-3) -- CAP-3
- [x] `collectors/collect-probe.ts` -- `collectProbe(page: Page, probes: Probe[]): Promise<ProbeResult[]>` extracting each value via `page.locator(selector)` (use `.first()` to avoid strict-mode multi-match failures) and returning ProbeResult records; a missing selector throws with the probe name -- CAP-4
- [x] `collectors/collectors.test.ts` -- unit tests with a mocked Page; use `vi.resetAllMocks()` per-test; screenshot test writes to a temp dir, asserts the PNG file exists on disk, and tears it down; each return validates against its schema; cover every I/O matrix edge case -- verify conformance (CAP-5) and edge cases
- [x] Verify: `npm run typecheck` clean, `npm test` passes

**Acceptance Criteria:**
- Given a loaded page, when the snapshot collector runs, then it returns a SnapshotRecord with the page's serialized structure and a capturedAt timestamp.
- Given a page with observed network activity, when the network collector runs, then it returns NetworkEvent records with url, method, status, and capturedAt.
- Given a loaded page and a target directory, when the screenshot collector runs, then it returns a ScreenshotRef pointing at a saved PNG with a capturedAt timestamp.
- Given probe definitions, when the probe collector runs, then it returns ProbeResult records, one per probe, with the extracted value and capturedAt.
- Given any collector's return value, when parsed by its schemas.ts schema, then it validates successfully.
- Given `npm run typecheck` / `npm test`, when run, then exits 0.

## Review Findings

_Code review 2026-08-29 (spec-2-2, baseline `47537b5`, diff to `1c6f049`)._

- [x] [Review][Patch] Tighten `probeSchema`: `name`/`selector` lack `trim().min(1)` (only `stateId` has it), so a whitespace-only probe def passes validation [model/schemas.ts:60]
- [x] [Review][Patch] Bound `collectProbe` locator lookups with an explicit timeout so a never-matching selector fails fast instead of riding Playwright's ~30s auto-wait [collectors/collect-probe.ts:24]
- [x] [Review][Patch] Test the `waitForLoadState` reject / partial-return path of `collectNetwork` (currently only the settle/resolve path is covered) [collectors/collect-network.ts:28]
- [x] [Review][Patch] Cover the unexercised loop-2 guards: whitespace-only `stateId` rejection and broken (null) probes-array rejection through `z.array(probeSchema)` [collectors/collectors.test.ts:124]
- [x] [Review][Patch] Assert `collectNetwork` detaches the exact handler reference on `off()`, not `expect.any(Function)` [collectors/collectors.test.ts:167]
- [x] [Review][Defer] `collectNetwork` captures only the networkidle settle-window, so responses that finished during the step action (before the listener attaches) are missed — collection-hook placement is a design refinement [collectors/collect-network.ts:8]
- [x] [Review][Defer] Failed/aborted requests (`requestfailed`) are not captured — already tracked in deferred-work.md for Story 2-4 [collectors/collect-network.ts:17]
- [x] [Review][Defer] Probe fail-fast discards already-collected `ProbeResult`s — already tracked in deferred-work.md for Story 2-4 [collectors/collect-probe.ts:21]

## Spec Change Log

- **2026-08-27 (loop 1, bad_spec)** — Finding: `Probe` and `SnapshotCollectorOptions` were declared in collector files (`collect.ts`/`collect-probe.ts`/`collect-snapshot.ts`), violating AD-13's rule that no player introduces a shared data shape outside `schemas.ts`. Amended: Code Map now directs shared input shapes (`Probe`, `SnapshotCollectorOptions`) into `model/schemas.ts`; Tasks route them there and import types from `schemas.ts`. Known-bad state avoided: Epic 3 validators and Story 2-3 wiring coupling to a collector module for shared shapes; a shared-shape change drifting out of sync in `schemas.ts`. Also folded in review patches (network listener now detaches to avoid accumulation/double-count; snapshot `stateId` required non-empty instead of silent `""`; `CollectorFn` made precise instead of `unknown[]` erasure; probe uses `.first()` to avoid strict-mode multi-match failure; tests use `vi.resetAllMocks()` and the screenshot test asserts a real PNG via a temp dir with teardown).
- **KEEP (must survive re-derivation):** page-in → corpus-data-out contract per concern (CAP-1..4); each collector pins its return type to the inferred `schemas.ts` type and round-trips through the Zod schema (conformance-as-contract-test, CAP-5); screenshot writes bytes but returns a `ScreenshotRef`; probe takes plain `{name,selector}` defs; network event-buffer capture approach; mocked-Page unit-test style; no storage/writing and fixed screenshot basename (naming deferred to Story 2-3).

- **2026-08-27 (loop 2, patch)** — Review confirmed no bad_spec/intent_gap; verification-gap layer found no gaps (all 8 matrix rows genuinely covered by passing tests). Applied patch-only robustness guards flagged by edge-case review: `collectNetwork` returns `events.slice()` so a late response can't mutate the returned array; `collectScreenshot` rejects an empty dir (avoids writing to CWD); `collectProbe` validates its input through `z.array(probeSchema)` (rejects null/broken entries and gives consistent input validation across collectors); `SnapshotCollectorOptions.stateId` tightened to `z.string().trim().min(1)` (rejects whitespace-only). Known-bad state avoided: silent CWD writes, TypeError on a broken probe entry, whitespace-only stateId passing as valid. KEEP unchanged; verification (`tsc --noEmit`, 24/24 tests) passes after patches.

- **2026-08-29 (code review)** — Full review (blind-hunter, edge-case-hunter, verification-gap, acceptance-auditor). Patches applied: `probeSchema` `name`/`selector` tightened to `z.string().trim().min(1)` (was plain `z.string()`); `collectProbe` bounds each lookup with a 5s timeout so a never-matching selector fails fast instead of riding Playwright's ~30s auto-wait; added tests for the `waitForLoadState` reject/partial-return path, whitespace-only `stateId` rejection, and a broken (null) probes-array rejection; detach assertions now pin the exact handler reference. The acceptance-auditor's absolute-`ScreenshotRef` claim was dismissed — at this story's commit `screenshotRefSchema.filePath` was plain `z.string()` (the corpus-relative refine and in-memory capture arrived with Story 2.3's Option A, which made refs corpus-relative). Deferred: networkidle observation-window placement, failed/aborted requests, probe fail-fast partial discard (both latter already tracked). Verification: `tsc --noEmit` clean, 61/61 tests pass.

## Design Notes

- **Corpus-type conformance is the contract test.** Every collector pins its return type to the inferred schema type and tests round-trip through the Zod schema, so a corpus shape change fails fast at `schemas.ts` (AD-13).
- **Network capture is event-buffer based.** `collectNetwork` attaches a `response` listener, captures observed events into a local buffer, then DETACHES the listener (`page.off("response", handler)`) so repeated calls never accumulate listeners or double-count events. Deterministic and testable by firing the listener via the mocked page's `emit`.
- **Screenshot writes bytes but returns a ref.** The collector is the only place that touches `page.screenshot`; it returns a `ScreenshotRef` (filePath + capturedAt). A fixed basename is used — final run/step naming policy is deferred to Story 2-3.
- **Probe definitions are plain data.** `Probe = { name: string; selector: string }` lives in `schemas.ts` (AD-13); extraction via `page.locator(selector).first().textContent()` (`.first()` avoids strict-mode multi-match failures).
- **Collector contract mirrors `ContractAction`.** Each collector receives the `Page` the orchestrator hands over; no collector opens its own navigation. `SnapshotCollectorOptions.stateId` is required and non-empty — a snapshot with no FSM state is corrupt corpus data.

## Verification

**Commands:**
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: all collector unit tests pass

**Manual checks (if no CLI):**
- Inspect each `collectors/collect-*.ts` return against the matching `schemas.ts` type; confirm no nested/embedded runtime data.

## Suggested Review Order

**Collector contract & registry**

- One page-in, corpus-data-out signature shared by every collector; precise generics avoid type erasure
  [`collect.ts:13`](../../collectors/collect.ts#L13)

- The `collectors` record the orchestrator wires in Story 2-3
  [`collect.ts:19`](../../collectors/collect.ts#L19)

**Schema / corpus conformance (AD-13)**

- Shared probe definition shape — single home in schemas.ts
  [`schemas.ts:56`](../../model/schemas.ts#L56)

- Snapshot options enforce a required non-empty stateId (no silent "")
  [`schemas.ts:65`](../../model/schemas.ts#L65)

**Snapshot capture**

- Serializes the page and returns a schema-validated SnapshotRecord
  [`collect-snapshot.ts:15`](../../collectors/collect-snapshot.ts#L15)

**Network capture**

- Event-buffer capture that detaches its listener so repeated calls never double-count
  [`collect-network.ts:14`](../../collectors/collect-network.ts#L14)

**Probe extraction**

- Validates the probes array, uses .first() to dodge strict-mode, names the probe on failure
  [`collect-probe.ts:14`](../../collectors/collect-probe.ts#L14)

**Screenshot capture**

- Writes bytes but returns a ScreenshotRef with a guarded non-empty dir
  [`collect-screenshot.ts:15`](../../collectors/collect-screenshot.ts#L15)

**Tests**

- 13 unit tests: schema round-trip, listener detach, temp-dir PNG signature, per-probe errors
  [`collectors.test.ts:1`](../../collectors/collectors.test.ts#L1)
