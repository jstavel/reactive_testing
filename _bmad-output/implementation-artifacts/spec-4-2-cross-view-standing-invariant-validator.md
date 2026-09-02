---
title: 'Cross-view standing invariant validator'
type: 'feature'
created: '2026-09-02'
baseline_commit: '8da319910deeb05c9bdaf8f19acd4afc75eb9e6e'
status: 'done'
review_loop_iteration: 0
context:
  - '_bmad-output/implementation-artifacts/epic-4-context.md'
  - '_bmad-output/implementation-artifacts/spec-4-1-standalone-repro-script-from-the-model.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A fact shown on multiple surfaces (e.g. current portfolio value) currently has no check that the surfaces agree; stale-view divergence — one fact, different values on different screens (the mBank-style desync) — goes unnoticed until a human compares screens manually.

**Approach:** Add a cross-view standing invariant validator: a fact is declared **once**, naming which modeled surfaces show it, and a pure offline runner checks that the fact's value agrees across those surfaces over a recorded corpus, failing with the offending view named (FR-13). Agreement semantics (e.g. pending vs settled) are declared per fact so legitimate divergence is not a false positive.

## Boundaries & Constraints

**Always:**
- Invariant is declared once per fact: `CrossViewInvariant { invariantId, fact, probeName, surfaces: stateId[], normalize }` in `validators/cross-view.ts`. Surfaces are FSM `stateId`s; each invariant names every modeled surface that shows the fact.
- Pure offline (FR-13, NFR-1): `runCrossViewInvariants(corpusDir, runId, plan): ValidationResult[]` reads only `loadCorpusSteps` evidence — no `Page`, no browser, no network. The no-browser guarantee is the same type-level absence as existing validators.
- One result per declared invariant, conforming to `ValidationResult` (AD-14) with `contractId = invariantId` — so the existing `failure-gherkin` reporter renders cross-view failures unchanged (FR-7).
- Value extraction is decoupled from collection: the invariant reads probe results by `probeName` from the corpus (`evidence.probes`). Probe selectors live in the runner's probe config (Story 2.7), never in the invariant — the invariant consumes only recorded corpus.
- Surface evidence: the latest recorded observation per surface (a step whose post-snapshot `stateId` equals the surface; probes from that step's batch), ordered by `capturedAt` — deterministic over the corpus.
- Comparison: normalize every observed value, then compare across surfaces. All agree → `passed: true`. Any divergence → `passed: false` with `details` naming the offending surfaces and their values (FR-13).
- Missing evidence: a declared surface with no recorded observation (no post snapshot, no matching probe, or empty value) → `passed: false` naming the surface — an honest "cannot verify", never a silent pass (mirrors validator-map's missing-snapshot path).
- Declaration-time gap: an invariant whose `surfaces` references a `stateId` absent from `homePageModel.states` throws at `runCrossViewInvariants` entry (an unmodeled surface is a declaration error, never silently ignored).
- New probe names are not required by preflight: cross-view invariants read probes only if recorded; they do not change orchestrator planning in this story.
- `npm run typecheck` clean; every rule unit-tested against hand-written corpora (offline-runner.test.ts pattern — no browser needed).

**Ask First:**
- Wiring a real fact probe (e.g. `portfolio-value`) into `bin/run-smoke.ts` so live runs record the fact the seed invariant checks — separate from the validator machinery, needs the human's live run.

**Never:**
- No live-session or browser access anywhere in the check (FR-13, NFR-1).
- No change to the Model (fsm/contracts/schemas), orchestrator, collectors, or smoke plan — the invariant registry lives outside the model hash (symmetric to action-map/validator-map, AD-17); `CrossViewInvariant` is a validator-layer TS interface consuming the canonical corpus types, not a new `schemas.ts` shape.
- No new predicate vocabulary, no probe-definition ownership by invariants, no hand-specified agreement exceptions per run — agreement semantics are declared once per fact in the registry.
- No silent skip of an unrecorded surface, and no partial pass when any declared surface diverges.
- NFR-4: English only; "shared validator," never "aspect."

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| AGREE | corpus records fact value X on every declared surface | one result, `passed: true`, empty `details` | N/A |
| DIVERGE | surface A records X, surface B records Y | `passed: false`, `details` names A (value X) and B (value Y) | N/A |
| MISSING_SURFACE | a declared surface has no post snapshot / probe / empty value | `passed: false`, `details` names the surface and why evidence is absent | N/A |
| NORMALIZE | values differ in formatting only (e.g. "5,034.89 USD" vs "5034.89 USD", pending vs settled same amount) | agreed once `normalize` maps them equal — no false positive | N/A |
| UNMODELED_SURFACE | invariant.surfaces contains a stateId not in `homePageModel.states` | throws at entry, naming the bad stateId | declaration gap, nothing validated |
| NO_OBSERVATIONS | corpus has no step landing on any declared surface | one result, `passed: false`, `details` names every missing surface | N/A |

</frozen-after-approval>

## Code Map

- `validators/cross-view.ts` (NEW) — `CrossViewInvariant` interface (`invariantId`, `fact`, `probeName`, `surfaces`, `normalize(value: string): string`), the `crossViewInvariants` registry seeded with `current-portfolio-value-agrees-across-surfaces` (probeName `portfolio-value`, surfaces `[homePage, portfolioSummaryDialog]`, normalize trimming whitespace and collapsing repeated spaces), and `runCrossViewInvariants(corpusDir, runId, plan): ValidationResult[]`.
- `validators/corpus-loader.ts:51` — `loadCorpusSteps(corpusDir, runId, plan): StepEvidence[]` (`:33` shape: `stepIndex`, `contractId`, `evidence: ContractEvidence`); the only corpus read. `evidence.post.stateId` identifies the surface; `evidence.probes` (`ProbeResult[]`) carries the fact values.
- `model/fsm.ts:41` — `homePageModel.states`; the authority for valid `surfaces` (declaration gap check).
- `model/schemas.ts:121` — `ValidationResult` shape (AD-14); `:149` `ContractEvidence`; `:59` `ProbeResult` — the canonical types consumed, unchanged.
- `validators/offline-runner.ts:25` — `runValidatorsOffline`; `runCrossViewInvariants` mirrors its shape and determinism, but is cross-surface (run-level) rather than per-step.
- `reporter/failure-gherkin.ts:47` — `emitFailureGherkin` consumes `ValidationResult[]`; cross-view failures render as scenarios naming the invariant and its evidence refs unchanged.

## Tasks & Acceptance

**Execution:**
- [x] `validators/cross-view.ts` (NEW) — export `CrossViewInvariant`, seed registry with `current-portfolio-value-agrees-across-surfaces`, and implement `runCrossViewInvariants(corpusDir, runId, plan): ValidationResult[]`: entry-time surfaces-⊆-FSM gap throw; latest-observation-per-surface extraction by post `stateId` + `probeName`; normalize-compare; missing-evidence failure; one conforming `ValidationResult` per invariant.
- [x] `validators/cross-view.test.ts` (NEW) — hand-written corpora (offline-runner.test.ts pattern) covering every I/O row: AGREE, DIVERGE (details name offending surfaces + values), MISSING_SURFACE, NORMALIZE (pending-vs-settled no-false-positive), UNMODELED_SURFACE (throws), NO_OBSERVATIONS; plus determinism (same corpus twice → identical results) and `validationResultSchema` conformance.

**Acceptance Criteria:**
- Given a recorded corpus spanning multiple surfaces showing the same fact, when `runCrossViewInvariants` runs, then it checks every declared surface, passes when they agree, and fails with the offending view named on divergence (FR-13).
- Given the invariant declares agreement semantics per fact, when a legitimate formatting/pending-vs-settled divergence occurs, then it passes — no false positive.
- Given a declared surface with no recorded evidence, when the runner runs, then it fails naming the surface (never silently passes).
- Given `npm run typecheck` and `npm test`, when run, then both exit 0 and every emitted `ValidationResult` conforms to `validationResultSchema`.

## Spec Change Log

- **2026-09-02** — Initial draft.

## Design Notes

- **Declared once, checked everywhere.** The registry is the single home of each fact's rule (`surfaces` + `normalize`); a reviewer reads one declaration to know exactly which surfaces must agree and how. No per-run or per-step repetition.
- **Why probe-name extraction instead of parsing snapshots.** `SnapshotRecord.snapshot` is serialized innerHTML — parsing values out of it in a validator couples the rule to DOM serialization details. Probes are already the corpus's typed value channel (`ProbeResult` name/value, Story 2.7); the invariant names the probe it reads, and the runner's config owns the selector (Story 2.7 decoupling).
- **"Latest observation per surface" keeps the rule honest and deterministic.** Within one recorded run the same fact can be observed at different times on the same surface (e.g. two homePage landings); sorting by `capturedAt` and taking the latest makes the comparison a well-defined pure function of the corpus (NFR-1), while cross-surface divergence still fails.
- **Missing evidence fails loudly.** A surface that cannot be observed cannot be confirmed to agree; failing with the surface named is the honest result and mirrors validator-map's "missing snapshot evidence" precedent — a corpus gap is never converted into a pass.
- **Schema-level example (agreement semantics, pending vs settled):**
  ```ts
  normalize: (v) => v.replace(/\s+/g, " ").trim().toLowerCase(),
  // "5,034.89 USD" and "5,034.89 usd" → agree; a pending marker that is
  // semantically irrelevant to the fact is stripped here per fact, declared once.
  ```

## Verification

**Commands:**
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: exit 0, new `validators/cross-view.test.ts` passes

**Manual checks (if no CLI):**
- _None._ (Checking against a real recorded run needs a live collection with the fact probe configured — Ask First; correctness is proven by the automated corpus tests.)

## Suggested Review Order

**Invariant registry — declared once, checked everywhere**

- Entry point: the registry seeds the fact, its surfaces, and per-fact agreement semantics in one place (FR-13's "declared once").
  [`cross-view.ts:53`](../../validators/cross-view.ts#L53)

- The `CrossViewInvariant` shape — `probeName` decouples extraction from collection; `normalize` carries the agreement semantics (pending-vs-settled per fact, no false positive).
  [`cross-view.ts:37`](../../validators/cross-view.ts#L37)

**Offline runner — pure over the corpus**

- `runCrossViewInvariants`: no `Page`/browser, entry-time declaration-gap check, one conforming `ValidationResult` per invariant (AD-14) so `failure-gherkin` renders failures unchanged.
  [`cross-view.ts:76`](../../validators/cross-view.ts#L76)

- `checkInvariant`: latest-observation-per-surface, normalize-compare, divergence fails with the offending views and values named; missing evidence fails loudly, never silently passes.
  [`cross-view.ts:137`](../../validators/cross-view.ts#L137)

- `assertRegistryEntryGaps`: empty surfaces, duplicated surfaces/ids, and unmodeled surfaces throw at entry — declaration gaps, never silent skips (review F1).
  [`cross-view.ts:93`](../../validators/cross-view.ts#L93)

- `latestObservation`: every probe record — empty included — advances "latest", so an empty value is missing evidence, not an older value in disguise (review F1).
  [`cross-view.ts:211`](../../validators/cross-view.ts#L211)

**Tests — hand-written corpora, no browser**

- The AGREE/DIVERGE core: divergence names surfaces + values; each result conforms to `validationResultSchema`.
  [`cross-view.test.ts:90`](../../validators/cross-view.test.ts#L90)

- The review-added declaration-gap + empty-latest guards are pinned by dedicated tests.
  [`cross-view.test.ts:347`](../../validators/cross-view.test.ts#L347)

- Determinism (NFR-1): the same corpus twice yields identical results.
  [`cross-view.test.ts:395`](../../validators/cross-view.test.ts#L395)
