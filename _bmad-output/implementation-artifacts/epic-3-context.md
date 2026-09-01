# Epic 3 Context: Verification & Gherkin Governance

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Jan can run pure validators against recorded corpora, see failures surface as readable, reviewable Gherkin, and adjudicate every spec change. Verification is fully deterministic — it runs offline over the corpus with no browser access — and the FSM/contracts stay the single source of truth: Gherkin remains a derived input/query layer and is never the machine truth. This epic delivers the verification leg of the run/collect/verify split and closes the loop from failing test to human-decided spec update.

## Stories

- Story 3.1: Validators are pure functions over the corpus
- Story 3.2: Validator declares corpus dependencies; one navigation funds N validators
- Story 3.3: New validation rule without re-running the scenario
- Story 3.4: Failure surfaces as reviewable Gherkin
- Story 3.5: Adjudicated spec change only
- Story 3.6: Gherkin is never the SSOT

## Requirements & Constraints

- Verification is pure: shared validators are functions from corpus → result with no browser access; verification runs with the browser closed, and a validator invoked twice on the same corpus yields identical results.
- A new validation rule runs against previously recorded corpora without launching the scenario or browser — regression results must be comparable across runs. This is what enables offline, historical, and cross-view validation.
- A failing verification produces a Gherkin scenario a QE can read and a PM/PO can review; every failure has a corresponding Gherkin artifact naming the failing rule and the recorded corpus it ran against.
- Spec changes occur only through human adjudication of spec drift vs app bug (the model is wrong, or the app broke a declared contract). A code failure is a trigger to update the spec, never an automatic write; the corpus `updated` changes only on explicit human approval, with no silent edits in the record. When the app changed, not the spec, the model stays untouched and a bug report is raised.
- Gherkin is a query/input layer — never silently edited, never treated as the source of truth. A behavior change is recorded in exactly one place: the FSM/contracts; Gherkin artifacts are derived and regenerable.
- Determinism (runtime verification is pure TypeScript), the type-safety gate (`tsc --noEmit` clean is a precondition for any generated code), and the English-only vocabulary (use "shared validator", never "aspect") apply throughout.
- Out of scope for this epic: graph queries (proposed missing edges, standing reachability invariants) are deferred to v1.1; cross-view standing invariants (one fact agrees across every modeled surface that shows it, failing with the offending view named, run purely over the corpus, with per-fact domain-grounded agreement semantics) belong to Epic 4.

## Technical Decisions

- Validators are per-contract pure functions (corpus in → pass/fail out), implemented as `validate-*.ts` files in `validators/`. Cross-state invariants and other validation kinds emerge from implementation rather than requiring a separate validation type.
- Every validator returns a typed result conforming to `ValidationResult` in schemas.ts: `{ contractId: string, passed: boolean, details?: string, corpusRefs: string[] }`. The reporter consumes only this type; no validator may return a custom shape.
- Each validator declares the corpus data it needs; the orchestrator reads these declarations to plan which collectors to run — the declared dependencies must reference the canonical corpus types (SnapshotRecord, NetworkEvent, ProbeResult, ScreenshotRef, ValidationResult) defined in schemas.ts.
- Gherkin is a file convention, not a processing layer: `.feature` files in `features/`, no parser, never the SSOT. It has a dual role — primary input (QE describes use cases) and secondary output (failing tests surface as Gherkin for review).
- The reporter is a separate player from the orchestrator — different reason to change: it reads the corpus (including screenshots) and produces human-readable reports and CI/CD formats (xunit XML, JSON).
- The Model (fsm.ts + contracts.ts + schemas.ts) is the sole authority; corpus is runtime evidence, not truth — validators read it and never write to the Model. The AI agent proposes model updates and test plans; every change is human-reviewed before merging, with no silent edits.
- State-reuse is an architectural invariant: one navigation funds N validators, and new validators must not multiply navigation cost. A validator needing data from a state no existing path reaches is flagged blocked until the FSM grows a reachable path.

## UX & Interaction Patterns

- The core journey: Jan runs a scenario → collection happens (snapshots, network events, probes) → verification runs as pure functions over the corpus → a validator fails → the failure surfaces as a Gherkin scenario a QE can read and a PM/PO can review → the fork is explicit: spec drift vs app bug → the review outcome updates the FSM/contracts, never silently.

## Cross-Story Dependencies

- Depends on Epic 1's model files and Epic 2's corpora: validators read namespaced corpus data (`collectorType/run-id/stepIndex.ext` + run-manifest) captured against the current Model version; a test plan embeds a content hash of the committed model files, and the orchestrator verifies the match before execution.
- Within the epic: the pure-function shape and `ValidationResult` contract (3.1) and declared corpus dependencies (3.2) are prerequisites for running new rules over old corpora (3.3); Gherkin surfacing (3.4) feeds adjudicated spec change (3.5) and Gherkin-never-SSOT (3.6).
- Dependency declarations (3.2) are consumed by Epic 2's orchestrator for collector planning, realizing the state-reuse efficiency invariant.
- Epic 4's cross-view standing invariants are built on this epic's corpus-only verification machinery (new rules over recorded corpora without a re-run).