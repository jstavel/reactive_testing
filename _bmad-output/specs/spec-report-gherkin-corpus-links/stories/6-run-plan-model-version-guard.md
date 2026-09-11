---
title: 'Run-plan modelVersion guard'
type: 'feature'
created: '2026-09-11'
status: 'done'
review_loop_iteration: 0
baseline_commit: 77b1c6f7ad0651854ab2be06fbfb85c8086a4049
context:
  - '_bmad-output/specs/spec-report-gherkin-corpus-links/SPEC.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The offline CLIs validate/report a corpus run against the **current** plan, but nothing records which model a run was recorded under. As the model grows (new scenarios, reordered steps), step-indexed evidence refs and per-contract validation silently misalign against stale recordings — a run recorded under an older model can look validated when it never was.

**Approach:** Record the executed plan's `modelVersion` in `run-manifest.json` at record time, and make `validate:smoke`/`report:smoke` refuse (with a precise "re-record" message) any run whose recorded plan version differs from the current plan — or whose manifest lacks the field (legacy recordings). Accepted churn: the schema change re-hashes the model, regenerating the plan and the committed sample fixture.

## Boundaries & Constraints

**Always:**
- `runManifestSchema` gains a required `planModelVersion: z.string()` — the corpus-versioned contract every new run carries.
- `finishRun` (the orchestrator's run-manifest writer) writes `planModelVersion` from the executed plan; `run:smoke` threads `parsed.plan.modelVersion` into it. Handoff/fan behavior is unchanged.
- Both CLIs run the guard **after** run resolution and **before** `runValidatorsOffline` / any report write:
  - manifest field present and equal to `plan.modelVersion` → validate/report behave exactly as today;
  - field present and different → exit 1: "model changed since recording (<recorded> ≠ <current>) — re-record the run (run:smoke)";
  - field absent (legacy manifest) → exit 1: "run predates the plan-version guard (no planModelVersion in the manifest) — re-record the run (run:smoke)". Never the generic zero-checks error.
- Guard failures are state errors: a single message naming the fix, exit 1 — no usage/flag noise. No report is written on a report-side guard failure (report.html and report.json both absent).
- The generator's `fixtureManifest` carries `planModelVersion = smokeTestPlan.modelVersion` for both `example` and `fail-demo`; regenerate the fixtures deterministically so they keep passing `validate:smoke`/`report:smoke` and the CI determinism gate.
- The accepted churn is mandatory: after the schema edit, regenerate `smoke.test-plan.ts`'s `modelVersion` per its own header convention, regenerate + commit `corpus/example` (the manifest now carries the field), and keep `model-version.test.ts` pinning green.
- Operator-facing docs (`docs/usage.md`) note the behavior change: local runs recorded before this story now require re-recording before `validate:smoke`/`report:smoke` accept them.

**Ask First:** None.

**Never:**
- No silent pass, warn-and-continue, or downgrade on a missing/mismatched plan version.
- No change to handoff symlinks, fan resolution, or the newest-run selection.
- No report or validation on a guard failure (nothing written for report:smoke).
- No hand-editing of `smoke.test-plan.ts` beyond its regeneration convention.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| MATCH | manifest `planModelVersion === plan.modelVersion` | validate/report run exactly as today (outcome by evidence) | N/A |
| MISMATCH | recorded ≠ current | exit 1, "model changed since recording (… ≠ …) — re-record" | state-error exit 1 |
| LEGACY | manifest lacks `planModelVersion` | exit 1, "run predates the plan-version guard — re-record" | state-error exit 1 |
| UNREADABLE | manifest missing / unparseable | existing no-checks-run outcome (unchanged) | existing |
| RECORD | `run:smoke` records a run | manifest `planModelVersion` = the executed plan's hash | N/A |
| FIXTURE | `generate:sample` (and `--fail`) | example + fail-demo manifests carry `planModelVersion`; byte-identical on regen | N/A |

</frozen-after-approval>

## Code Map

- `model/schemas.ts:340-360` -- `runManifestSchema`: add required `planModelVersion: z.string()` (with the run-versioning rationale comment). This edit re-hashes `computeModelVersion()` (`model/model-version.ts:14-27`, SHA-256 over contracts/fsm/schemas text).
- `model/smoke.test-plan.ts:1-6` -- regenerate `modelVersion` per the file's own header convention after the schema edit (comment chain is the pattern to extend).
- `orchestrator/corpus.ts:60-97` -- `finishRun`: new `planModelVersion: string` param → manifest field; keep handoff behavior identical. Update all callers + `orchestrator/corpus.test.ts` handoff/manifest tests (they build exact manifest objects).
- `orchestrator/orchestrator.ts:241` -- pass the executed plan's `modelVersion` into `finishRun`.
- `bin/validate-smoke.ts` -- after run resolution: read the raw manifest, derive `planModelVersion`, and guard before calling `runValidatorsOffline`; a small exported helper (`readPlanModelVersion(corpusDir, runId): string | undefined`) so tests cover it directly. New state-error messages (no usage), exit 1.
- `bin/report-smoke.ts:117-127` -- extend the raw manifest read to include `planModelVersion`; guard before `emitHtmlReport`/`emitJsonReport` (nothing written on failure).
- `bin/generate-sample-report.ts` -- `fixtureManifest` adds `planModelVersion: smokeTestPlan.modelVersion` (both modes).
- Tests: `bin/validate-smoke.test.ts` + `bin/report-smoke.test.ts` -- their manifest-writing fixtures gain `planModelVersion`; new MATCH/MISMATCH/LEGACY cases (report side asserts no report written on guard failure); `bin/generate-sample-report.test.ts` -- fixture manifest pins the field + determinism; `orchestrator/orchestrator.test.ts`/`corpus.test.ts` -- manifest field assertions.
- `docs/usage.md` -- the re-record behavior note for pre-existing local runs.
- `corpus/example/run-manifest.json` (and any fixture reports if the embedded data shifts) -- regenerate + commit.

## Tasks & Acceptance

**Execution:**
- [x] `model/schemas.ts` -- add required `planModelVersion` to `runManifestSchema` -- the corpus-versioned contract.
- [x] `orchestrator/corpus.ts` -- `finishRun` writes `planModelVersion` (new param) -- recorded provenance.
- [x] `orchestrator/orchestrator.ts` (+ `run:smoke` path) -- thread the executed plan's version into `finishRun`.
- [x] `bin/validate-smoke.ts` -- raw-manifest plan-version read + MISSING/MISMATCH guard before the runner -- the offline gate.
- [x] `bin/report-smoke.ts` -- guard before any report write (nothing on failure) -- reporting gate parity.
- [x] `bin/generate-sample-report.ts` -- fixture manifest carries `planModelVersion` (example + fail-demo).
- [x] `model/smoke.test-plan.ts` + `corpus/example` -- regenerate plan hash + fixture, commit -- accepted churn, gate stays green.
- [x] Tests -- MATCH/MISMATCH/LEGACY on both CLIs, record-path field, generator field + determinism, orchestrator manifest.
- [x] `docs/usage.md` -- re-record behavior note for pre-existing local runs.

**Acceptance Criteria:**
- Given a run recorded by `run:smoke`, when its manifest is read, then it contains `planModelVersion` equal to the executed plan's `modelVersion`.
- Given a run whose manifest `planModelVersion` equals the current plan's, when `validate:smoke`/`report:smoke` run, then behavior is unchanged from today (outcome by evidence, reports written on report).
- Given a run whose manifest `planModelVersion` differs from the current plan's, when either CLI runs, then it exits 1 with "model changed since recording (… ≠ …) — re-record", and for `report:smoke` nothing is written.
- Given a legacy manifest without `planModelVersion`, when either CLI runs, then it exits 1 with the "run predates the plan-version guard — re-record" message (never the generic zero-checks error).
- Given the schema change, when the model hash and fixture regenerate, then `model-version.test.ts` pins the new hash, `generate:sample` output stays byte-identical against the committed `corpus/example`, and `validate:smoke example`/`report:smoke example` both still exit 0.

## Design Notes

The guard sits on the offline path, not the recorder — recording always records whatever plan is current, and the *consumer* decides whether old evidence is still interpretable. The legacy (no-field) case is its own message because it is a different root cause than drift: the manifest predates provenance, vs the model moved on. Both are "re-record" outcomes, but the operator can tell why.

Churn is inherent: `runManifestSchema` lives in `schemas.ts`, which is one of the three hashed model files, so the field addition changes the model digest. The regeneration (plan + committed fixture) keeps the repo's own invariant honest — the fixture now encodes the version it was made under, which is the very property the guard protects.

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm test` -- expected: all green (incl. the new guard + record-path + generator cases); `model-version.test.ts` pins the regenerated hash
- `npm run generate:sample` then `git diff --exit-code -- corpus/example corpus/snapshots/example corpus/probes/example` -- expected: empty (determinism gate)
- `npm run validate:smoke -- example --corpus-dir corpus` + `npm run report:smoke -- example --corpus-dir corpus` -- expected: both exit 0 (18/18, 14/14)
- Manual: edit a copy of a run manifest's `planModelVersion` to a bad hash → run both CLIs → exit 1 with the change message and (for report) nothing written

**Manual checks (if no CLI):**
- A pre-existing local run (no field) → both CLIs print the "predates the guard" message + exit 1 (documented re-record behavior).

## Spec Change Log

<!-- Append-only -- populated by step-04 on review loopback. -->

## Suggested Review Order

**The provenance contract**

- runManifestSchema gains required `planModelVersion` (min 1) — the corpus-versioned record every new run carries
  [`schemas.ts:355`](../../../../model/schemas.ts#L355)
- finishRun threads the executed plan's version into the manifest (record path, handoff behavior unchanged)
  [`corpus.ts:70`](../../../../orchestrator/corpus.ts#L70)

**The offline gate (both CLIs)**

- One shared raw-manifest reader — guard condition independent of timestamp validity
  [`validate-smoke.ts:148`](../../../../bin/validate-smoke.ts#L148)
- The refusal semantics: absent/blank = LEGACY, unequal = MISMATCH, unreadable = existing zero-checks
  [`validate-smoke.ts:184`](../../../../bin/validate-smoke.ts#L184)
- Guard fires on every resolution path (explicit + implicit/newest + @last-run fan)
  [`validate-smoke.ts:363`](../../../../bin/validate-smoke.ts#L363)
- report:smoke refuses before any write — pre-existing reports preserved byte-identical
  [`report-smoke.ts:guard`](../../../../bin/report-smoke.ts#L305)

**Churn + supporting**

- Regenerated plan hash + committed fixture manifest (accepted churn, gate stays green)
  [`smoke.test-plan.ts:1`](../../../../model/smoke.test-plan.ts#L1)
- Generator fixture manifest carries the version (example + fail-demo)
  [`generate-sample-report.ts:289`](../../../../bin/generate-sample-report.ts#L289)
- In-suite committed-fixture byte-equality + record-path + fan-branch + preservation tests
  [`generate-sample-report.test.ts`](../../../../bin/generate-sample-report.test.ts#L789)
