# Prose Review — prd.md + addendum.md (2026-08-15)

Lens: prose only (clarity, word choice, voice, jargon density, tone consistency, typos, boilerplate). No structural or product-decision commentary.

Verdict: Strong, purposeful prose — active voice dominates, vocabulary is mostly glossary-anchored, and the "shared validator / never aspect" rule is honored in both documents. Issues are localized precision slips rather than systemic. One high (term overload of "model" inside the central anti-hallucination thesis), four mediums, fourteen lows. Recommend accept with targeted edits.

Severity counts: critical 0 · high 1 · medium 4 · low 14 · total 19

---

## Critical

(none)

---

## High

### H1. Term overload: "the model" contradicts its own glossary in the thesis sentence
- **Location:** §1 Vision, "The division of labor…" paragraph
- **Problematic wording:** "…you make hallucination structurally harmless by moving truth out of the model and into artifacts it cannot rewrite — real snapshots, human-declared spec, deterministic validators."
- **Problem:** Glossary §3 defines "Spec — The formal model of the application" and "model" = FSM throughout the document. Read against that anchor, "moving truth **out of the model**" claims truth is moved out of the very artifact the PRD says *is* the truth. The intended referent is the AI's neural model, but the sentence never names it. The same ambiguity recurs in §9 ("truth lives outside the model") and, more mildly, in FR-3 ("the model's prior"). This is the central claim of the PRD; precision here is not optional.
- **Suggested rewrite:** "…you make hallucination structurally harmless by moving truth into artifacts the AI cannot rewrite — real snapshots, human-declared spec, deterministic validators — so the AI has nothing left to invent." (Optionally, first use of "model" in §1 could carry the qualifier "the AI's model," reserving bare "model" for the FSM.)

---

## Medium

### M1. Unexplained jargon in a core requirement: "the model's prior"
- **Location:** FR-3, Dedup query against the corpus
- **Problematic wording:** "the answer is sourced from the corpus, not the model's prior."
- **Problem:** "Prior" is Bayesian term-of-art; combined with the §3 definition of "model" as the FSM, the phrase implies the FSM has a "prior," which is meaningless. It means the AI's pretrained knowledge.
- **Suggested rewrite:** "the answer is sourced from the corpus, not the AI's prior knowledge."

### M2. "Non-Users" heading undercut by "PM/PO as primary authors"
- **Location:** §2.2 Non-Users (v1), first bullet
- **Problematic wording:** "PM/PO as primary authors — they review and adjudicate via Gherkin; the QE authors scenarios (AI proposes, QE owns)."
- **Problem:** Listed under "Non-Users," the phrase "PM/PO as primary authors" reads as asserting the opposite of what is meant. The point is that the *PM/PO-as-primary-author* posture is a non-user; the actual PM/PO role is reviewer. As written, the sentence first contradicts its heading, then corrects itself.
- **Suggested rewrite:** "PM/PO as primary authors — in v1 the PM/PO does not author scenarios; they review and adjudicate via Gherkin. The QE authors scenarios (AI proposes, QE owns)."

### M3. Wrong subject-verb agency: "the corpus carries a standing invariant"
- **Location:** §4.6 Cross-Surface Consistency, Description
- **Problematic wording:** "The corpus carries a standing invariant that every surface showing the same fact agrees…"
- **Problem:** The corpus is recorded data; a validation rule is applied *to* it, not carried *by* it. The sentence gives agency to data. The glossary's own definitions distinguish "corpus" (data) from "validation rule" (check applied to corpora).
- **Suggested rewrite:** "A standing invariant requires every surface showing the same fact to agree — e.g. current balance, or the state of an open order, on every screen that displays it."

### M4. Elliptical metaphor: "journeys are shown at lighter weight"
- **Location:** §2.3 Key User Journeys, persona blockquote
- **Problematic wording:** "One operator role, so journeys are shown at lighter weight — entry, path, climax, resolution."
- **Problem:** "Shown at lighter weight" is an under-specified metaphor (lighter than what?); the dash-list then does the explaining the verb should have done. The sentence costs more to parse than the meaning is worth.
- **Suggested rewrite:** "With a single operator role, the journeys are kept light — each rendered as entry, path, climax, resolution."

---

## Low

### L1. Term inconsistency: "filter combo" vs "filter-combobox"
- **Location:** UJ-1, §2.3 (also memlog-sourced prompt)
- **Problematic wording:** "…for using the filter combo."
- **Problem:** The surrounding prose and §4.1/§9 standardize on "filter-combobox." If the prompt text is verbatim from the recording, annotate it as such; otherwise unify on "filter-combobox."
- **Suggested rewrite:** "*Propose Gherkin scenarios and contracts for using the filter-combobox.*" (or add a "(verbatim)" note).

### L2. Hyphenation drift: "standing-invariant" vs "standing invariant"
- **Location:** UJ-3, §2.3
- **Problematic wording:** "a pass/fail standing-invariant check"
- **Problem:** Glossary §3 and every other occurrence (§4.4, §6.1, SM-4) use the unhyphenated "standing invariant"; only UJ-3 hyphenates.
- **Suggested rewrite:** "a pass/fail standing invariant check"

### L3. Tangled phrase repeated twice: "runnable without the framework as a runtime dependency"
- **Location:** UJ-4, §2.3; §4.5 Description
- **Problematic wording:** "runnable without the framework as a runtime dependency"
- **Problem:** The prepositional stack is hard to parse, and the document already has the clean version in SM-5 ("no framework runtime dependency"). Use it in all three places.
- **Suggested rewrite:** "runnable with no framework runtime dependency."

### L4. Awkward collocation: "passes a human adjudication between"
- **Location:** §4.3 Gherkin Governance, Description
- **Problematic wording:** "every spec change passes a human adjudication between spec drift and app bug."
- **Problem:** One does not "pass an adjudication"; one "undergoes" or "goes through" one. The fork structure is good; the verb is off.
- **Suggested rewrite:** "…and every spec change goes through a human adjudication of spec drift vs app bug."

### L5. Non-parallel list: "proposed missing edges" vs "standing invariants that…"
- **Location:** §4.4 Graph as Product Artifact, Description
- **Problematic wording:** "Two query classes in v1: proposed missing edges (with reasoning) and standing invariants that critical tasks remain reachable from every important state at comparable cost."
- **Problem:** First item is a noun phrase, second is a noun + that-clause. Reading is bumpier than it needs to be.
- **Suggested rewrite:** "Two query classes in v1: proposed missing edges (with reasoning) and standing reachability invariants over critical tasks."

### L6. Redundant "derived byproducts"
- **Location:** §0; §1
- **Problematic wording:** "test scripts are derived byproducts" / "test scripts become derived byproducts"
- **Problem:** "Byproduct" already encodes "derived." The adjective doubles the meaning.
- **Suggested rewrite:** "test scripts are byproducts" / "test scripts become byproducts the machine generates and executes."

### L7. Verb phrase ambiguity: "the same missing edges the graph queries surface"
- **Location:** §1, "The model is never captured whole" paragraph
- **Problematic wording:** "its gaps are visible as the same missing edges the graph queries surface (FR-10)"
- **Problem:** Reads two ways: the queries surface the edges, or the edges surface in the queries. The subject-verb is ambiguous mid-sentence.
- **Suggested rewrite:** "its gaps are visible as the same missing edges the graph queries expose (FR-10)."

### L8. Boilerplate repetition: "the pattern generalizes to any surface"
- **Location:** §4.1 Description; §9 assumption for §4.1
- **Problematic wording:** "the pattern generalizes to any surface" (twice, near-verbatim)
- **Problem:** The §9 assumptions index is allowed to restate, but the §4.1 sentence is redundant with the preceding "The canonical trigger is…" and adds nothing about the FSM. (Noted: reconcile-constitution already flags the deeper point that only the filter trigger is carried.)
- **Suggested rewrite:** In §4.1, cut the sentence; §9 retains the generalization.

### L9. Truth-terms not anchored in one place
- **Location:** §1, §3
- **Problematic wording:** "served from one truth," "Machine truth (SSOT)," "source of truth," "human truth," "the single source of truth"
- **Problem:** Five variants of the same concept. Glossary defines "machine truth (SSOT)" but not the relation of "one truth"/"human truth." Each variant is defensible; a one-line map in §3 would settle it (e.g. "truth" = SSOT; "human truth" = the spec's human-readable dialect).
- **Suggested rewrite:** Add to the Glossary's Spec entry: "the one truth; Gherkin is its human dialect, FSM+contracts its machine dialect."

### L10. "A proposed new edge" — redundancy
- **Location:** FR-10
- **Problematic wording:** "produce a proposed new edge/shortcut with reasoning."
- **Problem:** "Proposed" and "new" both signal non-existence; one suffices.
- **Suggested rewrite:** "produce a proposed edge/shortcut with reasoning."

### L11. §0 closing sentence reads as table-of-contents furniture
- **Location:** §0 Document Purpose, last sentence
- **Problematic wording:** "Glossary-anchored vocabulary; features grouped with FRs nested; assumptions tagged inline and indexed in §9."
- **Problem:** Telegraphic, meta-referential; unlike the rest of §0's flowing sentences. It is true but reads like a checklist note, not a purpose statement. Either fold into the prose ("Vocabulary is glossary-anchored, features group their FRs, and assumptions are tagged inline and indexed in §9") or move to a "how to read this document" note.
- **Suggested rewrite:** "Vocabulary is glossary-anchored, each feature nests its FRs, and assumptions are tagged inline and indexed in §9."

### L12. Addendum: "Kraken Pro's job asks for proof of trading knowledge"
- **Location:** Addendum §4
- **Problematic wording:** "Kraken Pro's job asks for proof of trading knowledge."
- **Problem:** "Kraken Pro's job" is ambiguous between the app and the role; the sentence reads as if the platform has a job application.
- **Suggested rewrite:** "The Kraken Pro role asks for proof of trading knowledge."

### L13. Addendum: "trading intuition trained like GTD"
- **Location:** Addendum §4, Discipline training
- **Problematic wording:** "trading intuition trained like GTD: build the system, trust it, get in the zone"
- **Problem:** GTD is a system, not a trainer; "trained like GTD" is loose. The colon-list is good.
- **Suggested rewrite:** "trading intuition trained the GTD way — build the system, trust it, get in the zone (Mark Douglas, *Trading in the Zone*; David Wise; Wyckoff)."

### L14. Addendum: legacy term "interceptor chain" outside the glossary vocabulary
- **Location:** Addendum §5, Role-value map (Senior QA engineer row)
- **Problematic wording:** "Spec-driven types, interceptor chain, snapshot-driven generation, MBT/FSM"
- **Problem:** "Interceptor chain" is not defined in the PRD glossary and descends from the AOP/aspect lineage the glossary explicitly bans ("Use this term, never 'aspect.'"). If it names a real mechanism (the CDP/interceptor layer), define it or map it to a glossary term; otherwise the addendum reintroduces the vocabulary drift the glossary rule exists to prevent.
- **Suggested rewrite:** "Spec-driven types, corpus/collector pipeline, snapshot-driven generation, MBT/FSM" — or define "interceptor chain" once in the glossary.

---

## Tone note (informational, no action)

The PRD body and addendum deliberately differ in register: the body is dense, glossary-anchored, and assertive; the addendum is conversational ("cognitive load like crazy," "the wow-demo," "hunt for"). This split is documented in §0 and the addendum header as a memlog decision and serves the stated purpose (product-clean body, interview narrative). No tone violation found; the only risk is a reader of the addendum alone missing the body's rigor, which is inherent to the two-document split, not a prose defect.
