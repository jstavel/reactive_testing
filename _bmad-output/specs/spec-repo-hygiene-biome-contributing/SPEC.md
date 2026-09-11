---
id: SPEC-repo-hygiene-biome-contributing
companions: []
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Repo hygiene — Biome linting + CONTRIBUTING.md

## Why

This is an **opportunity to capture**: the repository is green and well-documented but has no static-analysis/style gate and no contributor guide. As the project grows (and any contributor or tool joins), consistent linting and a CONTRIBUTING.md that actually matches the current BMad workflow are table stakes for industry-standard repository hygiene.

## Capabilities

- **CAP-1**
  - **intent:** The repo ships a configurable static-analysis/style gate (Biome) with npm scripts and a CI step, green on the current tree with minimal style churn.
  - **success:** `npm run lint` exits 0 on the current tree; `npm run lint:fix` mechanically repairs violations; the remaining rules run in CI (green-only), and the config mirrors the repo's existing style (single quotes, semicolons, 2-space, ~100-column) so the initial diff is small.

- **CAP-2**
  - **intent:** A `CONTRIBUTING.md` exists and matches the BMad workflow and the repo's actual setup.
  - **success:** A new contributor can, from CONTRIBUTING.md alone, learn the development commands, the repository layout, the model-as-SSOT + determinism conventions, and the branch/PR policy — without guessing or contradicting README/AGENTS.md/docs.

- **CAP-3**
  - **intent:** The repository carries a license file that the README badge and `package.json` agree with.
  - **success:** A `LICENSE` file exists, `package.json` declares the same license, and the README badge/license sentence no longer say UNLICENSED or "does not yet carry a license".

## Constraints

- Biome is configured to match the current style (quoteStyle mirrors the actual tree (double), semicolons always, indent space 2, lineWidth ~100), keeping format churn small; formatter enabled, lint recommended, with any noisy rule disabled with a documented rationale.
- The CI step is green-only and additive (a lint step in `.github/workflows/ci.yml`); nothing in the existing gates may turn red as a normal state.
- `CONTRIBUTING.md` is created (it does not exist); it must not duplicate README wholesale — it points to README/docs for layout and focuses on contribution workflow, command quick-reference, and policy.
- The license choice is confirmed with the repository owner before the LICENSE file is committed (tasks.org anticipated MIT); LICENSE content is standard and unchanged from the SPDX text.

## Non-goals

- Enforcing a specific line width or style the codebase does not already follow.
- Auto-formatting every historical file beyond what the config requires (churn kept minimal; the formatter only normalizes what actually deviates).
- Adding lint hooks (pre-commit, husky, lint-staged).
- Rewriting README's existing Contributing section or AGENTS.md.

## Success signal

A contributor runs `npm i`, reads `CONTRIBUTING.md`, and both the commands in it and `npm run lint` work as described; CI includes the lint step and stays green.

## Assumptions

- Biome (recent stable, `@biomejs/biome`) installs as a devDependency and runs offline on CI like the rest of the pipeline.
- Mechanical lint fixes (`--write`/unsafe) across the existing 40 non-test TS files stay reviewable in one PR; any rule producing disproportionate churn is disabled with rationale rather than mass-edited.