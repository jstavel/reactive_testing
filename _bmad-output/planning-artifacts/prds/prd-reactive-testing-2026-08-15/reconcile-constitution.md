# Input Reconciliation: constitution.md

Input: `constitution.md` (652 lines, "frozen history"). Per SPEC non-goal, its domain discovery is harvested, not re-litigated; the PRD is not required to re-validate it. This pass checks only (a) framing consistency, (b) high-value harvest gaps, (c) contradictions.

## (a) Consistency check

High consistency — no framing conflict. The PRD's core framing maps one-to-one onto the constitution's principles and ADRs:

- **States / transitions / contracts.** The constitution's "four concepts" (STAV ~12 / KONTRAKT ~30 / SCÉNÁŘ ~20+ / PARAMETR) matches the PRD glossary (State / Contract / Scenario) and its granularity rule (URL change = state; same URL = parameter; dialog = nested state) is the exact basis the PRD's `state-granularity.md` reference assumes (CAP-1, FR-1, glossary "State"). "Scénář ≠ stav" / "stavy jsou vzácné, scénáře hojné" is the same claim the PRD's "model is never captured whole / seed model on the critical path" (§1, OQ-4) generalizes.
- **Kraken Pro as initial corpus.** The constitution's only domain discovery is the Kraken Pro History page discovered 2026-08-12 via live CDP; the PRD's canonical discover-and-record trigger is the History page filter-combobox (UJ-1, FR-1), and SPEC assumption names Kraken Pro as the initial corpus. Consistent.
- **Contracts = pre/action/post.** Constitution contract capture (`preconditions` / `action` / `postconditions`) matches the PRD's Contract definition ("preconditions, action, postconditions, invariants").
- **Shared validators, never "aspect".** ADR-4 is harvested verbatim into the PRD glossary and SPEC constraint — consistent.
- **Gherkin as query, not SSOT.** Constitution's SSOT & Workflow and "Gherkin jako dotazovací jazyk" match FR-9 and the SPEC constraint — consistent.
- **Human adjudication, no silent spec edits.** Constitution §7 step 4 ("agent nahlásí nesrovnalost, neopravuje Gherkin mlčky") and the bug-workflow fork match UJ-2 / FR-8 — consistent.
- **Two-phase model + one-navigation-N-validations.** ADR-1 and core principle 3 match Feature 4.2 (FR-4…FR-6) and SM-7 — consistent.
- **Read-only, authenticated, live CDP.** Constitution technical constraints match the PRD NFR ("Read-only against the live app") and assumption §6.1.
- **FR-13 ancestry.** The cross-surface consistency invariant is the direct generalization of the constitution's cross-transition `balance-invariant-across-tabs` ("balance se nemění mezi taby") — a genuine harvest, consistent.
- **Terminology "spec", "corpus", "scenario"** all align; no terms are redefined against the constitution.

## (b) High-value harvest gaps worth noting

Most detail correctly lives downstream in SPEC/architecture. The following are genuinely high-value and currently carried nowhere:

1. **The concrete seed FSM for the initial corpus is not carried.** The discovered History page machine — URL pattern `/app/history/{main|derivatives|earn}/{subtab}`, tabs Main/Futures/Earn, subtabs Ledger/Orders/Trades/Positions/Bots, `Portfolio:Overview`, ~12 states, and the **12 contracts C1–C12** (switch-tab-*, filter-by-type/asset/date, clear-filters, open-ledger-detail, paginate-next, navigate-portfolio) — is precisely the "seed model on the critical path" the MVP promises (§6.1), yet the PRD names only the filter-combobox trigger. The seed corpus should be grounded in this inventory.
2. **History-page global invariants and cross-transition examples are ready-made standing invariants.** The four invariants (side nav visible; Balance (USD) in top bar; three tabs present; "View statements" → `/app/statements`) plus `filter-monotonic` (count after ≤ before), round-trip (filter → clear = identical state), and idempotence seed FR-11 (reachability) and FR-13 (cross-view). In particular, the §4.6 open assumption ("agreement semantics need domain grounding in the corpus") is *already grounded* by `balance-invariant-across-tabs` — worth pointing the planner at it.
3. **Ephemeral-state / multi-source collection rationale for FR-4's corpus is not carried.** The constitution's ADR-5/ADR-6 "why" — continuous collection (MutationObserver/console/network started *before* the action, not just a final snapshot), multi-source snapshot (ariaSnapshot, DOM probe, console, network, screenshot), and the SPA limitations (virtual scroll ⇒ only visible rows in DOM, canvas invisible to ARIA, async WebSocket prices, `waitForSelector`/`waitForFunction` over `waitForTimeout`) — is the technical grounding for Feature 4.2's corpus definition (snapshots + network events + probes) and belongs in the SPEC/architecture.
4. **LedgerRow schema + Spec-vs-Data rule seed the corpus types.** The 9-column ledger schema (Date/Type/Wallet/Asset/Ticker/Amount/Fee/Balance/ID), the wallet/type enums, and the rule "schema describes shape, never values" (a contract never says "30 rows"; only the property "every row type = selected filter") are the exact seed for the TS schemas the MVP ships as its deliverable.
5. **Bug-workflow regression localization is an uncarried capability claim.** The `scenarios.edn` registry + "run validator against all historical snapshots to find when the bug first appeared" (80 % of bugs land on an existing scenario) extends FR-6 beyond "new rule without re-run" into first-seen regression localization — arguably the payoff of corpus permanence; expect it in the PRD or an open question, or deliberately defer it downstream.

Lower-value, fine to leave downstream: "Učící se pozorovatel" narrowing, the JIRA Report five-layer format, the 1–2-week/3-slice success framing.

## (c) Contradictions

None live. Two declared supersessions to note, both intentional:

- **Clojure/EDN/Malli vs TypeScript.** The constitution's architecture (ADR-2 polyglot emitter, ADR-3 Malli, EDN snapshot/SSOT files, "spec as Clojure maps") is dead-lettered by the SPEC's single-language-TS decision; the PRD §5 restates that non-goal. This is a deliberate divergence between the frozen history and the current contract — not an unnoticed contradiction, and the constitution correctly stays untouched.
- **Czech vs English.** The constitution body is in Czech; the SPEC's "English strictly" constraint supersedes it for all new artifacts. Content is preserved conceptually, so no loss beyond language.

Framing note (not a contradiction): UJ-3's "trade form" and addendum §5's order-book / limit–market / P&L signals reference surfaces **outside** the constitution's discovered corpus (History page only). That is an extension toward the broader Kraken Pro app, which the PRD already frames as the proving ground — but reviewers should not assume those surfaces are harvested.
