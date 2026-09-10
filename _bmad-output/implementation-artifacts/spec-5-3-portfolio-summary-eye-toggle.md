---
title: 'Story 5.3 — portfolio summary dialog: dialog-open/dialog-closed evaluators'
type: 'feature'
created: '2026-09-10'
baseline_commit: '01a1f49'
status: 'done'
review_loop_iteration: 0
context:
  - '_bmad-output/implementation-artifacts/epic-5-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The portfolio-summary dialog is the third read-only onboarding surface and its three smoke scenarios already pass live, but `validate:smoke` still fails every dialog contract (7 checks: `openPortfolioSummary` x3, `closePortfolioSummary` x3, `toggleEyeIcon` x1) with `dialog-open`/`dialog-closed` "not yet evaluatable" — the last serious gap in the smoke runway.

**Approach:** Implement the two predicate evaluators in `validator-map.ts` as snapshot-text checks for the `role="dialog"` marker (present ⇒ open, absent ⇒ closed). They are phase-correct because preconditions evaluate the pre snapshot and postconditions the post snapshot. No model, contract, test-plan, probe, or feature changes — completing the surface while preserving epic-5 add-only integrity.

## Boundaries & Constraints

**Always:**

- `validator-map.ts` stays thin/pure and outside the model hash (AD-17); evaluators read only the phase's own snapshot and return a result, never throw (FR-5).
- Dialog contracts (`openPortfolioSummary`/`closePortfolioSummary`/`toggleEyeIcon`), FSM, schemas, test plan, and feature files stay untouched — existing artifacts are fixed ground truth.
- `validators/dependencies.ts` must declare `snapshot` for `dialog-open`/`dialog-closed` (orchestrator.ts:297 plans collectors from it), with its doc comment and tests updated in lockstep.

**Ask First:**

- Editing any existing dialog contract or adding a predicate type (e.g. `value-visibility`) to assert the eye-toggle flip — out of scope by default; escalate as a renegotiation if it becomes necessary.

**Never:**

- No `value-visibility` predicate, no eye-icon probe, no new feature file, no test-plan change, no model-hash mutation.
- No re-running the live app: corpus `437ef5c5-e690-439e-8c63-cccd222cd739` is the fixed evidence base for `validate:smoke`.
- No asserting the eye flip (Eye⇄EyeOff): it is state-conditional and probes are captured once per step, so a pre≠post delta is inexpressible; the conditional is already tracked at deferred-work.md:89.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output | Error Handling |
|---|---|---|---|
| `openPortfolioSummary` post `dialog-open` | post snapshot (corpus 7.json) contains `role="dialog"` | PASS | marker absent → FAIL, detail names `dialog-open` and missing marker |
| `closePortfolioSummary` pre `dialog-open` | pre snapshot (8.pre.json) contains the marker | PASS | pre without marker → FAIL, detail names predicate + marker |
| `closePortfolioSummary` post `dialog-closed` | post snapshot (8.json, home) has NO marker | PASS | marker still present → FAIL (dialog did not actually close) |
| `toggleEyeIcon` pre `dialog-open` | pre snapshot (12.pre.json) contains the marker | PASS | pre without marker → FAIL, detail |
| snapshot missing | evidence `{ pre }` only | FAIL `missing snapshot evidence` | N/A |
| `dialog-closed` false positive | snapshot of a non-dialog state | PASS only if no marker anywhere in the text | marker found → FAIL with context detail |
| dependencies | `corpusDependenciesFor` for the 3 dialog contracts | `["snapshot"]` | unknown contractId → `[]` |

</frozen-after-approval>

## Code Map

- `validators/validator-map.ts` — `evaluate()` switch: replace the dialog stub (lines 64-69) with the marker check; `validateContract` (85-93) already passes the phase-correct snapshot and records `snapshot:pre`/`snapshot:post` refs (89-93).
- `validators/dependencies.ts` — dialog cases (31-33) change to `deps.add("snapshot")`; update doc comment (11-13).
- `validators/dependencies.test.ts` — line 17 `it("returns [] for dialog contracts whose predicates are not yet evaluatable"…)` → expect `["snapshot"]`.
- `validators/validator-map.test.ts` — add dialog-evaluator pass/fail tests (mirror the existing evidence shape at 10-24 and the probe-bound variant at 74-80).
- `model/contracts.ts` (READ-ONLY) — dialog contracts ~149-157 pin the exact pre/post shapes the evaluators must satisfy.
- `model/smoke.test-plan.ts` (READ-ONLY) — dialog scenario rows 49-71; `toggleEyeIcon` has no postconditions (evidence.probes is once-per-step → flip inexpressible).
- `corpus/snapshots/437ef5c5-e690-439e-8c63-cccd222cd739/` (READ-ONLY evidence) — 7.json, 8.pre.json, 9.json, 11.json, 12.pre.json, 12.json, 13.pre.json contain `role="dialog"`; 8.json, 10.json, 13.json (home) do not. Verified on 2026-09-10.
- `bin/validate-smoke.ts` — CLI whose 11/18 becomes 18/18.
- `docs/usage.md:145`, `docs/troubleshooting.md:119-130`, `README.md:121-122` — retire/rewrite the "not yet evaluatable" guidance.
- `_bmad-output/implementation-artifacts/deferred-work.md:58-61` — append a RESOLVED note to the deferred dialog-surface entry (locator half shipped via decision-2a in baseline; evaluator half ships here). Precedent: inline RESOLVED annotations at lines 51 and 66.

## Tasks & Acceptance

**Execution:**

- [x] `validators/validator-map.ts` — implement `dialog-open`/`dialog-closed` marker evaluators — closes the 7 dialog FAILs, completes the runway
- [x] `validators/dependencies.ts` — map `dialog-*` to `snapshot` (+ doc comment) — orchestrator plans snapshot collection for dialog-only contracts
- [x] `validators/validator-map.test.ts` — dialog evaluator unit tests per the matrix — locks phase-correct behavior
- [x] `validators/dependencies.test.ts` — update the `[]` assertion to `["snapshot"]` — keeps deps derivation honest
- [x] `docs/usage.md`, `docs/troubleshooting.md`, `README.md` — finalize/retire the deferred-notes — no stale guidance left
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` — append RESOLVED note to the dialog-surface entry — traceability

**Acceptance Criteria:**

- Given the 437ef5c5 corpus, when `npm run validate:smoke`, then all seven dialog contract checks pass (11/18 → 18/18).
- Given `npm test` and `npm run typecheck`, then the full suite is green with 0 failures.
- Given no model edit, when `computeModelVersion()` runs, then the hash is unchanged (add-only).
- Given the eye-toggle conditional (Eye⇄EyeOff), when 5-3 ships, then no contract asserts the flip; it stays tracked at deferred-work.md:89.

## Spec Change Log

_Append-only; empty until the first review loopback._

## Design Notes

- **Why the marker:** `role="dialog"` appears in every dialog-open snapshot record and in no non-dialog record (verified on 437ef5c5) — an exact-substring check, cheap and probe-free.
- **Phase correctness falls out for free:** `validateContract` (85-93) passes `evidence.pre` to preconditions and `evidence.post` to postconditions, so one evaluator body serves both phases without schema changes.
- **Eye-toggle honesty:** `toggleEyeIcon` keeps its empty postconditions; asserting the flip would need a pre≠post visibility value, but probes are captured once per step (orchestrator.ts:606-624) so that delta is inexpressible today — the surface stays contract-silent and recorded in snapshot evidence, with the persistent eye/state-loading RFE (deferred-work.md:89) owning the future.
- **modelVersion unchanged:** `832c258f…` stays pinned; no smoke-test-plan regeneration.

## Verification

**Commands:**

- `npm run typecheck` — expected: 0 errors
- `npm test` — expected: suite green incl. the new dialog-evaluator tests and the updated deps test
- `npm run validate:smoke` — expected: 18/18 (dialog checks PASS, corpus untouched)

## Suggested Review Order

**Evaluator**

- The whole change in one screen: a snapshot marker becomes the dialog-open/dialog-closed oracle, phase-correct because preconditions read the pre snapshot.
  [`validator-map.ts:64`](../../validators/validator-map.ts#L64)

**Dependency derivation**

- Dialog contracts now declare the snapshot dep so the orchestrator plans collection for dialog-only steps — without it `toggleEyeIcon` would validate against an empty snapshot.
  [`dependencies.ts:31`](../../validators/dependencies.ts#L31)

- The old "not yet evaluatable → []" contract pin is flipped to expect the snapshot dep.
  [`dependencies.test.ts:17`](../../validators/dependencies.test.ts#L17)

**Tests**

- Four-marker edge matrix (open/closed × present/absent) plus the missing-evidence case, one shared evidence shape.
  [`validator-map.test.ts:170`](../../validators/validator-map.test.ts#L170)

**Docs & groom**

- The runway note now states all predicates are evaluatable while being honest that `toggleEyeIcon` asserts only its precondition.
  [`usage.md:142`](../../docs/usage.md#L142)

- The "expected behaviour" FAQ becomes diagnosis guidance for a real dialog failure.
  [`troubleshooting.md:119`](../../docs/troubleshooting.md#L119)

- Deferred dialog-surface entry is closed with an inline RESOLVED note; the review's two new defers (CI pin for validate:smoke, default-case guard) follow the same ledger.
  [`deferred-work.md:62`](deferred-work.md#L62)