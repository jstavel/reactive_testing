---
title: 'Failure surfaces as reviewable Gherkin'
type: 'feature'
created: '2026-09-01'
baseline_commit: '92b215fac4a70821ccd9ae9c08444d71e767ea05'
status: 'done'
review_loop_iteration: 0
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A failing verification currently ends as in-memory `ValidationResult`s; there is no reviewable Gherkin artifact naming the failing rule and the recorded corpus it ran against (FR-7), so a QE cannot read a failure and a PM/PO cannot adjudicate it.

**Approach:** Add a deterministic reporter that renders failing `ValidationResult`s and run metadata into a `.feature` artifact at `{corpusDir}/{runId}/failure.feature`, naming each failing contract and the corpus it ran against (plan id, model version, corpus refs). Pure TypeScript, browser closed, no AI. Interpreting the failure and proposing a spec change stays in Story 3.5.

## Boundaries & Constraints

**Always:**
- Emission is a pure function: same corpus + same results → byte-identical artifact (NFR-1); no browser, no network, no AI in the loop; the only side effect is writing the derived file.
- Output follows the repo's Gherkin convention (`Feature:`/`Scenario:`, Given/When/Then) and is marked as a derived, regenerable artifact — never the source of truth (AD-9, Story 3.6 constraint).
- The reporter writes only `{corpusDir}/{runId}/failure.feature`; overwriting in place is expected on re-emit. It never touches the authored `features/*.feature` files.
- The emitter consumes only `ValidationResult` + `TestPlan`; `npm run typecheck` stays clean and new logic is covered by unit tests.

**Ask First:**
- Changing `model/schemas.ts` (`ValidationResult`, `TestPlan`, manifest shapes) means a model change and modelVersion bump — default design avoids it; HALT before modifying.

**Never:**
- No AI/LLM in this story: interpreting the failure (spec drift vs app bug) and any spec-change proposal are Story 3.5.
- No Gherkin parser, no processing layer (AD-9); no reading/editing authored `features/*.feature`; no modifications to FSM/contracts or to the run manifest as written by `finishRun`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| FAILED_SINGLE | one failing result with `corpusRefs` | `{corpusDir}/{runId}/failure.feature` written; one Scenario naming the contract + corpus (plan, model version, refs) | N/A |
| MULTI_FAIL | several failing results in arbitrary order | one file; scenarios in deterministic sorted order | N/A |
| PASS_ONLY / EMPTY | only passing results, or empty result set | no artifact written; returns empty path list | N/A |
| NO_CORPUS_REF | failing result with empty `corpusRefs` | Scenario still written; the evidence `And` clause is omitted; corpus still named via the `@run:` tag and plan line | N/A |
| NO_DETAILS | failing result without a `details` message | Scenario still written; the "validator reported" clause is omitted; evidence table (if any) kept | N/A |
| MISSING_RUN_DIR | `{corpusDir}/{runId}` absent | run dir created recursively (as `finishRun` does); artifact written | `mkdirSync` recursive |
| RE_EMIT | same corpus + results emitted twice | byte-identical artifact; second write overwrites the first | N/A |

</frozen-after-approval>

## Code Map

- `reporter/failure-gherkin.ts` (NEW) — `emitFailureGherkin({ corpusDir, runId, plan, results }): string[]`. Pure builder + only output writer (AD-8: reporter is a separate player). Consumes `ValidationResult` (`model/schemas.ts:121-131`) and `TestPlan` (`model/schemas.ts:304-322`). Writes `{corpusDir}/{runId}/failure.feature`, creating the run dir with `mkdirSync(..., { recursive: true })` as `finishRun` does (`orchestrator/corpus.ts:71-76`).
- `reporter/failure-gherkin.test.ts` (NEW) — mirrors the temp-dir corpus test pattern used in `orchestrator/corpus.test.ts` and `validators/corpus-loader.test.ts`: `startCorpusRun`/`writeCorpusFile`/`finishRun` from `orchestrator/corpus.ts:16-44,55-77`, `mkdtempSync` + `afterEach` cleanup. Asserts file existence and content.
- `reporter/` (NEW dir) — first reporter module. Chosen over `validators/`/`orchestrator/` so CI formats (xunit XML, JSON) can land beside it without touching validators (AD-8).
- `validators/offline-runner.ts:25-30` — READ-ONLY reference; `runValidatorsOffline(corpusDir, runId, plan, contractIds?)` is the natural upstream that produces the `ValidationResult[]` the emitter consumes.
- `features/*.feature` — READ-ONLY; authored Gherkin convention (e.g. `@plan:smoke` tag, `Feature:`/`Scenario:`, step clauses) borrowed for the output style. Never written to.
- `model/schemas.ts:121-131,304-322` — READ-ONLY;
- `orchestrator/corpus.ts:16-44,55-77` — READ-ONLY reference for the corpus layout (`{corpusDir}/{runId}/run-manifest.json`, `{corpusDir}/{kind}/{runId}/…`).

## Tasks & Acceptance

**Execution:**
- [x] `reporter/failure-gherkin.ts` (NEW) — implement `emitFailureGherkin({ corpusDir, runId, plan, results })` as a pure, deterministic function: filter failing results, render one Scenario per failure in a stable order, write `failure.feature` into the run dir, return the written path(s).
- [x] `reporter/failure-gherkin.test.ts` (NEW) — unit tests covering the I/O matrix (failed-single, multi-fail ordering, pass-only/empty, no-corpus-ref, missing run dir, re-emit byte-identical).

**Acceptance Criteria:**
- Given a failing `ValidationResult` for a contract against a recorded corpus run, when `emitFailureGherkin` runs, then `{corpusDir}/{runId}/failure.feature` exists and its Feature/Scenario name the failing contract, the plan id + model version, and the corpus refs it ran against (FR-7).
- Given multiple failing results delivered in arbitrary order, when the emitter runs, then the scenarios appear in the same deterministic order as any other run with identical inputs (NFR-1).
- Given a failing result with a `details` message, when the emitter runs, then the artifact embeds the message verbatim as the "validator reported" clause, so reviewers see the finding — not only the contract name and timestamp.
- Given only passing results (or an empty result set), when the emitter runs, then no artifact is written and nothing throws.
- Given the same corpus + results, when the emitter runs twice, then both runs yield byte-identical artifact bytes and the second write overwrites in place.
- Given `npm run typecheck` and `npm test`, when run, then both exit 0.

## Spec Change Log

- **2026-09-01** — Initial draft.

## Design Notes

- **Reporter = AD-8's separate player.** This is the first reporter module. Keeping it pure over in-memory results (not re-running validators, not fiddling with the run) means emission can also be invoked over old recorded corpora — Story 3.3's FR-6 promise, now with a reviewable face.
- **Deterministic ordering.** Scenarios are sorted by a stable key (e.g. `contractId`, then the joined `corpusRefs`/detail) so output bytes don't depend on the order results arrive in.
- **Golden example** of the emitted artifact:
  ```gherkin
  # Derived artifact — generated by the reporter. Never the source of truth.
  # Regenerate by re-running verification; do not hand-edit (Story 3.6).
  @run:2026-09-01T10:00:00Z
  Feature: Failed verification — plan "smoke" (model 3f2a…) run 2026-09-01T10:00:00Z

    Scenario: contract "portfolio-value-shown" was violated
      Given a recorded corpus run "2026-09-01T10:00:00Z" for plan "smoke"
      When the shared validator for contract "portfolio-value-shown" ran over the corpus
      Then the validation failed
      And the validator reported: expected "value shown" ≥ 1 but observed 0
      And the recorded evidence it ran against is:
        | snapshot/2026-09-01T10:00:00Z/5.post.json |
  ```
- **The payload is `details`, not the labels.** The artifact's review value is the validator-authored finding (`ValidationResult.details`, e.g. "expected ≥ 1 but observed 0") embedded verbatim, plus the evidence table — never invented prose. Review richness is capped by how informative validators write `details`; improving that is a validator-authoring concern, not a reporter one. A missing `details` or `corpusRefs` omits only that clause.
- **PASS_ONLY writes nothing.** FR-7 is about surfaces for review; an all-green run has nothing to adjudicate, so no file is produced (unlike a run report, which is a separate future concern).

## Verification

**Commands:**
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: exit 0, new `reporter/failure-gherkin.test.ts` tests pass

**Manual checks (if no CLI):**
- _None._

## Suggested Review Order

**Emission design**

- Entry point — deterministic filter → sort → render loop, the heart of FR-7.
  [`failure-gherkin.ts:47`](../../reporter/failure-gherkin.ts#L47)

- The payload is `details` verbatim, not the labels — this implements the checkpoint decision.
  [`failure-gherkin.ts:103`](../../reporter/failure-gherkin.ts#L103)

- Stable sort key keeps output bytes free of arrival order (NFR-1).
  [`failure-gherkin.ts:66`](../../reporter/failure-gherkin.ts#L66)

**Output safety**

- Line breaks in `details` collapse so the clause stays one Gherkin step.
  [`failure-gherkin.ts:81`](../../reporter/failure-gherkin.ts#L81)

- `|` in a corpusRef escapes so the evidence table stays a valid pipe table.
  [`failure-gherkin.ts:87`](../../reporter/failure-gherkin.ts#L87)

- Write path mirrors `finishRun` recursion and returns the rel path.
  [`failure-gherkin.ts:53`](../../reporter/failure-gherkin.ts#L53)

**Tests**

- Matrix coverage incl. multi-line details and piped ref escapes.
  [`failure-gherkin.test.ts:57`](../../reporter/failure-gherkin.test.ts#L57)

- Determinism and re-emit byte-identity assertions.
  [`failure-gherkin.test.ts:113`](../../reporter/failure-gherkin.test.ts#L113)

- Pass-only/empty write-nothing, no-throw.
  [`failure-gherkin.test.ts:131`](../../reporter/failure-gherkin.test.ts#L131)
