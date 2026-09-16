---
title: 'Guard unknown predicates in validator-map and dependencies'
story_id: 'unknown-predicate-guard'
type: 'fix'
created: '2026-09-16'
status: 'done'
review_loop_iteration: 1
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The `evaluate()` switch in `validators/validator-map.ts` has no `default:` case. The Zod schema (`contractPredicateSchema`) restricts `assert` to the 5-predicate union, so the gap is unreachable with validated plans — but a binding against a hand-rolled predicate (future caller, adjudication path, cast-across-boundary) would fall off the switch, return `undefined`, and crash the `r.passed` dereference in `validateContract`, violating FR-5 (a validator is a result, never an exception).

**Approach:** Add a `default:` case to `evaluate()` returning a failed `unknown predicate` result (FR-5-conformant), mirror it with an explicit no-op `default:` in the `dependencies.ts` predicate switch, and pin the guard with a direct unit test over an exported `evaluate`.

## Boundaries & Constraints

**Always:** `evaluate` returns `{ passed: boolean, detail: string }` for every input — unknown asserts fail honestly with a named detail, never `undefined`, never a throw. `corpusDependenciesFor` keeps its existing behavior for unknown asserts (no deps contributed), consistent with its unknown-contractId → `[]` convention. Existing results for the 5 known predicates are byte-identical (the default branch is unreachable with schema-valid predicates).

**Ask First:** Any behavior change to how the 5 known predicates evaluate; any new public API beyond exporting `evaluate`; any schema change to `contractPredicateSchema`.

**Never:** No model/FSM/contracts/schemas changes, no modelVersion bump (validator-map.ts and dependencies.ts live outside the model hash per AD-17), no changes to committed corpus fixtures, no throw on unknown predicates, no mocked-contract test scaffolding.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| KNOWN_PREDICATES | Any schema-valid predicate (state-is / url-is / view-selected / dialog-open / dialog-closed) | Behavior byte-identical to pre-change | N/A |
| UNKNOWN_ASSERT | Hand-rolled predicate `{ assert: "nope" }` (cast) | `{ passed: false, detail: 'unknown predicate "nope"' }` — never `undefined`, never throws | FR-5 result, not exception |
| UNKNOWN_ASSERT_DEREF | `validateContract` evaluates a contract carrying the hand-rolled predicate | `r.passed` deref is safe; failed ValidationResult with the unknown-predicate detail | never throws |
| DEPS_UNKNOWN_ASSERT | `corpusDependenciesFor` sees a hand-rolled unknown-assert predicate | No deps contributed (explicit no-op `default:` + comment) | unreachable with schema-valid plans |
| VALIDATORS_FOR_TOSTRING | Inherited contract ids (regression from #45) | Still `[]` — unchanged | N/A |

</frozen-after-approval>

## Code Map

- `validators/validator-map.ts:26-80` -- the `evaluate()` switch; add the `default:` case and export the function for direct unit testing.
- `validators/validator-map.ts:101,107` -- the `r.passed` dereferences the guard protects.
- `validators/dependencies.ts:21-33` -- the `corpusDependenciesFor` predicate switch; add an explicit no-op `default:` with a one-line comment (nothing derefs the result, so this is explicitness, not crash-proofing).
- `validators/validator-map.test.ts` -- new test: hand-rolled predicate through `evaluate` returns the failed unknown-predicate result and conforms to `validationResultSchema` when wrapped by a validator.

## Tasks & Acceptance

**Execution:**
- [x] `validators/validator-map.ts` -- add `default:` returning `{ passed: false, detail: 'unknown predicate "<assert>"' }`; export `evaluate`.
- [x] `validators/dependencies.ts` -- add explicit no-op `default:` + comment to the predicate switch.
- [x] `validators/validator-map.test.ts` -- pin the unknown-predicate failed-result contract (and that it never throws).

**Acceptance Criteria:**
- Given a hand-rolled predicate with an unknown `assert`, when `evaluate` runs, then it returns `{ passed: false, detail: 'unknown predicate "nope"' }` and does not throw.
- Given all 5 known predicates, when the full test suite runs, then all existing assertions pass unchanged.
- Given the committed example fixture, when `validate:smoke`-equivalent suite tests run, then check counts are unchanged (18 contract checks; the default branch is unreachable with valid predicates).

## Design Notes

The validator-map switch is the only place a fall-through can crash: `validateContract` dereferences `r.passed` immediately. Dependencies derivation has no such deref — an unknown predicate contributing no deps means the validator later fails honestly on missing/unknown-predicate evidence, which is the correct FR-5 posture. TypeScript narrows `predicate` to `never` in the default branch; interpolating `predicate.assert` in the detail template still compiles (property access on `never` is permitted), with a cast fallback if a strict-mode complaint appears.

Exporting `evaluate` (vs. `vi.mock`-ing `../model/contracts.js` to inject a poisoned contract through `validatorMap`) was chosen as the smallest surface that tests the exact guarded behavior; the deref path is trivially safe once `evaluate` always returns an object.

## Verification

**Commands:**
- `npm test` -- expected: all suites green, including the new unknown-predicate test.
- `npm run typecheck` -- expected: exit 0.
- `npm run lint` -- expected: exit 0.
