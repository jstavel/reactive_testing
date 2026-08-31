---
title: 'Story 3.1: Machine-compatible contracts + a per-contract validator interpreter'
type: 'feature'
created: '2026-08-30'
status: 'done'
review_loop_iteration: 0
baseline_commit: '917bb3ee94fe91f752193825ef9b541c9d7e8573'
context:
  - _bmad-output/planning-artifacts/epics/epics.md
  - _bmad-output/planning-artifacts/architecture/architecture-reactive-testing-2026-08-17/ARCHITECTURE-SPINE.md
  - _bmad-output/implementation-artifacts/spec-2-7-capture-the-evidence-validators-need.md
---

## Intent

**Problem:** The model's contract declarations are in the wrong dialect. `contracts.ts` carries `preconditions` / `postconditions` / `invariants` as **prose strings** — *"History page is displayed at /app/history/main/ledger"* — which is the human dialect, not the machine dialect that AD-1 assigns to the model ("FSM/contracts are the machine truth"). Those strings were a Story 1.2 placeholder (the runtime didn't exist yet). Now that verification is being built, the model must hold **machine-compatible declarations**; the human-readable sentence belongs to the Gherkin layer, linked by the QE-adjudicated trace (FR-2, FR-9), never as a second source of truth.

**Approach:** Make each contract's `preconditions` and `postconditions` **structured, machine-compatible declarations** — typed predicate objects (a small, closed vocabulary) validated by Zod — replacing the prose strings. `invariants` are **out of scope**: they are standing/cross-view properties (AD-3, FR-13) and belong to Epic 4 (Story 4.2), not a per-contract migration. Then introduce a **per-contract `validatorMap`** that is a *thin interpreter*: it evaluates each predicate against the recorded corpus and returns a conforming `ValidationResult` (AD-14). There is one machine declaration, one interpreter, and the human string is a derived Gherkin rendering — which removes the drift risk of a string-oracle plus a parallel re-encoding.

The predicate form chosen (per constitution #5 *"Postconditions = Malli schema"*, carried into the project's Zod stack): a closed set of typed expectations, e.g.

```ts
{ assert: "state-is", stateId: "historyMain" }
{ assert: "url-is",   url: "/app/history/main/ledger" }
{ assert: "view-selected", view: "ledger" }
```

Matching semantics: `url-is` compares the recorded snapshot `url` by **pathname equality** (`new URL(snapshot.url).pathname === predicate.url`); `state-is` compares the snapshot `stateId`; `view-selected` compares the probe value.

## Boundaries & Constraints

**Always:**
- `contracts.ts` `preconditions`/`postconditions` become machine-compatible declarations (typed predicate objects), not prose strings. `invariants` are out of scope (Epic 4). The predicate vocabulary is a **closed union** declared in `schemas.ts` and Zod-validated (AD-13).
- Phase is determined by which array a predicate sits in: `preconditions` are evaluated against the **pre-step** snapshot, `postconditions` against the **post-step** snapshot (both recorded by Story 2.7).
- A `Validator` is a pure function `(corpus) => ValidationResult` with **no `Page` and no browser access** (FR-5, NFR-1). Same corpus → same result.
- `ValidationResult` conforms to `validationResultSchema` (`contractId`, `passed`, `details?`, `corpusRefs`) — already in `model/schemas.ts:114-125` (AD-14).
- The `validatorMap` is a **thin interpreter** over the declarations, keyed by `contractId`, living outside the model hash (symmetric to `orchestrator/action-map.ts`). Editing the *interpreter* never bumps `modelVersion`; editing a *declaration* in `contracts.ts` does — correctly, since it changes the contract's meaning (AD-17).
- Validators read the corpus and never write to the Model (AD-2). The human string lives in the Gherkin layer as the trace (FR-9); the model holds no prose oracle.
- NFR-2 gate: `tsc --noEmit` clean and `npm test` green before done.

**Ask First (HALT):**
- **Exact predicate vocabulary.** Default: `state-is`, `url-is`, `view-selected`, plus `dialog-open`/`dialog-closed` for the dialog contracts. The vocabulary is constrained by what the corpus actually records — see the corpus-sufficiency note.
- **Corpus sufficiency.** Resolved — **extend collectors first** (human decision). Story 2.7 records the page URL on every snapshot and the selected view via the probe collector, so `url-is` and `view-selected` have evidence. The full vocabulary (`state-is`, `url-is`, `view-selected`, `dialog-open`, `dialog-closed`) is in scope; 3.1 is sequenced after 2.7.
- **Module location.** Default: a new top-level `validators/` directory (sibling to `collectors/`), with `validator-map.ts` (interpreter) and the predicate schema in `model/schemas.ts` (AD-13 single home).
- **Which seed contract.** Default: one nav contract (`clickHistoryMenuMain`), migrated to `state-is` + `url-is` postconditions, checked end-to-end against a fixture corpus (URL now captured by Story 2.7).

**Never:**
- No `Page`/browser object reaches a validator (FR-5); validators cannot re-navigate.
- Do not put the human prose back into `contracts.ts`/`fsm.ts`/`schemas.ts`; the prose is Gherkin-layer only (FR-9).
- Do not build the reporter, Gherkin rendering (Story 3.4), or the adjudication flow (Story 3.5).
- Do not have validators write to the corpus or the Model (AD-2).
- Do not consume `failures` (Story 2.7) beyond what the seed validator demonstrates.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| VALIDATOR_PURE | Same corpus twice | Identical `ValidationResult`; no browser access | N/A |
| CONTRACT_SATISFIED | Corpus where the post-action state matches the declaration | `passed: true`, `corpusRefs` listing the evidence read | N/A |
| CONTRACT_VIOLATED | Corpus where the postcondition is unmet | `passed: false`, `details` naming the unmet predicate, `corpusRefs` listing evidence read | no throw — failure is a result |
| MISSING_EVIDENCE | Corpus lacks the evidence (e.g. failed step from Story 2.7) | `passed: false`, `details` says evidence absent | no throw |
| UNKNOWN_PREDICATE | A declaration uses a predicate outside the closed vocabulary | Rejected at Zod parse time (never reaches runtime) | type/schema error |
| UNKNOWN_CONTRACT | `contractId` absent from the map | Reported as an unvalidated gap, not silently passed | explicit gap |
| DETERMINISM | Browser closed after collection | Validator still runs offline | N/A (NFR-1) |

## Code Map

- `model/contracts.ts` — IN SCOPE: replace the prose `preconditions`/`postconditions` strings with typed predicate declarations for the seed contract (and, per Ask First, the migration extent); `invariants` stay untouched (Epic 4). The remaining prose moves to the Gherkin trace (FR-9), not here.
- `model/schemas.ts` — `validationResultSchema` already exists `:114-125`; add the closed **predicate schema** (e.g. `contractPredicateSchema` discriminated union: `state-is` / `url-is` / `view-selected` / `dialog-open` / `dialog-closed`) and the shared `Validator` type (AD-13 single home).
- `validators/validator-map.ts` (NEW) — the thin interpreter `Record<contractId, Validator[]>` over the declarations; outside the model hash, symmetric to `orchestrator/action-map.ts`. One seed validator evaluating `state-is` + `url-is`.
- `contracts.ts` (READ-ONLY note) — postcondition strings currently at `:37-41` (e.g. `clickHistoryMenuMain` → `/app/history/main/ledger`, "Ledger sub-view is selected") are the *source material* the migration translates into predicates; they are then removed from the model and kept only as the Gherkin-layer trace.
- `validators/validator-map.test.ts` (NEW) — purity/determinism, satisfied, violated, missing-evidence, unknown-predicate (Zod reject), unknown-contract gap. The no-browser guarantee is the `Validator` type itself (`(corpus) => ValidationResult`, no `Page`); no import-scan test.

## Tasks & Acceptance

**Execution:**
- [x] `model/schemas.ts` — add the closed `contractPredicateSchema` discriminated union + `ContractEvidence` + the shared `Validator` type (AD-13).
- [x] `model/contracts.ts` — migrate ALL 10 contracts' `preconditions`/`postconditions` from prose strings to typed predicate declarations (A1); remove the dead `action` field + `placeholder` (retro item-5, keep `ContractAction`); `invariants` untouched (Epic 4).
- [x] `validators/validator-map.ts` (NEW) — the thin interpreter `Record<contractId, Validator[]>` over the declarations, evaluating `state-is`/`url-is`/`view-selected` (dialog predicates report "not yet evaluatable"), returning a conforming `ValidationResult`.
- [x] `validators/validator-map.test.ts` (NEW) — purity, satisfied/violated/missing-evidence, unknown-predicate (Zod reject), unknown-contract-gap, and map-parity tests (no-browser is enforced by the `Validator` type, not an import-scan).

**Acceptance Criteria:**
- Given a recorded corpus, when a validator runs twice on it, then results are identical and no browser access occurs (FR-5), and the result conforms to `ValidationResult` (AD-14).
- Given a contract whose postcondition is now a machine declaration, when its validator runs against a corpus whose post-action state matches, then `passed: true` with `corpusRefs` naming the evidence read.
- Given a corpus whose postcondition is unmet or whose evidence is absent (e.g. a failed step), when the validator runs, then `passed: false` with `details` naming the unmet predicate — a failure is a result, never a throw.
- Given a declaration using a predicate outside the closed vocabulary, when the model is parsed, then it is rejected at schema/type time, not at runtime.
- Given a `contractId` absent from the map, when queried, then it is reported as an unvalidated gap, not silently passed.
- Given `npm run typecheck` / `npm test`, when run, then exits 0.

## Spec Change Log

- **2026-08-30** — Initial draft. Supersedes an earlier framing ("`contracts.ts` stays declarative strings as the oracle") after design review: the strings are the human dialect sitting in the machine-dialect model file; the model should be machine-compatible. Postconditions become typed predicate declarations (constitution #5 "Malli schema" → Zod); the prose string moves to the Gherkin layer as the trace (FR-9). The `validatorMap` is a thin interpreter, not a parallel re-encoding. Depends on Story 2.7 for before-state + failed-step evidence.
- **2026-08-30 (review fixes)** — bmad-review folded in: `invariants` scoped out (Epic 4); `url-is` matching pinned to pathname equality; phase (pre vs post) tied to the precondition/postcondition arrays; seed validator marked fixture-only (3.2 owns the corpus loader); no-browser enforced by the `Validator` type (import-scan test dropped); vocabulary-in-`schemas.ts` tension documented.
- **2026-08-30 (implementation)** — Implemented and verified (decisions A1 + E). Migrated all 10 contracts' pre/postconditions to typed predicates (nav → `state-is`/`url-is`/`view-selected`; dialog → `dialog-open`/`dialog-closed`, with the un-mappable prose "shows total value"/"shows sections"/"values hidden/visible" left in the Gherkin layer). Removed the dead `action` field + `placeholder` (retro item-5; kept `ContractAction`). Added `contractPredicateSchema` + `ContractEvidence` + `Validator` to `schemas.ts`; `validators/validator-map.ts` thin interpreter. Regenerated `smoke.test-plan.ts` `modelVersion` (contracts.ts + schemas.ts changed). `npm run typecheck` clean; 103 tests pass (94 → 103).

## Design Notes

- **Human dialect vs machine dialect.** AD-1 gives the model the machine truth. A prose postcondition is the human rendering of intent — Gherkin-layer material. Keeping it in `contracts.ts` made the model neither single-sourced nor machine-compatible. The fix is a one-way trace: Gherkin step (human) → QE adjudication → model predicate (machine), with Gherkin derived/regenerable (FR-9).
- **One declaration, one interpreter.** The old risk was drift between a string oracle and a separately-maintained validator. With a typed predicate declaration and a generic interpreter, there is nothing to drift: what's declared *is* what's checked.
- **`modelVersion` semantics.** Editing a *declaration* changes contract meaning → bumping the hash and invalidating plans is correct (AD-17). Editing the *interpreter* (how a predicate is evaluated against corpus evidence) does not change meaning → it lives outside the hash, like `actionMap` (retro F1). This is the principled split the earlier "strings vs functions" framing failed to express.
- **Corpus is the constraint on the vocabulary.** A predicate can only check what the corpus records. Story 2.7 (sequenced first) supplies the before/after snapshots, the page URL, and the selected-view probe, so `state-is`, `url-is`, and `view-selected` all have evidence. The vocabulary ships small and grows with the evidence.
- **A failing validator is a result, not an exception.** `ValidationResult.passed: false` is the honest output; throwing would couple verification to the run and break determinism (mirrors AD-16's gap-vs-failure separation).
- **Fixture-only in 3.1.** The seed validator runs against a hand-built fixture corpus; the real corpus loader and the `contractId → stepIndex` mapping are Story 3.2's contract. Purity is proven here; corpus wiring is proven there.
- **Vocabulary lives in `schemas.ts` (hashed) — and that's fine.** Adding a predicate *type* (vocabulary growth) is rare and changes what the model can express, so bumping `modelVersion` is correct. FR-6 ("new rule without re-run") is unaffected: it is about re-validating an already-recorded corpus, and the corpus is independent of `modelVersion`.

## Verification

- `npm run typecheck` — expected: exit 0
- `npm test` — expected: existing suites + new validator-map tests pass
