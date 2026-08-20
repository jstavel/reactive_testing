# PRD Quality Review — Reactive Testing — Spec-First Testware

## Overall verdict

A strong, green-light-ready PRD. The thesis ("the spec is the deliverable; human owns truth, AI owns speed") is stated with conviction and every feature, success metric, and counter-metric is earned back to it; trade-offs are surfaced as non-goals and `[NOTE FOR PM]` callouts rather than smoothed to neutral; and Done-ness is carried by testable consequences on every FR. What's at risk is a narrow set of under-operationalized commitments — the flagship standing-invariant FR (FR-11) never defines what "important" or "comparable cost" mean, the read-only constraint silently conflicts with verifying the order-flow contracts on the critical path, and mechanical discontinuities (an FR-19 ghost ID, a non-roundtripping Assumptions Index) will trip downstream story creation.

## Decision-readiness — strong

The PRD states decisions as decisions: TypeScript-only (no polyglot), Gherkin never the SSOT, no full-capture, single-operator role, read-only against the live app. The three `[NOTE FOR PM]` callouts sit at real tensions, not checkpoints — CAP-6 vs CAP-2 nesting (§4.6), app-agnostic design vs single-target MVP (§6.2), dedup vs RAG at scale (§6.2). Open Questions are genuinely open and mostly owned: OQ-1 names Jan as decision owner; OQ-3 (model↔app synchronization) is a real unresolved risk, not a rhetorical question. The one dodge: §6.1 puts "order flow" on the critical path as the seed model while the read-only constraint (§4.1 NFRs) forbids submitting orders — yet nothing anywhere asks how mutating contracts get verified against a live app that can't be written to.

### Findings
- **[medium]** Read-only vs. order-flow verification (Feature-specific NFRs §4.1/§4.6; §6.1) — the seed model is "a seed model on the critical path (order flow)," but the read-only gate says the agent "never submits orders or mutates target-app state," so the postconditions of any order-submitting contract can never be verified live. This is a genuine scope tension (does the corpus only *model* trade entry, or *verify* it?) that the reader must infer. *Fix:* add a `[NOTE FOR PM]` or non-goal stating that mutating contracts are modeled and repro'd but their postconditions are not live-verified in v1.

## Substance over theater — strong

No persona theater: one persona, Jan, and all five UJs and every feature realization hang on him. No NFR theater: determinism, type-safety gate, and read-only are product-specific and tied to FRs. No vision theater: §1's "two consumers, served from one truth" and "hallucination loses its surface" are specific to this product and could not be swapped into another PRD without change. The one strong claim ("This is the answer to 'how do you stop AI hallucinating'", §1) is asserted as fact in the Vision and only later flagged as an assumption (§9 §1 entry) — a beat late, but it is flagged. The addendum absorbs the showcase narrative cleanly, so the body stays product-clean.

### Findings
- *(none required)*

## Strategic coherence — strong

The thesis is a real bet, not a headline: §1 names the problem (intent locked inside code), the move (spec as executable deliverable), and the mechanism (structural anti-hallucination). Feature prioritization follows the thesis — discover-and-record is the growth loop, three-concern is the verification machinery, Gherkin governance protects "human owns truth." Success metrics validate the thesis rather than measure activity: SM-3 ("100% of spec updates are adjudicated") is the *trust* metric, SM-C1..C4 are real counter-metrics tied to specific failure modes (count-bloat, trivial-pass validators, fidelity-sapping runtime optimization). One internal seam: JTBD-5 (career) in §2.1 sits uneasily against Non-Goal "Portfolio/deadline framing" (§5) — resolved by the addendum by design, but the body never says so.

### Findings
- **[low]** JTBD-5 vs. Non-Goals tension (§2.1 vs §5) — "Prove to hiring teams that I work at architectural depth" is the one JTBD that does not serve an internal user, yet Non-Goals says "Portfolio/deadline framing" is out. The addendum resolves it, but the body carries the career JTBD with no cross-reference. *Fix:* point JTBD-5 at the addendum ("narrative in addendum §5, per assumption §9/§0").

## Done-ness clarity — adequate

Every FR (1–13) carries a `**Consequences (testable)**` block with verifiable conditions, and the three-concern split (FR-4/5/6) has unusually crisp done-ness ("verification runs with the browser closed," "invoked twice… identical results"). But two FRs lean on concepts an engineer cannot yet measure, and one consequence is an absence claim with no stated test strategy.

### Findings
- **[high]** Standing-invariant semantics undefined (§4.4 FR-11; Glossary "Reachability") — the check is "one critical task remains reachable from every important state at comparable cost," but nothing defines what makes a state "important," what "comparable cost" is measured in (path length? clicks? navigation cost?), or where the importance attribute lives in the FSM. FR-11 is a flagship FR feeding UJ-3 and SM-4; an engineer cannot know done without inventing both definitions. *Fix:* declare an importance classification (e.g. from `state-granularity.md`-style rules) and a cost metric (e.g. max scenario-path length) in the Glossary or an FR-11 note.
- **[medium]** "Minimal script" unbounded (§4.5 FR-12) — "emits a minimal script" is an adjective without a bound, and consequences (a)–(c) test runnability and provenance, not minimality. A script that imports the whole framework or emits dead steps still passes. *Fix:* define minimality as a checkable property (no framework runtime import; no steps beyond the traced path).
- **[medium]** Absence claim unstested (§4.2 FR-4, consequence a) — "the run phase performs no verification" is a negative property with no stated way to verify it. *Fix:* specify the check (e.g. corpus files are written before any assertion code path can execute; run phase has no validator imports).
- **[low]** "Human-tolerable" latency (§4.1 NFR) — an unbounded adjective, though honestly self-disclaimed ("no strict SLA in v1"). *Fix:* keep the disclaimer or give a soft bound (e.g. "a dedup query returns within an interactive session without a rebuild").

## Scope honesty — strong

Non-Goals (§5) are specific and load-bearing, not boilerplate (polyglot, Clojure lineage, constitution re-validation, portfolio framing). §6.2 de-scopes honestly with `[NOTE FOR PM]` callouts at each silent-assumption risk (multi-app, CI/CD, RAG, cognitive-load). The "model is never captured whole" stance is asserted in the Vision and carried consistently through OQ-4's resolution and §6.1's seed-model scope — no whiplash. Open-items density (7 OQs, 3 NOTE FOR PM) is right for a green-light PRD of this size, and the OQs are mostly deferred-with-owner rather than blocking.

### Findings
- *(none required)*

## Downstream usability — adequate

Glossary is present (14 terms) and the vocabulary holds: "shared validator" is enforced over "aspect," FR/feature/SM/UJ cross-references all resolve (each feature "Realizes UJ-x," SM-1…6 map back to FRs, FR-10 defers to FR-8, FR-13 extends FR-6). Every UJ has its named protagonist (Jan). The gaps are small but real: FR-2 and FR-8 lean on "the corpus's `updated`," a field that appears in no Glossary entry and will force story creation to invent it; and the §4 intro's ID range is wrong.

### Findings
- **[low]** Undefined `updated` field (§4.1 FR-2; §4.3 FR-8) — "the corpus's `updated` reflects only accepted entries" presumes a field/audit mechanism never defined. *Fix:* glossarize `updated` (or replace with an explicit audit log) so story creation inherits it.

## Shape fit — strong

Right calibration for an internal, single-operator tool: capability-spec structure with deliberately light UJs — §2.3 explicitly says "journeys are shown at lighter weight — entry, path, climax, resolution" and each UJ still earns its place by realizing features. The showcase purpose is pushed to the addendum instead of being forced into the body, which is exactly the right shape for a PRD that is also a career artifact. Not over-formalized, not under-formalized.

### Findings
- *(none required)*

## Mechanical notes

- **ID continuity:** §4 intro claims "FRs are numbered globally (FR-1…FR-19)" but only FR-1…FR-13 exist — the FR-19 ghost will propagate into epics/stories if uncorrected.
- **Assumptions Index roundtrip broken:** §9 indexes eight assumptions by section (§0, §1, §2, §4.1…) but there are zero inline `[ASSUMPTION: …]` tags anywhere in the body. The index is still usable (section-referenced) but doesn't follow the tag→index convention.
- **Open-Question hygiene:** OQ-4 is marked "RESOLVED" but sits inside §8 Open Questions; it is a decision, not an open question, and would live better in a decisions note (its resolution already anchors §1 and §6.1).
- **UJ protagonists:** consistent — Jan across UJ-1…UJ-5, with the persona block inline at §2.3.
- **External references:** `state-granularity.md` (FR-1, SM-1) and `SPEC.md` CAPs resolve correctly to existing files; the SPEC's CAP-5 cap matches the §4.6 note.
- **Required sections:** all present for the stakes — Vision, Target User, Glossary, Features+FRs, Non-Goals, MVP Scope, Success Metrics (with counter-metrics), Open Questions, Assumptions Index.
