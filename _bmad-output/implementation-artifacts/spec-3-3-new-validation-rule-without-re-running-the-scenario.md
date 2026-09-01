---
title: 'Story 3.3: New validation rule without re-running the scenario'
type: 'feature'
created: '2026-09-01'
status: 'done'
review_loop_iteration: 0
baseline_commit: 'ea37b61c6c2de0acb41b4b3281d25df523a8cb67'
context:
  - _bmad-output/planning-artifacts/epics/epics.md
  - _bmad-output/planning-artifacts/architecture/architecture-reactive-testing-2026-08-17/ARCHITECTURE-SPINE.md
  - _bmad-output/implementation-artifacts/spec-3-1-validators-are-pure-functions-over-the-corpus.md
  - _bmad-output/implementation-artifacts/spec-3-2-validator-declares-corpus-dependencies-one-navigation-funds.md
---

## Intent

**Problem:** Story 3.1/3.2 proved validators are pure over `ContractEvidence` but only against a **hand-built fixture**; Story 3.2 explicitly **deferred** the real corpus loader / `contractId → stepIndex` mapping from a run's files. So today no **previously recorded corpus** can be re-validated by an old or newly written rule — exactly FR-6 ("new validation rule without re-running the scenario"). A new rule today requires re-launching the scenario, defeating this epic's offline re-validation value.

**Approach:** Ship the deferred **corpus loader** + an **offline runner** in `validators/`. The loader reads a recorded run's files on disk (guided by its `run-manifest.json` `files` list) and, using the **test plan** to reconstruct the orchestrator's global step-index assignment, rebuilds each step's `ContractEvidence` (pre/post snapshot + probes) tagged with its `contractId`. The runner composes the loader with the existing `validatorsFor(contractId)` interpreter, returning conforming `ValidationResult`s purely over the corpus — no browser, no re-launch (FR-5, FR-6, NFR-1).

## Boundaries & Constraints

**Always:**
- The loader is pure and read-only over recorded files (no `Page`, no browser, no AI) — determinism holds with the browser closed (FR-5, NFR-1). Same run → identical evidence and results.
- Evidence conforms to `snapshotRecordSchema` / `probeResultSchema` (AD-13): probes from `probes/{runId}/{stepIndex}.json`, snapshots from `snapshots/{runId}/{stepIndex}.json` (post) and `.pre.json` (pre). The manifest `files` list is the source of what exists, so a collector gap (AD-16) yields absent evidence, never a read error — reusing 3.1's missing-evidence failure path.
- The loader uses the **test plan** to assign the same global `stepIndex` values the orchestrator used (walked across `plan.scenarios[].steps[]`), reconstructing `stepIndex → contractId` exactly as recorded. Each step's evidence is tagged with its `contractId` — keying by `contractId` alone would collapse a contract repeated across steps.
- The runner returns only `ValidationResult`s conforming to `validationResultSchema` (AD-14) via the existing `validatorsFor(contractId)` — no new validator semantics.
- NFR-2 gate: `tsc --noEmit` clean and `npm test` green before done.

**Ask First (HALT):**
- **Loader API shape.** Default: per-step tagged evidence — `validators/corpus-loader.ts` exports `loadCorpusSteps(corpusDir, runId, plan): StepEvidence[]`, `StepEvidence = { stepIndex; contractId; evidence }`, preserving a contract repeated across steps. Alternative: `loadContractEvidence(...): Map<contractId, ContractEvidence>` (lossy on repeats — rejected unless the plan is single-occurrence).
- **Test-plan requirement.** Default: the loader needs the `TestPlan` to map stepIndex → contractId, because the manifest stores stepIndexes, not contractIds (no schema/model change). Alternative: add a per-step `contractId` to the manifest (a `runManifestSchema` edit → `modelVersion` bump; only if cross-run portability without the plan is required).
- **Runner location & surface.** Default: `validators/offline-runner.ts` — `runValidatorsOffline(corpusDir, runId, plan, contractIds?): ValidationResult[]` (all steps, or filtered to a `contractId` subset). Lives in `validators/` so it composes the loader + interpreter without importing `orchestrator/` (avoids a layer cycle).
- **"Add a new rule" flow.** Default: a "new rule" is just a `Validator` (added to the `validatorMap` or passed directly); the runner exercises it over recorded corpora. No rule-registration machinery this story.

**Never:**
- No `Page`/browser reaches the loader, runner, or a validator (FR-5, NFR-1); no re-launch; no navigation (FR-6).
- Do not edit the model, corpus, or plan (read-only over evidence, AD-2); do not silently change a spec (FR-8, AD-10).
- Do not build the reporter, Gherkin rendering (Story 3.4), or the adjudication flow (Story 3.5).
- Do not add a manifest `status/complete` field or embed assertions; do not change `runManifestSchema`/`modelVersion` unless the Test-plan Ask-First alternative is chosen.
- Do not create a `validators/ → orchestrator/` import (only the orchestrator consumes validators).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| OFFLINE_SATISFIED | A recorded run + plan where a nav contract's post-state matches its declaration | `ValidationResult` `passed: true`, `corpusRefs` naming snapshot/pre,post + probe evidence read | no throw — a result |
| OFFLINE_VIOLATED | Recorded run where a postcondition is unmet | `passed: false`, `details` naming the unmet predicate | no throw — a result |
| MISSING_EVIDENCE | A step whose post-snapshot collector gaped (file absent from manifest `files`) | evidence `post: undefined`; validator returns `passed: false`, `details` "missing snapshot evidence" | no throw — mirrors 3.1 |
| REPEATED_CONTRACT | Plan runs the same contractId on ≥2 steps | two `StepEvidence` entries (distinct stepIndex), each with its own evidence; both validated | N/A |
| COLLECTOR_GAP_ONLY | Run where `probe` gaped but snapshots present | probes absent; `view-selected` predicate reports the missing-value failure path | no throw — mirror of 3.1 |
| UNKNOWN_RUN | `runId`/dir absent from `corpusDir` | empty evidence set / no steps; runner returns `[]` | explicit, not a crash |
| PLAN_FILTER | `contractIds` subset passed to runner | only matching steps validated | N/A |
| DETERMINISM | Same run + plan twice (browser closed) | identical `ValidationResult`s | N/A (NFR-1) |

## Code Map

- `validators/corpus-loader.ts` (NEW) — pure reader: `loadCorpusSteps(corpusDir, runId, plan): StepEvidence[]`. Reads `run-manifest.json` (`files`) + the plan to reconstruct stepIndexes and rebuild `ContractEvidence` (pre/post snapshot, probes). NEW module; consumes only `node:fs`, `model/schemas.js`, `orchestrator/corpus.ts` naming conventions (keeper of the file layout). Must not import `orchestrator/` runtime (avoid a `validators/ → orchestrator/` cycle).
- `validators/offline-runner.ts` (NEW) — `runValidatorsOffline(corpusDir, runId, plan, contractIds?): ValidationResult[]` composing `loadCorpusSteps` + `validatorsFor(contractId)` from `validator-map.ts` (`:123-125`). Returns only `ValidationResult[]`.
- `validators/corpus-loader.test.ts` (NEW) — writes a corpus with `writeCorpusFile`/`finishRun` (from `orchestrator/corpus.ts`) into a temp dir then loads it: satisfied/violated/missing-evidence/repeated-contract/collector-gap/unknown-run/determinism. Mirrors the temp-dir pattern in `orchestrator/corpus.test.ts:33-37`.
- `validators/offline-runner.test.ts` (NEW) — end-to-end: recording a run then running the existing smoke-plan validators offline yields `ValidationResult[]`; a `contractIds` filter narrows to the requested contracts.
- `model/schemas.ts` — READ-ONLY unless the Test-plan Ask-First alternative is chosen (then `runManifestSchema`/`StepEvidence` would change → modelVersion bump; default avoids this).
- `orchestrator/corpus.ts` — READ-ONLY reference for the file layout (`writeCorpusFile` `:28-44`, `finishRun` `:55-77`); the loader mirrors its naming. Not modified by the default design.

## Tasks & Acceptance

**Execution:**
- [x] `validators/corpus-loader.ts` (NEW) — pure `loadCorpusSteps(corpusDir, runId, plan): StepEvidence[]` reading the manifest `files` + plan step ordering, rebuilding `ContractEvidence` per step tagged with `contractId`.
- [x] `validators/offline-runner.ts` (NEW) — `runValidatorsOffline(corpusDir, runId, plan, contractIds?)` composing the loader with `validatorsFor(contractId)`, returning `ValidationResult[]`.
- [x] `validators/corpus-loader.test.ts` (NEW) — edge cases from the I/O matrix (satisfied, violated, missing-evidence, repeated-contract, collector-gap-only, unknown-run, determinism).
- [x] `validators/offline-runner.test.ts` (NEW) — end-to-end offline re-validation over a wrote-then-loaded run; `contractIds` filter.

**Acceptance Criteria:**
- Given a previously recorded corpus and its test plan, when I add/author a `Validator` and run `runValidatorsOffline(corpusDir, runId, plan)`, then it produces `ValidationResult`s without launching the scenario or browser (FR-6).
- Given a nav contract whose recorded post-state matches its declaration, when the offline runner runs, then `passed: true` with `corpusRefs` naming the snapshot (pre/post) and probe evidence read (FR-5, AD-14).
- Given a recorded run with a collector gap (absent file), when the loader rebuilds evidence, then that step yields `post`/`probes` undefined and the validator reports missing evidence as a failure result — not a throw (mirrors 3.1).
- Given a plan that runs the same contractId on multiple steps, when the loader runs, then each occurrence is preserved as its own `StepEvidence` with its own stepIndex and evidence.
- Given the same recorded corpus and plan, when the offline runner runs twice with the browser closed, then results are identical (NFR-1).
- Given `npm run typecheck` / `npm test`, when run, then exits 0.

## Spec Change Log

- **2026-09-01** — Initial draft. Story 3.3 is the deferred 3.2 corpus loader plus an offline runner, making FR-6 executable over real recorded corpora rather than fixtures. Default design: per-step tagged evidence, test-planned step mapping, no manifest/model change, runner in `validators/`.

## Design Notes

- **This is the deferred 3.2 follow-up.** The loader rebuilds a run's step evidence from disk; the runner composes it with the existing interpreter — nothing about validator semantics changes.
- **stepIndex → contractId needs the plan.** The manifest stores stepIndexes and evidence paths, not the contract a step executed; the plan plus the global-step walk the orchestrator uses at `orchestrator.ts:119` reconstructs it deterministically — no `modelVersion` bump.
- **Manifest-first discovery.** Trusting `run-manifest.json` `files` (AD-15 self-describing corpus) distinguishes a skipped/gaped collector from a missing one, degrading to absent evidence (3.1's missing-evidence result) instead of throwing.
- **stepIndex is total, file presence is not.** The reconstructed indexes are always a complete `0..N-1` (guaranteed by the plan walk), but each step's files on disk may be incomplete — a step can lack a post-snapshot or a probe batch (collector gap, optional-probe absence). The loader must seek evidence by index but never assert a file exists; presence is discovered from the manifest.
- **Per-step, not per-contract, tags.** A contract repeats on several smoke-plan steps (e.g. `openPortfolioSummary` at steps 7 and 9); tagging each `StepEvidence` with its `contractId` while keying by `stepIndex` preserves every occurrence.
- **Layer direction preserved.** `validators/` imports only `model/`; the loader stays in `validators/` (never `orchestrator/`) so the runner needs only `validator-map`. Writer stays in `orchestrator/corpus.ts`; reader lives in `validators/`.
- **"New rule" = a new `Validator`.** An author adds a `Validator` (to the map or standalone); `runValidatorsOffline` exercises it over any recorded corpus — the FR-6 promise, with `ValidationResult`s comparable across historical runs.

## Verification

- `npm run typecheck` — expected: exit 0
- `npm test` — expected: existing suites + new corpus-loader / offline-runner tests pass

## Suggested Review Order

**Offline runner (entry point)**

- Composes the loader with the per-contract validator interpreter — the FR-6 promise
  [`offline-runner.ts:25`](../../validators/offline-runner.ts#L25)

- A throwing validator degrades to a skip, never escapes the pure runner
  [`offline-runner.ts:43`](../../validators/offline-runner.ts#L43)

**Evidence reconstruction (loader)**

- Manifest-first reader: rebuilds step evidence, `[]` for absent run
  [`corpus-loader.ts:51`](../../validators/corpus-loader.ts#L51)

- Defensive plan walk guards malformed plans so the loader never throws
  [`corpus-loader.ts:85`](../../validators/corpus-loader.ts#L85)

- Reads pre/post snapshot + probes, honoring the manifest `files` set
  [`corpus-loader.ts:118`](../../validators/corpus-loader.ts#L118)

- Listed-but-corrupt/missing file degrades to undefined evidence
  [`corpus-loader.ts:150`](../../validators/corpus-loader.ts#L150)

**Tests (peripheral)**

- Edge-case coverage incl. corrupt/missing-listed file and malformed plan
  [`corpus-loader.test.ts`](../../validators/corpus-loader.test.ts)

- End-to-end offline revalidation; new-rule and throwing-validator cases
  [`offline-runner.test.ts`](../../validators/offline-runner.test.ts)
