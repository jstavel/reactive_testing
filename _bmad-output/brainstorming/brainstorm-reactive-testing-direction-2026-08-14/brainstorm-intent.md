# Brainstorm Intent — Reactive Testing Direction

**Status:** settled direction for downstream planning (spec, product brief)
**Source session:** Reactive Testing POC tech direction (2026-08-14)

## Orientation

Spec-first testware for the AI-assisted era. The human decides what is true; the AI does the coding. The spec is a live corpus of TypeScript types — FSM, contracts, schemas — verified by `tsc`, one language for spec and generated code. This is a way of working, not a portfolio deliverable.

## Purpose

- Real goal: adopt spec-first as THE way to work in the AI-assisted world — the human's enduring contribution when AI writes the code.
- The human decides what is true (the spec); the AI reads the spec and writes TS.
- No portfolio/deadline framing. No time pressure. The demo matters, but the habit is the product.
- Stack settled: TypeScript, not Clojure/EDN/Malli. The polyglot-emitter core is dead in its Clojure form; Clojure re-enablement lives in the sibling krakatoa project, not here.
- Aligns with the Kraken QA target: Playwright, MCP integrations, automation framework, trading domain.

## The material

- TypeScript types ARE the spec/corpus: FSM + contracts + schemas as typed TS.
- `tsc` verifies the spec itself compiles — the spec is executable, machine-checkable truth.
- One language for spec and generated code.
- Model-Based Testing / Model-Driven Testing: FSM + contracts = the model; scenarios derive from it; model is SSOT, generated artifacts are derived.

## Architecture

- A test = three separated concerns: (1) run the scenario, (2) collect data, (3) verify the collected data.
- Verification is a pure function over the collected data.
- The corpus — DOM/aria snapshots, network events, DOM probes — IS the deliverable (snapshot-driven testing).
- Scripts are derived byproducts of the corpus, not the deliverable.
- The corpus enables deep queries ad-hoc tests cannot: task cognitive load (state hops per goal), minimal repro scripts from spec data.

## Workflow

- Spine: discover-and-record. Live discovery of a state/contract in the browser, recorded into the corpus in the same session.
- Everything else hangs off the spine: agent pickup, generation, queries, repro.
- Steps: (1) write the Gherkin scenario (manually or with AI), (2) decide whether it warrants a new FSM state, (3) name the contract the scenario describes. AI assists all three.
- Granularity rules (URL change = state, same URL = parameter, dialog = nested state) come from the existing constitution; AI needs these rules plus the visible FSM at decision time.
- The agent is a coder: reads the spec, writes TS. The user drives — observes DOM/aria via the agent to draft Gherkin; the agent queries FSM/contracts by scenario to decide whether a new state/contract is required.

## Governance

- FSM/contracts = SSOT (machine truth).
- Gherkin = the human negotiation surface between QE and PM/PO (PM-readable spec layer). Test fails → QE writes the Gherkin scenario → PM + PO review it together.
- A failing test is a fork: EITHER spec drift OR an app bug. The decision is human, never an automatic write. The agent reports the discrepancy; it never silently fixes the Gherkin.
- Code failure is a trigger to update the spec — generated TS is a sensor; when it breaks against the live app, the scenario/FSM is out of date — but the loop is NOT automatic.

## Graph as product

- The FSM/contracts graph is a product-design artifact, not just a test model.
- (a) Cognitive-load comparison: two starting states, same user goal → AI compares task difficulty from the corpus' DOM/aria snapshots for both full paths.
- (b) Graph optimization: complaint-driven ("task is hard from History") → AI searches the graph for alternative paths or proposes a new edge/shortcut contract. A product improvement IS a new edge in the model — a recommendation, not a test.
- (c) Standing invariants: for user-critical tasks, AI verifies reachability from EVERY important state at comparable cognitive load. Consistency of access = a property the corpus checks, not a test.
- Open thread: what is measurable from the DOM/aria vs not (cognitive-load metrics need UX/AI expertise).

## Notes / out of scope

- constitution.md stays frozen as a historical design record. Its domain discovery (Kraken Pro FSM, contracts, granularity rules, validation layers) will be harvested later — out of scope for what the new spec stores.
- Language: English strictly. Use "shared validator", never "aspect".
