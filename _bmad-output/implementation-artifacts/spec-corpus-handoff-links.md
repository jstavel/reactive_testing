---
title: 'Corpus handoff links (@last-run / @last-fail)'
type: 'feature'
created: '2026-09-09'
baseline_commit: 'd7da3d34fe1e23f2bdbb1704ebe76ef507a12788'
status: 'done'
review_loop_iteration: 1
context:
  - _bmad-output/implementation-artifacts/spec-3-2-validator-declares-corpus-dependencies-one-navigation-funds.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** After a failing smoke run, the exact corpus is hard to find: the runId is an opaque UUID, `run-smoke` never prints it, and the corpus is kind-split (`network/ probes/ screenshots/ snapshots/` as siblings plus a per-run manifest), so one run is a fan of paths, not a single directory.

**Approach:** During each run, create and maintain **stable symlink "handoff" views** that reassemble a run across its kind dirs, and print the resolved corpus path when the run completes. `@last-run` always points at the latest run; `@last-fail` points at the latest failing run and disappears on a pass. The corpus stays a lake — no layout migration.

## Boundaries & Constraints

**Always:**
- Keep UUID runIds unchanged. Keep the kind-split "lake" layout unchanged; do not collapse it into per-run subdirectories.
- `@last-run` is a symlink fan that always targets the latest completed run's kind dirs; `@last-fail` is the same fan but only exists while the latest run failed, and is removed when a run passes (absent → only ever when it would point at a failed run).
- The symlink fan for one run wires the corresponding per-kind dirs plus the manifest dir: `manifest/ snapshots/ network/ probes/ screenshots/`.
- Symlink creation/resolution/removal happens during `run:smoke` completion; no new bespoke CLI. The operator-facing surface is npm scripts.
- `corpus`-style scripts only print/resolve the canonical corpus path — they never `cd`, open editors, or mutate.
- Offline consumers (`validators/corpus-loader.ts`, reporter) keep reading `corpus/<runId>/…` directly; the symlink view is an operator convenience, never the loader's input. Deterministic (NFR-1).
- `@last-fail` semantics: after a run with any failure it points at that run; after a run with no failures it does not exist.

**Ask First:**
- Exact npm script names to add (MVP suggests `corpus:last-run` / `corpus:last-fail` / `corpus:list`), and the exact manual verification the operator runs after `run:smoke`.
- Whether the "fan" is fully flat (`@last-run/snapshots -> ../snapshots/<runId>`) or one parent dir with per-kind symlinks; recommend flat.

**Never:**
- No changes to `runId` format, corpus file schema (`run-manifest.json`, snapshot/probe records), validator/loader logic, or reporter output semantics.
- No fuzzy/query/AI corpus search — MVP is only symlink creation/removal during a run. Second-brain querying is a separate RFE.
- The links must never be used as inputs to validation or as a persistence layer.

</frozen-after-approval>

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH | `run:smoke` succeeds, at least one scenario passed | `@last-run` -> new run; `@last-fail` absent | no cleanup needed |
| FAILING_RUN | `run:smoke` has at least one failing scenario | `@last-run` and `@last-fail` both point to the new run | none |
| PASS_AFTER_FAIL | prior run failed, current pass | `@last-fail` removed; `@last-run` points to current | stale `@last-fail` never lingers |
| MISSING_KIND | a kind dir (e.g. `network/`) has no files for the run | fan includes a link to it (`network/` exists but empty); loading is unaffected | absent kind → link still created, reader sees empty dir |
| MANIFEST_PATH | same-run manifest at `corpus/<runId>/run-manifest.json` | the fan's manifest link points to `manifest/` → the manifest dir | none |

</frozen-after-approval>

## Code Map

- `orchestrator/corpus.ts` -- `startCorpusRun` (returns `{ runId: randomUUID(), files: [] }`), `writeCorpusFile`, `finishRun`. The run's completion is the hook where handoff symlinks are created.
- `orchestrator/orchestrator.ts` — `runTestPlan` calls `finishRun(...)` on completion; currently returns `{ planId, modelVersion, scenarios, setup }` without surfacing the runId.
- `bin/run-smoke.ts` — the runner CLI; at the end it computes `passed`, prints the summary, and would print the corpus path (from `RunResult`).
- `model/schemas.ts` — `RunResult` (runId/timestamp/scenarios), `CorpusRun`; optionally expose `runId` on `RunResult` so the runner can create the links.
- `package.json` — scripts: `run:smoke`, `typecheck`, `test`. Add `corpus:last-run`, `corpus:last-fail`, `corpus:list`.
- New helper module (e.g. `corpus/handoff.ts`) — pure symlink-fan resolution/creation/removal, tested in isolation (tmp dir).
- Validators/reporter unchanged (offline path reads `corpus/<runId>/…` directly; links are convenience-only).

## Tasks & Acceptance

**Execution:**
- [x] `model/schemas.ts` — add optional `runId?: string` to `RunResult` so the CLI can print the exact corpus path — expose the run identity to the operator
- [x] `orchestrator/orchestrator.ts` — propagate `corpus.runId` into `RunResult` in both the launch-failure and success paths — the runner learns the authoritative runId *(implemented on the success path only — see change log 2026-09-09)*
- [x] new `corpus/handlinks.ts` — implement `linkRun(corpusDir, runId, kindDirs)` + `unlinkLastFail(corpusDir)` + resolution; symlink fan over `manifest snapshots network probes screenshots`, created relative to `corpusDir` (portable) — the core deliverable *(implemented at `orchestrator/handlinks.ts` — `corpus/` is the gitignored runtime evidence dir, source cannot live there; see change log)*
- [x] `orchestrator/corpus.ts` — after `finishRun`, if any failure recorded, point `@last-fail` at the run; always re-point `@last-run`; remove `@last-fail` when no failures — the run writes its handoff on completion
- [x] `bin/run-smoke.ts` — after the summary, print `Corpus: corpus/@last-run → <abs> (runId)` — visible handoff
- [x] `package.json` — add `corpus:last-run` / `corpus:last-fail` / `corpus:list` npm scripts (print-only) — operator UX API
- [x] Tests — `handlinks.test.ts`: happy path, failing run, pass-after-fail removes `@last-fail`, missing-kind fan, relative-target portability, and that `corpus:list` prints a resolved path — pin the symlink semantics
- [x] `orchestrator.test.ts` / `corpus.test.ts` — assert `RunResult.runId` and that the runner creates `@last-run`/`@last-fail` appropriately — integration wiring

**Acceptance Criteria:**
- Given a fresh `run:smoke`, when it completes with at least one passing scenario, then `corpus/@last-run` exists as a symlink to the latest run's fan and `corpus/@last-fail` is absent.
- Given a `run:smoke` with at least one failing scenario, when it completes, then both `corpus/@last-run` and `corpus/@last-fail` exist and point to that run's kind dirs.
- Given a prior failing run, when the next run passes, then `corpus/@last-fail` is removed.
- Given `npm run corpus:last-run` (or `corpus:list`), when an operator runs it, then it prints the resolved canonical corpus path and makes no other filesystem change.
- Given the corpus has no `network/` files for a run, when the fan is created, then the fan still includes a `network` link (convenience-only; offline validation unchanged).
- Given the repo's offline pipeline, when a run's links are created or removed, validation and report generation still read `corpus/<runId>/…` unchanged.

## Spec Change Log

<!-- Append-only. Populated by step-04 during review loops. Do not modify or delete existing entries. -->

- **2026-09-09 (implementation)** — Implemented and verified. `model/schemas.ts` gained `RunResult.runId?`; `orchestrator/orchestrator.ts` returns `corpus.runId` and passes `{ failed: scenarioResults.some(s => !s.passed) }` to `finishRun`; `orchestrator/handlinks.ts` (NEW) owns `linkRun`/`unlinkLastFail`/`writeHandoff`/`resolveFan`/`resolveFanRunId`; `finishRun` writes the handoff after the manifest (only when the orchestrator passes the new `handoff?` arg — offline harness callers untouched); `bin/corpus-links.ts` (NEW) + three print-only npm scripts (`corpus:last-run`/`corpus:last-fail`/`corpus:list`, `CORPUS_DIR` env override for scripting/tests); `run-smoke.ts` prints `Corpus: …/@last-run → <abs> (runId …)` after the summary and on the all-scenarios-failed exit. The `schemas.ts` edit is a hashed model file (AD-17) → smoke plan `modelVersion` regenerated (`6fa0e240…` → `3b97cf8b…`). Deviations: (1) helper lives at `orchestrator/handlinks.ts`, not `corpus/handlinks.ts` — repo-root `corpus/` is the gitignored runtime evidence lake (`.gitignore`, docs/project-map.md), committed source cannot live there; (2) runId propagates on the success path only — `orchestrator.test.ts` ("no partial corpus when CDP attach fails") pins that the launch-failure path never *starts* a corpus run, so there is no runId to surface there and none is fabricated. Verified: `npm run typecheck` clean; `npm test` 288/288 (23 files; 13 new handlink tests, finishRun/orchestrator wiring extended, roundtrip filter adjusted for the fan dirs). Live manual check: `npm run run:smoke` completed 6/13 (the earn-page/dialog failures are pre-existing app drift — older manifests record the same contracts failing); run printed `Corpus: corpus/@last-run → /home/jstavel/dev/reactive-testing/corpus/@last-run (runId d3b954b0-8f36-47a0-9c28-72c78c596430)`; both `@last-run` and `@last-fail` fans exist with the five relative links; the `network` link resolves to an empty dir (missing-kind case, smoke plan declares no network dependency); `npm run corpus:list` resolves both fans; offline validators re-ran over the new `corpus/<runId>/…` directly (17 validators, no link involvement). Pass-after-fail `@last-fail` removal is pinned by tests (handlinks/corpus/offline-roundtrip) — a live passing run could not be reproduced because the smoke plan currently fails on the live app.
- **2026-09-09 (review round 1)** — Targeted review fixes folded in, frozen intent untouched: (1) `resolveFan` now returns the CANONICAL run dir (realpath of the fan's `manifest` link, which must contain `run-manifest.json`), `null` on absent fan/link/manifest, fully try/catch-wrapped so a concurrent re-point resolves to `null` instead of throwing; (2) `linkRun` guards runIds against `^[A-Za-z0-9-]+$` so a malicious id can never escape the corpus via symlink targets; (3) `finishRun` warns (`[handoff] skipped: …`) and keeps the completed run on any handoff write failure — the manifest is already written; (4) new pure `handoffLine(result, corpusDir, failed?)` builds the operator line (`Corpus: corpus/@last-run → /abs/corpus/<runId> (runId …)`, `· corpus/@last-fail → …` suffix when failed) and returns `null` when nothing honest to print; (5) `run-smoke.ts` prints that line LAST on all three completion paths (success summary, all-failed error, zero-scenarios early exit); (6) `bin/corpus-links.ts` usage text now names the npm scripts; (7) npm spawns in tests are win32-portable (`npm.cmd`); (8) `docs/usage.md` verify-run snippet excludes `@`-prefixed fans and mentions `corpus:list`/`@last-run` instead of mtime-guessing; (9) new tests: run-timeout and setup/bootstrap-failure runs assert `{ failed: true }`, `handoffLine` unit tests (failing/passing/undefined-runId/absent-mismatched fan), `linkRun` guard, `resolveFan` null cases (missing manifest file, dangling link), and `finishRun` warns-instead-of-throws. Verified: `npm run typecheck` clean, `npm test -- --run` 299/299 (288 → 299); live corpus re-checked — `corpus:list`/`corpus:last-fail` print the canonical run dir and `handoffLine` renders the failing-run line against the real corpus.

## Design Notes

- **Symlink fan shape.** `corpus/@last-run/manifest -> ../<runId>`, `corpus/@last-run/snapshots -> ../snapshots/<runId>`, etc. `cd` to the name and each kind is immediately addressable. Relative targets (not absolute) keep the corpus portable on a `cp -a`/`rsync` mirror.
- **No `cd`, no side effects.** `npm run corpus:*` only prints the resolved path; `cd $(npm run --silent corpus:last-run)` is the operator's own composition. The handoff links are a *view* over the lake, never a persistence layer.
- **`@last-fail` lifecycle.** The runner knows pass/fail per scenario; if `result.scenarios.some(passed===false)` then it re-points `@last-fail`; else it removes it. Simple, deterministic — a passing run clears the debugger state.

## Verification

**Commands:**
- `npm run typecheck` -- expected: exits 0
- `npm test` -- expected: 0, all new handoff tests pass (handlinks, corpus, orchestrator runId wiring, npm corpus scripts)

**Manual checks:**
- `npm run run:smoke` against a live corpus: confirm `corpus/@last-run` and (on failure) `corpus/@last-fail` appear, and that `npm run corpus:last-run` prints the resolved path without creating files.
- Create a failing run locally (e.g. `npm test -- ...` with a failing scenario or a manual corpus), verify the fan resolves all five kinds, then a passing run removes `@last-fail`.

## Suggested Review Order

**Handoff link semantics (the design intent — read this first)**

- The fan shape: relative symlinks over the kind-split lake, security-guarded runId.
  [`handlinks.ts:65`](../../orchestrator/handlinks.ts#L65)

- `resolveFan` resolves the *canonical run dir* (not the fan dir); `handoffLine` builds the operator-facing line, `null` when nothing honest.
  [`handlinks.ts:118`](../../orchestrator/handlinks.ts#L118)

- `writeHandoff` lifecycle: re-point `@last-run` always, `@last-fail` on fail / remove on pass.
  [`handlinks.ts:96`](../../orchestrator/handlinks.ts#L96)

**Run completion wiring**

- `finishRun` writes the handoff only when asked; a symlink failure warns, never fails the run.
  [`corpus.ts:87`](../../orchestrator/corpus.ts#L87)

- `runFailed` derivation vs. `@last-fail`; passed at the end of `runTestPlan`.
  [`orchestrator.ts:236`](../../orchestrator/orchestrator.ts#L236)

**Operator surface**

- `RunResult.runId?` propagated so the runner can print the exact corpus path.
  [`schemas.ts:266`](../../model/schemas.ts#L266)

- `run-smoke` prints the handoff line last on all completion paths.
  [`run-smoke.ts:87`](../../bin/run-smoke.ts#L87)

- Print-only `corpus:*` resolver + npm scripts (no `cd`, no mutation).
  [`corpus-links.ts:12`](../../bin/corpus-links.ts#L12)

- Docs: verify-run snippet now skips the `@` fans and points at `corpus:list`.
  [`usage.md:103`](../../docs/usage.md#L103)

**Tests**

- fan-link semantics + lifecycle + npm-script surface + runId guard
  [`handlinks.test.ts:74`](../../orchestrator/handlinks.test.ts#L74)