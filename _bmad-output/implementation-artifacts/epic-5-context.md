# Epic 5 Context: Pilot Operation — Onboarding, Test Authoring, and Refinement Feedback

<!-- Compiled from spec-pilot-operation/SPEC.md. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Prove the Reactive Testing framework is usable by a new operator. Jan acts as the first-time user, follows the existing docs alone to understand the project, authors new test scenarios against the live app, and records wherever the docs fall short. The outcome is a validated-and-extended onboarding path plus an actionable backlog that refines the framework for the next user. This is a way of working, not a feature race — the pilot's measure is whether a new operator can pick up the project and extend it.

## Stories

- Story 5.1: Onboarding scenario 1 — History filter/pagination (filter-by-type and paginate on the seed model)
- Story 5.2: Onboarding scenario 2 — order book / selected view (second read-only surface)
- Story 5.3: Onboarding scenario 3 — portfolio summary/eye toggle (third read-only surface, completing critical-path breadth)

## Requirements & Constraints

- **Self-serve onboarding (CAP-1):** A first-time reader using only `README.md` and `docs/*` goes from zero to a recorded corpus run and an authored new scenario without consulting anyone beyond the docs.
- **Actionable refinement feedback (CAP-2):** Every friction or gap encountered is captured as a backlog issue with enough context for a later story to act on it. The backlog is reviewed after each scenario story, and each entry has a clear disposition (accepted, deferred, or won't-fix).
- **Docs extended where gaps show (CAP-3):** Every doc-gap backlog issue is closed by a doc edit or explicitly recorded as won't-fix by the end of the epic; no doc section is added that the pilot did not motivate.
- **Add-only authoring:** New scenarios extend every file they need (Gherkin feature + FSM/contract entries + action-map/config) but never fix or edit existing model states, features, contracts, or behavior. Existing artifacts are fixed ground truth.
- **Framework conventions:** New tests carry a valid `@plan:<PlanId>` tag (`smoke` | `regression` | `acceptance`), corresponding FSM/contract entries in the model, and read-only scope (NFR-3 — no mutating or order-execution contracts).
- **No new framework capabilities** unless a pilot gap makes one necessary (and even then only after the gap is filed and triaged).
- **Open retro items** (epic-3 item-7/8/10, epic-4 item-5) stay out of scope — implemented later when an opportunity arises.
- **English strictly;** "shared validator," never "aspect" (NFR-4).

## Technical Decisions

- **Pilot uses the existing framework as built (Epics 1–4):** deterministic orchestrator over CDP, offline library-only validators/reporter, corpus-based verification. No new framework capability is assumed.
- **Backlog storage:** pilot issues (doc gaps/friction) live in a lightweight per-scenario backlog reviewed after each story; only items not closeable in-story (real framework change or a human decision) bubble up to `deferred-work.md` for a future story.
- **Story breakdown unit:** stories are split by scenario, not by capability — each scenario story runs through all three caps (onboard/author CAP-1, file friction CAP-2, extend docs CAP-3).
- **Concrete use case per story is pinned with Jan at that story's kickoff.**

## Cross-Story Dependencies

- Depends on Epics 1–4 being complete (the framework must be built and documented).
- Stories are sequential — each story's backlog review feeds the next story.
- Open retro items from Epics 3 and 4 are explicitly out of scope.
