---
id: SPEC-pilot-operation
companions:
  - ../spec-reactive-testing/SPEC.md
  - ../../../constitution.md
  - state-granularity.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Pilot Operation — Onboarding, Test Authoring, and Refinement Feedback

## Why

An opportunity to prove, born of the four shipped epics: the Reactive Testing framework exists and is documented, but nothing yet demonstrates that a new user can onboard to it — master the framework, extend its tests, and contribute. This pilot is that proof. It is simultaneously a **full review** of what the project is and does (why it exists, what each part is) and a hands-on **new-user run**: Jan acts as the first-time operator, follows the existing docs to understand the project, authors new tests against it, and records wherever the docs fall short. The outcome is a validated-and-extended onboarding path plus an actionable backlog that refines the framework for the next user. This is a way of working, not a feature race — the pilot's measure is whether a new operator can pick up the project and extend it.

## Capabilities

- **CAP-1 — self-serve onboarding**
  - **intent:** A new operator can onboard to the project by following the docs alone — set up the prerequisites, understand what the project is and how it works, record a corpus, and author new scenarios.
  - **success:** A first-time reader, using only `README.md` and `docs/*`, goes from zero to (a) a recorded corpus run and (b) an authored new scenario that follows framework conventions, without consulting anyone beyond the docs.

- **CAP-2 — actionable refinement feedback**
  - **intent:** Every friction or gap the pilot hits while reading, running, or authoring is captured as a backlog issue with enough context for a later story to act on it.
  - **success:** Each gap or friction point encountered during the pilot is recorded as a backlog item naming what failed and why; the backlog is reviewed after the first story completes and then after each scenario story, and each entry has a clear disposition (accepted, deferred, or won't-fix).

- **CAP-3 — docs extended where the pilot shows gaps**
  - **intent:** The onboarding docs are extended only where the pilot actually reveals a gap, so the next new user is better served without speculative documentation bloat.
  - **success:** Every backlog issue that names a documentation gap is either closed by a doc edit or explicitly recorded as won't-fix by the end of the epic; no doc section is added that the pilot did not motivate.

## Constraints

- The pilot uses the existing docs as the **sole** onboarding vehicle: during the run, Jan refrains from explaining anything the docs omit, so every missing step becomes a visible, recordable gap.
- **Authoring is add-only.** A new scenario extends every file it needs — its Gherkin feature, the FSM/contract entries in the model, and any action-map/config — but never fixes or edits existing model states, features, contracts, or behavior. Existing artifacts are fixed ground truth; anything wrong in them is a backlog/deferred item for a future story, not an in-scope edit.
- New tests authored in the pilot must follow framework conventions: Gherkin with a valid `@plan:<PlanId>` tag (`smoke` | `regression` | `acceptance`), corresponding FSM/contract entries in the model, and read-only scope (NFR-3 — no mutating or order-execution contracts).
- The pilot exercises the project as built (Epics 1–4): the deterministic orchestrator over CDP, the offline library-only validators/reporter, and corpus-based verification. No new framework capability is assumed.
- Open retro items (epic-3 item-7/8/10, epic-4 item-5) stay open/waiting and are **out** of this epic's scope; they are implemented later when an opportunity arises.
- Feedback is recorded to a backlog as issues appear; the backlog is reviewed together after the first story completes and then after each scenario story, feeding the next story.
- English strictly; "shared validator", never "aspect" (NFR-4).

## Non-goals

- Building new framework capabilities unless a pilot gap makes one necessary (and even then only after the gap is filed and triaged).
- Implementing the open retro items (epic-3 item-7/8/10, epic-4 item-5) — deferred to when an opportunity arises.
- A CI/CD or production rollout — the pilot is local and hands-on.
- FR-10/FR-11 (graph queries / standing reachability invariant) — still deferred to v1.1.
- Fixing or correcting existing model states, features, contracts, or behavior during the pilot — authoring is add-only (see Constraints).

## Success signal

A new user, relying only on the docs, extends the project's test suite by authoring new scenarios under the framework's conventions (add-only, read-only), and files actionable backlog issues for the friction points they hit; the docs are updated to close the gaps the pilot exposed so the next new user has a smoother path.

## Assumptions

- The pilot is run by Jan personally as the "new user" proxy, on the real local environment against the live authenticated app over CDP, rather than by a separate external test subject.
- Three scenario stories (one per read-only surface: History, order book, portfolio) constitute comprehensive feedback for this epic; the concrete use case per story is pinned with Jan at that story's kickoff.
- The existing user documentation set (README + `docs/*`) is the current, honest baseline — it describes the shipped reality of Epics 1–4, including the library-only (no-CLI) status of offline validation, failure-Gherkin, adjudication, cross-view invariants, and repro generation.

## Open Questions

- Where exactly the pilot backlog file lives (a dedicated `pilot-backlog.md` under implementation artifacts is the working assumption) and its precise shape are pinned during sprint planning.
