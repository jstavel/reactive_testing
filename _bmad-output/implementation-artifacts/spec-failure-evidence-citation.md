---
title: 'Cite failed-step failure evidence in the HTML and JSON reports'
type: 'bugfix'
created: '2026-09-17'
status: 'done'
baseline_commit: 'cc7ba9b18baf09d700bd9291be222c5c50997959'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** When a step fails, the orchestrator records best-effort failure evidence (`snapshots/<runId>/<i>.failure.json` and `screenshots/<runId>/<i>.failure(.json|.png)`, written per-step since gh-22), but neither the HTML nor the JSON report cites it — `buildStepEvidence`/`stepEvidenceFor` enumerates only normal stems (`.pre.json`, `.json`, probes, network, screenshot), so a failed step's row shows at most its pre-step snapshot and the failure captures stay invisible to the operator reviewing the report.

**Approach:** Derive the failing step indexes from the run manifest's recorded `failures` (`StepFailure[].stepIndex`), collect the `.failure.*` refs for those steps, and feed them to the reporters via a NEW parallel input keyed by scenario (the reporters' existing `stepEvidence: scenarioId → StepEvidence[]` pattern, mirrored as `failureEvidence`). The HTML report renders a "failure evidence" snapshot link + screenshot frame; the JSON report emits the same refs. `StepEvidence` in `model/schemas.ts` is deliberately NOT extended — it is part of the model hash, and extending it would force a modelVersion bump plus committed-fixture regeneration for a ref-only change.

## Boundaries & Constraints

**Always:** Failure refs are refs only (a corpus-relative path / `ScreenshotRef`), never evidence payloads — mirroring `StepEvidence`. Refs are cited only when the target file exists (reuse the existing `statSync`-based `corpusRef` and `readScreenshotRef` checks). The parallel `failureEvidence` input is optional and keyed `scenarioId → (FailureEvidenceRefs | undefined)[]` aligned to `steps` by index — a missing entry renders nothing (omission never throws). The HTML failure screenshot img reuses the `isSafeRelPath` gate (charset + no `..`); the failure snapshot renders as a link through the same SAFE_HREF rule the evidence links use. Behavior for all-pass runs/fixtures is byte-identical (no `.failure.*` files → no failure refs → no failure block). Failing-step detection reads the manifest `failures` list; a `.failure.*` file not named by the manifest is ignored, and a manifest failure index without files yields empty refs.

**Ask First:** Extending `StepEvidence` instead of the parallel channel (accepting the modelVersion cascade); rendering failure evidence for non-failing steps; embedding evidence payloads instead of refs; changing the normal-stem ref set.

**Never:** No edits to `model/schemas.ts`, `collectors/`, or `orchestrator/` (model hash and producers untouched); no fixture regeneration (all-pass committed fixtures stay byte-identical); no new runtime dependencies; no browser/network access; no changes to the orchestrator's failure-capture naming.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| FAILED_STEP_FULL | A step with `i.failure.json` (snapshot) + `i.failure.json`/`.png` (screenshot) + a manifest `failure` at `i` | HTML row shows a failure snapshot link and a failure screenshot frame; JSON adds both refs | N/A |
| FAILED_STEP_SNAPSHOT_ONLY | Only the `.failure` snapshot exists | HTML shows the link only; JSON the snapshot ref only | N/A |
| FAILED_STEP_SCREENSHOT_UNSAFE | Failure screenshot `filePath` fails `isSafeRelPath` | `img` omitted; snapshot link still renders; JSON still cites the ref | omit, no throw |
| MANIFEST_FAILURE_NO_FILES | Manifest failure at `i`, no `.failure.*` on disk | No failure block; step row unchanged | N/A |
| FILE_NO_MANIFEST | `.failure.*` on disk but index not in manifest failures | Ignored (`undefined` refs) | N/A |
| ALL_PASS | No failures in manifest, no `.failure.*` files | Byte-identical to today (committed fixtures) | N/A |

</frozen-after-approval>

## Code Map

- `bin/report-smoke.ts:168-208` -- `collectStepEvidence`/`buildStepEvidence` iterate scenarios→steps→`stepEvidenceFor` (normal stems only). Add a sibling collecting failure refs for failing step indexes and return both maps.
- `bin/report-smoke.ts` -- the run manifest is already read for validation (`runManifestSchema.failures`); derive `failingStepIndexes = new Set(manifest.failures.map(f => f.stepIndex))`.
- `bin/report-smoke.ts:189-208` -- `stepEvidenceFor`: untouched. New `failureEvidenceFor(corpusDir, runId, stepIndex)` reusing `corpusRef` (for `snapshots/${runId}/${i}.failure.json`) and `readScreenshotRef` (for `screenshots/${runId}/${i}.failure.json`).
- `model/schemas.ts:104-121` -- `StepEvidence` (READ-ONLY, part of the model hash) — unchanged; only a type-only `import type { ScreenshotRef }`.
- `reporter/html-report.ts:51,66-121` -- `EmitHtmlReportInput`/`renderHtmlReport` step row: accept `failureEvidence?: Readonly<Record<string, (FailureEvidenceRefs | undefined)[]>>`; render the failure block reusing `renderEvidenceLinks`-style SAFE_HREF links for the snapshot and the `isSafeRelPath` gate (`:274`) for the screenshot img.
- `reporter/html-report.ts` -- new exported `FailureEvidenceRefs` interface (`failureSnapshot?: string; failureScreenshot?: ScreenshotRef`).
- `reporter/json-report.ts:42-110` -- mirror the parallel input and add `failureSnapshot`/`failureScreenshot` keys to the per-step JSON object (import `FailureEvidenceRefs` from html-report).
- Test homes: `reporter/html-report.test.ts` (failure-block render cases, unsafe-path img omission, absent-no-block, all-pass byte-identity), `reporter/json-report.test.ts` (JSON keys), and `bin/report-smoke.test.ts` (a fixture corpus with `.failure.*` + manifest failures renders/emits the refs; an all-pass corpus emits none).

## Tasks & Acceptance

**Execution:**
- [x] `reporter/html-report.ts` -- export `FailureEvidenceRefs`; add the optional `failureEvidence` input to `EmitHtmlReportInput` and `renderHtmlReport`; render the failure block (snapshot link via SAFE_HREF, screenshot via `isSafeRelPath` img) with a distinct "failure evidence" label; absent → nothing.
- [x] `reporter/json-report.ts` -- accept the same optional input and emit the refs.
- [x] `bin/report-smoke.ts` -- derive failing indexes from the manifest `failures`; collect per-step failure refs (reusing `corpusRef`/`readScreenshotRef`); thread both the existing and the new evidence into the report emitters.
- [x] Tests in `reporter/html-report.test.ts`, `reporter/json-report.test.ts`, `bin/report-smoke.test.ts` -- full/snapshot-only/unsafe-path/manifest-without-files/file-without-manifest/all-pass cases.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- mark L285 `RESOLVED (2026-09-17)` and reconcile the sweep-triage bundle line.

**Acceptance Criteria:**
- Given a failed step with failure snapshot + screenshot files and a manifest `failure` at that step, when the HTML report is emitted, then the row renders a failure snapshot link and a failure screenshot frame, and the JSON sibling cites both refs.
- Given an unsafe failure screenshot path, when the HTML report renders, then the image frame is omitted while the snapshot link still renders.
- Given an all-pass corpus (committed fixtures), when `report:smoke` runs, then the output is byte-identical (no failure block, no failure refs).
- Given `npm run typecheck && npm test && npm run lint`, then all pass with `computeModelVersion()` unchanged and zero edits to `model/`, `collectors/`, or `orchestrator/`.

## Spec Change Log

- **2026-09-17 (review loop 1)** — Single-read manifest parsing avoids TOCTOU between metadata and failure-index discovery; `report.json` advances to `report.v2` for additive failure-ref keys; HTML omits empty/unsafe-only failure blocks; both reporters gate failure refs to failed scenarios; failure snapshot links reject `..` traversal; contract JSDoc documents global-index alignment and omitted-safe refs; added multi-scenario alignment, missing-file, unmanifested-file, all-pass, renderer safety, passing-scenario, malformed metadata, and report-shape coverage.

## Design Notes

Failure snapshot links deliberately use the stricter no-`..` rule, while legacy evidence links retain their tracked `..`-tolerant behavior. `readScreenshotRef` shares the pre-existing `..` tolerance; tightening it remains under the existing deferred link-rule item.

`StepEvidence` is declared in `model/schemas.ts`, which `computeModelVersion` hashes verbatim — extending it would cascade into a modelVersion bump, a `smoke.test-plan.ts` regen, and a committed-fixture `planModelVersion` regeneration, all to carry two optional ref strings. The parallel `failureEvidence` channel (same `scenarioId → array` shape, optional, aligned by index) delivers the same report value with zero model-hash impact and keeps the committed all-pass fixtures byte-identical — which the isolation tests then pin. Failure refs are discovered only from the manifest's `failures` list so a stale/corrupt `.failure.*` file cannot invent evidence; each ref still requires the on-disk file (the same `statSync`/`readScreenshotRef` discipline as normal stems).

## Verification

**Commands:**
- `npm run typecheck` -- expected: exit 0.
- `npm test` -- expected: all suites green (existing 686 + new reporter/CLI tests), `computeModelVersion()` unchanged.
- `npm run lint` -- expected: exit 0.

## Suggested Review Order

**Failure-ref derivation (entry point)**

- Failing step indexes come from ONE parse of the manifest's raw text — no double read.
  [`report-smoke.ts:155`](../../bin/report-smoke.ts#L155)

- Global step indexes map to per-scenario, per-step failure refs (alignment contract).
  [`report-smoke.ts:201`](../../bin/report-smoke.ts#L201)

- Refs re-check the on-disk file and re-use the screenshot-ref discipline.
  [`report-smoke.ts:218`](../../bin/report-smoke.ts#L218)

**Report surfaces**

- Failure snapshot link uses the strict no-`..` rule; screenshot img is `isSafeRelPath`-gated; empty/unsafe-only refs render nothing.
  [`html-report.ts:147`](../../reporter/html-report.ts#L147)
  [`html-report.ts:313`](../../reporter/html-report.ts#L313)

- JSON cites the refs only for failed scenarios and carries the new `report.v2` schema tag.
  [`json-report.ts:24`](../../reporter/json-report.ts#L24)

**Regression coverage**

- Global-index alignment across scenarios; manifest-no-files and file-no-manifest; all-pass byte-identity.
  [`report-smoke.test.ts:1195`](../../bin/report-smoke.test.ts#L1195)
  [`report-smoke.test.ts:505`](../../bin/report-smoke.test.ts#L505)
  [`report-smoke.test.ts:533`](../../bin/report-smoke.test.ts#L533)

- Renderer gating: passing scenarios never show failure refs.
  [`json-report.test.ts:381`](../../reporter/json-report.test.ts#L381)
