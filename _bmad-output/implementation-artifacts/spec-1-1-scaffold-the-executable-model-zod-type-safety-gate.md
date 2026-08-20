---
title: 'Story 1.1: Scaffold the executable model (Zod + type-safety gate)'
type: 'feature'
created: '2026-08-20'
status: 'done'
review_loop_iteration: 0
context: []
baseline_commit: '4992f26f266f77bbdeb136c5164ef15cb262e998'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Reactive Testing's model (FSM + contracts + schemas) exists only as prose. There is no TypeScript project, so nothing is type-checkable and the corpus/plan types have no single home.

**Approach:** Scaffold a minimal ESM TypeScript project with Zod ^4 and a strict `tsc --noEmit` gate, creating `model/fsm.ts`, `model/contracts.ts`, and `model/schemas.ts`, where `schemas.ts` exports the corpus and plan types.

## Boundaries & Constraints

**Always:** English-only identifiers and artifacts (NFR-4); `tsc --noEmit` clean; `schemas.ts` is the single home for shared shapes (AD-13); Zod ^4 with types inferred via `z.infer`; TypeScript 5.9.3 / Node 24.19.0.

**Ask First:** HALT and ask the user if a decision surfaces that is not covered by this spec.

**Never:** Install Playwright or any test runtime (owned by Epic 2); seed model data (owned by Story 1.2); use any language other than TypeScript; embed corpus data inside TS; use the term "aspect".

</frozen-after-approval>

## Code Map

- `model/schemas.ts` -- Zod schemas + `z.infer` types for corpus + plan types; single home for shared shapes (AD-13).
- `model/fsm.ts` -- FSM type declarations (states, transitions, initial state); seed data lands in Story 1.2.
- `model/contracts.ts` -- dialog-contract type declaration (preconditions, action, postconditions, invariants); seed data lands in Story 1.2.
- `package.json` / `tsconfig.json` -- project + typecheck gate.
- Reference: `_bmad-output/planning-artifacts/architecture/architecture-reactive-testing-2026-08-17/ARCHITECTURE-SPINE.md` -- AD-13, AD-14, AD-17, AD-19, Consistency Conventions, Stack.
- Reference: `_bmad-output/planning-artifacts/epics/epics.md` -- Story 1.1 acceptance criteria.
- Reference: `_bmad-output/specs/spec-reactive-testing/SPEC.md` -- constraints (TypeScript-only, one format per file).

## Tasks & Acceptance

**Execution:**
- [x] `package.json` -- scaffold ESM, `zod` ^4 dependency, `typescript` + `@types/node` devDependencies, `typecheck` script -- runtime for the tsc gate.
- [x] `tsconfig.json` -- strict, `noEmit` -- makes `tsc --noEmit` the typecheck gate.
- [x] `model/schemas.ts` -- define + export the 7 types as Zod schemas with `z.infer` -- single home for shared shapes.
- [x] `model/fsm.ts` -- declare FSM model types -- the shape the seed fills in Story 1.2.
- [x] `model/contracts.ts` -- declare dialog-contract type -- the shape the seed fills in Story 1.2.

**Acceptance Criteria:**
- Given a fresh checkout, when `npm install && npx tsc --noEmit`, then it exits 0 with no diagnostics.
- Given `model/schemas.ts`, when inspected, then it exports `SnapshotRecord`, `NetworkEvent`, `ProbeResult`, `ScreenshotRef`, `ValidationResult`, `PlanId`, `TestPlan` with types inferred from Zod (`z.infer`).
- Given the model files, when inspected, then all identifiers/comments are English and "aspect" never appears.

## Spec Change Log

## Design Notes

- `ValidationResult` is pinned by AD-14: `{ contractId: string; passed: boolean; details?: string; corpusRefs: string[] }`.
- `PlanId` is pinned by AD-19: the closed union `"smoke" | "regression" | "acceptance"`.
- `TestPlan` is minimal for now: `{ planId, modelVersion, scenarioIds }`; the per-scenario path/collection/validators shape lands with Story 1.6.
- The corpus types (`SnapshotRecord`, `NetworkEvent`, `ProbeResult`, `ScreenshotRef`) are initial minimal shapes here; Epic 2's collectors own their final field-level contract. Keep them plain-data serializable (no functions, no Buffers).
- fsm.ts / contracts.ts declare types only; they must not import Playwright (not installed yet) -- use an abstract action signature the Orchestrator supplies in Epic 2.

## Verification

**Commands:**
- `npm install` -- expected: exit 0, installs zod + typescript.
- `npx tsc --noEmit` -- expected: exit 0, no output.

## Suggested Review Order

**Model shapes**

- The single home for every shared corpus/plan shape — 7 Zod schemas, `z.infer` types; `ValidationResult` pinned to AD-14, `PlanId` to AD-19.
  [`schemas.ts:3`](../../model/schemas.ts#L3)

- FSM type declarations — states, transitions, guards, initial state; seed data lands in Story 1.2.
  [`fsm.ts:8`](../../model/fsm.ts#L8)

- Dialog-contract type — preconditions/action/postconditions/invariants; abstract action, no Playwright import.
  [`contracts.ts:9`](../../model/contracts.ts#L9)

**Typecheck gate & project**

- Strict + `noEmit` + NodeNext ESM; `**/*.ts` include so the gate covers the whole project as it grows.
  [`tsconfig.json:2`](../../tsconfig.json#L2)

- ESM scaffold, `zod` ^4 + `typescript` 5.9.3, `typecheck` script.
  [`package.json:1`](../../package.json#L1)
