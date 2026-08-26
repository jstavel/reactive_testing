---
title: 'Story 1.4: Dedup query against the corpus'
type: 'feature'
created: '2026-08-25'
status: 'done'
review_loop_iteration: 0
context:
  - _bmad-output/specs/spec-1-4-dedup-query-against-the-corpus/SPEC.md
---

## Intent

**Problem:** Without a dedup check, the QE risks proposing states or contracts that already exist in the model — wasting time and introducing noise.

**Approach:** The QE names a candidate stateId or contractId. The AI reads `model/fsm.ts` and `model/contracts.ts`, searches for an exact match, and returns "existing" (with file and line reference) or "new" (not found). The answer is always sourced from the committed files, never conversation history.

## Boundaries & Constraints

**Always:** Answer sourced from committed `fsm.ts`/`contracts.ts` (AD-12); read-only flows only (NFR-3); English-only (NFR-4).

**Ask First:** HALT and ask the user if a decision surfaces that is not covered by this spec.

**Never:** Answer from conversation memory; build a separate index or database.

## Code Map

- `model/fsm.ts` — queried for stateId matches.
- `model/contracts.ts` — queried for contractId matches.
- `_bmad-output/specs/spec-1-4-dedup-query-against-the-corpus/SPEC.md` — canonical spec.

## Tasks & Acceptance

**Execution:**

- [ ] Given a candidate stateId, read `fsm.ts` and check if any `state.stateId` matches exactly.
- [ ] Given a candidate contractId, read `contracts.ts` and check if any `contract.contractId` matches exactly.
- [ ] Return "existing" with file path and line number, or "new" with confirmation.
- [ ] Verify answer is sourced from files, not conversation context.

**Acceptance Criteria:**
- Given stateId `"homePage"`, when queried, then returns "existing" at `model/fsm.ts:42`.
- Given stateId `"earnRates"` (not in model), when queried, then returns "new".
- Given contractId `"clickHistoryMenuMain"`, when queried, then returns "existing" at `model/contracts.ts:33`.
- Given contractId `"sortByDate"` (not in model), when queried, then returns "new".

## Spec Change Log

## Design Notes

- **No code to write:** This is a workflow capability. The AI reads the model files and reports. The "implementation" is the query process itself.
- **Exact match only:** Matching is by exact string equality on stateId/contractId. No fuzzy matching.
- **File + line reference:** When existing, the response includes the exact file path and line number for traceability.

## Verification

**Manual review:**
- Query with an existing stateId — verify "existing" with correct file:line.
- Query with a new stateId — verify "new".
- Query with an existing contractId — verify "existing" with correct file:line.
- Query with a new contractId — verify "new".
