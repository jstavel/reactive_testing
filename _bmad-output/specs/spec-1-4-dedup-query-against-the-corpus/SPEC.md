---
id: SPEC-story-1-4-dedup-query-against-the-corpus
companions:
  - ../spec-reactive-testing/state-granularity.md
sources:
  - ../../planning-artifacts/epics/epics.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Story 1.4 — Dedup query against the corpus

## Why

A pain to solve: Without a dedup mechanism, the QE risks proposing states or contracts that already exist in the model — wasting time and introducing noise. Story 1.4 provides a structured query: the QE names a candidate state or contract, and the AI returns a verdict of **existing** (with its exact location in `fsm.ts` or `contracts.ts`) or **new**. The answer is always sourced from the committed model files, never from conversation history.

## Capabilities

- **CAP-1 — dedup-query-existing-or-new**
  - **intent:** The QE can ask whether a proposed state or contract already exists in the model, receiving a verdict of existing (with file and line reference) or new, so duplicates are caught before adjudication.
  - **success:** Given a candidate stateId or contractId, the query returns "existing" with the exact file and line in `fsm.ts` or `contracts.ts`, or "new" with confirmation that no matching entry exists; the answer is sourced from the committed files, never conversation history (AD-12).

## Constraints

- The answer is always sourced from the committed `fsm.ts`/`contracts.ts`, never from conversation memory or prior context (AD-12).
- Read-only flows only (NFR-3).
- English-only identifiers (NFR-4).
- Classification follows `state-granularity.md`.

## Non-goals

- Live-session discovery (Story 1.3).
- Adjudication workflow (Story 1.5).
- Test plan assignment (Story 1.6).
- Building a separate index or database — the model files are the corpus.

## Success signal

The QE proposes a stateId (e.g., `"historyMain"`) and the AI returns "existing at `model/fsm.ts:46`". The QE proposes a contractId (e.g., `"sortByDate"`) and the AI returns "new — not found in `model/contracts.ts`". In both cases, the answer is correct and traceable to the committed files.

## Assumptions

- The AI can read `model/fsm.ts` and `model/contracts.ts` directly.
- Matching is by `stateId`/`contractId` exact string equality.
- The model files are the single source of truth for dedup (AD-12).
