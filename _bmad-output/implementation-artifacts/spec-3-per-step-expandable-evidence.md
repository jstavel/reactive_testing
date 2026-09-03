---
title: 'Per-step expandable evidence'
type: 'feature'
created: '2026-09-03'
status: 'done'
review_loop_iteration: 0
baseline_commit: '536b1e339656b368fa5d7fda1e2cb134ca2f1e1b'
context: []
---

## Intent

**Problem:** The report (Stories 1–2) shows each scenario's steps as flat `Given state → When contract` lines with no per-step detail. Story 3 adds the "per-step expandable evidence" layer: each step becomes a click-to-expand row revealing wall-clock timing and, when captured, a screenshot of that step — the minimum visual evidence for a test run.

**Approach:** Keep the reporter pure and deterministic (NFR-1). Introduce an optional `stepEvidence` input — `scenarioId → per-step evidence` (timing + optional screenshot ref) — that the runner will populate with real capture; the reporter renders a `<details>` per step, closed by default (progressive disclosure), showing timing text and an `<img>` referencing the corpus-relative screenshot path (relative refs, not inlined — per the brainstorming decision; zip for sharing). Rendering any step without a screenshot's ref falls back to timing-only. Screenshot capture policy (which steps get screenshots) is a runner concern, out of scope here.

## Boundaries & Constraints

**Always:**
- Reporter stays pure + deterministic (NFR-1): `renderHtmlReport` is a pure function of its inputs; `stepEvidence` is an input it renders, never a live filesystem read.
- Steps render as `<details>` closed by default (progressive disclosure UX).
- Screenshots are referenced by corpus-relative path (`ScreenshotRef.filePath`), rendered via `<img src>`; never inlined/base64.
- Evidence is keyed per scenario, aligned by step index to `plan.scenarios[id].steps`.

**Ask First:**
- Whether to add a binary-friendly field to `ScenarioResult` vs a separate `stepEvidence` input map. (Default chosen: separate map, matching the `gherkinSource` decoupling pattern.)

**Never:**
- No orchestration/capture changes: the runner does not measure timing or capture screenshots here — that is a later story. This story only consumes evidence the caller already has.
- No DOM snapshot, FSM state widget, or contract-assertion rendering — those belong to Story 4.
- No clickable screenshot→DOM correlation (explicit Won't).
- No screenshot inlining or base64.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| STEP_WITH_TIMING_ONLY | `stepEvidence` has `timingMs` for the step, no screenshot ref | Step expands to show timing text only; no `<img>` | N/A |
| STEP_WITH_SCREENSHOT | `stepEvidence` has timing + screenshot ref | Step expands to show timing and `<img src="{corpus-relative path}">` | N/A |
| STEP_NO_EVIDENCE | step absent from `stepEvidence` (or map omitted) | Step renders as today: no expandable evidence (title/line only) | N/A |
| EMPTY_SCREENSHOT_PATH | screenshot ref present but empty `filePath` | No `<img>` emitted for that step | Skip the ref, keep timing |

## Code Map

- `model/schemas.ts` — `ScreenshotRef` already exists (`filePath` corpus-relative + `capturedAt`); `ScenarioStep`/`ScenarioResult` are step-state/plan types with no timing. Add a `StepEvidence` runtime shape (timing + optional screenshot) as the shared input type (AD-13 single-home).
- `reporter/html-report.ts` — `renderHtmlReport` currently renders each step as a plain `<li>` (state → contract). Wrap each step in a `<details>` and, when `stepEvidence` provides data, append timing + screenshot. Add optional `stepEvidence` to `EmitHtmlReportInput`.
- `reporter/html-report.test.ts` — existing story-2 tests remain green (omitting `stepEvidence` reverts to today's output). Add story-3 cases.
- `reporter/html-report.ts` `escapeHtml` — reused for timing text; screenshot path goes into `src` attribute (HTML-escaped).

## Tasks & Acceptance

**Execution:**
- [x] `model/schemas.ts` -- add `StepEvidence` type `{ timingMs: number; screenshot?: ScreenshotRef }` -- shared input shape the reporter consumes (AD-13).
- [x] `reporter/html-report.ts` -- add optional `stepEvidence: Record<scenarioId, StepEvidence[]>` to `EmitHtmlReportInput`; render each step as a closed `<details>` with timing text and, when a screenshot ref exists, an `<img src>`.
- [x] `reporter/html-report.test.ts` -- cover timing-only, screenshot, missing-evidence, empty-path cases; assert story-1/2 behavior unchanged when map omitted.
- [x] `model/smoke.test-plan.ts` -- regenerate `modelVersion` to `f435b0b9…` -- adding `StepEvidence` to `schemas.ts` (a hashed model file, AD-17) changed the model hash; the plan must reflect the current model or the version guard fails.

**Acceptance Criteria:**
- Given a run with `stepEvidence` providing timing for a step, when the report is rendered, then that step's `<details>` is closed by default and shows the wall-clock duration when opened.
- Given a step with a screenshot ref in `stepEvidence`, when rendered, then an `<img>` referencing the corpus-relative path appears inside the expanded step.
- Given a step with no entry in `stepEvidence`, when rendered, then the report matches Story 2 output for that step (no evidence block).
- Given a screenshot ref with an empty `filePath`, when rendered, then no `<img>` is emitted but timing still shows.

## Spec Change Log

- 2026-09-03: Added `model/smoke.test-plan.ts` modelVersion regeneration as an explicit execution task. Adding `StepEvidence` to `schemas.ts` (a hashed model file per AD-17) changed `computeModelVersion()` from `2391eb7d…` to `f435b0b9…`; the implementation dispatched from this spec omitted the regen, and the `model-version` guard test failed until the plan's `modelVersion` was updated. Documented so future model-touching stories regenerate the plan version up front.

## Verification

**Commands:**
- `npm run typecheck` -- expected: exits 0
- `npm test` -- expected: all tests pass (existing 232 + new story-3 cases)

**Manual checks (if no CLI):**
- N/A (covered by automated reporter tests).

## Suggested Review Order

**Design contract**

- The `stepEvidence` input shape the reporter consumes — optional map, keyed by scenario, aligned by step index.
  [`html-report.ts:46`](../../reporter/html-report.ts#L46)

- Reading `stepEvidence` and rendering each evidence-bearing step as a `<details>` with timing + optional screenshot.
  [`html-report.ts:107`](../../reporter/html-report.ts#L107)

**Shared shape**

- `StepEvidence` runtime type (timing + optional corpus-relative `ScreenshotRef`) declared once in the schemas home (AD-13).
  [`schemas.ts:107`](../../model/schemas.ts#L107)

- `model/smoke.test-plan.ts` modelVersion regenerated — `StepEvidence` in a hashed model file changed the model hash (AD-17).
  [`smoke.test-plan.ts:14`](../../model/smoke.test-plan.ts#L14)

**Tests**

- Story-3 table: timing-only, screenshot, missing-evidence, empty-filepath, mixed, closed-by-default, and `emitHtmlReport` forwarding.
  [`html-report.test.ts:403`](../../reporter/html-report.test.ts#L403)

