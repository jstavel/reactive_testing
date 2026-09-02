---
title: 'User documentation set — README + docs with Mermaid'
type: 'feature'
created: '2026-09-02'
baseline_commit: '4903790b4077494d41f2229c0c787d0142e0bc65'
status: 'done'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-reactive-testing-2026-08-17/ARCHITECTURE-SPINE.md'
  - '_bmad-output/specs/spec-reactive-testing/SPEC.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The repo has no user-facing documentation. A reader (Jan tomorrow, a QE colleague, an interviewer) cannot tell from the tree what the project is about, how to run it day-to-day, or what each part is — the only prose is a frozen historical constitution and internal `_bmad-output` planning artifacts.

**Approach:** Author a small user documentation set derived from the *current* repo (epics 1–4 shipped), never from the stale architecture seed: `README.md` (what it is, quick start, parts), `docs/architecture.md` (how it works, Mermaid pipeline + FSM diagrams), `docs/usage.md` (daily use — record a corpus, then the library-only validation/reporting with runnable snippets), `docs/project-map.md` (every part of the tree). Mermaid renders natively on GitHub.

## Boundaries & Constraints

**Always:**
- New files only, exactly four: `README.md`, `docs/architecture.md`, `docs/usage.md`, `docs/project-map.md`. No edits to any existing file (code, features, model, AGENTS.md, constitution.md, planning artifacts).
- **Accuracy over polish — every stated fact must match the code on disk** (Code Map anchors are the authority): commands verbatim from `package.json`; FSM states/transitions verbatim from `model/fsm.ts` (8 states, 10 transitions, `initialStateId: homePage`); module/dir names as they exist. Where the tree diverges from the old architecture seed, docs describe reality and never the seed — there is **no** `test-plans/` dir, no `validate-*.ts` files, no xunit/JSON reporter, no headless smoke; validation/reporting are **library-only** (no CLI).
- **Honest capability statements.** State plainly: `npm run run:smoke` needs a live authenticated Chromium at `http://127.0.0.1:9222` (CDP attach; the human's browser is never closed); offline validation, failure-Gherkin, adjudication, cross-view invariants, and repro generation have **no shell entry point today** — driven by small `tsx` scripts importing the real exports. Every snippet in `docs/usage.md` must import real symbols (`runValidatorsOffline`, `emitFailureGherkin`, `runCrossViewInvariants`, `writeReproScript`) and run as written.
- Mermaid must render on GitHub and name real components (`model/smoke.test-plan.ts`, `orchestrator/action-map.ts`, `validators/offline-runner.ts`, `reporter/failure-gherkin.ts`, `corpus/`). Use `flowchart` (pipeline), `stateDiagram-v2` (homePage FSM), `sequenceDiagram` (daily smoke run).
- Repository-relative links between the four files (and to `features/`, `model/`, `package.json`). English only; "aspect" banned, "shared validator" correct (NFR-4). No time estimates, no fabricated metrics (current 17 files/209 tests may be cited, marked drifting).
- Verification per the `## Verification` section: grep audit + running the documented `tsx` snippets against a recorded run.

**Ask First:**
- Going beyond the four files (an "extending the model" cookbook, CI wiring, a Mermaid renderer, an index under `docs/` subfolders).
- Whether `_bmad-output/` internal paths stay out of the docs entirely vs. one traceability pointer.

**Never:**
- Do not document/diagram unbuilt components: graph/CAP-4, xunit/CI reporting, `test-plans/` dir, headless smoke, mobile/Appium, the retired inline "aspect" chain from `constitution.md`/the removed `project-context.md`.
- Do not describe Gherkin as SSOT or claim automatic spec changes — the model is the SSOT (AD-1); failures surface as reviewable Gherkin for human adjudication (CAP-3).
- No code/schema/test changes to make the docs true. No edits/moves of existing files. No generated files left behind (temp verification scripts removed).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| DOC_ACCURACY | docs claim a command, module, FSM state, selector, or count | grep finds the exact string and it matches the Code Map source | fix the doc, never the code |
| SNIPPET_RUNS | user runs a `tsx` snippet from docs/usage.md against a recorded run | the real exports execute and print results | correct the snippet to the real signature |
| MERMAID | every diagram fence in the docs | balanced ```mermaid fences, valid syntax, real node names | fix syntax/node names before approval |
| STALE_SEED | an old-architecture name (`test-plans/`, xunit, `validate-*.ts`) appears | no occurrence in the four files | removed — docs describe the current tree |

</frozen-after-approval>

## Code Map

Ground-truth sources the implementer reads (not re-investigates) while writing:

- `package.json:10-14` — the three scripts to document verbatim: `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `run:smoke` (`tsx bin/run-smoke.ts`). No lint/build scripts.
- `bin/run-smoke.ts:11-31,41-75` — exact runner config to document: `baseUrl https://pro.kraken.com/app/home`, `readySelector '[data-testid="overview-portfolio-hero-value-text"]'`, `settleSelector '[aria-label="Side navigation"]'`, `cdpUrl http://127.0.0.1:9222`, step/run timeouts, probes `[selected-view → a[role="tab"][aria-current="page"], optional]`; per-scenario `[PASS|FAIL]` output; exit 1 only when zero scenarios or all failed.
- `orchestrator/browser.ts:47-68,105-133,169-175` — CDP reality to document: exactly one authenticated context required, human browser never closed, 10s connect timeout.
- `model/fsm.ts:41-57,59-77` — the 8 states / 10 transitions the `stateDiagram-v2` must match exactly.
- `model/smoke.test-plan.ts:8-65` — `planId "smoke"`, modelVersion hash, 10 scenarios; auto-generated from `@plan:smoke` tags (regenerate on model/feature change).
- `model/model-version.test.ts:10-13` + `model/ssot-guard.ts` — modelVersion guard + SSOT guard tests to cite under testing hygiene.
- `validators/offline-runner.ts:25` `runValidatorsOffline(corpusDir, runId, plan, contractIds?)`; `validators/cross-view.ts:74` `runCrossViewInvariants(corpusDir, runId, plan)` (seed invariant, probe `portfolio-value`); `reporter/failure-gherkin.ts:47` `emitFailureGherkin({corpusDir, runId, plan, results})` (writes `{runId}/failure.feature`); `reporter/adjudication.ts` `emitAdjudicationRecord(...)` — exact exports the usage snippets import.
- `model/schemas.ts:121-131,10-20,59-67,26-56` — `ValidationResult`, `SnapshotRecord`, `ProbeResult`, `NetworkEvent` shapes for the corpus-shapes section.
- `orchestrator/corpus.ts:28-44,55-77` — corpus layout: `corpus/{kind}/{runId}/{stem}.{ext}`, `{i}.json`/`{i}.pre.json`, `run-manifest.json` (errors/failures/collectors). `corpus/` gitignored (`.gitignore:33`); 7 recorded runs, some legacy pre-`url`/pre-naming (parsing gap — honest note).
- `features/` — six Gherkin files (`@plan:smoke`) for project-map + README; only nav/dialog scenarios are in the smoke plan.
- `repro/repro-generator.ts:19-32,49,165` — `ReproPath`, `generateReproScript`, `writeReproScript` (writes `scripts/repro-<slug>.ts`; run `npx tsx scripts/repro-<slug>.ts`).
- `ARCHITECTURE-SPINE.md:212-276,39-151` — source Mermaid (flowchart, sequence) + AD-1..19; reuse the diagrams but correct nodes to the current tree.

## Tasks & Acceptance

**Execution:**
- [x] `README.md` (NEW) — one-page landing: what Reactive Testing is (spec-first testware, two-phase capture→verify, model = SSOT, FSM+contracts+schemas); why it exists; the three daily commands; a top-level Mermaid pipeline diagram; a parts summary table linking to `docs/project-map.md`; pointers to the other two docs.
- [x] `docs/architecture.md` (NEW) — the system as built: two phases, the three model files as SSOT, players (orchestrator + action-map + collectors → corpus → offline validators → reporter), layer/import rules, Mermaid `stateDiagram-v2` of `homePageModel`, Mermaid pipeline `flowchart`, Mermaid `sequenceDiagram` of one recorded run; honest "not built yet" (CAP-4 graph, xunit/CI, CLI entry point).
- [x] `docs/usage.md` (NEW) — daily workflow: prerequisites (Node ≥24, `npm ci`, live authenticated Chromium via `--remote-debugging-port=9222`, one context); record a corpus (`npm run run:smoke` — output, exit codes, corpus location); inspect a run (manifest, shapes); re-validate offline / render failures / adjudicate / run cross-view invariants / generate-and-run a repro via real `tsx` snippets; testing gates.
- [x] `docs/project-map.md` (NEW) — every top-level part: `model/`, `features/`, `orchestrator/`, `collectors/`, `validators/`, `reporter/`, `repro/`, `bin/`, `corpus/`, `scripts/` (created on repro write); corpus layout; naming conventions; notes the absent old-seed dirs/files so a reader is not misled.

**Acceptance Criteria:**
- Given a reader opens `README.md`, when they read it, then they can state the core idea (spec-first, two-phase, model SSOT), run the documented quick-start commands, and reach the other three docs by link.
- Given the homePage model in `model/fsm.ts`, when `docs/architecture.md` is checked, then its `stateDiagram-v2` lists exactly the 8 real states and 10 real transitions (none invented) and its diagrams name only components that exist on disk.
- Given the real exports, when the `tsx` snippets in `docs/usage.md` run against a recorded corpus run, then each executes and prints results (verified, temp script removed).
- Given the Code Map sources, when a grep scans the four files, then every documented command, state, contract, selector, module, and directory matches, and no stale-seed name (`test-plans/`, xunit, `validate-*.ts`, "aspect", headless smoke) appears.
- Given `npm run typecheck` and `npm test`, when run before and after, then both stay green (docs-only change).

## Spec Change Log

- **2026-09-02** — Initial draft.

## Design Notes

- **Derived, not authored from memory.** Every fact comes from the Code Map anchors (verified 2026-09-02). The architecture spine's Mermaid diagrams are the right starting shape but several nodes are stale — the docs show shipped reality: `smoke.test-plan.ts` (not a `test-plans/` dir), library-only offline `validators/`, a reporter writing `failure.feature`/`adjudication.json` into `corpus/{runId}/` (no xunit).
- **Honesty about the library-only gap is a feature.** Usage's biggest value is telling a user exactly how to run offline verification today (a small `tsx` script) and stating no CLI exists yet — mirroring the deferred-work ledger.
- **Snippets must be real.** Each imports a real export and is proven by execution during implementation. The recorded runs under `corpus/` (some legacy, pre-`url`) are the honest test corpus — snippets must tolerate or explain "missing evidence" results, never fabricate passes.
- **Diagrams carry the README's message.** The top-level pipeline flowchart in README is the highest-value image for a new reader; the FSM state diagram in architecture.md is second. Keep both minimal and valid.
- **Golden shape (README core idea):**
  > **Reactive Testing** = describe the app once as a formal model (FSM + contracts + schemas); a deterministic orchestrator records *evidence* (corpus) from a live session; pure validators verify that evidence *offline* — no browser needed — and failures surface as reviewable Gherkin. One navigation funds N validations. The model is the source of truth; every test script and corpus is a derived byproduct.

## Verification

**Commands:**
- `npm run typecheck` && `npm test` -- expected: unchanged green (17 files / 209 tests) before and after.
- Grep audit over the four files -- expected: every claimed command/state/contract/selector/dir present verbatim; zero stale-seed tokens (`test-plans/`, `validate-*.ts`, xunit, "aspect", headless smoke).
- Temp snippet execution -- expected: the `docs/usage.md` `tsx` snippets run against a real recorded run and print results; temp files removed.

**Manual checks (if no CLI):**
- Open `README.md` and each `docs/*.md` in a GitHub-rendering viewer (or the Emacs markdown preview): every Mermaid fence renders and every relative link resolves.

## Suggested Review Order

**The landing page — start here**

- Entry point: the README states the core idea (spec-first, two-phase, model = SSOT) and links the whole doc set — read it first to judge tone and accuracy.
  [`README.md:1`](../../README.md#L1)

- The one-sentence essence drives every other doc's framing — check it matches the repo's actual philosophy (model is truth, corpus is evidence, failures are adjudicated).
  [`README.md:3`](../../README.md#L3)

- Quick start carries the three real commands and the CDP prerequisite — verify each command exists in package.json and the flow matches bin/run-smoke.ts.
  [`README.md:38`](../../README.md#L38)

**How the system works — architecture claims**

- The model-is-SSOT table and the AD legend — confirms the docs never present Gherkin/plans/corpus as truth.
  [`docs/architecture.md:7`](../../docs/architecture.md#L7)

- The 9-state FSM `stateDiagram-v2` must match model/fsm.ts exactly (states and transition labels) — cross-check visually.
  [`docs/architecture.md:80`](../../docs/architecture.md#L80)

- Pipeline flowchart names only real components; honest "not built" inventory below it keeps the reader undistracted by the old vision.
  [`docs/architecture.md:101`](../../docs/architecture.md#L101)

**Daily workflow — the claims a reader will act on**

- Record + exit-code semantics: watch the "some fail still exits 0" note — the honest behavior of bin/run-smoke.ts.
  [`docs/usage.md:20`](../../docs/usage.md#L20)

- Offline-verify snippet imports real exports and runs against a real recorded run (verified during implementation) — the legacy-corpus caveat explains the honest failures.
  [`docs/usage.md:74`](../../docs/usage.md#L74)

- The repro snippet maps to repro-generator's ReproPath; the "no plan-regeneration CLI" closing is the deliberate honesty fix from review.
  [`docs/usage.md:171`](../../docs/usage.md#L171)

**The tree map — completeness and absence claims**

- Project-map tree + "not shown" note scope the doc to the product tree without hiding tooling dirs.
  [`docs/project-map.md:1`](../../docs/project-map.md#L1)

- "Authored features vs. the smoke plan" discloses that three feature files are not yet exercised — a tracked authoring gap, not a broken generator.
  [`docs/project-map.md:113`](../../docs/project-map.md#L113)

- Corpus layout table and the absent old-seed table (readers learn what not to look for).
  [`docs/project-map.md:88`](../../docs/project-map.md#L88)
