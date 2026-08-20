# Addendum: Interview & Showcase Narrative

> Purpose per memlog decision: PRD body stays product-clean; this addendum preserves the storytelling and role-mapping the PRD intentionally excludes. Sources: `project-context.md` and the 2026-08-15 recordings.

## 1. The cognitive-load story: the model makes load measurable, then minimizes it

Two recordings, one arc:

1. **Recognition (08_24_37).** Because the corpus models the app as a graph, AI can *recognize* which tasks carry high cognitive load — e.g. finding card limits in mBank is "cognitive load like crazy," and the model can see why: the fact is buried under navigation unrelated to the task. This is a derived benefit of the model (CAP-4), not a deliverable.
2. **Response (07_17_02).** Once the model knows the UI, the same AI can run a "focus mode": *"I'm reviewing my orders — minimize every link that doesn't belong to this task."* It temporarily hides or nests irrelevant elements and leaves the load-bearing ones, so a yearly review of buys/sells/profits happens at minimum cognitive load.

**Interview framing:** "The corpus doesn't just test the app — it makes cognitive load measurable, and the same model that measures it can simplify the UI for the task at hand." This is the wow-demo: AI that knows the FSM *doing something* with that knowledge beyond asserting.

**Growth story:** the model never has to be captured whole — it starts as a seed on the critical path and matures through daily discover-and-record sessions. The demo shows the *growth loop* (discover → adjudicate → record → query sees it), not a finished model.

## 2. The consistency story: a real bug that motivates it

The stale-balance failure mode is real and citable: an mBank session where one view showed a balance and another showed the same fact stale — the views on one truth had desynchronized (07_55_32; the personal frustration variant in 08_00_01). The cross-surface consistency invariant (PRD Feature 4.6) is engineered to catch exactly this class in the trading UI, where "different views on one intent" carries real money.

## 3. The trading domain thread (out of PRD scope, noted here)

The Kraken Pro role asks for proof of trading knowledge. Recorded ideas that belong to a **separate product thread** (close to the gtd-trading project), relevant here only as future corpus targets on Kraken Pro:

- **Chart analysis over the live UI (07_19_35).** AI reads the chart canvas through the app model (FSM + contracts), identifies support/resistance and accumulation/distribution per Wyckoff theory, maintains a daily-review knowledge journal, and can even render Point & Figure charts (which Kraken doesn't offer natively) — proof of trading domain depth.
- **Discipline training (07_31_04).** With the journal as a knowledge base, the AI classifies each order as *emotional* vs *in-plan* before execution — trading intuition trained the GTD way: build the system, trust it, get in the zone (Mark Douglas, *Trading in the Zone*; David Wise; Wyckoff).

## 4. Role-value map (from `project-context.md`)

| Talking to… | Emphasize… |
|---|---|
| QA manager | Playwright natively, testing architecture, MCP workflow |
| Senior QA engineer | Spec-driven types, corpus/collector pipeline, snapshot-driven generation, MBT/FSM |
| Platform engineering | CDP, CI/CD, observability, type safety |
| Engineering manager | Team compatibility (TS stack), architecture over scripts |
| Recruiter (general) | "Tests generated from a formal model of the application" |

**Signals this project demonstrates (interview checklist):** Playwright at architectural level (orchestrator over CDP, not just `page.click()`); systematic not ad-hoc testing (model → generated scenarios with measurable coverage); AI as productivity tool, not replacement (MCP pair-programmer, human approves); trading domain literacy (order book, limit/market order, balance, P&L in model and validators); thinking beyond "writing tests" (two-phase model, state reuse, FSM, contracts); delivering — 1–2 weeks from zero to a working demo.

**Numbers to cite (state-reuse value, from `project-context.md`):** one navigation funds N validations — e.g. validating 20 aspects across 10 UI states needs roughly 30s of navigation if the corpus is reused, vs ~60s if each check navigates alone. New validators don't multiply navigation cost.

**Architecture is language-agnostic (proven):** the interceptor-chain / two-phase design was first validated in ClojureScript, then re-implemented in TypeScript — the principles held across languages. The interceptor chain itself is architecture detail; it gets its full home in the downstream architecture document, not here.
