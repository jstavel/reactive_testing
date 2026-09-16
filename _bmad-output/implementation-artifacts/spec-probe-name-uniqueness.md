---
title: 'Reject duplicate probe names at plan-config preflight'
type: 'bugfix'
created: '2026-09-16'
status: 'done'
baseline_commit: '8bc695569bede3a40939fc7b9f3143df0d9cd756'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `validateProbeDependencies` builds a `Set` from the configured probe names (`new Set(probes.map((p) => p.name))`), so two probes sharing a name collapse silently — both "run", and the second's `ProbeResult` is unreachable/overwritten in the corpus. The `probeSchema` rejects empty names but cannot express array-level uniqueness.

**Approach:** Detect duplicate configured probe names during the existing plan-config preflight and fail fast with a deterministic error (before the missing-probe check and before CDP launch), mirroring the existing `Plan requires probe(s) not configured` style.

## Boundaries & Constraints

**Always:** The duplicate check runs inside `validateProbeDependencies` before the missing-name check and before any CDP/browser launch — uniqueness is a config-level contract, independent of a probe's `optional` flag. The error is one deterministic throw listing every duplicated name (first-occurrence order), never a warning. Detection is exact-name (case-sensitive, no trimming beyond `probeSchema`'s own trim at plan boundary); duplicate names that also happen to be required-by-contract are reported as duplicates, not as missing. Existing single-instance configs (run-smoke, verify-actions, tests) are byte-identical.

**Ask First:** Case-insensitive or trimmed duplicate comparison (selectors and probe lookups are exact/case-sensitive today); deduplicating config instead of throwing; any `probeSchema`/model version impact.

**Never:** No changes to `probeSchema`, `TestPlan`, or the model hash (`probes` live in `OrchestratorConfig`, outside `computeModelVersion`); no changes to the missing-probe error or its ordering; no changes to how configs are declared in `bin/run-smoke.ts` / `bin/verify-actions.ts` / smoke-config; no network/browser access.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| DUP_SIMPLE | probes `[{name:"a"}, {name:"a"}, {name:"x"}]` | Preflight throws naming `a` | throw before CDP launch |
| DUP_MULTI | probes `[{a},{a},{b},{b}]` | One throw naming both `a, b` | throw |
| DUP_OPTIONAL | A duplicated name where one/both entries are `optional: true` | Still throws — uniqueness is unconditional | throw |
| DUP_REQUIRED | Two probes share a name a contract requires | Duplicate throw (not the missing-probe path) | throw |
| CASE_SENSITIVE | `"Portfolio"` vs `"portfolio"` | Passes (names are exact-match keys today) | N/A |
| NO_DUP | All names unique (current configs) | Behavior unchanged | N/A |

</frozen-after-approval>

## Code Map

- `orchestrator/orchestrator.ts:316-335` -- `validateProbeDependencies(plan, probes)`: add the duplicate-name scan before the `configured` Set (line 330) and missing check (331-334); called at line 65 in `runTestPlan` preflight, before CDP launch.
- `orchestrator/orchestrator.ts:63-65` -- preflight entry: `validatePlan` then `validateProbeDependencies` — the duplicate throw joins this existing fail-fast gate.
- `model/schemas.ts:82-92` -- `probeSchema` (name trimmed non-empty): array-level uniqueness is simply not expressible here; not touched.
- `orchestrator/orchestrator.test.ts:1200-1231` -- existing probe-preflight tests (`PROBE_NOT_CONFIGURED`, invariant missing-probe AC): home of the new negative tests, mirroring the same `.rejects.toThrow(/…)` pattern over `runTestPlan`.
- Config declarations (read-only, already unique): `bin/run-smoke.ts:38-54`, `bin/verify-actions.ts:12`, `bin/smoke-config.ts` (`PORTFOLIO_VALUE_PROBE` + `selected-view` + `selected-board-tab`).

## Tasks & Acceptance

**Execution:**
- [x] `orchestrator/orchestrator.ts` -- in `validateProbeDependencies`, scan `probes` for exact duplicate names; if any, throw `Duplicate probe name(s) configured: <names>.` (first-occurrence order) before the missing-probe logic.
- [x] `orchestrator/orchestrator.test.ts` -- negative tests mirroring the existing pattern: duplicate single name, multiple duplicates (both named), duplicate-optional collision, duplicate-of-required name misreported as duplicate not missing; all assert rejection before CDP use.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- mark L54 `RESOLVED (2026-09-16)` and reconcile the sweep-triage bundle line (`probe-name-uniqueness`).

**Acceptance Criteria:**
- Given a probe config with a duplicated name, when `runTestPlan` runs against any plan, then preflight throws a deterministic error naming the duplicate(s) before any CDP/browser interaction.
- Given the current unique configs (run-smoke, verify-actions, all existing tests), when the suite runs, then every existing test passes unchanged and no config is edited.
- Given `npm run typecheck && npm test && npm run lint`, then all pass with `computeModelVersion()` unchanged.

## Spec Change Log

- 2026-09-16 (review loop 1) — Blind-hunter and edge-case-hunter review of the preflight diff amended the non-frozen planning sections. Detection switched from the seen/`includes` array scan to an O(n) Map count so large configs stay linear AND interleaved duplicates report in true first-occurrence order (a real ordering-contract bug the edge-case reviewer caught: the array version listed second-occurrence order). Error names are JSON-stringified so comma/newline/quote-bearing probe names stay unambiguous and non-forgeable. Tests hardened: anchored-regex message assertions, triple-occurrence (dedup-branch), two-optional, duplicate-vs-missing precedence (duplicate wins), interleaved ordering, launch-exactly-once assertion on the case-sensitivity case, and launch-not-called assertions on the pre-existing missing-probe test. Design Notes corrected: `config.probes` is not re-parsed through `probeSchema`, so exact raw names are the consistent comparison/lookup key. Known-bad avoided: quadratic dup scan, second-occurrence error ordering, substring-permissive assertions.
- KEEP: duplicate check before the missing-probe check, module-private function tested via `runTestPlan`, unconditional (optionality-independent) uniqueness, no config/schema edits.

## Design Notes

The duplicate scan runs before the `configured` Set so a duplicate never leaks into either the missing-name check (a duplicated required probe would otherwise silently satisfy the requirement) or the collector run. Exact raw-name comparison matches the codebase's probe-lookup semantics (`probes.find(p => p.name === …)`, validators and requiredProbeNames all exact-match); `runTestPlan` does not re-parse `config.probes` through `probeSchema`, so raw configured names are both the duplicate-comparison keys and the collector/validator lookup keys. The function stays module-private — `runTestPlan` is the tested entry point (existing tests exercise it via `.rejects.toThrow`), so no new export surface is needed.

## Verification

**Commands:**
- `npm run typecheck` -- expected: exit 0.
- `npm test` -- expected: all suites green (existing 651 + new preflight tests), `computeModelVersion()` unchanged.
- `npm run lint` -- expected: exit 0.

## Suggested Review Order

**Validation logic (entry point)**

- The O(n) Map-count dup scan runs before the missing-probe check and before CDP launch; first-occurrence order, JSON-quoted names.
  [`orchestrator.ts:330`](../../orchestrator/orchestrator.ts#L330)

- The duplicates land before the `configured` Set, so a duplicated required probe reports as duplicate, never silently satisfied or missing.
  [`orchestrator.ts:337`](../../orchestrator/orchestrator.ts#L337)

**Regression coverage**

- Core matrix: single, multiple-first-occurrence, optional, and required-name precedence over the missing check.
  [`orchestrator.test.ts:1232`](../../orchestrator/orchestrator.test.ts#L1232)

- Interleaved first-occurrence ordering and the pre-existing missing-probe path now both pin launch-not-called.
  [`orchestrator.test.ts:1312`](../../orchestrator/orchestrator.test.ts#L1312)
  [`orchestrator.test.ts:1200`](../../orchestrator/orchestrator.test.ts#L1200)
