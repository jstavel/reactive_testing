---
title: 'Sample-report generator — committed mock fixture corpus/example'
type: 'feature'
created: '2026-09-11'
status: 'done'
review_loop_iteration: 0
baseline_commit: 02d21bdebc3f60d9df05d0babff1af6b67ea16d9
context:
  - '_bmad-output/specs/spec-report-gherkin-corpus-links/SPEC.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The repo has no committed example corpus — a headhunter or AI assistant opening it sees no browsable evidence, and CI has no offline fixture to validate against. The only corpora are live recordings, which are private (real account data) and gitignored.

**Approach:** Add a deterministic `bin/generate-sample-report.ts` that writes an all-passing mock fixture at `corpus/example/` (runId `example`: manifest, 18 pre/post snapshots, 18 probe batches, plus `report.html`/`report.json` via the existing emitters), wire a `--corpus-dir` flag on the `validate:smoke`/`report:smoke` CLIs, and un-ignore only the fixture subtree in `.gitignore` so it can be committed and browsed.

## Boundaries & Constraints

**Always:**
- The generator is deterministic (NFR-1): fixed runId `example`, fixed ISO timestamps, fixed mock content — two runs produce byte-identical output. No `Date.now`, no `randomUUID`.
- Mock data only — no real recorded content (privacy: real balances must never appear). Snapshot bodies are minimal synthetic strings that satisfy the offline predicates (`state-is`, `url-is`, `dialog-open`/`closed`, `view-selected`); the per-step stateId/url/dialog recipe is cloned from the verified all-passing run `corpus/efcb749d…`.
- The fixture must pass the offline pipeline: `validate:smoke --corpus-dir corpus` → 18/18 checks exit 0, and `report:smoke --corpus-dir corpus` → 14/14 scenarios exit 0. The generator self-checks via `runValidatorsOffline` and exits 1 (with failing detail) if any check fails — never a silent pass.
- The generator writes in place under the corpus root (default `corpus`): `corpus/example/run-manifest.json` + `corpus/example/report.html` + `corpus/example/report.json`, `corpus/snapshots/example/{i}.pre.json` + `{i}.json`, `corpus/probes/example/{i}.json` for i=0..17. It never touches other corpus content.
- `--corpus-dir <path>` on both CLIs: precedence flag > `options.corpusDir` > `CORPUS_DIR` env > `"corpus"` default. Unknown flags keep the existing "Invalid argument(s)" + usage error (exit 1); `report:smoke`'s positional-count guard applies to the remaining args after the flag is extracted.
- `.gitignore`: un-ignore only the fixture subtree — `corpus/*` + `!corpus/example/` + `!corpus/snapshots/example/` + `!corpus/probes/example/`. Real run dirs and their evidence stay ignored.
- The fixture omits screenshots and network files in v1 (network is never read offline; screenshots are existence-filtered, so the report renders evidence links only — MISSING_KIND exercised naturally). No `@last-run`/`@last-fail` symlinks in the fixture.
- The committed fixture is all-pass — no failing evidence (green CI signal; SPEC CAP-3/CAP-5).

**Ask First:** None.

**Never:**
- No real recorded data in the fixture.
- No screenshots/network in the fixture v1.
- No changes to `run-manifest.json` schema or the report emitters' behavior (they consume the fixture as-is).
- No random or date-dependent content anywhere in the generator output.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH | generator over an empty corpus root | fixture written at `corpus/example` + evidence + reports; self-check 18/18; exit 0 | N/A |
| REGEN_OVER_EXISTING | fixture already present | byte-identical rewrite; exit 0 (determinism) | N/A |
| SELF_CHECK_FAIL | mock data violates a contract (regression) | generator exits 1 with the failing check detail; no partial reports claimed as pass | error + exit 1 |
| CLI_CORPUS_DIR | `validate:smoke --corpus-dir corpus` (or report) | corpus root honored; runId `example` resolves; 18/18 / 14/14 exit 0 | N/A |
| FLAG_PRECEDENCE | `--corpus-dir` flag + `CORPUS_DIR` env + default | flag wins | N/A |
| UNKNOWN_FLAG | `--bogus` | existing "Invalid argument(s)" + usage; exit 1 | unchanged guard |

</frozen-after-approval>

## Code Map

- `bin/generate-sample-report.ts` (NEW) — the generator: fixed runId `example`; per-step recipe table (stateId/url/dialog per the efcb749d clone above); writes manifest + 54 evidence files; then emits `report.html` + `report.json` via `emitHtmlReport`/`emitJsonReport` (`reporter/html-report.ts:62`, `reporter/json-report.ts:124`) with `relations` (`model/relations.ts:33`), `buildGherkinSnapshot("features", relations)`, and `buildStepEvidence(plan, corpusDir, runId)` (imported from `bin/report-smoke.ts:148`); scenario results via `deriveScenarioResults` (`bin/report-smoke.ts:58`); self-check via `runValidatorsOffline` (`validators/offline-runner.ts:25`); pure `generateSampleReport(corpusRoot, options)` + main-guard pattern.
- `bin/validate-smoke.ts:248-256` — corpus-dir resolution + flag guard: extract `--corpus-dir <path>` before the `startsWith("-")` guard; precedence chain; update `USAGE`.
- `bin/report-smoke.ts:253-261` — same flag extraction; apply the positional-count guard to remaining args (relax `argv.length > 1` for the two-token flag); update `USAGE`.
- `.gitignore:33` — replace the bare `corpus/` rule with the fixture un-ignore recipe (order matters: `corpus/*` first, then the three `!` negations).
- `package.json` — add `"generate:sample": "tsx bin/generate-sample-report.ts"`.
- `bin/generate-sample-report.test.ts` (NEW) — determinism (two runs byte-identical), self-check passes (18/18), fixture shape (manifest lists all 54 paths, `report.json` present with `schema: report.v1`).
- `bin/validate-smoke.test.ts` / `bin/report-smoke.test.ts` — flag tests: `--corpus-dir` accepted + applied; precedence; `--bogus` still rejected.
- `docs/usage.md` — document `generate:sample` and the `--corpus-dir` flag on both CLIs.
- `model/smoke.test-plan.ts`, `model/contracts.ts`, `validators/*` — READ-ONLY (the fixture is derived from the plan; contracts/validators are the pass condition).

## Tasks & Acceptance

**Execution:**
- [x] `bin/generate-sample-report.ts` (new) -- deterministic generator writing the all-pass fixture + reports, self-checking via `runValidatorsOffline` -- the committed fixture's producer.
- [x] `bin/validate-smoke.ts` -- `--corpus-dir` flag parsing before the guard + precedence + USAGE -- CI targets the fixture explicitly.
- [x] `bin/report-smoke.ts` -- `--corpus-dir` flag parsing (length guard on remaining args) + precedence + USAGE -- same for the report CLI.
- [x] `.gitignore` -- fixture un-ignore recipe -- only the fixture becomes trackable. (Kept the four frozen recipe lines in order; added four guard lines — see Spec Change Log.)
- [x] `package.json` -- `generate:sample` script -- operator entry point.
- [x] `bin/generate-sample-report.test.ts` (new) -- determinism + self-check + fixture shape -- locks the generator contract.
- [x] `bin/validate-smoke.test.ts` / `bin/report-smoke.test.ts` -- flag acceptance/precedence/rejection tests -- CI guards the new surface.
- [x] `docs/usage.md` -- document `generate:sample` + `--corpus-dir` -- operator-facing docs stay current.
- [x] Commit the generated fixture (`corpus/example/`, `corpus/snapshots/example/`, `corpus/probes/example/`) -- the browsable, CI-validatable artifact. (Fixture generated and trackable — `git add -n corpus` yields exactly the 57 fixture files; the human commits.)

**Acceptance Criteria:**
- Given the generator runs twice into the same corpus root, when the outputs are compared, then the fixture (manifest, evidence, both reports) is byte-identical (NFR-1 determinism).
- Given a fresh checkout with the committed fixture, when `npm run validate:smoke -- --corpus-dir corpus` and `npm run report:smoke -- --corpus-dir corpus` run, then both exit 0 (18/18 checks, 14/14 scenarios) and `report.html` + `report.json` are produced in `corpus/example/`.
- Given `--corpus-dir <dir>` plus a `CORPUS_DIR` env value, when either CLI runs, then the flag wins (flag > env > default).
- Given an unknown flag such as `--bogus`, when passed to either CLI, then the existing "Invalid argument(s)" + usage error is returned with exit 1.
- Given the committed fixture, when a reader opens the repo, then `corpus/example/report.html`, `report.json`, and the evidence files are browsable, and no real recorded data is present (all mock content).

## Design Notes

The per-step recipe (stateId/url/dialog) is cloned from the verified all-passing run `efcb749d…`; snapshot bodies are minimal synthetic strings (e.g. `<div>mock home</div>`, plus `role="dialog"` where a predicate needs it). Fixed timestamps (pre `…00.000Z`, post `…00.400Z`) make `timingMs` a stable 400 and newest-run resolution byte-stable.

Per-step snapshot recipe (pre url is `https://pro.kraken.com/app/home` unless noted; post url is `https://pro.kraken.com` + the path column):

| i | contract | pre state | post state | post url path | dialog pre | dialog post |
|---|----------|-----------|------------|---------------|------------|-------------|
| 0 | clickHistoryMenuMain | homePage | historyMain | /app/history/main/ledger | no | no |
| 1 | clickHistoryMenuFutures | homePage | historyFutures | /app/history/derivatives/ledger | no | no |
| 2 | clickPortfolioMenuOverview | homePage | portfolioOverview | /app/portfolio/overview | no | no |
| 3 | clickPortfolioMenuMain | homePage | portfolioMain | /app/portfolio/main | no | no |
| 4 | clickPortfolioMenuFutures | homePage | portfolioFutures | /app/portfolio/derivatives | no | no |
| 5 | clickPortfolioMenuLoans | homePage | portfolioLoans | /app/portfolio/loans | no | no |
| 6 | clickPortfolioMenuEarn | homePage | earn | /app/earn | no | no |
| 7 | openPortfolioSummary | homePage | portfolioSummaryDialog | /app/home | no | yes |
| 8 | closePortfolioSummary | portfolioSummaryDialog | homePage | /app/home | yes | no |
| 9 | openPortfolioSummary | homePage | portfolioSummaryDialog | /app/home | no | yes |
| 10 | closePortfolioSummary | portfolioSummaryDialog | homePage | /app/home | yes | no |
| 11 | openPortfolioSummary | homePage | portfolioSummaryDialog | /app/home | no | yes |
| 12 | toggleEyeIcon | portfolioSummaryDialog | portfolioSummaryDialog | /app/home | yes | yes |
| 13 | closePortfolioSummary | portfolioSummaryDialog | homePage | /app/home | yes | no |
| 14 | filterHistoryByAsset | historyMain | historyMain | /app/history/main/ledger | no | no |
| 15 | filterHistoryByAsset | historyMain | historyMain | /app/history/main/ledger | no | no |
| 16 | paginateHistoryNext | historyMain | historyMain | /app/history/main/ledger | no | no |
| 17 | selectOrderBookTab | orderBook | orderBook | /app/trade/btc-usd | no | no |

Pre-url exceptions: steps 8/10/12/13 pre state `portfolioSummaryDialog` → `https://pro.kraken.com/app/home`; steps 14–16 pre state `historyMain` → `https://pro.kraken.com/app/history/main/ledger`; step 17 pre state `orderBook` → `https://pro.kraken.com/app/trade/btc-usd`.

Probe batch per step (both names always present; `capturedAt` fixed): `selected-view` = Ledger (0,1,14,15,16), Overview (2), Main (3), Futures (4), Loans (5), `""` otherwise; `selected-board-tab` = `"Order book"` only for step 17, else `""`.

The gitignore recipe works because `corpus/*` re-includes immediate children and the three `!` negations re-include only the fixture subtrees — every other path under `corpus/` remains matched by the original `corpus/` rule (real runs stay ignored).

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm test` -- expected: all suites green (incl. new `generate-sample-report.test.ts` + flag tests)
- `npm run generate:sample` -- expected: fixture written; self-check prints 18/18; exit 0
- `npm run validate:smoke -- --corpus-dir corpus` -- expected: 18/18 checks, exit 0
- `npm run report:smoke -- --corpus-dir corpus` -- expected: 14/14 scenarios, both report paths printed, exit 0
- Determinism gate: run `generate:sample` twice, then `git diff --exit-code -- corpus/example corpus/snapshots/example corpus/probes/example` -- expected: empty

**Manual checks (if no CLI):**
- `git status` shows only the fixture paths tracked under `corpus/` (no real run dirs/evidence).
- Open `corpus/example/report.html` — green summary bar, evidence links resolve to `corpus/snapshots/example/…` / `corpus/probes/example/…`.

## Spec Change Log

(Append-only — empty until the first review loopback.)

- **2026-09-11 (implementation): `.gitignore` recipe needed four guard lines beyond the frozen four.** The frozen recipe (`corpus/*` + `!corpus/example/` + `!corpus/snapshots/example/` + `!corpus/probes/example/`) is insufficient as written: git cannot re-include a path under an excluded parent directory, so `corpus/snapshots/` and `corpus/probes/` (matched by `corpus/*`) stay excluded and their nested negations never apply — verified empirically with `git check-ignore` (the frozen recipe left `corpus/snapshots/example/0.json` ignored). Implementation keeps the four frozen lines, in order, and adds the standard guards: `!corpus/snapshots/`, `corpus/snapshots/*`, `!corpus/probes/`, `corpus/probes/*`. Result matches the frozen intent exactly: only the fixture subtree is trackable (`git add -n corpus` → 57 files, all under `corpus/example/`, `corpus/snapshots/example/`, `corpus/probes/example/`), real runs and `network/`/`screenshots/` evidence stay ignored. No frozen text was modified.
- **2026-09-11 (implementation note): local `@last-run` fan precedence.** `resolveLatestRun` prefers the `@last-run` fan over the newest manifest, so on a machine with prior live recordings `npm run validate:smoke -- --corpus-dir corpus` resolves the *fan's* run (18/18 also passes there), not `example`. On a fresh checkout (CI) the fan is absent and `example` is the newest manifest — verified in a fan-less copy: both CLIs resolve `example`, 18/18 / 14/14, reports written to `corpus/example/`. Matches the AC's "fresh checkout" framing; no code change.

## Suggested Review Order

**The generator — deterministic mock fixture mint**

- The whole generator: write fixture -> self-check via validators -> emit both reports -> verify report.json -> guard outcomes
  [`generate-sample-report.ts:328`](../../../../bin/generate-sample-report.ts#L328)
- The 18-step mint recipe (manifest + pre/post snapshots + probe batches) bound to the plan
  [`generate-sample-report.ts:221`](../../../../bin/generate-sample-report.ts#L221)
- Failure atomics: fixture subtrees wiped before writing and on any non-zero outcome
  [`generate-sample-report.ts:280`](../../../../bin/generate-sample-report.ts#L280)
- Report self-verify — report.json must parse with the schema tag before success
  [`generate-sample-report.ts:300`](../../../../bin/generate-sample-report.ts#L300)

**Fixture resolution + the --corpus-dir flag**

- Flag extraction runs before the guard; empty values rejected; precedence flag > options > env > default
  [`validate-smoke.ts:88`](../../../../bin/validate-smoke.ts#L88)
- Newest-run resolution prefers real runs — the fixture's fixed timestamp can't hijack the default
  [`validate-smoke.ts:177`](../../../../bin/validate-smoke.ts#L177)
- report:smoke applies the same extraction with the positional-count guard on remaining args
  [`report-smoke.ts:259`](../../../../bin/report-smoke.ts#L259)

**Shared run-id + repo plumbing**

- The one reserved runId both generator and resolution know about
  [`sample-run-id.ts:8`](../../../../bin/sample-run-id.ts#L8)
- Fixture-only un-ignore recipe (frozen 4 lines + the 4 git-parent guard lines)
  [`../../../../.gitignore:38`](../../../../.gitignore#L38)

**Supporting — tests, docs**

- Determinism, rollback, non-interference, empty-flag guard, npm-script spawn — the generator contract
  [`generate-sample-report.test.ts:111`](../../../../bin/generate-sample-report.test.ts#L111)
- Committed-fixture shape + prohibited content (exact file set, no network/screenshots, no balances)
  [`generate-sample-report.test.ts:414`](../../../../bin/generate-sample-report.test.ts#L414)
- Fixture excluded from the implicit default; explicit example still resolves
  [`validate-smoke.test.ts:200`](../../../../bin/validate-smoke.test.ts#L200)
- Unconditional 18/18 against the committed fixture (and report-side 14/14)
  [`validate-smoke.test.ts:411`](../../../../bin/validate-smoke.test.ts#L411)
- Fixture examples use the explicit runId so local fan precedence can't surprise
  [`usage.md:reports-section`](../../../../docs/usage.md)
