---
title: 'Offline validation reconciles expected checks — no vacuous passes on partial corpora'
type: 'bugfix'
created: '2026-09-15'
status: 'done'
baseline_commit: '7928669f2097698f5418d0f0c245799c866cda37'
review_loop_iteration: 1
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A partially corrupt or inconsistently recorded corpus silently undercounts offline checks: `loadCorpusSteps` returns `[]` on an unreadable/invalid manifest, silently skips malformed plan segments, and `runValidatorsOffline` skips unknown contracts and swallows throwing validators — so `validate:smoke`/`report:smoke` can print "N/N passed" over fewer checks than the plan actually declares.

**Approach:** Make the corpus loader report gaps alongside steps (new `loadCorpusRun`), and make `runValidatorsOffline` reconcile every expected check (per filtered plan step) against exactly one emitted `ValidationResult` — emitting failed results for every gap class (unknown contract, throwing validator, invalid manifest, malformed plan segment) instead of skipping. The CLIs inherit the guarantee unchanged; no orchestrator or model changes.

## Boundaries & Constraints

**Always:** Results are pure and deterministic (NFR-1) and never escape as throws (FR-5) — gaps become failed `ValidationResult`s, never exceptions. A legitimate collector gap (AD-16: file absent from `manifest.files[]`) still degrades to the existing missing-evidence validator failures — reconciliation must NOT flag steps whose evidence is legitimately unrecorded. `runCorpusSteps`-era public API `loadCorpusSteps` keeps its exact signature and behavior (`validators/cross-view.ts` depends on it). `validationResultSchema` is unchanged (`contractId: z.string()` admits the `"(corpus)"` sentinel for gaps attributable to no declared contract).

**Ask First:** Any change to `runManifestSchema` or the manifest write path (out of scope — halt with proposal). A gap class that cannot be attributed to a step's contract or the `"(corpus)"` sentinel cleanly. Any case where reconciliation would change the recorded-run semantics of `deriveScenarioResults` in `report:smoke`.

**Never:** No orchestrator, reporter, failure-gherkin, or cross-view changes. No new corpus file formats or manifest fields. No change to UNKNOWN_RUN CLI behavior — the CLIs' zero-checks guard stays as the final backstop for unknown runs. No wiring of `runCrossViewInvariants` (separate story).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH | Intact recorded run + valid plan | `results.length === Σ validatorsFor(contractId)` over filtered steps; example fixture still 18/18 | N/A |
| MANIFEST_INVALID | Run dir whose run-manifest.json fails `runManifestSchema` | Loader reports `manifest-invalid` gap; runner emits one failed result per plan step ("cannot validate: run manifest invalid") | never throws |
| UNKNOWN_RUN | runId with no manifest | `steps: []` + `unknown-run` gap → zero results (CLI guard owns messaging) | unchanged from today |
| UNKNOWN_CONTRACT | Plan step whose contractId is not in the validator map | Failed result naming the contract + "unvalidated gap" — the step's expected check still counts | N/A |
| VALIDATOR_THROWS | A validator throws for a step | Failed result naming the contract; remaining validators for the step still run | never escapes |
| PLAN_MALFORMED | Scenario/steps not arrays, or step without a string contractId | Loader reports `plan-malformed` gap; runner emits failed result attributed to `"(corpus)"` | N/A |
| FILTER | `contractIds` subset given | Reconciliation scope = filtered steps only; unfiltered steps stay untouched | N/A |

</frozen-after-approval>

## Code Map

- `validators/corpus-loader.ts` -- CHANGE SURFACE. `loadCorpusSteps` :47-75 (manifest `safeParse` fail → silent `[]` :59-65); `planSteps` silent segment skip :82-108; `readSnapshotIfListed`/`readProbesIfListed` corrupt-file → `undefined` :130-174 (stays as-is — validators already fail those honestly). New export `loadCorpusRun(corpusDir, runId, plan): { steps: StepEvidence[]; gaps: CorpusGap[] }`; `loadCorpusSteps` becomes a wrapper returning `.steps`.
- `validators/offline-runner.ts` -- CHANGE SURFACE. `runValidatorsOffline` :25-55: zero-steps early return :32-34 (manifest-invalid escape), unknown-contract skip via `validatorsFor` → `[]` (validator-map.ts:135-137), throw-skip :44-50. Reconciliation lives here.
- `validators/validator-map.ts` -- read-only: `validatorMap` built from `allContracts` :127-132; `validatorsFor` returns `[]` for unknown ids :135-137.
- `validators/cross-view.ts` -- read-only consumer of `loadCorpusSteps` (comment :8); must keep working via the wrapper.
- `bin/validate-smoke.ts` -- read-only: `summarizedOutcome` zero-checks guard :141-159; `planVersionRefusal` guard :174 (refuses legacy manifests upstream, so CLI-reachable `manifest-invalid` is rare — the runner-level guarantee is the defense).
- `bin/report-smoke.ts` -- read-only: `deriveScenarioResults` :79-102 maps per-step results to scenarios; inherits correctness from full-count results.
- `model/schemas.ts` -- read-only: `validationResultSchema` :140-150; `runManifestSchema` :333; no edits.
- `orchestrator/corpus.ts` -- read-only reference for manifest `files[]` semantics (AD-15) and collector-gap recording (AD-16).
- Tests: `validators/corpus-loader.test.ts`, `validators/offline-runner.test.ts` (fixtures + `vi.mock` precedent), `bin/validate-smoke.test.ts` (18/18 example pin :772; fail-demo 17/18 corruption precedent :566), `bin/generate-sample-report.test.ts` ONE_DEFECT corruption pattern.

## Tasks & Acceptance

**Execution:**
- [x] `validators/corpus-loader.ts` -- add `CorpusGap` (`kind: "manifest-invalid" | "unknown-run" | "plan-malformed" | "file-corrupt"`; `file-corrupt` carries `stepIndex`/`contractId`/`relPath`; `plan-malformed` carries optional `scenarioIndex`/`detail`) and `loadCorpusRun`; reimplement `loadCorpusSteps` as a wrapper -- gap visibility without breaking consumers. Classify a manifest read failure by error code: `ENOENT` → `unknown-run`, any other read error → `manifest-invalid` (a present-but-corrupt manifest is never mislabeled "no run"). In `loadStepEvidence`, treat a file that is *listed in the manifest but unparseable or failing its schema* as a `file-corrupt` gap while leaving its evidence `undefined` for the validators (a listed-but-missing file stays a plain collector-gap — no flag, same as today).
- [x] `validators/corpus-loader.ts` -- in `planSteps`, advance the global `stepIndex` for every scenario step *iteration* including malformed ones, so a later valid step never aliases the evidence index of a skipped malformed step -- preserves global-counter alignment even under a malformed plan.
- [x] `validators/offline-runner.ts` -- switch to `loadCorpusRun`; emit failed results for `manifest-invalid` (one per plan step), for `file-corrupt` (one failed result per affected step naming `relPath`/`details` even when no predicate needs the corrupt evidence), for `plan-malformed` (`"(corpus)"`), for steps whose contract is unknown ("unvalidated gap"), and for validators that throw; when any `plan-malformed` gap exists, suppress every passing result and emit only `(corpus)` failed results (untrustworthy plan alignment ⇒ nothing passes); keep the filter and happy path byte-identical -- establishes the no-vacuous-pass invariant.
- [x] `validators/corpus-loader.test.ts` -- unit tests for each gap class (manifest-invalid, unknown-run, plan-malformed, file-corrupt) plus the ENOENT-vs-other-read-error split -- pin the gap taxonomy.
- [x] `validators/offline-runner.test.ts` -- reconciliation tests: unknown contract (plan fixture referencing a contract outside `allContracts`), throwing validator, manifest-invalid, file-corrupt attribution (contract whose predicates don't touch the corrupt evidence still fails), plan-malformed suppression, filter scope, count invariant -- pin the invariant.
- [x] `bin/validate-smoke.test.ts` -- CLI integration: fixture plan with one unknown-contract step → summary shows the gap as a failed check (count preserved, exit 1), not a reduced "N/N" -- end-to-end proof of the fix.

**Acceptance Criteria:**
- Given an intact recorded run, when `runValidatorsOffline` executes, then the result count equals Σ validators per filtered plan step and the example fixture still reports 18/18.
- Given a plan step whose contract is not in the validator map, when validated offline, then a failed `ValidationResult` names the contract and "unvalidated gap" — never a silent skip.
- Given a validator that throws for a step, when the runner executes, then the step yields a failed result naming the contract and the remaining validators still run.
- Given a run manifest that fails `runManifestSchema`, when the runner executes, then every plan step yields a failed result ("cannot validate: run manifest invalid") — no empty-set escape.
- Given a manifest whose file is listed but unparseable/failed-schema, when the runner executes, then the affected step yields a failed result naming the file even when that step's contract predicates do not depend on the corrupt evidence.
- Given a manifest read error other than `ENOENT`, when the runner executes, then it is treated as `manifest-invalid` (named failures), never as an unknown run.
- Given a plan containing any malformed scenario/step segment, when the runner executes, then no result passes — only `(corpus)` failed results are emitted.
- Given a legitimately gaped collector (file absent from `manifest.files[]`), when the runner executes, then behavior is unchanged (missing-evidence failures, no reconciliation flags).
- Given NFR-1/FR-5, when any input is corrupt, then no throw escapes and repeated runs produce identical results.

## Spec Change Log

- 2026-09-15 (bad_spec loop 1) — Blind-hunter finding: the frozen I/O matrix's FILE_CORRUPT row ("step keeps failed validators results + gap attributed to (stepIndex, contractId)") had no implementation — `readSnapshotIfListed`/`readProbesIfListed` still flattened listed-but-unparseable files into silent `undefined` evidence, so a corrupt file affecting a contract whose predicates don't depend on that evidence passed silently. Amended the non-frozen sections: `loadCorpusRun` now distinguishes `file-corrupt` (listed in the manifest but unparseable/failed-schema) from a legitimate collector gap (absent from the manifest), and the runner emits a failed result per affected step even when no predicate needs the evidence. Folded in during the same re-plan: (a) manifest read failure with ENOENT → `unknown-run`; any other read error → `manifest-invalid` (corruption is never mislabeled "no run"); (b) `planSteps`'s global counter advances across malformed steps so later valid steps never alias earlier evidence indexes, and any `plan-malformed` gap suppresses every passing result for the run (untrustworthy alignment ⇒ nothing passes, only `(corpus)` failures remain). Known-bad state avoided: a partially corrupt corpus silently passing a contract that happens not to depend on the corrupt evidence; an unreadable manifest masquerading as no recorded run; malformed plans passing with mis-indexed evidence. KEEP: `loadCorpusSteps` wrapper compatibility (cross-view depends on it); the `(corpus)` sentinel for unattributable gaps; collector gaps (absent from the manifest) stay unflagged (AD-16, no double-report); unknown-run → `[]` + CLI zero-checks backstop; per-validator count invariant (Σ `validatorsFor` per filtered step).

## Design Notes

Reconciliation invariant: for every filtered plan step, `validatorsFor(contractId).length` checks are *expected*; the runner emits exactly that many results — substituting failed results wherever a validator would have been skipped (unknown contract → 1 expected check that cannot run; throw → the skipped validator's slot; loader gap → all expected checks of every affected step). The `"(corpus)"` sentinel exists only for gaps attributable to no declared contract (malformed plan segments); failure-gherkin renders it verbatim as contract "(corpus)" — honest, if unusual. Collector gaps (file absent from the manifest) stay unflagged because AD-16 already degrades them to missing-evidence failures: flagging them would double-report isolation events as reconciliation errors — this is why `file-corrupt` (listed but unparseable) is the flagged case, not the absent one. Malformed-plan suppression (nothing passes) recognizes that the loader's step-index reconstruction is only trustworthy for well-formed plans; a malformed segment means the plan-to-corpus alignment cannot be proven, so all-passing results would be a vacuous pass by construction.

## Verification

**Commands:**
- `npm run typecheck` -- expected: exit 0.
- `npm test` -- expected: all suites green, including the untouched 18/18 example pin.
- `npm run lint` -- expected: exit 0.
- `npm run validate:smoke -- example` -- expected: "18/18 checks passed in example", exit 0.

**Manual checks (if no CLI):**
- Read the final `runValidatorsOffline` diff and confirm the only early-return left is the unknown-run path; confirm no `catch` silently drops a result.

## Suggested Review Order

**Reconciliation core — the no-vacuous-pass invariant**

- Entry point that makes every expected check emit exactly one result; unknown-run alone returns `[]`.
  [`offline-runner.ts:15`](../../validators/offline-runner.ts#L15)

- Per-step gap dispatch: `file-corrupt` takes precedence over unknown-contract, throws become named failures.
  [`offline-runner.ts:55`](../../validators/offline-runner.ts#L55)

**Loader gap taxonomy and classification**

- The four gap kinds that kill silent skips.
  [`corpus-loader.ts:38`](../../validators/corpus-loader.ts#L38)

- Manifest classification: schema-fail vs ENOENT vs other read errors never blurred.
  [`corpus-loader.ts:63`](../../validators/corpus-loader.ts#L63)

- Indexed plan walk: sparse holes visited, counter advances, malformed steps carry `stepIndex`.
  [`corpus-loader.ts:129`](../../validators/corpus-loader.ts#L129)

- Listed-but-corrupt vs listed-but-missing: which earns the `file-corrupt` flag.
  [`corpus-loader.ts:207`](../../validators/corpus-loader.ts#L207)

**CLI contract**

- Zero-checks guard reworded to its only reachable trigger (stepless plan).
  [`validate-smoke.ts:142`](../../bin/validate-smoke.ts#L142)

**Tests**

- Manifest + file corruption forced-fail without vacuous passes.
  [`offline-runner.test.ts:264`](../../validators/offline-runner.test.ts#L264)

- Malformed-plan suppression proven over would-pass evidence.
  [`offline-runner.test.ts:348`](../../validators/offline-runner.test.ts#L348)

- Gap taxonomy, ENOENT split, index advance across malformed steps.
  [`corpus-loader.test.ts:402`](../../validators/corpus-loader.test.ts#L402)

- Listed-corrupt evidence keeps its gap while value stays undefined.
  [`corpus-loader.test.ts:456`](../../validators/corpus-loader.test.ts#L456)

- CLI end-to-end: unknown-contract gap is a failed check, not a leaner "N/N".
  [`validate-smoke.test.ts:390`](../../bin/validate-smoke.test.ts#L390)
