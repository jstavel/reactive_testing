# Structure Review — PRD + Addendum (2026-08-15)

Lens: **structure** (section ordering/grouping, feature grouping, hierarchy, body↔addendum separation, redundancy/misplacement/missing sections).
Source: `prd.md` (243 lines), `addendum.md` (41 lines), against the `bmad-prd` Essential Spine template.

**Verdict:** SOUND — the Essential-Spine is used with judgment (not checkbox style), section order and feature nesting are coherent, and the body↔addendum boundary is respected with only one leak. No criticals. The main defect is a misfiled cross-cutting block and a few stale cross-references/anchors.

---

## High

### H1 — Global NFRs filed under §4 under a self-contradictory heading
- **Location:** §4, `### Feature-specific NFRs (all features)` (lines 161–165)
- **What's wrong:** Three system-wide constraints (Determinism, Type-safety gate, Read-only against the live app) are parked as the last "feature" of §4, under a heading that is internally contradictory ("feature-specific" × "all features") and that the template reserves for *inline per-feature* NFRs. 4.1 and 4.2 each carry a legit inline `**Feature-specific NFRs:**` line (95, 112); the trailing block is a different scope (cross-cutting) wearing the same label. A reader scanning §4 for feature detail hits a global-constraints wall, and the template's Adapt-In menu has an exact home for this content ("Cross-Cutting NFRs").
- **Suggested fix:** Move the three bullets to a dedicated **Cross-Cutting NFRs** section (Adapt-In placement — e.g. directly after §4, before §5 Non-Goals, or folded into §6 MVP Scope), and rename the heading accordingly. Keep the inline feature NFRs (4.1, 4.2) where they are.

---

## Medium

### M1 — §4 intro claims global numbering "FR-1…FR-19"; the body only contains FR-1…FR-13
- **Location:** §4 intro (line 78)
- **What's wrong:** "FRs are numbered globally (FR-1…FR-19)" — verified: the highest FR in the document is FR-13; the string "FR-19" appears *only* in this intro line. The range claim is stale (likely a carry-over from a longer SPEC FR list) and misleads downstream artifacts that rely on the declared numbering.
- **Suggested fix:** Correct to "FR-1…FR-13", or if SPEC FRs beyond 13 were intentionally trimmed from this PRD, say so explicitly.

### M2 — JTBD-5 leaks interview/showcase content into the body, contradicting §0's boundary declaration
- **Location:** §2.1, JTBD-5 (line 33)
- **What's wrong:** §0 promises "Interview/showcase narrative lives in `addendum.md`, never in this body." JTBD-5 ("Prove to hiring teams… one project that maps to six of seven target roles") is precisely the role-mapping/showcase material the addendum §5 (role-value map + interview checklist) exists to hold. The hiring-teams/role-count framing is narrative, not a product need.
- **Suggested fix:** Keep a career JTBD if wanted (template explicitly allows "for me as the builder"), but strip the hiring-team/role-count specifics; let the addendum carry that mapping. Alternatively move the "six of seven target roles" detail into addendum §5.

### M3 — §0 claims assumptions are "tagged inline"; §9 indexes assumptions the body never states
- **Location:** §0 (line 13), §9 Assumptions Index (lines 235–243)
- **What's wrong:** Verified: there are **zero** inline `[ASSUMPTION: …]` tags in the body, so the §0 "tagged inline and indexed" claim (template boilerplate) does not describe the document. Relatedly, several §9 entries point at sections that never state the assumption — e.g. "§6.1 — Playwright over CDP against the live authenticated Kraken Pro app" (CDP appears nowhere in §6.1; it surfaces only in addendum §5) and "§4.6 — one fact may legitimately differ across views…" (the pending-vs-settled nuance is not stated in Feature 4.6's description).
- **Suggested fix:** Either add inline `[ASSUMPTION: …]` tags at the anchor points (preferred), or reword §0 to "assumptions collected in §9" and re-anchor the two entries above to locations that actually state them (or add the statements there).

### M4 — Cognitive-load deferral cross-referenced as "FR-11", but the deferral lives in Feature 4.4's description
- **Location:** §6.2 (line 198), §7 SM-C4 (line 222)
- **What's wrong:** Both reference "(FR-11)" / "(FR-11 note)" for the cognitive-load deferral. FR-11 is "Standing reachability invariant"; the cognitive-load note sits in **Feature 4.4's Description** ("Cognitive-load comparison is a derived benefit of the model, not a deliverable"). The anchor is wrong, and "FR-11 note" doesn't exist. Downstream readers navigating FR-11 will find nothing about cognitive load.
- **Suggested fix:** Re-anchor both references to "Feature 4.4" (or add the note as an explicit FR-level "Out of Scope"/"Notes" line and then reference it).

---

## Low

### L1 — §8 Open Questions contains a RESOLVED entry
- **Location:** §8, Open Question 4 (line 229)
- **What's wrong:** Q4 is tagged "RESOLVED" with its resolution already stated in §1 and §6.1. An "Open Questions" section that includes settled items weakens the section's meaning (future tickets / follow-up research). With the resolution stated twice elsewhere, the entry is redundant.
- **Suggested fix:** Drop Q4, or if the decision trail must be preserved, move it to a short "Resolved / decisions" note at the end of §8 (or a decision-log line under §6.1).

### L2 — Cognitive-load deferral restated four times in the body while §1 claims it is "kept out of this body"
- **Location:** §1 (line 21), §4.4 Description (line 131), §6.2 (line 198), §7 SM-C4 (line 222)
- **What's wrong:** §1 says the focus-mode idea is "deliberately kept out of this body," but the deferral is restated in three more places. It's coherent content each time, but the repetition plus the §1 phrasing creates a mild internal contradiction and invites drift.
- **Suggested fix:** Consolidate to the Feature 4.4 note plus the SM-C4 counter-metric; §1 keeps only the one-line pointer to the addendum.

### L3 — Mobile/Appium boundary stated three times without cross-links
- **Location:** §2.2 Non-Users (line 39), §5 Non-Goals (line 178), §8 Open Question 7 (line 232)
- **What's wrong:** One decision (desktop-web-only in v1, Appium/TestDriver undecided) framed in three sections with no cross-reference; each is defensible, but the triplication invites divergence when the decision moves.
- **Suggested fix:** Acceptable as-is; consider cross-linking (e.g. Non-Goals → §8 Q7) so a later change updates all three.

---

## Not flagged (checked, judged fine)

- **Spine order (0→9)** matches the Essential Spine exactly; all nine sections present, in template order.
- **Heading hierarchy** consistent within each file: `#` title / `##` spine / `###` feature / `####` FR in the PRD; `##` in the addendum.
- **Feature grouping (4.1–4.6)** coherent — FRs nest logically under their feature, UJ mappings are accurate, and the "Realizes UJ-x" discipline is followed.
- **Addendum separation** — one-directional references maintained (body→addendum for narrative; addendum→"PRD Feature 4.6"). Only the JTBD-5 case (M2) crosses the line.
- **§4.6 SPEC-capability gap** ("SPEC stops at CAP-5") — handled with an explicit `[NOTE FOR PM]` and Open Question 1; not a defect.
- **§2.3 lighter-weight UJs** — the lighter scope dial is explicitly justified ("one operator role") and matches the template's scope-dial guidance.
- **§6.2 / §8 CI-CD and RAG duplication** — acceptable: scope statement vs. open question are distinct jobs.
