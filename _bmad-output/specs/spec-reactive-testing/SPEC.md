---
id: SPEC-reactive-testing
companions:
  - ../../../constitution.md
  - state-granularity.md
  - ../../planning-artifacts/architecture/architecture-reactive-testing-2026-08-17/ARCHITECTURE-SPINE.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Reactive Testing — Spec-First Testware

## Why

An opportunity to capture, born of the AI revolution: as AI writes more code, the human's enduring role is deciding what is true — and the spec is where that decision lives. Reactive Testing is the practice of that principle: the application is described as a formal model (FSM + contracts + schemas), the model is the deliverable, and test scripts are derived byproducts. This is a way of working, not a portfolio deadline — adopted here as the way to work in an AI-assisted world, with the Kraken Pro trading UI as the proving ground.

## Capabilities

- **CAP-1 — discover-and-record**
  - **intent:** A user can record a newly observed state or contract from the live browser into the corpus within the same session, assisted by an AI agent that observes the DOM/aria and queries the existing FSM to judge state-worthiness.
  - **success:** A state discovered in a live session lands in the corpus (FSM + contracts) in that same session, and a subsequent agent query against the corpus immediately sees it. Classification follows the rules in `state-granularity.md`.

- **CAP-2 — three-concern test**
  - **intent:** A test is separated into three concerns — run the scenario, collect data, verify the collected data — where verification is a pure function over the collected corpus, independent of the scenario and the browser.
  - **success:** Running a scenario produces a corpus (DOM/aria snapshots, network events, DOM probes); verification reads only that corpus; a new validation rule can run against previously recorded corpora without re-running the scenario.

- **CAP-3 — Gherkin governance**
  - **intent:** A failing test surfaces as a Gherkin scenario that a QE writes and a PM/PO reviews; the review outcome updates the FSM/contracts, and the agent never fixes the spec silently.
  - **success:** A test failure produces a human-reviewable Gherkin scenario; no spec change occurs without a human adjudication between "spec drift" and "app bug".

- **CAP-4 — graph as product artifact** *(deferred to v1.1 — AD-11)*
  - **intent:** The FSM/contracts graph answers product questions: proposals for missing edges (graph optimization) and standing invariants that critical tasks remain reachable from every important state at comparable cost.
  - **success:** From the corpus alone, the system produces (a) a proposed new edge/shortcut with reasoning, and (b) a pass/fail invariant check for one critical task across all modeled states. Cognitive-load comparison is a derived benefit of the model, not a deliverable requirement.

- **CAP-5 — repro script generation**
  - **intent:** From the FSM/contract model, emit a minimal script that reproduces a reported bug, runnable without the framework as a runtime dependency.
  - **success:** A reported bug path yields a runnable standalone script that reproduces the failure.

## Constraints

- The corpus is TypeScript types (FSM + contracts + schemas), verified by `tsc`; one language for spec and generated code. Clojure/EDN/Malli and the polyglot-emitter core are excluded — they contribute nothing here.
- Recorded snapshots live in separate plain-data files, never embedded in TS code — no format inside another format (no long aria dumps or nested data inside TS). One format per file.
- FSM/contracts are the SSOT (machine truth); Gherkin is a human-readable input/query layer, never the SSOT, never silently edited.
- Test plans are named, plural artifacts derived from the model, drawn from a fixed traditional taxonomy (smoke, regression, acceptance); a scenario carries a single QE-assigned plan reference, and the assignment is adjudicated (the agent proposes, never silently chooses).
- A failing test is a human-adjudicated fork (spec drift vs app bug); code failure is a trigger to update the spec, never an automatic write.
- English strictly; use "shared validator", never "aspect".

## Non-goals

- Re-enabling Clojure skills in this project — that lives in the sibling krakatoa project.
- A polyglot emitter framework (TS + Pytest + Bash targets) — one language, TypeScript.
- Gherkin as SSOT — it is a query/input interface only.
- Portfolio/deadline framing — this is a way of working, not a 1–2-week demo race.
- Re-validating the full body of `constitution.md` — it stays frozen as history; its domain discovery is harvested, not re-litigated.

## Success signal

A live session against the target app where a newly discovered state is recorded into the corpus and the agent generates a working TS script from it — all from the corpus, with no hand-written test script in the loop.

## Assumptions

- Browser automation is Playwright over CDP against the live authenticated app (read-only), with the AI agent reading DOM/aria snapshots via Playwright MCP.
- The target app for the initial corpus is Kraken Pro (the discovered FSM in `constitution.md`).
- MBT/MDD lineage holds: the model drives scenario generation; artifacts are derived from the model.

## Open Questions

- Cognitive-load measurement (CAP-4): explicitly not a priority — a good modelling feature, deferred. Which UX methods would quantify it (if ever pursued) is un-researched.
