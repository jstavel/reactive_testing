---
title: 'Story 1.6: Assign a scenario to a test plan'
type: 'feature'
created: '2026-08-25'
status: 'done'
review_loop_iteration: 0
context:
  - _bmad-output/specs/spec-1-6-assign-a-scenario-to-a-test-plan/SPEC.md
---

## Intent

**Problem:** Without test plan assignment, there's no way to group scenarios into named suites (smoke, regression, acceptance) for selective execution.

**Approach:** Tag each `.feature` file with `@plan:smoke|regression|acceptance`. Generate a `*.test-plan.ts` file that declares `planId`, `modelVersion` (SHA-256 of model files), and scenario IDs. Validate tags at authoring.

## Boundaries & Constraints

**Always:** PlanId is a closed union (smoke/regression/acceptance); each feature gets exactly one tag; modelVersion is SHA-256 of fsm.ts+contracts.ts+schemas.ts; `tsc --noEmit` clean.

**Ask First:** HALT and ask the user if a decision surfaces that is not covered by this spec.

**Never:** Allow tags outside the PlanId union; allow missing tags; allow multiple tags per feature.

## Code Map

- `features/*.feature` — tagged with `@plan:smoke`.
- `model/smoke.test-plan.ts` — generated test plan with planId, modelVersion, scenarioIds.
- `model/schemas.ts` — PlanId and TestPlan types (AD-19).

## Tasks & Acceptance

**Execution:**

- [x] Tag all 6 `.feature` files with `@plan:smoke`.
- [x] Compute SHA-256 of model files: `150e526676b0b6769e5daff4b68d3e2a2316f05c2132d3f73948719c07f40328`.
- [x] Generate `model/smoke.test-plan.ts` with planId, modelVersion, 18 scenario IDs.
- [x] Validate: each feature has exactly one `@plan:smoke` tag.
- [x] Validate: 18 scenario IDs match 18 `Scenario:` entries in features.
- [x] `npx tsc --noEmit` passes clean.

**Acceptance Criteria:**
- Given a `.feature` file with `@plan:smoke`, when inspected, then exactly one valid tag exists.
- Given `smoke.test-plan.ts`, when inspected, then `planId` is `"smoke"`, `modelVersion` matches SHA-256 of model files, and `scenarioIds` covers all tagged scenarios.
- Given `npx tsc --noEmit`, when run, then exits 0.

## Spec Change Log

## Design Notes

- **Scenario IDs are kebab-case:** Scenario names are converted to lowercase, non-alphanumeric chars replaced with hyphens, consecutive hyphens collapsed.
- **modelVersion will drift:** When model files change, the SHA-256 changes and the test plan must be regenerated. This is by design (AD-17) — the plan declares which model version it was derived from.
- **All scenarios are smoke:** User chose to put all 18 scenarios into the smoke plan. Regression and acceptance plans can be created later by adding `@plan:regression` or `@plan:acceptance` tags.

## Verification

- `grep -c "^@plan:" features/*.feature` — each file returns 1.
- `grep "planId" model/smoke.test-plan.ts` — returns `"smoke"`.
- `grep "modelVersion" model/smoke.test-plan.ts` — returns SHA-256 hash.
- `npx tsc --noEmit` — exit 0.
