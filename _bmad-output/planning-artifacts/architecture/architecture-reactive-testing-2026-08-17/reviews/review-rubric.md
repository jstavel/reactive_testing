# Review — "Good-Spine Checklist" Rubric Walker

Reviewer role: independent architecture reviewer
Subject: `ARCHITECTURE-SPINE.md` (architecture-reactive-testing-2026-08-17)
Date: 2026-08-18
Inputs skimmed for coverage context (not re-reviewed): `SPEC.md`, `prd.md`, `project-context.md`, `state-granularity.md`
Related artifact: `review-version-reality.md` (stack/version check — item 4 already covered there)

## Verdict

**CONDITIONAL — do not cut epics/stories until F1–F5 are resolved.** The spine's core (AD-1..AD-18) is coherent, enforceable, and ratifies the SPEC/PRD well. But the newly-added AD-19 introduces an SSOT ambiguity against the "Model is SSOT / Gherkin is never SSOT" rules (F1) and its `PlanId` typing of a Gherkin tag is not mechanically enforceable (F2). AD-11 defers an entire SPEC capability (CAP-4) that the source inputs and the SPEC success signal require (F3); AD-3 contradicts the in-scope FR-13 (F4); and the operational/environmental envelope is left largely silent (F5). These are real divergence points for the level below.

---

## Findings

### F1 — HIGH — AD-19 + FR-14 creates an SSOT ambiguity; plan assignment lives in Gherkin, contradicting AD-1 / AD-9 / FR-9

- **Checklist items:** 2 (enforceable & prevents divergence), 5 (ratifies sources), 7 (no AD weakens inherited decision) + the AD-19/FR-14 special attention.
- **Evidence:**
  - AD-19 Rule: "A scenario carries a single QE-specified plan assignment (a `@plan:<id>` tag in its `.feature`, typed as `PlanId` in schemas.ts). … Plan membership is regenerable from scenario assignments."
  - AD-1: "The Model … is the single source of truth … Gherkin is an input interface. Test plans are derived artifacts."
  - AD-9: "No parser, no processing layer … Primary role: input." FR-9: "Gherkin is a query/input layer; it is never silently edited and never treated as the source of truth … Gherkin artifacts are derived and regenerable."
- **Reasoning:** The scenario→plan assignment has **no home in the Model** — its only record is the `@plan:<id>` tag in the `.feature`. That makes Gherkin the de-facto SSOT for plan membership, which directly contradicts AD-9/FR-9 ("Gherkin is never the SSOT"). Simultaneously, FR-9 says Gherkin is "derived and regenerable" — but since the Model does not store plan assignment, regenerating Gherkin from the Model would silently drop the assignment. So either (a) Gherkin is the SSOT (violating AD-1/AD-9/FR-9), or (b) plan assignments are losable. The PRD/SPEC constraint "Test plans are … derived from the model" is also undercut: plan membership is actually derived from Gherkin tags, not the Model. This is the exact SSOT ambiguity the rubric asks about — confirmed.
- **Suggested fix:** Give plan assignment a Model-side canonical home. Preferred: store `planId` (typed `PlanId`) as scenario metadata in the Model (`schemas.ts`/`contracts.ts`), making the Model the SSOT for membership; the `@plan:<id>` Gherkin tag becomes a transient input the AI Agent writes into the Model (consistent with AD-10 "proposes"). Then "membership is regenerable" is unambiguous: regenerable *from the Model*. Alternative (weaker): explicitly declare Gherkin `.feature` (or a separate testware manifest) a second SSOT surface *for testware metadata only* and amend AD-1/AD-9 to carve out that exception. Either way, state in AD-19 what "regenerable from scenario assignments" is regenerable *from*.

### F2 — MEDIUM-HIGH — AD-19's Rule is not mechanically enforceable; the `@plan:<id>` tag is "typed as PlanId" but nothing validates Gherkin

- **Checklist item:** 2.
- **Evidence:** AD-19 says the tag is "typed as `PlanId` in schemas.ts"; AD-9 says Gherkin has "no parser, no processing layer"; the Consistency Conventions gate (`tsc --noEmit`) only covers TypeScript.
- **Reasoning:** `.feature` files are plain text — `tsc`/Zod never see them. A `@plan:performance` tag, a missing tag, or multiple tags will not be caught by any mechanical gate; the closed-union `PlanId` and "single assignment" guarantees are enforced only by the AI Agent's discretionary behavior. AD-10 (human review) and "proposes, never silently chooses" reduce but do not eliminate the risk. This is a real divergence point: two units (the authoring AI vs. a downstream consumer) can disagree on what a valid plan tag is with nothing to fail loudly.
- **Suggested fix:** State the enforcement point explicitly. Either (a) move assignment into the Model (F1) where `PlanId` is mechanically enforced by `tsc`/Zod, or (b) declare the AI Agent the sole reader/validator of Gherkin and make it reject non-`PlanId`, missing, or multiple `@plan` tags at authoring time (a behavior contract, not a type contract). Do not leave "typed as PlanId" as an unsupported claim.

### F3 — MEDIUM — AD-11 defers CAP-4 (FR-10/FR-11) to v1.1, contradicting the SPEC capability, PRD §6.1 In-Scope, and the SPEC success signal

- **Checklist items:** 5, 6.
- **Evidence:** AD-11 Rule: "FR-10 … and FR-11 … are deferred to v1.1. The PRD §6.1 lists them as In Scope; the spine defers them. PRD/SPEC need updating to match." Capability map: "CAP-4 — Graph as Product Artifact | (deferred — Graph Query Engine) | AD-11." SPEC success signal: "a proposed-edge graph query is answered — all from the corpus." PRD §6.1 lists graph queries In Scope.
- **Reasoning:** The spine binds CAP-4 in frontmatter but maps it to "(deferred)", knowingly contradicting two source inputs and the SPEC's own success signal. Deferring an entire capability at spine altitude while the SPEC still promises it is a genuine source-of-truth conflict: the level below cannot tell whether CAP-4 is build or not, and the PRD/SPEC "need updating to match" is an unfulfilled, unowned action.
- **Suggested fix:** Pick one and reconcile now. Either (a) keep CAP-4 in v1 with a real AD (a minimal Model-reading Graph Query player; defer only *depth* — cognitive-load — not the whole capability), or (b) formally update SPEC + PRD to move CAP-4/FR-10/FR-11 to v1.1 and revise the success signal before epics are cut. Do not ship a "bound but deferred" capability with an outstanding "update the sources" note.

### F4 — MEDIUM — AD-3 "Validators are per-contract for MVP" contradicts the in-scope FR-13 (cross-view invariant)

- **Checklist items:** 5, 7.
- **Evidence:** AD-3: "Validators are per-contract for MVP. Cross-state invariants and other validation types emerge from implementation." FR-13 (bound in frontmatter) is In-Scope per PRD §6.1; a cross-view standing invariant is inherently cross-state/cross-surface, not per-contract. The Deferred table flags the CAP-6-vs-CAP-2 decision (OQ-1) but never reconciles AD-3 with FR-13.
- **Reasoning:** AD-3's "per-contract for MVP" language rules out the very validator FR-13 requires. AD-18 (state-reuse) gestures at cross-state validators ("one navigation funds N validators"), but AD-3 and AD-18/F-13 are left in tension. Downstream stories for FR-13 will inherit a contradictory rule.
- **Suggested fix:** Restate AD-3 to allow cross-surface validators as first-class MVP members while preserving the pure-function + corpus-only guarantees (FR-5/FR-13 already constrain them), or explicitly scope FR-13 out of MVP and update PRD/SPEC. Resolve OQ-1 in the spine (see F7) as the prerequisite.

### F5 — MEDIUM — Operational/environmental envelope is largely silent (item 8 finding)

- **Checklist item:** 8.
- **Evidence:** The spine decides language/stack, file layout, player ownership, data contracts, naming, scope — but the operational/environmental dimension is nearly absent. The only mentions are "CI/CD integration shape — deferred" and "Model↔app synchronization (drift detection) — open question."
- **Reasoning:** Unaddressed: target environments (where the authenticated Kraken Pro session runs — local dev vs. CI), authenticated-session provisioning / secrets (the spine assumes a "live authenticated Kraken Pro app" but never says how the Orchestrator obtains a session across environments), and corpus/report storage + retention (AD-15 namespaces files but does not fix storage or cleanup). These are genuine divergence points: the Orchestrator/Collector units and any infra/CI unit will disagree on environment and credentials. This is the exact "whole dimension left silent" case the rubric names.
- **Suggested fix:** Add at least one AD (or "Decided" convention row) fixing: environment tiers (local-only for v1? CI deferred explicitly?), authenticated-session provisioning (Playwright storage-state/context reuse vs. fresh login), and corpus/report storage + retention. Mark everything else as open questions rather than leaving the dimension silent.

### F6 — LOW — AD-4 vs AD-19 define two unreconciled "Test Plan declares X" shapes

- **Checklist item:** 1 (missed divergence point).
- **Evidence:** AD-4: "The Test Plan declares: path (FSM states), collection (what data), validators (what to run)." AD-19: "Each plan declares `planId`, `modelVersion` (per AD-17), and the scenario ids it covers."
- **Reasoning:** The two field lists are never merged into one canonical `*.test-plan.ts` shape. Is a plan a flat `{path, collection, validators}` or a list of `scenarios[]` each carrying those? Story authors will invent the schema and diverge. Both are individually consistent with "named plural plans," so this is an ambiguity, not a contradiction.
- **Suggested fix:** Add one canonical field list for the test-plan file (e.g., `planId`, `modelVersion`, `scenarios[]` where each scenario carries `path` + `collection` + `validators`), in schemas.ts or a Consistency Conventions row, and have AD-4 and AD-19 both point at it.

### F7 — LOW — Open questions deferred without owners or decision points gate other ADs

- **Checklist items:** 1, 8.
- **Evidence:** Deferred table carries OQ-1 (CAP-6 vs CAP-2), FR-11 operationalization, and Model↔app drift detection as "deferred"/"open question," but the spine is itself the planning substrate deliverable.
- **Reasoning:** OQ-1 gates F4 (AD-3 vs FR-13) and F3 (CAP-4 scope); leaving it to "planning" leaves the level below without a resolved rule. "Model↔app synchronization" is a real divergence point between Model truth and app reality that AD-17 (plan↔model pin) does not cover. These are not "silent" (they are named), so this is lower severity — but they lack a decision or an owner.
- **Suggested fix:** Decide OQ-1 in the spine (nesting under CAP-2 is the cheapest coherent answer and matches PRD §4.6's own note). Give FR-11 operationalization and drift detection explicit v1.1 owners, not bare "deferred."

### F8 — LOW — `sources:` / `companions:` frontmatter paths are broken (double `_bmad-output` prefix)

- **Checklist item:** 5 (traceability).
- **Evidence:** `sources:` lists `../../../_bmad-output/planning-artifacts/prds/...` and `../../../project-context.md`. From the spine directory, `../../../` already reaches `_bmad-output/`, so `../../../_bmad-output/...` resolves to `_bmad-output/_bmad-output/...` (nonexistent), and `../../../project-context.md` resolves to `_bmad-output/project-context.md` (nonexistent — the real file is at repo root).
- **Suggested fix:** Correct the relative paths (e.g., `../../prds/prd-reactive-testing-2026-08-15/prd.md`, `../../specs/spec-reactive-testing/SPEC.md`, and `../../../../project-context.md` to repo root).

---

## Rubric items not separately flagged (for completeness)

1. **Fixes the real divergence points / misses none** — AD-1..AD-18 cover the Model/corpus/orchestration/collector/validator/reporter/repro boundaries cleanly; the missed points are F1 (plan-assignment SSOT) and F6 (test-plan schema shape). Item otherwise passes.
4. **Named tech verified-current** — covered by `review-version-reality.md`: TypeScript 7.0.2, Node 24.13.1, Playwright 1.62.1 all real/current; Zod unpinned is acceptable. No action beyond that review's advisories.
6. **Covers CAP-1..CAP-5** — CAP-1/2/3/5 are governed; CAP-4 is only "covered" by being deferred (see F3).

## Positives (recorded for fairness)

- AD-1..AD-18 are individually enforceable, non-overlapping, and ratify the SPEC/PRD vocabulary ("shared validator" not "aspect", English strictly, read-only v1 scope, one-format-per-file).
- AD-17 (Model version pinning) is a sound determinism guard and AD-19 correctly reuses it via `modelVersion`.
- The smoke/regression/acceptance taxonomy matches PRD §3 glossary and §4.8 exactly — no drift there.
- AD-19's "proposes, never silently chooses" is consistent with AD-10 (AI proposes, human reviews), and its "Prevents" clause names three real divergence risks.
- Naming conventions and the Structural Seed are internally consistent (collectors ↔ corpus dirs ↔ AD-13 types all align).
