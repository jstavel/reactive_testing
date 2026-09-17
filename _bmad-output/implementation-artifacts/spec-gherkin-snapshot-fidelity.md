---
title: 'Make the Gherkin run-time snapshot faithful for outlines, tags, and scenarioId wiring'
type: 'bugfix'
created: '2026-09-16'
status: 'done'
baseline_commit: 'd4b88c5507d5907e80052a9e3f99ce78fdbecd72'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `extractScenario` only matches the `Scenario:` prefix, so `Scenario Outline:` scenarios are silently skipped from the run-time snapshot even though the end-boundary already recognises them; preceding `@` tag lines are dropped; `relationsByScenarioId` and the snapshot grouping silently overwrite on a duplicate `scenarioId`; and `scenarioId`s are hand-typed kebab-cases of their titles with no derivation check. All latent today (no feature uses outlines/tags), but each silently corrupts or degrades the report's "embedded Gherkin that was actually run" promise (CAP-4).

**Approach:** Make `extractScenario` match both scenario keywords, fold the contiguous pre-scenario `@`-tag block into the extracted block, and stop each block at the next *scenario-level* keyword (an outline's `Examples:` table belongs to the outline, so it is included). Add a `deriveScenarioId(title)` helper plus an `assertUniqueScenarioIds` guard in `model/relations.ts`, wire the guard into `relationsByScenarioId` and `buildGherkinSnapshot` so duplicate ids fail loudly instead of overwriting, and pin everything with outline/tag/derivation/dedup tests.

## Boundaries & Constraints

**Always:** Extraction stays verbatim — the returned text is the exact source slice, now including tag lines and Examples tables. Matching is by exact scenario title against the text after the keyword (`Scenario:` or `Scenario Outline:`). The tag block is the contiguous run of lines whose trimmed form starts with `@` immediately above the scenario line. End-of-block boundaries are the next `Scenario`/`Scenario Outline`/`Scenarios`/`Background`/`Feature`/`Rule` keyword line or the file end — `Examples:` no longer ends a block. Existing plain-`Scenario:` features extract byte-identically to today. `deriveScenarioId` lowercases, collapses non-alphanumerics to single `-`, and trims leading/trailing `-` — it must reproduce every seeded `scenarioId` exactly. Duplicate detection throws a named error (deterministic, mirroring ssot-guard), in both `relationsByScenarioId` and `buildGherkinSnapshot`.

**Ask First:** Changing the derivation rule (letters/digits only vs the ASCII set); making duplicate detection warn-and-continue instead of throw; any change to a seeded `scenarioId` value.

**Never:** No changes to the seeded `relations` data or their ids (all must keep deriving identically); no touching `contracts.ts`/`fsm.ts`/`schemas.ts`; no committed `.feature`/corpus fixture edits; no silent normalization of extraction output; no network/browser access.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| PLAIN_SCENARIO | `Scenario: A …` block, no tags | Block verbatim, unchanged from today | N/A |
| OUTLINE_ONLY | `Scenario Outline: A` + steps + `Examples:` table, followed by another scenario or EOF | Full block verbatim INCLUDING the Examples table; stops at the next scenario-level keyword or EOF | N/A |
| OUTLINE_EXAMPLES_NEXT | Outline followed by `Examples:` then another `Scenario:` | Outline block includes its Examples; next scenario starts a new block | N/A |
| OUTLINE_MULTI_EXAMPLES | Outline with two `Examples:` blocks | Both tables included in the one block | N/A |
| TAGS | `@feature @regression` lines directly above a `Scenario:` | Tag lines included at the top of the block, verbatim | N/A |
| TAGS_TRAILING | Tags above the LAST scenario (EOF right after steps) | Tags included; block ends at EOF | N/A |
| TAGS_ONLY_FEATURE | `@tag` above the `Feature:` line (non-contiguous with scenario) | NOT attached to the scenario (no lookback beyond the contiguous tag run) | N/A |
| MISSING_TITLE | Title not present | Omitted from snapshot, unchanged | N/A |
| DUPLICATE_ID | `relations` array with two entries sharing a `scenarioId` | `relationsByScenarioId` and `buildGherkinSnapshot` throw naming the id | throw |
| SEEDED_DERIVATION | All 14 seeded relations | `deriveScenarioId(scenarioTitle) === scenarioId` for every one | N/A |
| DERIVE_EDGE | Title with `/`, punctuation, multiple spaces, non-ASCII | Collapsed to kebab (e.g. `BTC/USD` → `btc-usd`); leading/trailing dashes trimmed | empty title → empty string |

</frozen-after-approval>

## Code Map

- `reporter/gherkin-snapshot.ts:82-127` -- `extractScenario` (scope: plural start-keyword match, contiguous `@`-tag fold, `Examples:` removed from the end-boundary regex at `:100`, shared `tagRunStart` walkback at `:121`); `buildGherkinSnapshot` guards with `assertUniqueScenarioIds` before grouping/any I/O (`:35`).
- `model/relations.ts` -- seeded `relations` (14 entries, `:33-148`) read-only; `deriveScenarioId` (`:157`); `assertUniqueScenarioIds` (`:177`, aggregates duplicate ids, empty ids, id-derivation drift, and duplicate (feature, title) pairs into one throw); `relationsByScenarioId` guarded + `readonly` (`:219`).
- `reporter/gherkin-snapshot.test.ts` -- existing `HISTORY_FEATURE` fixture (plain scenarios) + 4 tests must pass unchanged; homes of the new outline/tag/boundary fixtures and the dup-throw test.
- `model/relations.test.ts` (new) -- derivation conformance over the seeded map, `assertUniqueScenarioIds` pass/throw per violation class, `relationsByScenarioId` dup throw. Mirrors repo test conventions (vitest, no browser).
- `reporter/html-report.test.ts`, `reporter/json-report.test.ts` -- real-consumer dup-relation throw tests (last-wins replaced by a deterministic error at render entry points).
- Model-hash note: `model/model-version.ts:6` hashes only `contracts.ts`/`fsm.ts`/`schemas.ts` — edits to `relations.ts`/reporter files do **not** bump `modelVersion`, so no plan/fixture regeneration is needed.

## Tasks & Acceptance

**Execution:**
- [x] `reporter/gherkin-snapshot.ts` -- `extractScenario`: match `Scenario:` and `Scenario Outline:` by title; extend `start` upward over contiguous `@` lines; drop `Examples:` from the end-boundary; slice verbatim.
- [x] `model/relations.ts` -- export `deriveScenarioId` (kebab derivation) and `assertUniqueScenarioIds` (named throw); guard `relationsByScenarioId` with it.
- [x] `reporter/gherkin-snapshot.ts` -- call `assertUniqueScenarioIds(relations)` at the top of `buildGherkinSnapshot`.
- [x] `reporter/gherkin-snapshot.test.ts` -- add fixtures/tests: outline+Examples extraction (incl. multi-Examples and EOF end), tag inclusion (incl. tags above the last scenario), feature-tag non-attachment, duplicate-id throw, and plain-scenario byte-identity with the existing fixture.
- [x] `model/relations.test.ts` (new) -- derivation conformance for all seeded relations + edge inputs; `assertUniqueScenarioIds` pass/throw; `relationsByScenarioId` duplicate throw.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- mark L142/L146/L150/L154/L158 `RESOLVED (2026-09-16)` and reconcile the sweep-triage bundle line.

**Acceptance Criteria:**
- Given a feature containing a `Scenario Outline` with an `Examples:` table and `@` tags, when the snapshot is built for its relation, then the extracted block contains the `Scenario Outline:` line, every step, the `Examples:` table, and the tag lines, verbatim.
- Given only plain `Scenario:` relations (the current committed features), when the suite runs, then the existing snapshot tests and reports are byte-identical — no fixture or golden-output edits.
- Given a `relations` array with a duplicate `scenarioId`, when `relationsByScenarioId` or `buildGherkinSnapshot` runs, then it throws an error naming the duplicate id.
- Given the seeded `relations`, when `deriveScenarioId` is applied to each `scenarioTitle`, then it equals the authored `scenarioId` in every case.
- Given `npm run typecheck && npm test && npm run lint`, then all pass with `computeModelVersion()` unchanged.

## Spec Change Log

- 2026-09-16 (review loop 1) — Blind-hunter/edge-case review of the fidelity diff amended the non-frozen planning sections. The frozen end-boundary rule was renegotiated with the user (Ask-First, human-approved): a block now stops before the NEXT block's own contiguous `@`-tag run (tags attach to their own scenario instead of the previous block's tail). `assertUniqueScenarioIds` (frozen name kept) now aggregates every violation into one deterministic throw — duplicate `scenarioId`, empty `scenarioId`, `scenarioId !== deriveScenarioId(scenarioTitle)`, and duplicate `(feature, scenarioTitle)` pairs — and `relationsByScenarioId` accepts `readonly`. `Scenarios:` is documented as a container boundary that ends blocks but is never itself title-matchable (deliberate asymmetry). Tests extended to exact-slice outline/tag/boundary cases (Background/Rule/Feature enders, orphan/tight tags, tagged Examples) and to the real report consumers. Known-bad avoided: foreign tag runs corrupting the previous block, silent last-wins overwrite at render entry points, first-match title mis-attribution, and an `assertUniqueScenarioIds` that reported only the first of several corruptions.
- KEEP: verbatim slicing, exact title match, contiguous-only tag folding (feature tags never leak), Examples-as-content-not-boundary, ASCII-lenient derivation pinned against all 14 seeded ids, guard-before-I/O ordering.

## Design Notes

Tag inclusion mirrors the end-boundary logic: after a scenario line is located, walk upward while the line above, trimmed, starts with `@` — a blank or non-tag line stops the lookback, so feature-level tags above `Background:` (which can be non-contiguous) never leak into a scenario block. The `Examples:` change is the fidelity core: an outline is ONE scenario, so its data table is part of its verbatim block; a new `Scenario`/`Background`/etc. keyword is the only true boundary. Removing `Examples:` from the boundary is safe for plain scenarios because a plain `Scenario` never has an `Examples:` table. Derivation is deliberately ASCII-lenient (`[^a-z0-9]+` → `-`) so punctuation like `/` in "BTC/USD" becomes `btc-usd`; the conformance test across all 14 seeded ids pins the rule against drift, and `assertUniqueScenarioIds` turns a future silent-overwrite into a named error at the source of truth.

Refinement (human-approved 2026-09-16; Ask-First renegotiation of the frozen boundary rule, recorded here): the end-boundary now stops before the NEXT block's own contiguous `@`-tag run — when the end-scan hits the next top-level keyword line, it walks up over that keyword's tag run and ends the current block at the tag run's first line — so a following scenario's tags attach to its own block instead of the previous block's tail; each block runs from its own tag run through the line before the next block's tag run (or the next keyword line when the next block is untagged, or EOF). Orphan-tag attribution (review-derived, unpinned by the frozen matrix): a tag run separated from its scenario by a blank line stays in the preceding block's tail while the run adjacent to the scenario attaches to it — a literal verbatim choice, pinned by the ORPHAN_TAGS test.

Review extension: `assertUniqueScenarioIds` is exercised at the real report consumers (`renderHtmlReport`/`renderJsonReport`), so a caller-supplied duplicate replaces the previous last-wins rendering with a deterministic error. Gherkin `"""` doc-string fence tracking is explicitly deferred (deferred-work.md): no committed feature uses doc strings today, and the rapid line-scan would misread keyword/`@` lines inside them.

## Verification

**Commands:**
- `npm run typecheck` -- expected: exit 0.
- `npm test` -- expected: all suites green; `computeModelVersion()` unchanged (no plan regen); existing plain-scenario snapshot tests pass unmodified.
- `npm run lint` -- expected: exit 0.

## Suggested Review Order

**Verbatim extraction (entry point)**

- Start here: one fast line-scan now matches both scenario keywords, folds tags, and slices verbatim blocks.
  [`gherkin-snapshot.ts:82`](../../reporter/gherkin-snapshot.ts#L82)

- One shared tag-run walkback drives both the start-fold and the refined end-boundary.
  [`gherkin-snapshot.ts:121`](../../reporter/gherkin-snapshot.ts#L121)

- `Examples:` stays inside the outline block; only scenario-level keywords (or the next block's tags) end it.
  [`gherkin-snapshot.ts:100`](../../reporter/gherkin-snapshot.ts#L100)

**Drift-safe scenario id wiring**

- `deriveScenarioId` — the single kebab rule all ids must reproduce.
  [`relations.ts:157`](../../model/relations.ts#L157)

- The aggregated guard: duplicate id, empty id, derivation drift, and duplicate (feature, title) all throw in one error.
  [`relations.ts:177`](../../model/relations.ts#L177)

- `relationsByScenarioId` is guarded and now accepts `readonly`.
  [`relations.ts:219`](../../model/relations.ts#L219)

- `buildGherkinSnapshot` rejects malformed relations before any file I/O.
  [`gherkin-snapshot.ts:35`](../../reporter/gherkin-snapshot.ts#L35)

**Regression coverage**

- Outline/Examples, multi-Examples, and EOF-end verbatim blocks.
  [`gherkin-snapshot.test.ts:319`](../../reporter/gherkin-snapshot.test.ts#L319)

- Tag-boundary interaction: next-tag-run boundary and orphan-tag attribution.
  [`gherkin-snapshot.test.ts:385`](../../reporter/gherkin-snapshot.test.ts#L385)
  [`gherkin-snapshot.test.ts:448`](../../reporter/gherkin-snapshot.test.ts#L448)

- Background/Rule/Feature enders and guard-before-I/O ordering.
  [`gherkin-snapshot.test.ts:405`](../../reporter/gherkin-snapshot.test.ts#L405)
  [`gherkin-snapshot.test.ts:497`](../../reporter/gherkin-snapshot.test.ts#L497)

- Seeded derivation conformance and the aggregated-violations error.
  [`relations.test.ts:33`](../../model/relations.test.ts#L33)
  [`relations.test.ts:112`](../../model/relations.test.ts#L112)

- Real-consumer behavior change: duplicate relations now throw at the report renderers.
  [`html-report.test.ts:404`](../../reporter/html-report.test.ts#L404)
  [`json-report.test.ts:232`](../../reporter/json-report.test.ts#L232)
