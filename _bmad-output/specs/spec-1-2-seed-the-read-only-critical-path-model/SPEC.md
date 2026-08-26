---
id: SPEC-story-1-2-seed-the-read-only-critical-path-model
companions:
  - ../spec-reactive-testing/state-granularity.md
  - ../../planning-artifacts/architecture/architecture-reactive-testing-2026-08-17/ARCHITECTURE-SPINE.md
sources:
  - ../../planning-artifacts/epics/epics.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Story 1.2 — Seed the read-only critical-path model

## Why

A pain to solve: Story 1.1 delivered the model scaffold but it is empty — discover-and-record (CAP-1 of SPEC-reactive-testing) has nothing to anchor to, and every downstream epic (collection, verification, repro) depends on a grounded model. This story seeds the FSM states and dialog contracts for Kraken Pro's read-only critical path (order History, order book, portfolio), with the QE's own Gherkin scenarios — authored with AI assistance — as the human input that decides what the seed contains.

## Capabilities

- **CAP-1 — seeded-read-only-model**
  - **intent:** The committed model contains the seed FSM states and dialog contracts for order History, order book, and portfolio, so recording starts from a grounded model rather than an empty corpus.
  - **success:** Every seeded entry classifies per `state-granularity.md` (URL change → state, action → contract, data value → parameter); only read-only flows are modeled; `npm install && npx tsc --noEmit` exits clean on a fresh checkout.

- **CAP-2 — qe-authored-gherkin-input**
  - **intent:** The QE prepares Gherkin scenarios (AI-assisted drafting, QE-owned adjudication) as committed `.feature` files that drive which states and contracts the seed contains.
  - **success:** `features/` holds `.feature` scenarios whose steps each trace to a seeded state or contract, and no model entry exists that the QE did not adjudicate (FR-2).

## Constraints

- Read-only flows only — no mutating or order-execution contracts (NFR-3).
- Gherkin is input/query layer only, never the SSOT (FR-9, AD-1, AD-9); no Gherkin governance machinery is built here — Epic 3 owns it.
- Nothing enters `fsm.ts`/`contracts.ts` without QE adjudication of an AI proposal (FR-2, AD-10).
- No Playwright or test runtime installed; `fsm.ts`/`contracts.ts` stay dependency-free with abstract action/guard signatures (Epic 2 owns the runtime).
- English-only identifiers and artifacts (NFR-4); never use the term "aspect".
- Scope is strictly the epic acceptance criteria (`epics.md`, Story 1.2); deferred-work items (runtime schema smoke test, FSM referential-integrity refinements) stay deferred.

## Non-goals

- Mutating or order-execution contracts (order placement, cancellation).
- Gherkin governance machinery — parsers, failure rendering, review workflow (Epic 3).
- Live-session discover-and-record (Story 1.3) and dedup query (Story 1.4).
- Closing deferred-work findings from the 1.1 review — they remain recorded in `_bmad-output/implementation-artifacts/deferred-work.md`.

## Success signal

On a fresh checkout, the type gate passes clean with a populated model, and `features/` contains QE-authored `.feature` scenarios whose every step names something the model actually contains — Gherkin and model tell the same story, with the model as machine truth.

## Assumptions

- History/Main/Ledger is one state hosting the filter-by-type / paginate / clear-filters contracts, per the worked example in `state-granularity.md`.
- Exact state decomposition for the order-book and portfolio surfaces is settled during build via AI proposal + QE adjudication.

## Open Questions

- Which concrete states make up the order-book and portfolio surfaces in the seed? (The epic AC pins History/Main/Ledger concretely; the other two surfaces are named but not decomposed.)
