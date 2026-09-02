<!-- bmad:context -->
<!-- Verified 2026-09-01 against bec2d2d. Managed by bmad-project-context; edits inside this block are replaced on refresh. Keep anything you want preserved outside the markers. -->

## reactive-testing

Spec-first testware: the application described as a formal model (FSM + contracts + schemas). TypeScript/Node >=24, Vitest, Zod 4, Playwright. Planning and architecture live under `_bmad-output/`, and per-story work is driven by the installed BMad skills in `.agents/skills/`.

## Policy

- Never commit a story directly to `main`. Each story lands as a `feat/story-<N>-<slug>` branch, its commits locally rebased into a single commit, then merged to `main` via a PR. Not enforced by CI or branch protection — a working rule, not a check.

## Where things are

- Per-story build/review/present follows `bmad-build` (see `.agents/skills/bmad-build`).
- Story specs: `_bmad-output/implementation-artifacts/`; running status: `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `project-context.md` is a frozen historical vision record — read for context, never edit.

## Coding Style & Architecture: Functional TS
- **Immutability First:** Prefer immutable data structures and pure functions. Avoid unnecessary state mutations via `let`.
- **Immer for Deep Updates:** Use the `immer` library (`produce` function) for complex and nested objects instead of tedious multi-level spread operators (`...`).
- **Data Flow & Pipelines:** Write code as data transformations (input -> collection methods `map`/`filter`/`reduce` -> output). Avoid deeply nested `for` loops and imperative stateful code unless strictly required for performance in hot loops.
- **Expression-Oriented:** Prefer expressions that return a value over procedural blocks with side effects.
