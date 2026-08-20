# Input Reconciliation: `project-context.md`

PRD: `prd.md` (2026-08-15, draft) · Addendum: `addendum.md` · Review date: 2026-08-15

## (a) Content checked and where captured

| project-context.md content | Captured in |
|---|---|
| Vision: spec-first testware, types as spec | PRD §1, §3 (Spec), §6.1 |
| Motivation: Kraken Pro, QA job Proof of Work | PRD §2.1 (JTBD-5), §6.1 (seed model on Kraken Pro); addendum §5. PRD §5 deliberately reframes "portfolio/deadline framing" as a non-goal (see Contradictions 1). |
| Why Kraken Pro is ideal target (stateful UI, high error cost, Playwright in reqs) | Partially: PRD §2.3 (persona), §4.6/addendum §2 ("real money"). The explicit "high cost of error / stateful" rationale is not restated. |
| State-reuse value proposition ("one navigation, N validations") | PRD §7 SM-7 (explicitly cites `project-context.md`); qualitative claim kept, quantification lost (Gap 2). |
| Two-phase observation vs validation model | PRD §4.2 "Three-Concern Test" (run/collect/verify), FR-4/5/6; §3 glossary (Shared validator, Snapshot); §6.1; §7 SM-2. Fully captured. |
| MBT / FSM concept (states, transitions, guards, contracts; scenario generation) | PRD §3 glossary (FSM, State, Contract, Scenario), §1, §4.4. Fully captured. |
| Interceptor-chain architecture (enter/leave/error, context flow, chain) | PRD body correctly excludes it. Addendum only name-checks "interceptor chain" (§5). Architecture content has no home (Gap 1). |
| Tech-stack reasoning (TypeScript) | PRD §6.1, §5 (Polyglot emitter non-goal), §3. The *rationale* (spec-driven types, native Playwright API, team compat, CLJS→TS proof) is not preserved (Gap 5). |
| Key discussion findings (2026-08-10/12) | Encoded: "use 'shared validator', never 'aspect'" (PRD §3) = the 08-10 "no AOP" decision; CLJS→TS lineage in PRD §5 non-goal. |
| ROI / role-value mapping | Role map + interview signals: addendum §5. Per-company ROI matrix and weighted scores: missing (Gap 3). |
| Open questions / brainstorming | PRD §8 carries model↔app sync (OQ3), CI/CD (OQ5), TestDriver/mobile (OQ7); PRD §5 non-goal (RAG). Dropped: mutation testing, PBT over snapshots, demo shape, AppModel-from-snapshot generation (Gap 4). |
| TestDriver protocol | PRD §8 OQ7, §5 non-goal. Captured. |
| "AOP" term ban | PRD §3 glossary. Captured (term renamed to "shared validator"). |
| Read-only against live app | Not in source; PRD adds it as Feature NFR — an extension, no conflict. |

## (b) Gaps

Substantive source content missing from BOTH the PRD body and the addendum:

1. **Interceptor-chain architecture content.** The enter/leave/error interceptor pattern, context threading through the chain, the validation chain as a reduce loop, and the `Interceptor`/`ValidationResult` TypeScript contracts appear nowhere except a name-check in addendum §5. The PRD correctly excludes it, but the addendum (which exists to preserve what the PRD drops) does not carry it either — it must be parked in the downstream architecture doc, and currently nothing guarantees that hand-off.
2. **State-reuse quantification.** The concrete claim (20 aspects × 10 UI states → 60 s vs 30 s navigation; 3–5 s navigation per test) is lost. PRD SM-7 keeps only the qualitative "one navigation funds N validations" claim.
3. **ROI matrix detail.** The per-company requirement mapping and weighted scores (Kraken/Jobgether/8am/IP Fabric/Semrush/Bloomreach/Flexiana; 27-point Reactive Testing POC; "6 of 7 offers") exist only as a one-liner (JTBD-5) and a condensed role map (addendum §5). PRD §5's "portfolio framing" non-goal makes exclusion from the body defensible, but the addendum — whose stated purpose is role-mapping — does not retain the matrix.
4. **Brainstorming items dropped.** Mutation testing (validator-quality verification), property-based testing over snapshots (global invariants), and the concrete POC demo shape are in neither PRD §8 nor the addendum. "Generate the AppModel from an accessibility-snapshot walk" is only indirectly covered by FR-1/FR-2.
5. **CLJS→TS "language-agnosticism proof" finding (2026-08-12).** The narrative that reimplementing the architecture in TypeScript *validates* it (principles survive a language change) is not preserved; PRD §5 only bans Clojure. The addendum's interview-story remit would be the natural home.

## (c) Contradictions

1. **Deadline framing (PRD body vs addendum vs source).** `project-context.md` is explicitly "POC za 1–2 týdny → funkční demo"; PRD §5 non-goal states "Portfolio/deadline framing — this is a way of working, not a 1–2-week demo race". Yet addendum §5's signal list keeps "delivering — 1–2 weeks from zero to a working demo". The addendum contradicts the PRD body it accompanies on the same claim.
2. **Vocabulary drift.** PRD §3 mandates "shared validator, *never* 'aspect'". The addendum (§5) and source retain "interceptor chain" and aspect-flavored phrasing ("aspects" in the signals list). The addendum should be aligned to the PRD glossary terms or explicitly annotated as historical/paraphrase.
3. **"App" vs "spec" as the deliverable.** Source frames the deliverable as generated tests on a live app; PRD reframes spec-as-deliverable, tests as byproducts. Recorded here as an intentional evolution (PRD §1), not an error — flagging so downstream docs do not reintroduce the old framing.
