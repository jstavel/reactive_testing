---
title: 'Standalone repro script from the model'
type: 'feature'
created: '2026-09-02'
baseline_commit: '0f15d6a9bb53b3fcd0b6879d47afc119e5ac900f'
status: 'done'
review_loop_iteration: 0
context:
  - '_bmad-output/implementation-artifacts/epic-4-context.md'
  - '_bmad-output/implementation-artifacts/spec-3-6-gherkin-is-never-the-ssot.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A reported bug path (a sequence of FSM states and contracts) currently has no tool that turns it into a runnable script; a QE has to hand-write a Playwright repro. A developer wants to grab a repro from a ticket and run it without reasoning about the testware's runtime machinery (no Orchestrator/Validator), but the contract navigation must still reflect the app's current spec — the Model + the action-map (the canonical contract implementation).

**Approach:** Add a Repro Generator that validates a reported bug path against the Model (FSM + contracts) and emits `scripts/repro-<slug>.ts` — a script whose only testware dependency is a single import of `action-map.ts` (the contract implementation), plus `playwright` and a self-contained CDP-attach bootstrap. It drives each step via the live `actionMap[contractId]({ page })`, so a regenerated repro always reflects the current spec (FR-12). An unmodeled path is reported as a gap, never silently approximated (FR-12c).

## Boundaries & Constraints

**Always:**
- **The emitted `scripts/repro-*.ts` has no Reactive Testing *runtime* dependency — no Orchestrator, no Validator, no runner, no validators, no collectors** (FR-12a, AD-7). Its only testware imports are `model/fsm.ts` (the path's states), `model/contracts.ts` (types only), and `orchestrator/action-map.ts` (the canonical contract implementation). It never imports `orchestrator/orchestrator.ts`, `validators/*`, or `collectors/*`.
- **The repro reflects the current spec at run time, not a snapshot.** The generated script delegates each navigation step to the live `actionMap[contractId]({ page })` and reads the current Model — so a later spec edit (a new/retired locator in action-map, a new/retired transition) is automatically reflected when the repro runs. No locator logic is duplicated into the generator.
- **Keep `ContractAction` closures in the action-map** — no rewrite to serializable descriptors, no interpreter, no refactor of the orchestrator or its tests (closure is the proven, live-verified, fully-expressive implementation home; retro item 5).
- The generator validates every step of the bug path against the Model + action-map before emitting: each `stateId` in the FSM, each `contractId` in `allContracts` + `actionMap`, each `(stateId, contractId)` a declared transition. An unresolvable step aborts emission with a gap naming the offending step — never an approximated path (FR-12c).
- The emitted script attaches to an already-authenticated browser via CDP (browser.ts's pattern, self-contained bootstrap) and runs against the live app. It performs each step via `actionMap` then waits for a settle selector. No AI, no validators, no corpus write (AD-4, AD-7).
- Signature: `generateReproScript(path: ReproPath): string` (pure, testable without running) plus `writeReproScript(path): string` writing `scripts/repro-<slug>.ts`. Deterministic (NFR-1): identical inputs → identical output.
- `npm run typecheck` clean and the emitted script also typechecks; every generator rule is unit-tested, including negative (gap) cases.

**Ask First:**
- Wiring the generated repros into a `package.json` script or CI — out of MVP scope, confirm before adding.

**Never:**
- No dependency on the Orchestrator or Validator at runtime of the emitted script (FR-12a); the generated file runs standalone with only the action-map + Model + Playwright, never the orchestrator execution loop/validators/collectors.
- No serialization/stringification of `ContractAction` closures into the generated source — the script calls the live `actionMap` instead (no-copy, no-drift).
- No parallel/duplicated locator table in the generator (retro item 5 — action-map is the single action home).
- No changes to the Model (fsm/contracts/schemas), orchestrator, validators, reporters, or the smoke plan. The generator only reads the Model/action-map and writes `scripts/repro-*.ts`.
- No inferred URL-based navigation as a silently-approx fallback for dialog/self-loop contracts.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| VALID_PATH | path `[homePage→openPortfolioSummary, portfolioSummaryDialog→closePortfolioSummary]` | emits `scripts/repro-<slug>.ts` whose steps follow the path in order, imports only playwright + model + action-map | N/A |
| UNKNOWN_STATE | step references a stateId absent from FSM | generator throws a gap listing the offending step | reported as a gap, nothing written |
| UNKNOWN_CONTRACT | step references a contractId absent from `allContracts`/`actionMap` | generator throws a gap listing the offending step | reported as a gap, nothing written |
| UNKNOWN_TRANSITION | (stateId, contractId) pair matches no transition | generator throws a gap for that step | reported as a gap, nothing written |
| EMPTY_PATH | zero steps | generator throws a gap ("empty path") | reported as a gap, nothing written |

</frozen-after-approval>

## Code Map

- `orchestrator/action-map.ts:21` (READ-ONLY) — `actionMap` (`Record<string, ContractAction>`): the canonical contract implementation, kept as closures (retro item 5). The emitted repro imports and calls `actionMap[contractId]({ page })` directly.
- `model/fsm.ts:80` — `homePageModel` (`FsmModel`): readonly `states`, `transitions`, `initialStateId`; the generator reads transitions to validate steps (an unmodeled path is a gap).
- `model/contracts.ts:122` — `allContracts` (`DialogContract[]`): readonly canonical contract list; the generator verifies each `contractId` is declared.
- `model/ssot-guard.ts:20` — `resolveTestPlanAgainstModel(...)` precedent for validating path steps against the Model; the generator reuses its resolve pattern (state/contract/transition).
- `orchestrator/browser.ts:31` — `launchBrowser` CDP-attach pattern (connectOverCDP + single authenticated context + new tab + navigate to baseUrl + ready wait) that the emitted script reproduces self-contained (it attaches over CDP in its own bootstrap; it does not import the runtime browser module).
- `orchestrator/orchestrator.ts:260-300` — per-step action + settle wait sequence (`actionMap[step.contractId]({ page })` then `page.waitForSelector(settleSelector)`), mirrored in the emitted script.
- `model/schemas.ts:218-232` — `ScenarioStep`/`ScenarioPath` shapes; `TestPlan` at `:304`.
- `bin/run-smoke.ts:11-31` — the base URL, ready/settle selectors, and CDP endpoint used in real runs; the emitted repro config mirrors these values.

## Tasks & Acceptance

**Execution:**
- [x] `repro/repro-generator.ts` (NEW) — export `ReproPath` (e.g. `{ slug, baseUrl, readySelector, settleSelector?, cdpUrl?, steps: ScenarioStep[] }`), `generateReproScript(path): string` (validates each step against the Model + action-map, throws a gap on any unresolvable/empty step, else returns the standalone source that imports playwright + model + action-map and drives each step via `actionMap[contractId]({ page })`), and `writeReproScript(path): string` (writes `scripts/repro-<slug>.ts`, returns the written path).
- [x] `repro/repro-generator.test.ts` (NEW) — unit tests: VALID_PATH emits source importing playwright + model + action-map (and no orchestrator/validator/collector/runtime module) and drives each step via `actionMap`; each UNKNOWN_STATE/CONTRACT/TRANSITION and EMPTY_PATH case throws the right gap and writes nothing; `writeReproScript` creates a file under `scripts/`.

**Acceptance Criteria:**
- Given a valid bug path with steps that resolve against the Model and action-map, when `generateReproScript` runs, then it returns a `scripts/repro-<slug>.ts` importing only playwright + model + action-map (no Orchestrator/Validator/runtime) and driving each step via `actionMap`, following the path in order (FR-12b, AD-7).
- Given the emitted script run against the live authenticated browser via CDP, when executed, then it navigates the path using the current spec (a later action-map edit is automatically reflected) and never couples to the Orchestrator/Validator (FR-12a).
- Given a bug path with an unmodeled state, contract, transition, or zero steps, when `generateReproScript` runs, then it throws a gap naming the offending step and writes no file (FR-12c).
- Given `npm run typecheck` and `npm test`, when run, then both exit 0 and the emitted script also typechecks.

## Spec Change Log

- **2026-09-02** — Initial draft.
- **2026-09-02** — Adopted the compromise: keep `ContractAction` closures in action-map (no descriptor/interpreter refactor); the emitted repro's only testware dependency is the single `action-map.ts` import (plus model types), so it stays close to standalone while reflecting the current spec. Replaces both the earlier "import model+action-map" design and the serializable-descriptor design.

## Design Notes

- **Why the single action-map import is the right compromise.** The original goal — "import nothing" — forced a rewrite of `action-map.ts` into serializable descriptors plus an interpreter, a refactor with real blast radius and a closed grammar that would need growing for every new accessor kind (fill, selectOption, frame, …). Closures are already expressive, proven, and live-verified. The repro's only testware import is the one file that *is* the contract implementation — the small compromise the human accepted. A dev runs the repro with `action-map.ts` alongside (bundled with the ticket) and never reasons about the Orchestrator/Validator.
- **No-copy, no-drift.** The generated script calls the live `actionMap` rather than inlining locators, so a regenerated repro always reflects the current spec; there is no second locator source to go stale.
- **"Standalone" is scoped precisely.** It means no Reactive Testing *runtime* (FR-12a bans the Orchestrator and Validator). The generated file drives itself via its own CDP-attach bootstrap + per-step `actionMap` calls + settle wait; it never imports the orchestrator's execution loop, validators, or collectors.
- **Golden shape of emitted source (conceptual, not literal):**
  ```ts
  import { chromium } from "playwright";
  import { actionMap } from "../orchestrator/action-map.js";
  // (model/fsm.ts for the path; contracts types if referenced)

  const browser = await chromium.connectOverCDP(cdpUrl);
  // ...require a single authenticated context, open a tab, goto(baseUrl),
  //    waitForSelector(readySelector) ...
  for (const step of steps) {
    await actionMap[step.contractId]({ page });
    await page.waitForSelector(settleSelector, { timeout: stepTimeout });
  }
  await browser.close();
  ```
- **Gaps vs silent approximation.** The generator reuses the ssot-guard's resolve logic up front and throws before writing anything, so a half-modeled path (unknown state/contract/transition, or empty) never yields a partial/guessed repro (FR-12c).
- **NFR-4 / language:** generated artifacts and code comments are English; "action-map," never "aspect."

## Verification

**Commands:**
- `npm run typecheck` -- expected: exit 0 (including any generated repro present)
- `npm test` -- expected: exit 0, new `repro/repro-generator.test.ts` passes

**Manual checks (if no CLI):**
- _None._ (A real CDP run needs the human's authenticated browser; the emitted script's correctness is verified by the automated tests, and readability by review.)

## Suggested Review Order

**Generator core**

- Entry: `generateReproScript` validates slug, run config, and path, then composes the standalone source; a gap aborts before any emission (FR-12c).
  [`repro-generator.ts:49`](../../repro/repro-generator.ts#L49)

- `validatePath` mirrors the ssot-guard resolve rules — state, contract, action-map presence, transition — so an unresolvable step is a named gap, never a partial repro.
  [`repro-generator.ts:188`](../../repro/repro-generator.ts#L188)

- `validateSlug` confines slugs to kebab-case so the generated filename and run comment can't escape `scripts/` or inject source.
  [`repro-generator.ts:176`](../../repro/repro-generator.ts#L176)

- `writeReproScript` validates before writing and records the written repo-relative path.
  [`repro-generator.ts:165`](../../repro/repro-generator.ts#L165)

**Emitted script (the standalone artifact)**

- The emitted script imports only playwright + action-map + fsm and re-reads the CURRENT model at run time — a retired state or transition aborts loudly instead of silently running a stale path.
  [`repro-generator.ts:107`](../../repro/repro-generator.ts#L107)

- Self-contained CDP-attach bootstrap mirrors browser.ts: our own tab is closed even on failure (no stray tabs), `browser.close()` is a disconnect, and a thrown step exits non-zero with a clear message.
  [`repro-generator.ts:86`](../../repro/repro-generator.ts#L86)

- Baked run config (CDP endpoint, base URL, ready/settle selectors, step timeout) mirrors `bin/run-smoke.ts`.
  [`repro-generator.ts:79`](../../repro/repro-generator.ts#L79)

**Tests**

- VALID_PATH coverage: allowed-import whitelist, live `actionMap` driving, path order, determinism, run-time guards, tab cleanup, and non-zero exit.
  [`repro-generator.test.ts:30`](../../repro/repro-generator.test.ts#L30)

- Gap coverage (FR-12c): empty path, unknown state/contract, undeclared transition, bad slug, missing run config — each asserts nothing is written.
  [`repro-generator.test.ts:103`](../../repro/repro-generator.test.ts#L103)

- `writeReproScript` writes `scripts/repro-<slug>.ts` and writes nothing on a gap.
  [`repro-generator.test.ts:143`](../../repro/repro-generator.test.ts#L143)
