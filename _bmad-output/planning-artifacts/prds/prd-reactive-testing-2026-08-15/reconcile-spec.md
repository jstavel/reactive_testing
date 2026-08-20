# Input Reconciliation — SPEC → PRD

- **Input:** `_bmad-output/specs/spec-reactive-testing/SPEC.md` (+ companion `state-granularity.md`)
- **Output checked:** `prd.md` (body) + `addendum.md` (narrative)
- **Method:** every capability, constraint, non-goal, success-signal element, and assumption in the SPEC (and its companion) was checked for capture — verbatim, paraphrased, or referenced — in the PRD body or addendum. Nothing in the SPEC may be silently dropped or contradicted.

## (a) Capabilities / constraints checked and where captured

### Capabilities

| SPEC element | Captured in PRD | Where |
|---|---|---|
| CAP-1 discover-and-record: record observed state/contract from live browser in-session; AI observes DOM/aria, queries FSM to judge state-worthiness | FR-1, FR-2, §4.1 description, UJ-1 | §4.1 (FR-1, FR-2); §2.3 (UJ-1) |
| CAP-1 success: same-session corpus landing; immediate re-query sees it; classification per `state-granularity.md` | FR-1 consequences (a)(b)(c); UJ-1 resolution + dedup edge case; SM-1 | §4.1 (FR-1); §2.3 (UJ-1); §7 (SM-1) |
| CAP-2 three-concern test: run / collect / verify; verification is a pure function over the corpus, independent of scenario and browser | §4.2 description; FR-4, FR-5; §1; UJ-2; UJ-5 | §4.2 (FR-4, FR-5); §1 Vision; §2.3 |
| CAP-2 success: scenario run produces corpus (DOM/aria snapshots, network events, DOM probes); verification reads only corpus; new rule runs on old corpora without re-run | FR-4, FR-5 consequences (a)(b), FR-6; SM-2 | §4.2; §7 (SM-2) |
| CAP-3 Gherkin governance: failing test → Gherkin a QE writes, PM/PO reviews; review outcome updates FSM/contracts; agent never fixes spec silently | FR-7, FR-8; §4.3 description; UJ-2 (incl. edge case: app changed → model untouched, bug raised); §2.2 (QE authors, PM/PO reviews) | §4.3 (FR-7, FR-8); §2.3 (UJ-2); §2.2 |
| CAP-3 success: failure → human-reviewable Gherkin; no spec change without adjudication (spec drift vs app bug) | FR-7, FR-8 consequences; SM-3 | §4.3; §7 (SM-3) |
| CAP-4 graph as product artifact: missing-edge proposals + standing reachability invariants at comparable cost | FR-10, FR-11; §4.4 description; UJ-3 | §4.4; §2.3 (UJ-3) |
| CAP-4 success: from corpus alone → (a) proposed edge/shortcut with reasoning, (b) pass/fail invariant for one critical task across modeled states; cognitive-load is a derived benefit, not a deliverable | FR-10, FR-11; UJ-3 ("no scenario is re-run"); SM-4; §6.2 (cognitive-load deferred); §8 OQ-6; addendum §1 (derived benefit framing) | §4.4; §2.3; §7 (SM-4); §6.2; §8; addendum §1 |
| CAP-5 repro script generation: minimal script from FSM/contract model, runnable without framework as runtime dependency | FR-12; §4.5 description; UJ-4 (+ edge case: unmodeled path → recorded gap) | §4.5 (FR-12); §2.3 (UJ-4) |
| CAP-5 success: reported bug path → runnable standalone repro | FR-12 consequences (a)(b)(c); SM-5 | §4.5; §7 (SM-5) |

### Constraints

| SPEC constraint | Captured in PRD | Where |
|---|---|---|
| Corpus is TS types (FSM + contracts + schemas), verified by `tsc`; one language for spec and generated code; Clojure/EDN/Malli and polyglot emitter excluded | Glossary (Spec, FSM); §6.1; §5 non-goals (Polyglot emitter, Clojure); §1 ("`tsc` verifies the model"); §6.1/§Feature-NFRs Type-safety gate | §3; §5; §6.1; §1; Feature-NFRs |
| Snapshots in separate plain-data files, never embedded in TS; one format per file | Glossary (Snapshot); §4.2 feature-NFR ("one format per file…never embedded in TS code"); FR-4 consequences ("plain data files") | §3; §4.2; FR-4 |
| FSM/contracts are SSOT; Gherkin is human input/query layer, never SSOT, never silently edited | Glossary (Gherkin); FR-9; §5 non-goal | §3; §4.3 (FR-9); §5 |
| Failing test = human-adjudicated fork (spec drift vs app bug); code failure is trigger to update spec, never automatic write | FR-8; UJ-2; SM-3 | §4.3; §2.3; §7 |
| Use "shared validator", never "aspect" | Glossary (Shared validator: "Use this term, never 'aspect.'") | §3 |
| English strictly | **Not captured** — see Gap 1 | — |

### Non-goals

| SPEC non-goal | Captured in PRD | Where |
|---|---|---|
| Re-enabling Clojure skills (sibling krakatoa project) | §5 non-goal; §9 assumption | §5; §9 |
| Polyglot emitter framework (TS + Pytest + Bash); one language, TS | §5 non-goal | §5 |
| Gherkin as SSOT (query/input interface only) | §5 non-goal; §3 Glossary | §5; §3 |
| Portfolio/deadline framing — a way of working, not a 1–2-week demo race | §5 non-goal ("…even though the Kraken Pro corpus is the proving ground") | §5 |
| Re-validating full body of `constitution.md` (frozen history; domain discovery harvested, not re-litigated) | §5 non-goal; §0 | §5; §0 |

### Success signal

| SPEC element | Captured in PRD | Where |
|---|---|---|
| Headline success signal (live session → record discovered state, generate working TS script, answer proposed-edge graph query — all from the corpus, no hand-written script in the loop) | Quoted near-verbatim | §7 (headline) |

### Assumptions

| SPEC assumption | Captured in PRD | Where |
|---|---|---|
| Playwright over CDP against live authenticated app, read-only; AI reads DOM/aria via Playwright MCP | §2.3 persona; §6.1; Feature-NFRs ("Read-only against the live app…never submits orders"); §9 (§6.1 assumption) | §2.3; §6.1; Feature-NFRs; §9 |
| Initial corpus target is Kraken Pro (discovered FSM in `constitution.md`) | §6.1; §6.2 ("single: Kraken Pro"); §9 | §6.1; §6.2; §9 |
| MBT/MDD lineage: model drives scenario generation; artifacts derived from the model | Glossary (Scenario: "Generated from the model"); §1; JTBD-4 | §3; §1; §2.1 |

### SPEC Open Question
- Cognitive-load measurement: not a priority, deferred, method un-researched → §8 OQ-6; §6.2; §7 (SM-C4). ✓

### Companion `state-granularity.md`
- Classification rules (URL→state; state/contract/parameter/ignore table; four-concepts; dialog = nested state) → carried by **reference**: Glossary (State: "Classified per the rules in `state-granularity.md`"), FR-1(c) ("classification follows the rules in `state-granularity.md`"), SM-1. No detail is silently dropped; the PRD defers to the canonical companion as the SPEC itself does. Low-severity observation only.

## (b) Gaps

1. **"English strictly" constraint not stated in the PRD.** The companion half of that constraint ("shared validator", never "aspect") is captured in the Glossary, but the language constraint itself appears nowhere in the body or addendum. All PRD content is in English, so it is not violated — merely unstated. Recommend one line in the Glossary or §4 NFRs.
2. **Addendum §5 "delivering — 1–2 weeks from zero to a working demo"** sits in tension with the SPEC non-goal "not a 1–2-week demo race". The PRD body preserves the non-goal faithfully (§5), and the addendum's line is interview-showcase signalling (consistent with JTBD-5's career framing), so this is a **narrative tension, not a body contradiction** — flag only so the non-goal isn't accidentally read as vacated by the addendum.
3. **Companion granularity detail preserved only by reference.** The four-concepts (STATE/CONTRACT/SCENARIO/PARAMETER) and "dialog = nested state" rules are not restated in the PRD body; capture relies entirely on FR-1(c)/Glossary/SM-1 pointing at `state-granularity.md`. Acceptable per the SPEC's own reference chain, but any future edit that moves classification rules out of that companion would silently change the contract. No action required now.

## (c) Contradictions

- **None in the PRD body.** Every SPEC capability, constraint, non-goal, success-signal element, and assumption is captured — verbatim, paraphrased, or by reference — and nothing is contradicted in `prd.md`.
- **Soft tension in addendum only:** the "1–2 weeks from zero to a working demo" interview signal (addendum §5) vs SPEC non-goal "portfolio/deadline framing" (see Gap 2). Contained to the addendum; the PRD body is clean.
- No SPEC content found to be silently dropped.
