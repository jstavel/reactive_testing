---
title: 'Story 1.3: Discover-and-record a state in-session'
type: 'feature'
created: '2026-08-25'
status: 'done'
review_loop_iteration: 0
context:
  - _bmad-output/specs/spec-1-3-discover-and-record-a-state-in-session/SPEC.md
---

## Intent

**Problem:** The model was seeded from static Gherkin features (Story 1.2), but features capture what the QE knew at authoring time. The model may be incomplete — missing states or contracts that exist in the live app.

**Approach:** The AI performs a review session: it connects to the live Kraken Pro via MCP Playwright (localhost:9222), reads the current model (`fsm.ts`, `contracts.ts`), compares what's on screen against what's in the model, and suggests new states and contracts that are missing. The QE adjudicates each suggestion.

## Boundaries & Constraints

**Always:** Read-only flows only (NFR-3); nothing enters model without QE adjudication (FR-2, AD-10); classification per `state-granularity.md`; English-only (NFR-4); `tsc --noEmit` clean after updates; AI reviews for discovery, NOT for specifying xpaths/selectors; AI pre-filters already-modeled items.

**Ask First:** HALT and ask the user if a decision surfaces that is not covered by this spec.

**Never:** Model mutating or order-execution contracts; use the term "aspect"; specify implementation details (xpaths, selectors); replace existing model entries.

## Code Map

- `model/fsm.ts` — FSM types + seed data (10 states, 12 transitions). Updated if new states/transitions are accepted.
- `model/contracts.ts` — DialogContract type + seed data (10 contracts). Updated if new contracts are accepted.
- `model/schemas.ts` — Shared Zod schemas (read-only, not modified by this story).
- `_bmad-output/specs/spec-1-3-discover-and-record-a-state-in-session/SPEC.md` — Canonical spec.
- `_bmad-output/specs/spec-reactive-testing/state-granularity.md` — Classification rules.
- MCP Playwright — connects to localhost:9222 with Kraken Pro already open.

## Tasks & Acceptance

**Execution:**

- [ ] Connect to live Kraken Pro via MCP Playwright at localhost:9222.
- [ ] Read the current model (`fsm.ts` states/transitions, `contracts.ts` contracts).
- [ ] Read the DOM/aria tree of the current page.
- [ ] Compare on-screen elements against the model — identify states and contracts present in the UI but missing from the model.
- [ ] Classify each missing element per `state-granularity.md` (URL change → state, action → contract, data value → parameter, tooltip → ignore).
- [ ] Present pre-filtered proposals to the QE (only genuinely new items, no duplicates).
- [ ] On QE acceptance: update `fsm.ts`/`contracts.ts` with new entries using abstract placeholder actions.
- [ ] Run `npx tsc --noEmit` — passes clean after every update.
- [ ] Navigate to other pages and repeat the review.

**Acceptance Criteria:**
- Given a live page with unmodeled elements, when the AI reviews the DOM/aria against the model, then it proposes only new states/contracts (pre-filtered against existing model).
- Given a proposal, when the QE rejects it, then nothing is written to the model.
- Given a proposal, when the QE accepts it, then `fsm.ts` and `contracts.ts` are updated and `tsc --noEmit` passes.
- Given the updated model, when inspected, then all new entries follow `state-granularity.md` classification.
- Given the updated model, when inspected, then all identifiers are English and "aspect" never appears.

## Spec Change Log

## Design Notes

- **This is a review workflow, not a code module.** The "implementation" is the AI agent performing a structured review session — connecting to the browser, reading the model, comparing, proposing, and updating on adjudication.
- **Pre-filter, not post-filter:** The AI excludes already-modeled items before presenting to the QE.
- **MCP Playwright at localhost:9222:** Kraken Pro is already open. The AI reads the DOM/aria tree via the MCP Playwright tool.
- **Abstract placeholders only:** New contracts use the same `placeholder` pattern as Story 1.2. The Orchestrator (Epic 2) replaces them with Playwright calls.
- **Incremental, not replacement:** The existing 10 states and 10 contracts are the baseline. New entries are appended, never modifying existing ones.

## Verification

**Commands:**
- `npx tsc --noEmit` — expected: exit 0, no output (run after each model update).

**Manual review:**
- Connect to localhost:9222 with Kraken Pro open.
- Navigate to a page not fully modeled (e.g., Earn page rate table).
- Verify AI proposes new states/contracts classified correctly per `state-granularity.md`.
- Reject a proposal — verify nothing is written.
- Accept a proposal — verify `fsm.ts`/`contracts.ts` updated and `tsc --noEmit` passes.
- Verify no existing entries were modified.
