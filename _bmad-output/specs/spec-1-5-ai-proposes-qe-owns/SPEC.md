---
id: SPEC-story-1-5-ai-proposes-qe-owns
companions:
  - ../spec-reactive-testing/state-granularity.md
sources:
  - ../../planning-artifacts/epics/epics.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Story 1.5 — AI proposes, QE owns

## Why

A pain to solve: Without an explicit adjudication gate, the AI could silently add states or contracts to the model — bypassing the QE's review. Story 1.5 formalizes the architectural invariant: every AI proposal requires the QE's explicit approval before entering `fsm.ts`/`contracts.ts`. This was demonstrated in Stories 1.3 and 1.4; this story makes it a binding constraint.

## Capabilities

- **CAP-1 — adjudication-gate**
  - **intent:** Every AI-proposed state, contract, or scenario requires the QE's explicit approval before entering the model, so no unreviewed change lands in the corpus.
  - **success:** A rejected proposal is never written to `fsm.ts` or `contracts.ts`; the model reflects only QE-adjudicated entries (FR-2, AD-10).

## Constraints

- Nothing enters `fsm.ts`/`contracts.ts` without QE adjudication (FR-2, AD-10).
- Read-only flows only (NFR-3).
- English-only identifiers (NFR-4).
- `tsc --noEmit` must pass after any model update.

## Non-goals

- Building a UI for adjudication — the QE adjudicates in conversation.
- Audit log of rejections — not required for v1.
- Live-session discovery (Story 1.3) or dedup query (Story 1.4).

## Success signal

The AI proposes a state and the QE rejects it — `fsm.ts` is unchanged. The AI proposes a contract and the QE accepts it — `fsm.ts`/`contracts.ts` are updated and `tsc --noEmit` passes. The model contains only QE-adjudicated entries.

## Assumptions

- The adjudication happens in the conversation between the AI and the QE.
- The AI does not write to model files until explicitly told to.
