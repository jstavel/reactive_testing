---
title: 'Adjudicated spec change only'
type: 'feature'
created: '2026-09-01'
baseline_commit: '508031d9bcac383c7647040e3e47a1b58c232f06'
status: 'done'
review_loop_iteration: 0
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
  - '_bmad-output/implementation-artifacts/spec-3-4-failure-surfaces-as-reviewable-gherkin.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A failing verification now surfaces as reviewable Gherkin (Story 3.4), but recording *what the human decided about it* — spec drift (the model is wrong) vs app bug (the app broke a declared contract) — is unobservable, so nothing proves spec changes only happen through human adjudication (FR-8).

**Approach:** Add a deterministic adjudication record to the Reporter: given the failing results and an explicit human decision, it writes `{corpusDir}/{runId}/adjudication.json` whose `updated` marker exists only when the human approved the change. For `spec-drift` the record carries the human-approved proposal; for `app-bug` it carries the bug-report reference. The module is deliberately **not** a write path to the model — it records the decision; applying it stays a separate, human-reviewed model edit (Story 1.5/AD-10). Pure TypeScript, browser closed, no AI.

## Boundaries & Constraints

**Always:**
- A decision is required: no call can produce a record without an explicit `approvedBy` + `approvedAt` + decision. The input is a discriminated union (`spec-drift` requires a `proposal`; `app-bug` requires a `bugReportRef`), so a half-answer fails at schema/type level.
- The module's only side effect is writing `{corpusDir}/{runId}/adjudication.json`; it never reads or writes `model/fsm.ts`, `model/contracts.ts`, `model/schemas.ts`, the authored `features/*.feature` files, or the run manifest (`run-manifest.json`).
- Deterministic (NFR-1): byte-identical record for identical inputs. `approvedAt` is supplied by the caller (the human's decision time), never stamped `new Date()` inside the module.
- The record names the failing contracts, the plan id + model version, the decision, and the approval marker — traceable to the exact `failure.feature` and model version it judged (AD-17).
- `npm run typecheck` stays clean and new logic is covered by unit tests.

**Ask First:**
- Moving the record shape into `model/schemas.ts` (a model change + modelVersion bump) — default design keeps it local to the reporter, like Story 3.4.
- Any behavior where the module writes to or proposes auto-applying a model file.

**Never:**
- No silent or automatic spec edits: no function turns a `ValidationResult` into a model change by itself; the record never embeds a git write. No AI/LLM in this story.
- No Gherkin/`failure.feature` parsing or rewriting (AD-9); over-writing the run manifest.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| APP_BUG | failing results + `decision: "app-bug"` + `bugReportRef` | `{corpusDir}/{runId}/adjudication.json` written; record: decision app-bug, failing contract ids, plan + model version, `bugReportRef`, `updated` = `approvedAt` | N/A |
| SPEC_DRIFT | failing results + `decision: "spec-drift"` + `proposal` | record written; decision spec-drift, `proposal` recorded verbatim, `updated` = `approvedAt`; **no model file modified** | N/A |
| EMPTY | no failing results | nothing written; returns `[]` | N/A |
| NO_DECISION | results + no `decision` (or half a decision) | no record; explicit throw naming the missing/malformed decision | thrown (type + runtime check) |
| NO_APPROVAL | decision + missing `approvedBy`/`approvedAt` | no record; throw — a decision without the approval marker is a silent edit | thrown |
| MISSING_RUN_DIR | `{corpusDir}/{runId}` absent | run dir created recursively; record written | `mkdirSync` recursive |
| RE_EMIT | same inputs twice | byte-identical record; second write overwrites in place | N/A |

</frozen-after-approval>

## Code Map

- `reporter/adjudication.ts` (NEW) — `emitAdjudicationRecord({ corpusDir, runId, plan, results, decision, approvedBy, approvedAt, ... }): string[]`. Mirrors `reporter/failure-gherkin.ts:47-64` (filter `!passed`, return rel path, `mkdirSync(...{ recursive: true })`, no manifest edit). Consumes `ValidationResult` (`model/schemas.ts:121-131`) and `TestPlan` (`model/schemas.ts:304-322`) — both READ-ONLY. Writes `adjudication.json` into the run dir.
- `reporter/adjudication.test.ts` (NEW) — mirrors the temp-dir corpus test pattern of `reporter/failure-gherkin.test.ts:10-26` (`mkdtempSync` + `afterEach` cleanup, `MODEL_VERSION` const). Assert file contents, the `updated` marker, the throw cases, and that no model/feature/manifest file is created.
- `reporter/failure-gherkin.ts` (READ-ONLY) — module to mirror for shape, determinism (stable order), and the "derived artifact, never SSOT" stance (Story 3.6).
- `model/schemas.ts:121-131,304-322` (READ-ONLY) — the only consumed shared shapes; the record type stays local (Ask-First).
- `orchestrator/corpus.ts:55-77` (READ-ONLY) — run-manifest writing behavior that this module must not touch.
- `validators/offline-runner.ts:25-30` (READ-ONLY) — `runValidatorsOffline` is the natural upstream producing the `results` this module adjudicates.

## Tasks & Acceptance

**Execution:**
- [x] `reporter/adjudication.ts` (NEW) — implement `emitAdjudicationRecord`: filter failing results; derive failing contract ids into the record; require the discriminated decision + approval marker (throw otherwise); write `adjudication.json` into the run dir (created recursively); return the written rel path or `[]`.
- [x] `reporter/adjudication.test.ts` (NEW) — unit tests covering the I/O matrix: app-bug, spec-drift (model untouched), empty, no-decision/half-decision throw, no-approval throw, missing run dir, re-emit byte-identity.

**Acceptance Criteria:**
- Given a failing verification and an explicit human decision (`spec-drift` with a proposal, or `app-bug` with a bug-report reference), when `emitAdjudicationRecord` runs, then `{corpusDir}/{runId}/adjudication.json` records the failing contract ids, plan id + model version, the decision, and `updated` equal to the caller-supplied `approvedAt` (FR-8).
- Given the adjudication record for a `spec-drift` or `app-bug` decision, when emitted, then no model file (`fsm.ts`/`contracts.ts`/`schemas.ts`), authored `.feature` file, or `run-manifest.json` is read-from/written-to — the record is a decision log, never a write path.
- Given failing results without a decision, with a half-decision, or without the approval marker, when `emitAdjudicationRecord` runs, then it throws and no file is written — no unadjudicated record can exist.
- Given only passing results, when `emitAdjudicationRecord` runs, then nothing is written and nothing throws.
- Given identical inputs, when `emitAdjudicationRecord` runs twice, then both runs yield byte-identical record bytes and the second write overwrites in place (NFR-1).
- Given `npm run typecheck` and `npm test`, when run, then both exit 0.

## Spec Change Log

- **2026-09-01** — Initial draft.

## Design Notes

- **The `updated` marker is the approval.** The story's phrase "the corpus `updated` changes only on approval" is realized as the record's `updated` field, which is set exclusively from the caller-supplied `approvedAt`; there is no code path that produces a record (or an `updated` value) without that marker. This makes "no silent edits" assertable in tests instead of a claim.
- **Governance, not a write path.** The module cannot apply a proposal — it only records it. Applying a spec change remains Story 1.5's human-reviewed model edit (AD-10: "AI proposes, human reviews — no silent Model edits"). A future story may read the record to *propose* a model update; it will still need human approval to land.
- **Golden example** of the record:
  ```json
  {
    "runId": "2026-09-01T10:00:00Z",
    "plan": { "planId": "smoke", "modelVersion": "fab62143…" },
    "contractIds": ["portfolio-value-shown"],
    "decision": "app-bug",
    "bugReportRef": "JIRA-1234",
    "updated": "2026-09-01T14:05:00Z",
    "approvedBy": "Jan"
  }
  ```
  For `spec-drift`, `bugReportRef` is replaced by `proposal` (human-approved change, verbatim), and the model files stay byte-identical.
- **Why JSON.** A decision record is an audit artifact, not a narrative; JSON keeps it trivially parseable for tests and a future adjudication-aware reporter/CI step (AD-8 lists JSON among Reporter outputs). `failure.feature` remains the human-reviewable surface; `adjudication.json` is its decision counterpart.

## Verification

**Commands:**
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: exit 0, new `reporter/adjudication.test.ts` tests pass

**Manual checks (if no CLI):**
- _None._

## Suggested Review Order

**Decision gate**

- Entry point: filter failing results, then require the discriminated decision + approval before any write.
  [`adjudication.ts:151`](../../reporter/adjudication.ts#L151)

- The `updated` marker comes only from caller-supplied `approvedAt` — never a silent timestamp.
  [`adjudication.ts:168`](../../reporter/adjudication.ts#L168)

- Discriminated union: `spec-drift`→`proposal`, `app-bug`→`bugReportRef`, with non-empty enforcement.
  [`adjudication.ts:18`](../../reporter/adjudication.ts#L18)

**Write safety**

- Empty or all-passing results write nothing and return `[]` — nothing to adjudicate.
  [`adjudication.ts:155`](../../reporter/adjudication.ts#L155)

- The module's only side effect is `adjudication.json`; the model/manifest/features stay untouched.
  [`adjudication.ts:181`](../../reporter/adjudication.ts#L181)

**Determinism**

- Sorted + deduplicated contract ids keep output bytes independent of arrival order (NFR-1).
  [`adjudication.ts:161`](../../reporter/adjudication.ts#L161)

- Lexicographically sorted keys make identical inputs render byte-identically.
  [`adjudication.ts:122`](../../reporter/adjudication.ts#L122)

**Tests**

- Full I/O matrix incl. the half-decision throw and the model-untouched invariant.
  [`adjudication.test.ts:65`](../../reporter/adjudication.test.ts#L65)

- Approval-marker throws (no `approvedBy`/`approvedAt` → silent edit rejected).
  [`adjudication.test.ts:255`](../../reporter/adjudication.test.ts#L255)