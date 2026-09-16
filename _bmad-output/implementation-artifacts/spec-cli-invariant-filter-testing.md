---
title: 'Accept and clearly report contract + invariant filter ids in validate:smoke'
type: 'bugfix'
created: '2026-09-16'
status: 'done'
baseline_commit: 'dceeb17d525cc14fa2f62cc91903dbd821d3226c'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `resolveContractIds` already accepts both contract ids AND cross-view invariant ids as `validate:smoke` filters, but the unknown-id error still speaks only in contract terms (`Unknown contract id(s)`, `Valid contract ids: …`) even when the valid list contains invariant ids, and no test covers a mixed contract+invariant filter (or a mistyped invariant id).

**Approach:** Reword the unknown-filter error so it names the filter vocabulary (`contract ids and cross-view invariants`) while keeping the deterministic throw-on-unknown behavior, and add CLI coverage for mixed filters, a mistyped invariant id, and mixed-with-unknown inputs.

## Boundaries & Constraints

**Always:** `resolveContractIds` semantics are unchanged — the same filter set is accepted, unknowns still throw, dedup/ordering unchanged. Only the error message text changes (the exported `UnknownContractIdError` class name is KEPT to avoid API churn; its message is reworded). The message enumerates the unknown ids and the full valid set (contract ids then invariant ids, current order preserved). New tests are offline CLI tests against `validateSmoke` in `bin/validate-smoke.test.ts`, mirroring the existing single-invariant test. Existing single-contract and single-invariant filter tests keep passing (updated only for the reworded message where they assert it).

**Ask First:** Renaming the exported `UnknownContractIdError` class; changing `resolveContractIds`' accepted-id set; altering the valid-id ordering in the message; touching `runValidatorsOffline`/offline-runner behavior.

**Never:** No changes to `model/contracts.ts`, `validators/cross-view.ts`, schemas, or the model hash; no changes to the run-resolution (runId) path or its messages; no changes to the committed fixture; no changes to the pass/fail result lines; no browser/network access.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| MIXED_FILTER | `["example", "<contractId>", "<invariantId>"]` | Both checks run: two `[PASS]` lines + `2/2 checks passed`, exit 0 | N/A |
| SINGLE_INVARIANT | `["example", "<invariantId>"]` | Existing behavior unchanged (1/1) | N/A |
| SINGLE_CONTRACT | `["example", "<contractId>"]` | Existing behavior unchanged | N/A |
| TYPO_INVARIANT | A mistyped invariant id (`…surface` vs `…surfaces`) | Throws `Unknown filter id(s): …` naming the typo; message lists valid ids including the invariant | throw |
| MIXED_UNKNOWN | Valid contract id + an unknown id | Error names only the unknown id | throw |
| UNKNOWN_CONTRACT | Contract-typo filter | Reworded error still names it + valid ids | throw |
| NO_FILTER | No filters | `undefined`/unfiltered path unchanged | N/A |

</frozen-after-approval>

## Code Map

- `bin/validate-smoke.ts:56-70` -- `UnknownContractIdError`: reword `super(...)` text to `Unknown filter id(s): ${unknownIds.join(", ")}. Valid filter ids (contract ids and cross-view invariants): ${validIds.join(", ")}`. Class name and fields unchanged.
- `bin/validate-smoke.ts:98-115` -- `resolveContractIds`: unchanged (already unions `planContractIds` + `crossViewInvariants.map(invariantId)` into `validIds`).
- `bin/validate-smoke.test.ts:407-415` -- existing unknown-contract test asserts the old wording: update to the new message.
- `bin/validate-smoke.test.ts:785-801` -- existing single-invariant test (`current-portfolio-value-agrees-across-surfaces`): home for the new MIXED / TYPO / MIXED_UNKNOWN tests against the committed `corpus/example` fixture.
- `validators/cross-view.ts:53` -- the invariant registry's `invariantId` (used as the canonical filter value).

## Tasks & Acceptance

**Execution:**
^- [x] `bin/validate-smoke.ts` -- reword the `UnknownContractIdError` message to the filter-id vocabulary (asserts `cross-view invariants` in the valid set).
^- [x] `bin/validate-smoke.test.ts` -- update the unknown-contract test's expected message; add MIXED_FILTER (contract + invariant → 2/2 exit 0), TYPO_INVARIANT (unknown error names the typo, valid ids listed), and MIXED_UNKNOWN (only the unknown named) CLI tests against the committed example fixture.
^- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- mark L329 `RESOLVED (2026-09-16)` and reconcile the sweep-triage bundle line.

**Acceptance Criteria:**
- Given a mistyped or unknown filter id, when `validate:smoke` runs, then it exits 1 with a deterministic error naming the unknown id(s) and listing valid contract AND invariant ids.
- Given a mixed contract+invariant filter, when `validate:smoke` runs against the committed example fixture, then all filtered checks run and the summary reports the exact count (2/2), exit 0.
- Given no filter change to behavior for single/non-filters, when the suite runs, then `npm run typecheck && npm test && npm run lint` all pass with `computeModelVersion()` unchanged.

## Spec Change Log

- 2026-09-16 (review loop 1) — Blind-hunter + verification-gap review of the reword-and-coverage diff amended the non-frozen sections. The user-visible vocabulary was made fully consistent, not just the one error string: `USAGE` and the runId hint now say filter ids (contract ids and cross-view invariants), the inverted-argument hint fires for invariant ids passed in the runId position, and stale doc comments on the error class / `parseArgs` / `resolveContractIds` were refreshed. `docs/usage.md` operator documentation updated to match. Tests hardened: the synthetic-plan unknown test no longer embeds the whole invariant registry (registry growth would break it), TYPO/MIXED_UNKNOWN assert the valid list + ordering + USAGE tail, and new cases cover invariant+unknown, repeated-unknown dedup, invariant-first hint, and a standalone fixture contract-filter run (SINGLE_CONTRACT row). Known-bad avoided: contract-only vocabulary surviving in hints/docs/USAGE beside the new message, and a fixture test that would break when a second invariant is added. The `UnknownContractIdError` name is kept and tracked as debt in deferred-work.md.
- KEEP: `resolveContractIds` behavior unchanged, exported class name unchanged, offline fixture-based coverage.

## Design Notes

The class keeps its `UnknownContractIdError` name deliberately — it is an exported surface and the rename is churn without functional value; only the message reflects the dual vocabulary (review will judge whether the name deserves revisiting). The new tests reuse the committed `corpus/example` fixture so the mixed path exercises the real invariant id and a real contract id offline.

## Verification

**Commands:**
- `npm run typecheck` -- expected: exit 0.
- `npm test` -- expected: all suites green (existing 668 + new filter tests), `computeModelVersion()` unchanged.
- `npm run lint` -- expected: exit 0.

## Suggested Review Order

**Filter vocabulary (entry point)**

- The reworded error names filter ids and lists contract + invariant ids in one message.
  [`validate-smoke.ts:61`](../../bin/validate-smoke.ts#L61)

- Usage and the inverted-argument hint now agree with the error's dual vocabulary (invariant ids in the runId position get the hint too).
  [`validate-smoke.ts:50`](../../bin/validate-smoke.ts#L50)
  [`validate-smoke.ts:52`](../../bin/validate-smoke.ts#L52)

**Regression coverage**

- Mixed contract + invariant filters run together and the count pins the runner's result ordering.
  [`validate-smoke.test.ts:828`](../../bin/validate-smoke.test.ts#L828)

- Mistyped invariant and mixed-with-unknown rejectors assert the valid list + ordering + usage tail.
  [`validate-smoke.test.ts:843`](../../bin/validate-smoke.test.ts#L843)
  [`validate-smoke.test.ts:856`](../../bin/validate-smoke.test.ts#L856)

- Dedup of repeated unknown filters and the standalone contract-filter fixture case.
  [`validate-smoke.test.ts:879`](../../bin/validate-smoke.test.ts#L879)
  [`validate-smoke.test.ts:818`](../../bin/validate-smoke.test.ts#L818)

**Docs**

- Operator documentation now states contract ids and cross-view invariants are accepted filters.
  [`usage.md`](../../docs/usage.md)
