---
title: 'Scenario selection for a test-plan run'
type: 'feature'
created: '2026-09-08'
status: 'done'
baseline_commit: '1747fe7ff7274a8df21ae5604e020227c72acf13'
review_loop_iteration: 0
context:
  - 'docs/usage.md'
  - 'README.md'
---

## Intent

**Problem:** When a smoke run hits a failure, there is no way to re-run only the failing scenarios — `npm run run:smoke` always executes every scenario in the plan, so isolating a single flaky or broken scenario means watching the whole suite.

**Approach:** Let the runner accept scenario ids as CLI arguments after `--` and execute exactly that subset. The filter is applied at the CLI layer by **narrowing the `TestPlan`** before `runTestPlan` — the orchestrator, collectors, validators, and corpus layout stay untouched.

## Boundaries & Constraints

**Always:**
- Argv surface is positional scenario ids forwarded through npm: `npm run run:smoke -- <id> [<id>…]`. With no ids, the full plan runs (unchanged backward-compatible behavior).
- Selection is **exact match** on the plan's `scenarios[].id` (stable kebab-case slugs, AD-19/architecture naming); duplicates are deduplicated preserving first-seen order.
- An unknown id fails fast with a clear error listing the valid ids — **before** any CDP connect or browser work.
- The narrowed plan is what executes: `[PASS|FAIL]` output, "Listening for N scenario(s)", exit-code guards, and `run-manifest.json` all reflect the narrowed set. A narrowed run is a run against the narrowed plan.
- No new runtime dependency (no arg-parsing library); parse `process.argv` directly.
- Docs are updated to match the code (`docs/usage.md` §1 and the README quick-start line) — `tsc --noEmit` and `npm test` stay green.

**Ask First:**
- Substring/glob/regex scenario selection, multi-plan (`--plan`) selection, or a `--list` mode — each is a separate concern (a future plan-picker; the smoke plan is the only plan today).
- Wiring an offline `validate:smoke` in the same change — that is its own filed deferred item.

**Never:**
- Touch the orchestrator, collector, validator, reporter, or model (no `orchestrator/orchestrator.ts`, `model/schemas.ts`, `model/smoke.test-plan.ts` changes).
- Attempt to keep `stepIndex` aligned with the full plan's global step indexing — within a narrowed run indices are consistent with the narrowed plan (same as any independently authored plan).
- Add a flag-parsing dependency, change scenario ids, or alter the existing zero-scenario/all-failed exit semantics.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| SINGLE | `run:smoke -- clicking-earn-navigates-to-the-standalone-earn-page` | "Listening for 1 scenario(s)"; exactly one `[PASS\|FAIL]` line; fresh run-id corpus | N/A |
| MULTIPLE | `run:smoke -- <a> <b> <c>` | runs exactly a, b, c in plan order; "Listening for 3 scenario(s)" | N/A |
| DUPLICATES | `run:smoke -- <a> <a> <b>` | runs a once then b; count reflects dedupe | dedupes silently |
| UNKNOWN_ID | `run:smoke -- not-a-scenario` | no browser launch; exits non-zero | error lists `not-a-scenario` and every valid plan id |
| EMPTY | `run:smoke` (no args after `--`) | full plan runs — unchanged behavior | N/A |
| ALL_SELECTED_FAIL | narrowed set where every scenario fails | exit code `1` via existing `passed === 0` guard | message names the selected ids |
| MODEL_MISMATCH | selected ids + stale embedded `modelVersion` | existing zero-scenarios guard fires (unchanged) | existing mismatch message |

## Code Map

- `bin/run-smoke.ts:1-75` — the CLI (only entry point today, AD-8-adjacent `bin/` docs say "the only CLI"): imports `smokeTestPlan` (:7), builds `OrchestratorConfig` (:11-31), logs plan + "Listening for N scenario(s)" (:34-39), calls `runTestPlan(plan, config, onScenario)` (:41), zero/all-failed guards (:53-69). No `process.argv` use anywhere in the repo (grep-confirmed) — argv land here.
- `model/smoke.test-plan.ts:9-79` — 13 scenarios, stable kebab-case ids (e.g. `clicking-earn-navigates-to-the-standalone-earn-page`, `pressing-escape-closes-the-portfolio-summary-dialog`, `open-the-assets-filter`). Plan is a `TestPlan` (schemas.ts:322-340) with `scenarios: { id, steps[] }[]`.
- `package.json:13` — `"run:smoke": "tsx bin/run-smoke.ts"`; npm forwards args only after `--` (must document).
- `orchestrator/orchestrator.ts:40-44,96` — `runTestPlan(plan, config, onScenario?)` iterates `parsed.scenarios`; every pre-execution pass (`validatePlan` :194, `planCollectors` :162, `validateProbeDependencies` :176, `stepIndex` :94-119) is bounded by the plan passed in — passing the narrowed plan is fully self-consistent. Read-only here.
- `docs/usage.md:20-47` — §1 "Record a corpus" documents `npm run run:smoke`, output, exit codes, corpus location — extend with the scenario-id form.
- `README.md:53,56` — quick-start and the run:smoke line to touch.
- `vitest.config.ts` — picks up `*.test.ts` anywhere (add `bin/scenario-select.test.ts` alongside a pure helper so selection logic is unit-testable).

## Tasks & Acceptance

**Execution:**
- [x] `bin/scenario-select.ts` (NEW) — pure `selectScenarios(plan, selectedIds): TestPlan`: empty selection returns the plan unchanged; otherwise returns a plan whose `scenarios` are the matching subsets in original order (dedupe, no other field touched); throws a named error for unknown ids listing them and all valid ids. Rationale: keep filtering testable and callable without a browser.
- [x] `bin/scenario-select.test.ts` (NEW) — unit tests for SINGLE, MULTIPLE, DUPLICATES, UNKNOWN_ID, EMPTY against `smokeTestPlan`. Rationale: pin the edge cases of the new selection surface.
- [x] `bin/run-smoke.ts` — parse `process.argv.slice(2)` as scenario ids; call `selectScenarios` before CDP connect; log the narrowed count and selected ids in the opening lines; wire an unknown-id error to `exit 1` before any connection; leave the existing guards and summary untouched. Rationale: the narrowing is the only behavioral change to the entry point.
- [x] `docs/usage.md` — §1: add the `-- <id> [<id>…]` form with an example, note `--` is required for npm forwarding, dedupe/unknown-id behavior, and that exit codes are unchanged. Rationale: doc set must match the code (spec-user-documentation-set standard).
- [x] `README.md` — quick-start run:smoke line gains "(optionally: `-- <scenario-id>…` to run a subset)". Rationale: the only other doc that names the command.

**Acceptance Criteria:**
- Given `smokeTestPlan`, when I run `selectScenarios(plan, ["a","a","b"])`, then the result's `scenarios` are `[a, b]` in plan order with `planId`/`modelVersion` unchanged.
- Given an unknown id, when `selectScenarios` or the runner receives it, then it fails with an error naming the id and listing every valid id, and the runner exits non-zero before any CDP/browser activity.
- Given no arguments, when `npm run run:smoke` runs, then all plan scenarios execute exactly as before (backward compatible).
- Given a narrowed invocation `npm run run:smoke -- <valid-id>`, then the opening log says "Listening for 1 scenario(s)", exactly one `[PASS|FAIL]` line prints, and the corpus lands under a fresh run-id (manual, live CDP).
- Given `npm run typecheck` and `npm test`, when run before and after, then both stay green.

## Spec Change Log

- **2026-09-08 (approved)** — bmad-review (adversarial 12, edge-case-hunter 2, structure 7, prose 9) findings triaged by the spec owner; spec approved as-is for development.

## Design Notes

- **Narrowing at the CLI, not the orchestrator.** The orchestrator already treats a `TestPlan` as the unit of work (run :96, planning :162-192, stepIndex :94-119) — a narrower plan flows through every pre-execution pass consistently by construction. Per-run `run-manifest.json` and offline validation (`runValidatorsOffline(corpusDir, runId, plan)`) of a narrowed run simply use the narrowed plan, whose step indices align within that run. No index bookkeeping with the full plan is attempted — this mirrors any independently authored plan (AD-19).
- **npm `--` forwarding is the documented footgun:** `npm run run:smoke -- <id>` (npm swallows flags without `--`). Example:
  ```bash
  npm run run:smoke -- clicking-earn-navigates-to-the-standalone-earn-page pressing-escape-closes-the-portfolio-summary-dialog
  ```
- Primary use case driving the shape: after a failing run, copy the `[FAIL] <id>` lines and re-run exactly those. Stable kebab-case ids make this a verbatim copy (architecture naming), so exact-match positional args are the smallest honest surface.

## Verification

**Commands:**
- `npm run typecheck` -- expected: `tsc --noEmit` clean (NFR-2).
- `npm test` -- expected: all existing tests plus the new `bin/scenario-select.test.ts` pass.
- `npx tsx bin/scenario-select.ts` (not a script) -- expected: module-only; pure helper exercised via tests, not a CLI.

**Manual checks (if no CLI):**
- `npm run run:smoke -- definitely-not-a-scenario-id` -- expected: immediate non-zero exit naming the id and listing valid ids; **no** CDP connect line.
- `npm run run:smoke` (no args, live CDP) -- expected: all scenarios run exactly as before.
- `npm run run:smoke -- <a valid id>` (live CDP) -- expected: "Listening for 1 scenario(s)", one result line, fresh `corpus/<run-id>/`.

## Suggested Review Order

**CLI boundary and selection**

- Narrows the plan before any browser work while preserving all orchestrator behavior.
  [`run-smoke.ts:13`](../../bin/run-smoke.ts#L13)

- Provides pure exact-match validation, deduplication, and plan-order selection.
  [`scenario-select.ts:18`](../../bin/scenario-select.ts#L18)

**Documentation and verification**

- Documents npm argument forwarding, subset examples, and unchanged exit semantics.
  [`usage.md:26`](../../docs/usage.md#L26)

- Covers single, multiple, duplicate, unknown, empty, and metadata-preservation behavior.
  [`scenario-select.test.ts:6`](../../bin/scenario-select.test.ts#L6)

- Exposes the subset syntax in the quick-start command.
  [`README.md:53`](../../README.md#L53)
