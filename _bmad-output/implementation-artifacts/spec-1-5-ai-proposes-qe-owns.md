---
title: 'Story 1.5: AI proposes, QE owns'
type: 'feature'
created: '2026-08-25'
status: 'done'
review_loop_iteration: 0
context:
  - _bmad-output/specs/spec-1-5-ai-proposes-qe-owns/SPEC.md
---

## Intent

**Problem:** Without an explicit adjudication gate, the AI could silently add entries to the model — bypassing the QE's review.

**Approach:** This story formalizes the architectural invariant already demonstrated in Stories 1.3 and 1.4: the AI proposes, the QE adjudicates, and only accepted entries enter the model. No new code — this is a binding constraint on the AI's behavior.

## Boundaries & Constraints

**Always:** Nothing enters `fsm.ts`/`contracts.ts` without QE approval (FR-2, AD-10); `tsc --noEmit` clean after updates.

**Ask First:** HALT and ask the user if a decision surfaces that is not covered by this spec.

**Never:** Write to model files without explicit QE instruction; add entries the QE rejected.

## Code Map

- `model/fsm.ts` — updated only on QE acceptance.
- `model/contracts.ts` — updated only on QE acceptance.
- `_bmad-output/specs/spec-1-5-ai-proposes-qe-owns/SPEC.md` — canonical spec.

## Tasks & Acceptance

**Execution:**

- [x] Verified in Story 1.3: AI proposed 7 items, QE deferred all, nothing written to model.
- [x] Verified in Story 1.4: Dedup query returned results without writing to model.
- [x] Architectural constraint documented: AI waits for explicit QE instruction before writing.

**Acceptance Criteria:**
- Given an AI proposal, when the QE rejects it, then `fsm.ts`/`contracts.ts` are unchanged.
- Given an AI proposal, when the QE accepts it, then the model is updated and `tsc --noEmit` passes.
- Given the model, when inspected, then all entries are QE-adjudicated.

## Spec Change Log

## Design Notes

- **No code to write:** This is an architectural invariant, not a feature. The AI simply does not write to model files until told to. Stories 1.3 and 1.4 already demonstrated this behavior.
- **Enforcement is process, not technology:** The constraint is enforced by the AI's behavior, not by a pre-commit hook or type-system trick. This is acceptable for v1; a hook could be added later.

## Verification

- Story 1.3 review: 7 proposals deferred, model unchanged. ✅
- Story 1.4 query: dedup results returned, model unchanged. ✅
- Any future model update: verify `tsc --noEmit` passes.
