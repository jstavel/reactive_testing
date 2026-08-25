---
id: SPEC-story-1-3-discover-and-record-a-state-in-session
companions:
  - ../spec-reactive-testing/state-granularity.md
  - ../../planning-artifacts/architecture/architecture-reactive-testing-2026-08-17/ARCHITECTURE-SPINE.md
sources:
  - ../../planning-artifacts/epics/epics.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Story 1.3 — Discover-and-record a state in-session

## Why

A pain to solve: Story 1.2 seeded the model from Gherkin features, but features are static — they capture what the QE knew at authoring time. The model needs to grow from live observations, catching states or contracts the QE missed, forgot, or that appeared since the features were written. Story 1.3 enables in-session discovery: the AI reads the live browser DOM/aria tree, proposes new states and contracts classified per `state-granularity.md`, the QE adjudicates, and accepted entries land immediately in the model files.

## Capabilities

- **CAP-1 — ai-observes-live-browser**
  - **intent:** The AI reads the DOM/aria tree of a live browser session and proposes new states and contracts not yet in the model, so the QE can discover gaps without leaving the session.
  - **success:** Given a live page, the AI produces a pre-filtered list of proposed states and contracts (excluding those already in the model) classified per `state-granularity.md` (URL change → state, action → contract, data value → parameter, tooltip → ignore); every proposal names the observation that triggered it.

- **CAP-2 — qe-adjudicates-before-model-update**
  - **intent:** Every AI proposal requires the QE's explicit approval before entering `fsm.ts`/`contracts.ts`, so no unreviewed change lands in the model.
  - **success:** A rejected proposal is never written to the model; an accepted proposal is committed; the corpus reflects only QE-adjudicated entries (FR-2, AD-10).

- **CAP-3 — immediate-model-update**
  - **intent:** Accepted states and contracts land in `fsm.ts`/`contracts.ts` within the same session, so the model is immediately current and queryable.
  - **success:** After acceptance, `fsm.ts` contains the new state(s) with correct `stateId`/`label`/`parentStateId`, `contracts.ts` contains the new contract(s) with correct `contractId`/`preconditions`/`postconditions`/`invariants`, and `tsc --noEmit` passes clean.

## Constraints

- Read-only flows only — no mutating or order-execution contracts (NFR-3).
- Nothing enters `fsm.ts`/`contracts.ts` without QE adjudication of an AI proposal (FR-2, AD-10).
- No Playwright or test runtime installed; `fsm.ts`/`contracts.ts` stay dependency-free with abstract action/guard signatures (Epic 2 owns the runtime).
- AI reads the browser for discovery (what to model), NOT for specifying implementation details like xpaths or selectors — that is Epic 2's Orchestrator.
- Classification follows `state-granularity.md`: URL change → state, action → contract, data value → parameter, tooltip/hover → ignore.
- English-only identifiers and artifacts (NFR-4); never use the term "aspect".
- The existing model (from Story 1.2) is the baseline; discovery adds to it, does not replace it.
- The AI pre-filters proposals to exclude states and contracts already in the model before presenting to the QE — dedup logic lives in the discovery step.
- DOM/aria access is via MCP Playwright connecting to `localhost:9222` with Kraken Pro already open in the browser; no browser extension or custom tooling needed.

## Non-goals

- Specifying implementation details (xpaths, selectors, Playwright calls) — Epic 2 owns the Orchestrator and runtime.
- Dedup query against the corpus (Story 1.4).
- Test plan assignment (Story 1.6).
- Mutating or order-execution flows (order placement, cancellation).
- Gherkin governance machinery — parsers, failure rendering, review workflow (Epic 3).

## Success signal

A QE navigates to a page not yet in the model (e.g., the Earn page's rate table), the AI proposes the new state and contracts classified correctly, the QE accepts them, and they appear in `fsm.ts`/`contracts.ts` immediately — a subsequent `tsc --noEmit` passes clean and the model now contains the new entries.

## Assumptions

- The QE has an active browser session with Kraken Pro loaded; the AI accesses the DOM/aria tree via MCP Playwright at `localhost:9222`.
- The existing model from Story 1.2 is the baseline; discovery extends it incrementally.
- The AI pre-filters to exclude already-modeled entries, so the QE only sees genuinely new proposals.
