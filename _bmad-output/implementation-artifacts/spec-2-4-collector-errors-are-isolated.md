---
title: 'Collector errors are isolated'
type: 'feature'
created: '2026-08-29'
status: 'done'
review_loop_iteration: 1
baseline_commit: 'aa5ebfd'
context:
  - '{project-root}/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** One failing collector fails the whole scenario. `executeScenario` wraps the collector loop in a single try/catch (`orchestrator.ts:206-270`), so any collector throw skips the remaining collectors, skips all later steps, and marks the scenario `passed:false` — violating AD-16 ("one failure never aborts the whole run"). The probe collector also discards already-collected `ProbeResult`s on one missing selector, and the network collector drops failed/aborted requests and can crash on a closed page or a throwing response listener — both parked in deferred-work for this story.

**Approach:** Give each collector call its own isolation boundary inside the step loop: a collector throw becomes a `status=error` gap entry (`collector`, `stepIndex`, `error`) in the run manifest, the remaining collectors and later steps still run, and partial corpus already written is retained. The reporter does not exist yet (Epic 3), so AD-16's "reporter flags the gap" is a recorded data contract — the manifest gains an `errors` array a future reporter consumes; no reporting module is built. Collector changes are limited to the deferred items (probe partial-results; network failed-request/closed-page/listener robustness).

## Boundaries & Constraints

**Always:**
- One collector failure never aborts the run: remaining collectors in the same step AND later steps still execute; `finishRun` still writes the manifest; the browser still closes. Partial corpus files written before the throw stay in the manifest `files` list.
- A collector failure is a recorded **gap**, not a scenario failure. `ScenarioResult.passed` keeps meaning *execution completed*; action/settle/timeout failures still fail the scenario as today. This deliberately reverses the old assertion at `orchestrator.test.ts:595-615` (snapshot rejection → `passed:false`).
- Gap records live in the run manifest via a new `CollectorError` shared shape in `model/schemas.ts` (AD-13). `errors: []` means no gaps.
- Collectors stay pure and may keep throwing; the orchestrator owns isolation and recording (AD-5/AD-15). Corpus-write IO failures stay run-fatal — isolation covers collector function failures only.
- NFR-2 gate: `tsc --noEmit` clean and `npm test` green (61 existing + new isolation tests) before done.

**Ask First:**
- Whether collector gaps should also be surfaced on the returned `RunResult`. Default: manifest-only.

**Never:**
- Do not build any reporter/validator or reporting UI (Epic 3). Gap-flagging = the manifest `errors` record.
- Do not make collectors swallow errors or return generic envelopes — output keeps conforming to corpus types (AD-13); only the probe typed-failure carrier and network event widening deviate.
- Do not change `ScenarioResult`, `RunResult`, happy-path manifest fields, corpus filenames, or the run/step-timeout, model-version, CDP-attach behaviors from other stories.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH | All collectors succeed every step | All corpus files written; manifest `errors: []` | N/A |
| COLLECTOR_THROWS | A collector throws mid-step | Remaining collectors in the step and later steps still run; that collector's file absent; manifest gains `{collector, stepIndex, error}`; scenario `passed:true` | throw isolated to a gap record |
| PARTIAL_PROBE | Probe batch: A found, B missing | `ProbeResult` for A persisted; gap for B recorded; remaining collectors run | typed probe failure carries partial results; orchestrator unwraps |
| NETWORK_SETTLE_TIMEOUT | `networkidle` never settles | Partial events returned as data; listener detached; NOT a gap | unchanged (today's behavior) |
| NETWORK_CLOSED_PAGE | Page closes before/during settle | Events captured so far returned; no throw | collector stops settling, no gap |
| NETWORK_FAILED_REQUEST | A request fails/aborts (`requestfailed`) | Event captured with `error` instead of `status`; collector succeeds | `networkEventSchema` widens: `status` optional, `error` optional |
| NETWORK_LISTENER_THROW | `response` listener throws once | Capture continues; other events retained | listener body quarantined |
| CORPUS_IO_FAILURE | `writeCorpusFile` rejects | Run fails as today | NOT isolated (orchestrator IO) |

</frozen-after-approval>

## Code Map

- `orchestrator/orchestrator.ts` -- `executeScenario` `:197-271`; monolithic collector-loop try/catch `:206-270` to carve into per-collector isolation (collector calls `:219/228/237/254`); `withTimeout` `:273`; `finishRun` in run loop `:111`.
- `model/schemas.ts` -- shared shapes (AD-13): `networkEventSchema` `:21-30`, `probeResultSchema` `:34-41`, `runManifestSchema` `:171-178` — new `collectorErrorSchema` + `errors` field + widened network schema live here.
- `orchestrator/corpus.ts` -- `startCorpusRun` `:10-12`; `writeCorpusFile` `:20-34` (sole writer, AD-15); `finishRun` `:39-55` — must now accept/emit `errors`.
- `collectors/collect.ts` -- `CollectorFn<TResult, TArgs>` `:13-16`; `collectors` record `:19-24` (`{snapshot, network, screenshot, probe}`).
- `collectors/collect-probe.ts` -- `PROBE_TEXT_TIMEOUT_MS = 5_000` `:8`; fail-fast throw discarding partials `:32-37`.
- `collectors/collect-network.ts` -- `NETWORK_CAPTURE_TIMEOUT_MS = 5_000` `:6`; timer settle + partial return `:32-38`; no `requestfailed` listener `:17`, no closed-page/quarantine.
- `orchestrator/orchestrator.test.ts` -- mocked collectors `:56-63`; `:595-615` asserts OLD abort behavior (replace); step/run-timeout failure coverage already exists `:175`, `:213`.
- `orchestrator/corpus.test.ts` -- manifest conformance `:96-116`, namespacing `:118`, schema round-trips `:135-158`.
- `collectors/collectors.test.ts` -- `createPageMock` `:42-90`, `deferred` helper `:26`.

## Tasks & Acceptance

**Execution:**
- [x] `model/schemas.ts` -- add `collectorErrorSchema` (`collector: 'snapshot'|'network'|'screenshot'|'probe'`, `stepIndex: number`, `error: string`) + `errors: CollectorError[]` on `runManifestSchema`; widen `networkEventSchema` (`status` optional, optional `error`) AND add a `.superRefine` requiring exactly one of `status`/`error` (a blank or contradictory event must be rejected) -- AD-13; `runManifestSchema.errors` gets `.default([])` so legacy pre-`errors` manifests still parse -- AD-13.
- [x] `orchestrator/corpus.ts` -- `finishRun` accepts the gap list; manifest writes `errors` (always present) -- records `status=error` (AD-16).
- [x] `orchestrator/orchestrator.ts` -- per-collector try/catch in the step loop with `withTimeout` OUTSIDE the isolation boundary: a collector THROW becomes a `CollectorError` gap (scenario `passed:true`; siblings in the step and later steps still run; persist any partial output a typed probe failure carries), while a collector exceeding `stepTimeout` still FAILS the scenario (timeout failures fail as today -- frozen `Always`; do NOT downgrade a timeout to a gap) -- AD-16 core.
- [x] `collectors/collect-probe.ts` -- return partials via a typed failure carrying the partial `ProbeResult[]` + missing probe name instead of discarding -- deferred-probe entry.
- [x] `collectors/collect-network.ts` -- capture `requestfailed` as `error` events (fallback via `||` so an empty `errorText` still yields "Request failed"); quarantine the listener bodies; closed page → return partials without throwing -- deferred-network entry.
- [x] `collectors/collectors.test.ts` -- matrix edges: probe partials; network failed-request (both non-empty and empty/absent errorText), closed-page, listener-throw (with schema check on the retained event AND a negative assertion that response events carry no `error`); the `requestfailed` handler is exactly detached across two capture windows; negative schema test rejecting a blank or both-fields network event -- matrix unit coverage.
- [x] `orchestrator/orchestrator.test.ts` -- replace `:595-615`: non-throwing collectors still called, scenario `passed:true`, manifest `errors` length 1 -- pin new contract; add a collector-timeout test asserting a collector that exceeds `stepTimeout` fails the scenario (timeout is NOT a gap).
- [x] `orchestrator/corpus.test.ts` -- manifest round-trip with populated `errors` + `collectorErrorSchema` conformance -- manifest coverage.

**Acceptance Criteria:**
- Given a collector that throws during a run, when the orchestrator runs the suite, then that collector records `status=error` in the manifest (`{collector, stepIndex, error}`), remaining collectors for that step and later steps still run, partial corpus files stay in `files`, and a future reporter can flag the gap from `manifest.errors` (AD-16).
- Given a probe batch with one missing selector, when the run executes, then already-collected probe results persist as partial corpus and the missing probe is recorded as a gap.
- Given a failed/aborted request during network capture, when the run executes, then it is captured as an event bearing `error` (no `status`) and the network collector succeeds.
- Given a collector that exceeds `stepTimeout`, when the run executes, then the scenario records `passed:false` (timeout failures still fail the scenario -- frozen `Always`); only collector throws become gaps.
- Given a step-level failure (action/settle/timeout), when the run executes, then the scenario records `passed:false` and the run still finalizes with a manifest.

## Spec Change Log

- **2026-08-29 (code review, bad_spec loopback)** — Blind-hunter finding: the first implementation wrapped `withTimeout` INSIDE `isolateCollector`, so a collector exceeding `stepTimeout` was downgraded to a gap and the scenario passed. That deviates from the frozen `Always` boundary ("action/settle/timeout failures still fail the scenario as today"): pre-2-4 each collector ran under `withTimeout` outside any catch, so a collector timeout failed the scenario. Amended (non-frozen sections only): `orchestrator.ts` execution task now pins `withTimeout` OUTSIDE the isolation boundary — a collector THROW becomes a gap, a collector TIMEOUT still fails the scenario; added a collector-timeout acceptance criterion. Known-bad state avoided: hung collectors silently passing scenarios with a misleading "Step timed out" message, and inconsistent timeout semantics between step actions and collectors. Carried patch findings folded into the amended tasks: `networkEventSchema` `.superRefine` exactly-one of `status`/`error` + negative test; `runManifestSchema.errors` `.default([])`; `collect-network.ts` `||` empty-errorText fallback; `requestfailed`-handler detach test (two capture windows); negative `error`-absence assertion on response events; listener-quarantine test schema-checks the retained event. KEEP (must survive re-derivation): per-collector isolation for throws only (gap `{collector, stepIndex, error}`, siblings + later steps continue, scenario `passed:true`); `collectorErrorSchema` + `errors` on `runManifestSchema`, `finishRun(errors)` always writing `errors`; corpus-write IO failures run-fatal and NOT isolated; probe partial retention via `ProbePartialError` on throw; network widening (requestfailed→`error` event with no `status`, quarantined listener bodies, closed-page partial returns, listeners detached in `finally`); all isolation/matrix/wiring tests that passed review; frozen behaviors (action/settle timeout fails scenario, run/step-timeout, model-version, CDP attach, corpus filenames/namespacing).

- **2026-08-29 (code review, patch findings)** — Round-2 review (blind-hunter 24, edge-case-hunter 2, verification-gap empty). No intent_gap/bad_spec — the frozen matrix (quarantines, timeout-not-a-gap, isolation contract) is implemented as specified. 13 patch findings applied post-copy (no re-derivation needed): `StepTimeoutError` now names the hung collector; `NetworkEvent` is an exported discriminated union so the exactly-one invariant survives at compile time; `status` doc reworded (any HTTP code, not "success"); `stepIndex` `int().nonnegative()`; multi-step/multi-scenario gap `stepIndex` test; `requestfailed` quarantine test; success-path asserts both listeners detached; isolation test asserts sibling kinds written at the gap step; probe partial test de-coupled from fixture order; wrong-type schema negatives; "listener-body quarantine ≠ isolation boundary" doc reconciliation; `seen` set dedupes `response`+`requestfailed` for the same request (one event per exchange); `error` `z.string().min(1)` rejects a blank failure string. Rejected (spec-compliant/theoretical/contrived): quarantine swallows a throwing event (spec'd listener quarantine); probe timeout-vs-missing conflation (gap carries the underlying cause); non-probe throwing `ProbePartialError`; collector-name/plural-file-kind skew; `errors: null`; in-file partial marker (manifest `errors` disambiguates); hypothetical stepIndex desync; `instanceof` module identity; withTimeout outcome-unification refactor. Deferred: networkidle one-shot window misses late/lazy traffic; probe batch fail-fast loses later probes; schema-wide `capturedAt` ISO validation; duplicate probe-name detection. Verification now 76/76 tests + clean typecheck. `review_loop_iteration` stays 1.

## Design Notes

- **Gap ≠ failed scenario.** Completeness and execution success are separate axes: a scenario whose snapshot failed did execute — `passed:true` plus a manifest `error` is the honest report; failing it would double-report what the future reporter owns.
- **Probe carrier keeps AD-13 intact.** Normal output stays `ProbeResult[]`; the partial set travels in a typed thrown error the orchestrator's uniform isolation catch persists — no envelope change on the happy path.
- **Network widening is deliberate.** Failed requests have no HTTP status; exactly-one of `status`/`error` keeps capture emitting conforming events for `requestfailed` while rejecting blank/contradictory records.
- **Timeout is not a gap.** The isolation boundary catches collector *throws*; it never swallows a `stepTimeout`. A collector that hangs beyond its budget fails the scenario exactly as it did before AD-16 — isolation gives the run resilience to collector failure, not license to ignore a hung collector.

## Verification

- `npm run typecheck` -- expected: clean (NFR-2)
- `npm test` -- expected: all pass (76: 61 existing + new isolation/edge tests + round-2 review patches)

## Suggested Review Order

**Isolation contract (the design's core)**

- Entry point: how a collector throw becomes a recorded gap while a timeout still fails the scenario — one boundary with two deliberately different outcomes
  [`orchestrator.ts:317`](../../orchestrator/orchestrator.ts#L317)

- `withTimeout` sits OUTSIDE the boundary so only throws are isolated; siblings and later steps keep running
  [`orchestrator.ts:225`](../../orchestrator/orchestrator.ts#L225)

- `StepTimeoutError` is rethrown with the hung collector's name so a timeout is diagnosable and never degrades into a gap (Timeout is not a gap)
  [`orchestrator.ts:376`](../../orchestrator/orchestrator.ts#L376)

- Gap list flows from the run loop into `finishRun`, so `errors` is always part of every manifest
  [`orchestrator.ts:110`](../../orchestrator/orchestrator.ts#L110)

**Schema contract (AD-13)**

- `networkEventSchema` widened to an optional `error` + `.superRefine` enforcing exactly one of `status`/`error`
  [`schemas.ts:24`](../../model/schemas.ts#L24)

- `NetworkEvent` exported as a discriminated union so the exactly-one invariant also holds at compile time
  [`schemas.ts:52`](../../model/schemas.ts#L52)

- `collectorErrorSchema` — collector identity, int non-negative global `stepIndex`, error string
  [`schemas.ts:146`](../../model/schemas.ts#L146)

- `errors` defaults to `[]` so pre-`errors` manifests still parse
  [`schemas.ts:232`](../../model/schemas.ts#L232)

**Collectors**

- Shared `seen` set makes an exchange firing both `response` and `requestfailed` yield exactly one event
  [`collect-network.ts:16`](../../collectors/collect-network.ts#L16)

- Failed/aborted requests become `error` events; empty `errorText` still yields "Request failed"
  [`collect-network.ts:46`](../../collectors/collect-network.ts#L46)

- Quarantined listener bodies and listeners detached in `finally` — no event loss, no cross-window leakage
  [`collect-network.ts:61`](../../collectors/collect-network.ts#L61)

- `ProbePartialError` carries partial results + missing probe so nothing collected is ever discarded
  [`collect-probe.ts:18`](../../collectors/collect-probe.ts#L18)

- Bounded per-probe wait before raising the partial — no unbounded batch hang
  [`collect-probe.ts:56`](../../collectors/collect-probe.ts#L56)

**Corpus / manifest**

- `finishRun` now persists the gap list alongside the file record
  [`corpus.ts:41`](../../orchestrator/corpus.ts#L41)

**Tests (peripherals last)**

- Collector timeout fails the scenario (the once-broken behavior, now pinned)
  [`orchestrator.test.ts:723`](../../orchestrator/orchestrator.test.ts#L723)

- IO failures stay run-fatal — never isolated into a gap
  [`orchestrator.test.ts:752`](../../orchestrator/orchestrator.test.ts#L752)

- Gap `stepIndex` verified as a true global index across multi-step scenarios
  [`orchestrator.test.ts:637`](../../orchestrator/orchestrator.test.ts#L637)

- requestfailed quarantine, dedupe, and two-window detach coverage
  [`collectors.test.ts:339`](../../collectors/collectors.test.ts#L339)

- Exactly-one schema negatives (blank, both-fields, wrong-typed, blank-error)
  [`collectors.test.ts:571`](../../collectors/collectors.test.ts#L571)

- Manifest round-trips with populated `errors`
  [`corpus.test.ts:143`](../../orchestrator/corpus.test.ts#L143)