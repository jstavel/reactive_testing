---
title: 'Biome lint gate + CONTRIBUTING.md + LICENSE'
type: 'chore'
created: '2026-09-11'
status: 'done'
review_loop_iteration: 0
baseline_commit: 9ad952f289b8d0c49775181d380a9818f9687a58
context:
  - '_bmad-output/specs/spec-repo-hygiene-biome-contributing/SPEC.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The repo has no static-analysis/style gate, no contributor guide, and no license file (the badge claims UNLICENSED) — the three optional tasks.org hygiene items are open.

**Approach:** Add `@biomejs/biome` as a devDependency with a config that mirrors the repo's existing style (single quotes, semicolons, 2-space indent, ~100-col), `lint`/`lint:fix` scripts, a green-only lint step in CI, and apply only mechanical fixes so the diff stays reviewable. Create `CONTRIBUTING.md` documenting the BMad workflow + current setup (pointing at README/docs rather than duplicating them), and add a LICENSE the README badge and `package.json` agree with.

## Boundaries & Constraints

**Always:**
- Biome config (biome.jsonc, comment-rich) mirrors the repo style: `quoteStyle: single`, `semicolons: always`, `indentStyle: space`/`indentWidth: 2`, `lineWidth: ~100`; formatter enabled; lint recommended.
- Apply only mechanical fixes: `biome check --write` (safe) then `--unsafe` where the change is reviewable; where a rule would force disproportionate churn, disable it in config with a rationale comment instead of mass-editing.
- `.gitignore` gains the Biome cache (`node_modules/.cache/biome` or the configured `biome` cache path).
- npm scripts: `"lint": "biome check ."`, `"lint:fix": "biome check --apply ."` (and `--unsafe` variant if helpful); package-lock updated.
- CI: add one green-only lint step to `.github/workflows/ci.yml` (after typecheck); nothing else in the workflow changes.
- `CONTRIBUTING.md` is created (absent today), consistent with AGENTS.md + README + docs; focuses on the BMad workflow (features → model → actions → story spec → bmad-build → single-rebase-commit PR), a commands quick-reference (typecheck/test/validate/report/generate/lint), layout pointer, and branch policy. No README/AGENTS duplication.
- CI lint mode matches local `npm run lint` (same command), so the gate can't pass where local fails.
- `LICENSE` file added (SPDX-standard text, unmodified), the README license badge stops claiming UNLICENSED, the "does not yet carry a license file" sentence is removed, and `package.json` gains a matching `license` field. The choice of license is confirmed with the owner before committing; tasks.org anticipated MIT.

**Ask First:** Confirm the exact license (tasks.org default: **MIT**, holder Jan Stavel, year 2026) before the LICENSE file is committed.

**Never:**
- No formatting churn beyond what the config forces; no arbitrary rule mass-editing.
- No pre-commit/husky/lint-staged hooks.
- No change to the existing CI gates' semantics (S4) beyond the added lint step.
- No README rewrites beyond the license badge/sentence and any CiteUCI-consistent bits (its Contributing section stays as-is).
- No non-SPDX/custom license text.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| CLEAN_TREE | fully compliant code | `npm run lint` exit 0, no output noise | N/A |
| VIOLATION | a deliberate lint error introduced | `npm run lint` exit 1, names file/rule | CI lint step fails the gate |
| FIX_FLOW | `npm run lint:fix` on violations | files rewritten, `npm run lint` exit 0 | N/A |

</frozen-after-approval>

## Code Map

- `package.json` — add `@biomejs/biome` devDependency + `lint`/`lint:fix` scripts.
- `biome.jsonc` (NEW, root) — config per Boundaries; `files.includes` scoped to TS/TSX under the project dirs (bin, model, orchestrator, collectors, validators, reporter, repro, scripts) and excludes node_modules/dist/corpus/vitest artifacts; tested `.test.ts` included (lint applies).
- `.gitignore` — add the Biome cache path.
- `.github/workflows/ci.yml` — add `npm run lint` step after `Typecheck`.
- `CONTRIBUTING.md` (NEW) — the contributor guide aligned with AGENTS.md/README/docs.
- `package-lock.json` — updated by `npm install --save-dev @biomejs/biome`.

## Tasks & Acceptance

**Execution:**
- [x] `package.json` (+lock) -- install `@biomejs/biome`, add `lint`/`lint:fix` scripts.
- [x] `biome.jsonc` -- style-mirroring config (formatter + lint, scoped files, rationale for any disabled rule).
- [x] `.github/workflows/ci.yml` -- green-only `npm run lint` step after typecheck.
- [x] `.gitignore` -- Biome cache entry.
- [x] Tree fixes -- apply mechanical lint fixes across the 40 non-test + test TS files; reviewable diff.
- [x] `CONTRIBUTING.md` -- created, workflow + commands + layout + policy, consistent with AGENTS/README/docs.
- [x] `LICENSE` + `README.md` + `package.json` -- SPDX-text LICENSE (owner-confirmed), badge/sentence flip, license field -- CAP-3.

**Acceptance Criteria:**
- Given the current tree, when `npm run lint` runs, then it exits 0 with no violations.
- Given a deliberate temporary violation, when `npm run lint` runs, then it exits 1 naming the file/rule; when `lint:fix` runs, then the tree is compliant again.
- Given the CI workflow, when it runs on a push, then the new lint step executes the same command as local `npm run lint` and is green-only alongside the existing gates.
- Given a new contributor, when they read CONTRIBUTING.md, then they can run the documented commands and follow the branch/PR policy without contradicting AGENTS.md/README/docs.
- Given the final diff, then no file was reformatted beyond what the config requires (no gratuitous churn) and no rule was mass-edited without a config rationale.
- Given the LICENSE, when README and package.json are read, then the badge, the sentence, and the `license` field all agree with the LICENSE file (no UNLICENSED/“does not yet carry” remnants).

## Design Notes

Biome's defaults differ from the repo style mainly on quotes (double) and line width (80) — the config's three style keys bring the formatter into alignment so the initial `check --write` only touches real deviations. Any recommended lint rule that would be disproportionately noisy on this codebase (e.g. strict any/unknown narrowing across model code) is disabled with a comment in `biome.jsonc` rather than edited en masse.

## Verification

**Commands:**
- `npm i` (installs biome) then `npm run lint` — expected: exit 0
- `npm run typecheck` — expected: no errors (no type changes)
- `npm test` — expected: 30 files / 528 tests green
- `npm run lint:fix` on a seeded violation — expected: tree returns to compliant

**Manual checks (if no CLI):**
- Open `biome.jsonc` — every non-standard rule choice carries a rationale comment; `CONTRIBUTING.md` commands match `package.json` scripts.

## Spec Change Log

<!-- Append-only -- populated by step-04 on review loopback. -->

- 2026-09-11 — RENEGOTIATED (human-approved): frozen `quoteStyle: single` →
  `double`. The tree measured uniformly double-quoted (355/355 import
  statements, ~250:4 assignments use `"`); `single` would flip ~6,200 strings
  across all ~60 project TS files, contradicting the frozen no-churn
  guardrail ("no formatting churn beyond what the config forces") and the
  non-goal ("enforcing a style the codebase does not already follow"). KEEP:
  `biome.jsonc` keeps `quoteStyle: "double"` with its rationale comment; do
  not flip the tree to single quotes without a fresh human decision.
- 2026-09-11 — RENEGOTIATED (tooling-driven): frozen `lint:fix` literal
  `biome check --apply .` → `biome check --write .` (Biome 2.x removed the
  `--apply` flag; `--write` is its direct safe-fix successor). KEEP: the
  `lint:fix` script as `biome check --write .`; do not resurrect `--apply`.


## Suggested Review Order

**The gate**

- biome.jsonc — repo-matching formatter/lint config, pinned schema, `**` includes (new dirs can't escape), import organizing pinned, measured rationales
  [`biome.jsonc:1`](../../../../biome.jsonc#L1)

- `lint` script — `biome check --error-on-warnings .` (warn-class diagnostics fail the gate)
  [`package.json:14`](../../../../package.json#L14)

- ci.yml — lint step + the red-path gate (seeded violation must exit≠1 naming the file, --write restores)
  [`ci.yml:lint`](../../../../.github/workflows/ci.yml#L38)

**The docs & license**

- LICENSE (MIT © 2026 Jan Stavel), README badge flip, package.json license field — pinned agreeing by the hygiene test
  [`LICENSE`](../../../../LICENSE)

- CONTRIBUTING.md — BMad workflow, command quick-reference (pinned by the hygiene test), spec-location clarification, scope-maintenance rule
  [`CONTRIBUTING.md:1`](../../../../CONTRIBUTING.md#L1)

- New imports-cheat pins: scripts/repo-hygiene.test.ts (LICENSE agreement + command table)
  [`repo-hygiene.test.ts:1`](../../../../scripts/repo-hygiene.test.ts#L1)

**The mechanical churn**

- Biome reflow across ~60 TS files (100-col, import organize, unused-import removal) + model-hash ripple (plan + fixture regenerated, 3 hash lines)
  [`git diff --stat`](../../../../)
