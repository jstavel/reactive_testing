---
title: 'validate:smoke CLI — offline validation counterpart to run:smoke'
type: 'feature'
created: '2026-09-09'
status: 'draft'
review_loop_iteration: 0
context:
  - _bmad-output/implementation-artifacts/deferred-work.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Recording and verifying are separated by design, but only recording has a CLI: `npm run run:smoke` exists while validation requires hand-writing a `verify-run.ts` snippet (docs/usage.md §3). The offline validator runner is complete (`validators/offline-runner.ts`), it just has no operator entry point.

**Approach:** Add a print-only `bin/validate-smoke.ts` behind `npm run validate:smoke` that loads the smoke plan, resolves the run to validate, runs `runValidatorsOffline`, prints a per-result pass/fail summary, and exits non-zero when any check failed. Defaults to the latest recorded run; explicit runId and contract-id filters are optional.

## Boundaries & Constraints

**Always:**
- Arguments: `npm run validate:smoke -- [<runId>] [<contractId>…]` — runId optional (defaults to the latest run), contract ids optional (each filters which validators run, mirroring `runValidatorsOffline`'s `contractIds`).
- Latest-run resolution: prefer the `@last-run` handoff fan (resolve to its canonical run dir); when absent, fall back to the newest `run-manifest.json` in `corpus/` by mtime, skipping `@`-prefixed fans and the kind dirs.
- Exit codes: `0` when every result passed or the run has no results to validate; `1` when any result failed, when the run is unknown, or on usage error. An unknown contractId filter is an error (it would silently validate nothing).
- Output: one line per `ValidationResult` (`[PASS]/[FAIL] contractId — details?`), plus a summary line `X/Y checks passed in <runId>`; failures print their `details`.
- Deterministic and offline: no browser, no CDP, no AI (NFR-1). Reads only `corpus/` and `model/`.

**Ask First:** none — the four design decisions were pinned this session (default latest run, optional contract filters, non-zero exit on failure, cross-view wiring deferred).

**Never:**
- No wiring of `runCrossViewInvariants` (epic-4 retro item-5) — that stays a separate decision with its own probe-config scope.
- No changes to `runValidatorsOffline`, `corpus-loader`, or the reporter modules; the CLI is a thin caller.
- No mutation of the corpus — validation is read-only.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| DEFAULT_LATEST | `npm run validate:smoke` | validates the latest run (via `@last-run`, fallback newest manifest), prints summary | no runs → exit 1 with guidance |
| EXPLICIT_RUN | `npm run validate:smoke -- <runId>` | validates that exact run | unknown runId → exit 1, list nothing |
| CONTRACT_FILTER | `npm run validate:smoke -- <runId> filterHistoryByAsset` | only that contract's checks run | unknown contractId → exit 1 naming valid ids |
| FAILING_CHECK | corpus violates a validator | `[FAIL]` line with details; exit code 1 | N/A |
| LEGACY_CORPUS | run predates per-step pre-snapshots | checks report `missing snapshot evidence` (documented caveat) — still exit 1 on failures | N/A |

</frozen-after-approval>

## Code Map

- `bin/validate-smoke.ts` -- NEW: arg parsing, run resolution, `runValidatorsOffline` call, summary printing, exit codes. Mirrors the print-only conventions of `bin/corpus-links.ts` (no mutation, `CORPUS_DIR` override not needed — corpus dir is `corpus` like `run-smoke`).
- `bin/scenario-select.ts` -- reuse the unknown-ids error pattern (`UnknownScenarioIdError`-style message listing valid ids) for contract filters.
- `validators/offline-runner.ts` -- the engine; called as-is (`runValidatorsOffline(corpusDir, runId, plan, contractIds?)`).
- `model/smoke.test-plan.ts` -- the plan loaded by the CLI (`smokeTestPlan`), same as `bin/run-smoke.ts:7`.
- `orchestrator/handlinks.ts` -- `resolveFan`/`LAST_RUN` for default latest-run resolution via the `@last-run` fan.
- `package.json` -- add `"validate:smoke": "tsx bin/validate-smoke.ts"` (sibling of `run:smoke`).
- `docs/usage.md` -- §3's hand-written `verify-run.ts` snippet gets superseded; point it at the new script.

## Tasks & Acceptance

**Execution:**
- [ ] `bin/validate-smoke.ts` -- implement the CLI (arg parsing, latest-run resolution via `@last-run` + newest-manifest fallback, `runValidatorsOffline` call, per-result `[PASS]/[FAIL]` lines, summary, exit codes) -- the deliverable
- [ ] `package.json` -- add the `validate:smoke` script -- operator surface
- [ ] `bin/validate-smoke.test.ts` -- unit-test arg handling and summary formatting via a helper extracted for testability (resolve-run fallback, unknown run, unknown contract filter, failing check exit semantics) -- pin the CLI contract
- [ ] `docs/usage.md` -- replace the §3 hand-written snippet with `npm run validate:smoke` usage and exit-code semantics -- close the doc gap that surfaced this RFE

**Acceptance Criteria:**
- Given a recorded run, when `npm run validate:smoke` runs with no arguments, then it validates the latest run and prints one line per check plus a summary.
- Given a runId, when `npm run validate:smoke -- <runId>` runs, then only that run is validated.
- Given contract-id filters, when passed after the runId, then only matching checks run; an unknown filter exits 1 listing valid contract ids.
- Given any failing check, unknown run, or no recorded runs, the CLI exits 1 with a clear message; all-pass exits 0.
- Given the offline pipeline, when the CLI runs, then it performs no corpus mutation and no browser interaction.

## Spec Change Log

<!-- Append-only. Populated by step-04 during review loops. Do not modify or delete existing entries. -->

## Design Notes

- Exit-code asymmetry is deliberate and mirrors `run-smoke`: a *fully passing* run exits 0, *any* failing check exits 1 (unlike `run:smoke`, which exits 0 when some scenarios pass — validators have no "at least one passed" gray zone).
- The `@last-run` fan is preferred for default resolution because it is exactly what `run:smoke` last wrote; the newest-manifest fallback keeps the CLI usable before/independently of the handoff links.

## Verification

**Commands:**
- `npm run typecheck` -- expected: exits 0
- `npm test` -- expected: exits 0
- `npm run validate:smoke` (against the latest live corpus) -- expected: prints per-check lines and exits per the semantics above; then `npm run validate:smoke -- <runId> filterHistoryByAsset` -- expected: only that contract's checks

**Manual checks:**
- `npm run validate:smoke` on a legacy pre-`{stepIndex}.pre.json` corpus prints the documented `missing snapshot evidence` failures and exits 1 — the legacy-corpus caveat now observable from the CLI.