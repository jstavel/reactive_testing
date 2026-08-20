---
title: Reactive Testing — Spec-First Testware
created: 2026-08-15
updated: 2026-08-15
status: final
---

# PRD: Reactive Testing — Spec-First Testware
*Title confirmed 2026-08-15.*

## 0. Document Purpose

This PRD defines Reactive Testing, a spec-first approach to testware: the target application is described as a formal model (FSM + contracts + schemas), the model is the deliverable, and test scripts are byproducts. It is written for the QE who builds and operates it (internal/tech audience), for the AI agents that execute it, and for downstream workflow owners (architecture, epics and stories, sprint planning, build). It builds on three inputs and does not duplicate them: `SPEC.md` (the canonical, preservation-validated contract — capabilities, constraints, non-goals, success signal), `constitution.md` (frozen history; its domain discovery is harvested, not re-litigated), and `project-context.md` (motivation, state-reuse value, role mapping). Interview/showcase narrative lives in `addendum.md`, never in this body. Vocabulary is glossary-anchored, each feature nests its FRs, and assumptions are tagged inline and indexed in §9.

## 1. Vision

Reactive Testing inverts the usual relationship between code and intent. In classical testing, the test script is the artifact of record: it couples a simulation with its assertions, and its intent is locked inside code that churns as technologies change. Reactive Testing makes the **spec the deliverable** — the application is captured as a formal model (states, transitions, contracts, invariants) — and test scripts become byproducts the machine generates and executes. When the UI changes, you edit the contract in one place; every derived test updates with it. `tsc` verifies the model, so the spec is executable.

The division of labor runs on comparative advantage: the **human owns truth**, the **AI owns speed**. The human writes a clear spec; the AI writes the code fast. Anti-hallucination is a *byproduct*, not the intent — when the AI is not the source of truth, it can only execute the spec, so hallucination loses its surface. This is the answer to "how do you stop AI hallucinating": you don't stop it, you make hallucination structurally harmless by moving truth into artifacts the AI cannot rewrite — real snapshots, human-declared spec, deterministic validators — so the AI has nothing left to invent.

The spec has two consumers, served from one truth. To the **PM/PO**, the human-centric description (Gherkin) is the negotiation surface — clear requirements earlier, intent that outlives any technology stack, the same traceability discipline the automotive industry applies to long-lived software. To the **AI**, the machine truth (FSM + contracts) is executable input. One spec, two dialects, no duplicated work. When the corpus knows the app as a graph, it stops being just a test model: it answers product questions — where a shortcut edge is missing, whether every critical task is still reachable from every important state, and (as a derived benefit) where the user's cognitive load is highest. That last signal is the seed of a larger idea — an AI that knows the model and simplifies the UI for the task at hand — deliberately kept out of this body and recorded in the addendum.

**The model is never captured whole.** The corpus grows step by step: a state discovered in a session, adjudicated, recorded; the FSM matures from a seed model on the read-only critical path through daily discovery. Completeness is a direction, not a prerequisite — the model is usable from its first state, becomes more valuable as it grows, and its gaps are visible as the same missing edges the graph queries expose (FR-10). No full-capture effort is ever required or expected.

## 2. Target User

### 2.1 Jobs To Be Done

- **JTBD-1 (functional)** — Capture the truth about an application's behavior once, in a place both I and the AI can query, instead of maintaining dozens of hand-written scripts.
- **JTBD-2 (functional)** — Get systematic, measurable coverage: "I covered 100% of transitions" means something concrete.
- **JTBD-3 (emotional)** — Trust the AI: when I delegate generation, the contract and `tsc` keep it honest, so I review intent rather than police trivia.
- **JTBD-4 (contextual)** — Make the same model serve multiple consumers — smoke coverage, regression paths, critical-flow invariants, product questions, and repro scripts — from one source of truth.
- **JTBD-5 (career)** — Prove to hiring teams that I work at architectural depth on Playwright, spec-driven design, and model-based testing.

### 2.2 Non-Users (v1)

- PM/PO as primary scenario authors — in v1 they do not author scenarios; they review and adjudicate via Gherkin. The QE authors scenarios (AI proposes, QE owns).
- Testers who prefer hand-written scripts with embedded assertions — the two-phase separation of collection and verification is the point, not a style choice.
- Mobile/Appium targets — desktop web only in v1.

### 2.3 Key User Journeys

> Persona: **Jan**, the QE operator. Authenticated, read-only session against Kraken Pro, Playwright MCP as pair programmer. With a single operator role, the journeys are kept light — each rendered as entry, path, climax, resolution.

- **UJ-1. Jan records a newly discovered state in the same session.**
  Jan opens the app and navigates to the History page. He inspects the filter-combobox, then prompts the AI: *"Propose Gherkin scenarios and contracts for using the filter-combobox."* The AI reads the live DOM/aria snapshot, queries the existing FSM, and proposes — flagging what's new. Jan reviews; when unsure whether it's already specified, he asks the AI *"is this already in the specification?"* (dedup query against the corpus) and then adjudicates. The accepted state lands in the corpus that same session, and an immediate re-query sees it. **Edge case:** the proposed state duplicates an existing one — the dedup query catches it before it enters the corpus.

- **UJ-2. A failing test forks into a human adjudication.**
  Jan runs a scenario; collection happens (snapshots, network events, probes) and verification runs as pure functions over the corpus. A validator fails. The failure surfaces as a Gherkin scenario a QE can read and a PM/PO can review. The fork is explicit: *spec drift* (the model is wrong) vs *app bug* (the app broke a declared contract). The review outcome updates the FSM/contracts; the AI never fixes the spec silently. **Edge case:** the app changed, not the spec — the model is untouched and the bug report is raised instead.

- **UJ-3. Jan asks the graph a product question before a release.** *(deferred to v1.1)*
  From the corpus alone, Jan asks: "What's the cheapest way a user reaches the trade form?" The model answers with (a) a proposed missing edge/shortcut plus reasoning, and (b) a pass/fail standing invariant check that critical tasks remain reachable from every important state at comparable cost. No scenario is re-run — the question is answered from the recorded model.

- **UJ-4. Jan turns a customer bug report into a repro script.**
  A bug path comes in from support. Jan traces it through the FSM/contracts and asks for a minimal repro. The model emits a standalone script that reproduces the failure — runnable with no framework runtime dependency. **Edge case:** the path isn't modeled — the gap is recorded and the state is added via UJ-1.

- **UJ-5. Jan checks that one fact is consistent across every view.**
  Jan defines a standing invariant: one fact (e.g. current balance; the state of an open order) must agree across every surface that shows it. The verification runs against previously recorded corpora — no browser needed. **Edge case:** a view shows a stale value (the mBank stale-balance failure mode) — the invariant fails with the offending view named.

## 3. Glossary

- **Spec** — The formal model of the application: FSM + contracts + schemas, in TypeScript. The one truth (SSOT); Gherkin is its human dialect, FSM + contracts its machine dialect. Verified by `tsc`.
- **FSM** — The finite-state model: states, transitions, guards, initial state. One representation of the app's behavior.
- **State** — A screen/dialog in a concrete condition. Classified per the rules in `state-granularity.md`.
- **Contract** — A dialog/screen's behavioral declaration: preconditions, action, postconditions, invariants.
- **Corpus** — The accumulated spec plus recorded artifacts (snapshots, network events, probes) the AI and validators read. One place, queryable.
- **Snapshot** — A serialized capture (DOM/aria, network event, probe result) from a scenario step. Plain data, never embedded in TS code.
- **Scenario** — A sequence of steps through the FSM (transition coverage, path coverage, happy path, negative paths). Generated from the model.
- **Gherkin** — The human-centric (BDD) description layer. The QE↔PM/PO negotiation surface. A query/input interface, never the SSOT, never silently edited.
- **Shared validator** — A pure verification function over the corpus. *Use this term, never "aspect."*
- **Validation rule** — A shared validator plus its passing criteria, applied to recorded corpora.
- **Dedup query** — A corpus query asking whether a proposed state/contract already exists.
- **Standing invariant** — A validation rule checked over all recorded corpora (reachability of critical tasks; cross-view consistency of one fact).
- **Reachability** — A critical task is reachable from a state when a scenario path exists at comparable cost.
- **Test plan** — A named, model-derived artifact, one of the three traditional test suites — `smoke` (minimal critical path), `regression` (full functional coverage), `acceptance` (end-to-end user journeys) — declaring the scenario path(s), collection, and validators the Orchestrator runs; it references the Model version it was derived from. The QE assigns each scenario to exactly one plan.

## 4. Features

Each feature maps to a SPEC capability; FRs are numbered globally (FR-1…FR-14). "Realizes UJ-x" references §2.3.

### 4.1 Discover and Record

**Description:** The loop that grows the corpus in-session. While working against the live app with the AI as pair programmer, Jan records newly observed states and contracts; the AI reads the DOM/aria, judges state-worthiness against the existing FSM, proposes Gherkin + contracts, and Jan adjudicates. The canonical trigger is the History-page filter-combobox prompt. The corpus is built incrementally — a seed model on the critical path, grown session by session; recording a state never requires the whole FSM to exist. Realizes UJ-1, UJ-4 (edge case).

**Functional Requirements:**

#### FR-1: Record a state into the corpus in the same session
Jan can record a newly observed state or contract from the live browser into the corpus (FSM + contracts) within the same session. **Consequences (testable):** (a) a state discovered in a live session lands in the corpus in that same session; (b) a subsequent agent query against the corpus immediately sees it; (c) classification follows the rules in `state-granularity.md`.

#### FR-2: AI proposes, QE owns
The AI proposes candidate states, Gherkin scenarios, and contracts from the live DOM/aria snapshot plus a query of the existing FSM; nothing enters the corpus without the QE's adjudication. **Consequences (testable):** a rejected proposal is never written to the corpus; the corpus's `updated` reflects only accepted entries.

#### FR-3: Dedup query against the corpus
Jan can ask "is this already in the specification?" and receive a verdict of existing (with reference) or new. **Consequences (testable):** an existing state returns its location in the FSM/contracts; a genuinely new one returns "new"; the answer is sourced from the corpus, not the AI's prior knowledge.

**Feature-specific NFRs:** the query path is agent-facing, so response latency is human-tolerable (no strict SLA in v1); the corpus must remain queryable mid-session (no rebuild required).

### 4.2 Three-Concern Test

**Description:** Every test is split into run / collect / verify. Running a scenario collects a corpus (snapshots, network events, probes); verification is a set of pure shared validators over that corpus, independent of scenario and browser. A new validation rule runs against previously recorded corpora without re-running the scenario — which is what makes offline, historical, and cross-view validation possible. Realizes UJ-2, UJ-5.

**Functional Requirements:**

#### FR-4: Scenario run produces a corpus
Running a scenario produces a recorded corpus (DOM/aria snapshots, network events, DOM probes) with no assertions embedded in the run. **Consequences (testable):** the run phase performs no verification; the corpus is serializable and stored as plain data files.

#### FR-5: Verification reads only the corpus
Shared validators are pure functions from corpus → result, with no browser access. **Consequences (testable):** (a) verification runs with the browser closed; (b) a validator invoked twice on the same corpus yields identical results.

#### FR-6: New validation rule without re-running the scenario
A newly written validation rule can be executed against previously recorded corpora. **Consequences (testable):** adding a rule and running it over an existing corpus produces results without launching the scenario or browser; regression results are comparable across runs.

**Feature-specific NFRs:** one format per file — recorded snapshots live in separate plain-data files, never embedded in TS code.

### 4.3 Gherkin Governance

**Description:** Failing tests surface as human-reviewable Gherkin, and every spec change goes through a human adjudication of spec drift vs app bug. Gherkin is the QE↔PM/PO negotiation surface; the FSM/contracts stay the machine truth. The AI never fixes the spec silently. Realizes UJ-2.

**Functional Requirements:**

#### FR-7: Failure surfaces as reviewable Gherkin
A failing verification produces a Gherkin scenario a QE can read and a PM/PO can review. **Consequences (testable):** every failure has a corresponding Gherkin artifact; the artifact names the failing rule and the recorded corpus it ran against.

#### FR-8: Adjudicated spec change only
Spec changes occur only through human adjudication (spec drift vs app bug); a code failure is a trigger to update the spec, never an automatic write. **Consequences (testable):** the corpus's `updated` changes only on an explicit human-approved update; no silent edits in the record.

#### FR-9: Gherkin is never the SSOT
Gherkin is a query/input layer; it is never silently edited and never treated as the source of truth. **Consequences (testable):** an edit to the FSM/contracts is the single place a behavior change is recorded; Gherkin artifacts are derived and regenerable.

### 4.4 Graph as Product Artifact

**Description:** The FSM/contracts graph answers product questions from the corpus alone — no scenario re-run. Two query classes — proposed missing edges (with reasoning) and standing reachability invariants over critical tasks — are **deferred to v1.1 per AD-11**: they require a mature, queryable Model. Cognitive-load comparison is a derived benefit of the model, not a deliverable. Realizes UJ-3.

**Functional Requirements:**

#### FR-10: Propose missing edges
From the corpus alone, produce a proposed edge/shortcut with reasoning. **Consequences (testable):** the proposal cites the source states and the gap it closes; it is presented as a proposal, never auto-merged (governed by FR-8).

#### FR-11: Standing reachability invariant
A pass/fail check that one critical task remains reachable from every important state at comparable cost. **Consequences (testable):** the check covers all modeled states of the given importance; a regression that breaks reachability flips the check to fail with the unreachable pair named. `[NOTE FOR PLANNING]` — which states count as *important*, and the cost definition behind *comparable cost*, are deliberately left open; pin both against the seed model's critical path at planning (FR-11 operationalization, rubric finding).

### 4.5 Repro Script Generation

**Description:** From the FSM/contract model, emit a minimal script that reproduces a reported bug, runnable with no framework runtime dependency. Realizes UJ-4.

**Functional Requirements:**

#### FR-12: Standalone repro from the model
A reported bug path yields a runnable standalone script that reproduces the failure. **Consequences (testable):** (a) the script runs without the framework's runtime; (b) the script is generated from the FSM/contracts, not hand-written; (c) an unmodeled path is reported as a gap rather than silently approximated.

### 4.6 Cross-Surface Consistency

**Description:** One fact, many views. A standing invariant requires every surface showing the same fact to agree — e.g. current balance, or the state of an open order, on every screen that displays it. This closes the real failure class where a stale view desynchronizes from the true value (the mBank-style stale-balance bug). Runs against recorded corpora, so it needs no live session. Realizes UJ-5. Extends FR-6. [ASSUMPTION: one fact may legitimately differ across views in edge cases (pending vs settled); the invariant's "agreement" semantics need domain grounding in the corpus.]

**Functional Requirements:**

#### FR-13: Cross-view standing invariant
A validation rule that one fact agrees across every modeled surface that shows it. **Consequences (testable):** the invariant is declared once per fact and checked over recorded corpora; a divergence fails with the offending view named; the rule is purely corpus-based (no browser).

**Notes:** `[NOTE FOR PM]` — the SPEC's capability list stops at CAP-5; this feature is a flagship application of CAP-2's verification-over-corpus machinery. **RESOLVED** — stays nested under CAP-2, no CAP-6 (see Open Question 1).

### 4.7 Cross-Cutting NFRs

- **Determinism** — runtime verification is pure TypeScript; the browser may be closed after collection. Realizes FR-4/FR-5.
- **Type-safety gate** — the corpus is verified by `tsc`; types are the contract. `tsc --noEmit` clean is a precondition for any generated code.
- **Read-only v1 scope** — in v1 the agent automates read-only flows only (order History, order book, portfolio views); it never places orders or mutates target-app state. Order-execution contracts are deferred to a later phase via small real-money DCA buys (see §6.2).
- **English strictly** — corpus vocabulary and generated artifacts are English-only, per the SPEC's language constraint (which also bans the term "aspect"; use "shared validator").

### 4.8 Test Plan Assignment

**Description:** Test plans are named, plural artifacts — not one anonymous output. The QE specifies which plan covers the scenario being authored, and that assignment is recorded and regenerable. When the AI generates or updates a test plan, it routes the scenario into the QE-specified plan and proposes (never silently chooses) an assignment when none is given. Plans embed the Model version they were derived from. Realizes the multi-plan authoring need behind JTBD-4.

**Functional Requirements:**

#### FR-14: QE assigns a scenario to a test plan
Multiple named test plans exist; the QE specifies which plan covers a scenario, and the assignment is recorded and regenerable. **Consequences (testable):** (a) a fixed traditional taxonomy of three plans exists — `smoke`, `regression`, `acceptance` — typed as `PlanId = "smoke" | "regression" | "acceptance"`; (b) a scenario carries exactly one plan assignment (a `@plan:<id>` tag, typed as `PlanId`); (c) the AI routes the scenario into the QE-specified plan when generating/updating the plan, and proposes the assignment for adjudication rather than silently choosing; (d) a plan's scenario membership is regenerable from the scenarios' assignments.

## 5. Non-Goals (Explicit)

- **Polyglot emitter** — no TS + Pytest + Bash targets; one language, TypeScript. Realizes the single-language constraint.
- **Gherkin as SSOT** — it is a query/input interface only; FSM/contracts are the machine truth.
- **Re-enabling Clojure skills** — no Clojure/EDN/Malli; that lineage stays in the sibling project.
- **Re-validating `constitution.md`** — it stays frozen as history; its domain discovery is harvested, not re-litigated.
- **Portfolio/deadline framing** — this is a way of working, not a 1–2-week demo race (even though the Kraken Pro corpus is the proving ground).
- **Fixing the target app's bugs** — testware reports failures and produces repros; it does not patch the app.
- **A general AI agent framework / vector RAG over the corpus** — dedup runs as a direct corpus query in v1; no retrieval layer is added over the corpus.
- **UI focus-mode minimization** (the "AI simplifies the UI for a task") — a future application of the model; recorded in the addendum, not built here.
- **Trading-discipline journal / chart automation (Wyckoff, Volume Profile, Point & Figure)** — a separate product thread; relevant to this PRD only as future corpus targets on Kraken Pro.
- **Mobile/Appium abstraction (TestDriver protocol)** — desktop web only; an open question, not a commitment.

## 6. MVP Scope

### 6.1 In Scope

- TypeScript corpus types (FSM + contracts + schemas) verified by `tsc`; one language for spec and generated code.
- Live-session discover-and-record with AI proposal + QE adjudication + dedup query (FR-1…FR-3).
- Two-phase run/collect/verify with pure shared validators and corpus-only verification (FR-4…FR-6).
- Gherkin governance: failure → Gherkin → adjudicated spec change (FR-7…FR-9).
- Standalone repro script generation (FR-12).
- Cross-surface consistency standing invariant (FR-13).
- Named, QE-assigned test plans with per-scenario routing (FR-14).
- Initial corpus on a single target (Kraken Pro, authenticated) as a **seed model on the read-only critical path** (order History, order book, portfolio views) — grown incrementally via discover-and-record, never captured whole. [ASSUMPTION: Playwright over CDP against the live authenticated Kraken Pro app is the v1 runtime.]

### 6.2 Out of Scope for MVP

- Multiple target applications (single: Kraken Pro). `[NOTE FOR PM]` — the design is app-agnostic, but breadth is a v2 conversation.
- CI/CD packaging (AppModel in git, generated scenarios as build artifacts) — open question, deferred to planning.
- **Order-execution automation (mutating contracts)** — placing orders and verifying postconditions is deferred to a later phase, run against small real-money DCA buys. v1 automates read-only scenarios only. `[NOTE FOR PM]` — design the corpus/contracts so mutating contracts slot in without restructuring; the read-only split is a scope line, not an architecture line.
- Cognitive-load measurement as a deliverable — explicitly deferred; it is a derived model benefit (§4.4).
- **Graph queries** (proposed missing edges, standing reachability invariants — FR-10…FR-11) — deferred to v1.1 per AD-11; they require a mature, queryable Model.

## 7. Success Metrics

The headline success signal (from the SPEC): a live session against the target app where a newly discovered state is recorded into the corpus and the agent generates a working TS script from it — all from the corpus, with no hand-written test script in the loop.

**Primary**

- **SM-1**: *Same-session corpus landing* — a state discovered in a live session is recorded and immediately queryable, per `state-granularity.md`. Validates FR-1, FR-2.
- **SM-2**: *New rule, no re-run* — a new validation rule executes against previously recorded corpora without launching the scenario or browser. Validates FR-6, FR-5.
- **SM-3**: *No silent spec change* — 100% of spec updates are adjudicated; every failure has a reviewable Gherkin artifact. Validates FR-7, FR-8, FR-9.
- **SM-4**: *Corpus-alone graph answers* — [DEFERRED to v1.1] a proposed-edge query and a standing reachability invariant check are both answered from the corpus with no scenario re-run. Validates FR-10, FR-11.
- **SM-5**: *Standalone repro* — a reported bug path yields a runnable script with no framework runtime dependency. Validates FR-12.
- **SM-6**: *Cross-view consistency* — the cross-view invariant catches a deliberately introduced stale-view divergence. Validates FR-13.
- **SM-8**: *Plan assignment respected* — every scenario lands in its QE-assigned plan; a plan's membership regenerates from scenario assignments and matches its `modelVersion`. Validates FR-14.

**Secondary**

- **SM-7**: *State-reuse efficiency* — one navigation funds N validations; new validators don't multiply navigation cost (the concrete value claim from `project-context.md`).

**Counter-metrics (do not optimize)**

- **SM-C1**: *Total scenario count* — raw coverage breadth is not the goal; systematic coverage from the model is. Optimizing count invites trivia.
- **SM-C2**: *Trivial-pass validators* — a validator that passes because it asserts nothing. Every validator must be able to fail on a real divergence.
- **SM-C3**: *Validation runtime* — optimizing speed at the cost of corpus fidelity (dropping snapshots, probes, or network events) is a false economy; fidelity funds all other metrics.
- **SM-C4**: *Cognitive-load metric* — explicitly not a deliverable (§4.4); measuring it as a product metric would balloon scope.

## 8. Open Questions

1. **SPEC CAP-6? — RESOLVED.** Cross-surface consistency (Feature 4.6) stays nested under CAP-2; no sixth capability. Decided 2026-08-18.
2. **Model↔app synchronization** — How is corpus-to-real-app correspondence verified over time (the model drifts as the app changes)?
3. **Initial corpus depth — RESOLVED.** A seed model on the read-only critical path (order History, order book, portfolio views), grown incrementally through daily discover-and-record sessions. Whole-FSM-at-once capture is explicitly not required (see Vision, §1).
4. **CI/CD integration shape** — AppModel in git, generated scenarios as build artifacts, validation runs in CI. Design deferred to planning.
5. **Cognitive-load measurement method** — Which UX method would quantify it if ever pursued (explicitly un-researched; deferred).
6. **TestDriver protocol / mobile** — Abstraction above Playwright + Appium; explicitly not committed in v1.

## 9. Assumptions Index

- §0 — Interview/showcase narrative stays in the addendum, never in the PRD body (memlog decision; confirmed).
- §1 — The "answer to AI hallucination" is structural (truth lives in artifacts the AI cannot rewrite, not in its latent knowledge), not a prompt technique.
- §2 — Single operator role (the QE); PM/PO is a downstream Gherkin reviewer, not a primary author.
- §4.1 — The History filter-combobox workflow is the canonical discovery trigger; the pattern generalizes.
- §4.2 — Browser may be closed after collection; recorded corpora are durable and replayable.
- §4.6 — One fact may legitimately differ across views in edge cases (pending vs settled); the invariant's "agreement" semantics need domain grounding in the corpus.
- §5 — Clojure skills and constitution re-validation stay out, per SPEC non-goals.
- §6.1 — Playwright over CDP against the live authenticated Kraken Pro app is the v1 runtime (tagged inline).
