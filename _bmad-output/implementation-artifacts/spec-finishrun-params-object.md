---
title: 'Refactor finishRun to an options object and convert all call sites'
type: 'refactor'
created: '2026-09-17'
status: 'done'
baseline_commit: '8d75445dfaa1029ea90a52d80df8642b53cc26dd'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `finishRun` (orchestrator/corpus.ts:95) grew to nine positional parameters — the `handoff` object was added as the eighth argument and updated every existing caller with a trailing `{ failed: … }`, and `bootstrap`/`handoff` are easy to misorder. The repo's other emitters already use single input-object shapes (`EmitAdjudicationRecordInput`, `EmitHtmlReportInput`), so `finishRun` is the outlier whose signature gets more fragile with every new field.

**Approach:** Convert `finishRun` to a single options object (`FinishRunInput`) containing all current fields, with the same defaults (`bootstrap` defaults to `[]`, `handoff` optional) and byte-identical manifest output, and mechanically convert every call site (the orchestrator + ~55 test callers).

## Boundaries & Constraints

**Always:** Runtime behavior is byte-identical — same manifest JSON, same handoff semantics, same throws (including the `assertSafeRunId` preflight and the planModelVersion-empty refusal), same `console.warn` handoff downgrade. The exported function keeps its `finishRun` name. `FinishRunInput` mirrors the reporter input-object convention: `corpusDir`, `run`, `timestamp`, `planModelVersion`, `errors`, `failures`, `collectors` required; `bootstrap?` (default `[]`), `handoff?` optional. Call sites convert positionally (no reordering, no field renaming beyond the mechanical shape change), and every previously-defaulted argument (omitted `bootstrap`/`handoff`) stays omitted on the new shape so defaults still apply. The separate `bin/run-smoke-finish.ts` `finishRun` (CLI print helper) is OUT OF SCOPE and untouched.

**Ask First:** Fully-positional-first-two (`finishRun(corpusDir, run, options)`) over a single object; renaming exported symbols or fields; changing any default or the param set; splitting the function.

**Never:** No behavior change (no reordered writes, no new validation, no new defaults); no edits to `bin/run-smoke-finish.ts` or its tests; no changes to `writeCorpusFile`/manifest schema; no model/schema changes (modelVersion untouched); no leftover positional call sites or trailing placeholder arguments.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| CANONICAL | Full options incl. `bootstrap` + `handoff.failed` | Manifest + handoff link identical to today | N/A |
| OMIT_BOOTSTRAP | No `bootstrap` key | Defaults to `[]` (legacy 7-arg calls) | N/A |
| OMIT_HANDOFF | No `handoff` key | No links touched (offline harness behavior) | N/A |
| EVIL_RUNID | `run.runId` bad | `assertSafeRunId` throws before any write | throw |
| EMPTY_VERSION | `planModelVersion: ""` | Manifest write proceeds — schema refusal happens downstream, identical to today | N/A |
| HANDOFF_FAILURE | `handoff` provided, symlink write throws | `console.warn` + run completes (unchanged) | warn |

</frozen-after-approval>

## Code Map

- `orchestrator/corpus.ts:95-131` -- `finishRun` (9 positional args). Convert to `finishRun(input: FinishRunInput)`, define and export `interface FinishRunInput { corpusDir; run; timestamp; planModelVersion; errors; failures; collectors; bootstrap?; handoff?: { failed: boolean } }` above the function, update the JSDoc to describe the options object + defaults.
- Callers (all `orchestrator/corpus.js` `finishRun`): `orchestrator/orchestrator.ts:260` (real run; the `_finishRun`/mock in `orchestrator/orchestrator.test.ts` assertions must be updated to the object shape) and the ~55 test call sites in `orchestrator/corpus.test.ts` (~10), `orchestrator/handlinks.test.ts` (3), `validators/offline-runner.test.ts` (~16), `validators/corpus-loader.test.ts` (~15), `validators/cross-view.test.ts` (~13) — mechanical conversion, preserving each call's argument ORDER and any omitted defaults.
- NOT this file: `bin/run-smoke-finish.ts:36` (separate CLI `finishRun` — untouched).

## Tasks & Acceptance

**Execution:**
- [x] `orchestrator/corpus.ts` -- define/export `FinishRunInput`; convert `finishRun` to a single `input` parameter destructuring the required + defaulted fields exactly as today; refresh the JSDoc.
- [x] `orchestrator/orchestrator.ts:260` + `orchestrator/orchestrator.test.ts` -- convert the real call and the mock's expected-args assertions to the object shape; no trailing placeholders.
- [x] `orchestrator/corpus.test.ts`, `orchestrator/handlinks.test.ts`, `validators/offline-runner.test.ts`, `validators/corpus-loader.test.ts`, `validators/cross-view.test.ts` -- convert every `finishRun(...)` call to the options shape, preserving argument order and defaults.
- [x] `orchestrator/corpus.test.ts` -- add one OMIT_BOOTSTRAP pin (omitting `bootstrap` yields `[]` in the manifest) and keep the OMIT_HANDOFF/MANIFEST assertions that already exist.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- mark L222 `RESOLVED (2026-09-17)` and reconcile the sweep-triage entry.

**Acceptance Criteria:**
- Given the converted `finishRun`, when any existing scenario runs through the orchestrator or offline harness, then the emitted manifest, handoff links, gaps, failures, and error/warn behavior are byte-identical to the positional version.
- Given a call that previously omitted `bootstrap`/`handoff`, when converted, then the keys are omitted from the options object and the defaults still apply.
- Given the repo, then NO call site passes positional trailing arguments to `finishRun(corpus.js)` and `bin/run-smoke-finish.ts` is untouched.
- Given `npm run typecheck && npm test && npm run lint`, then all pass with `computeModelVersion()` unchanged and the committed example fixtures unchanged.

## Spec Change Log

- 2026-09-17 (review loop 1) — Blind-hunter + edge-case review of the refactor diff. The conversion itself was confirmed runtime-identical and the required-field wiring is pinned suite-wide (exact full-input assertions + distinct-field typechecking), so the narrowed `objectContaining` subsets at orchestrator test sites were left as-is (not a hole). Patches applied: `bootstrap ?? []` so an explicit null can never reach the manifest serialization; a FULL_INPUT test pinning NON-EMPTY bootstrap record CONTENT reaching the manifest (a genuine pre-existing gap — positional assertions also used `expect.any(Array)` placeholders) plus a deep BYTE_IDENTITY manifest pin; the failure-path `handoff` assertion tightened to exact `{ failed: true }`. Also fixed a bookkeeping corruption this session's earlier sed introduced into FOUR spec files (literal `^- [x]` checkboxes → `- [x]`). Rejected as not-this-repo-pattern: runtime required-field guards and unknown-key whitelists (all callers are internal and typed; TS excess-property checks catch typos).
- KEEP: exported `finishRun` name, `FinishRunInput` convention, defaults preserved, `bin/run-smoke-finish.ts` untouched.

## Design Notes

A single `FinishRunInput` object matches the repo's emitter convention (`EmitHtmlReportInput`, `EmitAdjudicationRecordInput`) and removes the trailing-`{ failed }` churn the ledger flagged: adding a future field becomes an optional key, not a new positional slot that forces edits at ~55 sites. The two `finishRun` names are pre-existing and intentional (corpus finisher vs CLI print helper) — this change keeps the name and only reshapes the corpus one. Conversion preserves argument order verbatim so defaults behave identically; the OMIT_BOOTSTRAP test pins that an omitted key (not an explicit `[]`) is the new default path.

## Verification

**Commands:**
- `npm run typecheck` -- expected: exit 0.
- `npm test` -- expected: all suites green (existing 706 + new pins, now 708), `computeModelVersion()` unchanged.
- `npm run lint` -- expected: exit 0.
- Authoritative no-positional-call check: `npm run typecheck` (a positional call is a type error against `FinishRunInput`). Belt-and-braces: `git grep -n "finishRun(" orchestrator/ validators/` and review each result — none outside `bin/run-smoke-finish*` may pass positional corpus arguments (use `git grep -n "finishRun(" --multiline` or review lines that span multiple lines by eye).
## Suggested Review Order

**Signature reshape (entry point)**

- The single `FinishRunInput` object mirrors the reporter input convention; defaults preserved.
  [`corpus.ts:96`](../../orchestrator/corpus.ts#L96)

- `bootstrap ?? []` normalizes an explicit null so the manifest never serializes one.
  [`corpus.ts:108`](../../orchestrator/corpus.ts#L108)
  [`corpus.ts:119`](../../orchestrator/corpus.ts#L119)

**Regression coverage**

- Full-input bootstrap content + failed handoff reach the manifest.
  [`corpus.test.ts:224`](../../orchestrator/corpus.test.ts#L224)

- Byte-identical manifest for a known input (deep exact object).
  [`corpus.test.ts:271`](../../orchestrator/corpus.test.ts#L271)
