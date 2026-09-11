# Contributing

Thanks for contributing. This guide covers the contribution workflow, the
commands, and the project conventions. It deliberately does not restate the
README or the docs — it links to them.

- **What this project is:** [README](README.md) — spec-first testware built
  around a formal model.
- **How the parts fit together:** README's
  [Parts of the project](README.md#parts-of-the-project) table plus
  [docs/project-map.md](docs/project-map.md) (every directory, real file
  names, corpus layout).
- **Daily usage** (record, validate, report, adjudicate, repro):
  [docs/usage.md](docs/usage.md).
- **Agent operating rules:** [AGENTS.md](AGENTS.md) — the BMad setup this
  guide summarizes.

## Setup

Prerequisites: **Node ≥ 24** (see `package.json` `engines`), npm.

```bash
npm ci                                # install dependencies (incl. Biome)
npx playwright install chromium       # only needed for screenshot:report
```

## Commands quick-reference

Everything runs from the repository root. `typecheck`, `test`, and all the
`validate:smoke` / `report:smoke` / `generate:sample` commands are fully
offline — no browser, no CDP. Only `run:smoke` attaches to a live,
authenticated browser.

| Command | What it does |
|---------|--------------|
| `npm run typecheck` | `tsc --noEmit` — the type-safety gate |
| `npm test` | `vitest run` — the offline unit/integration suite |
| `npm run lint` | `biome check .` — the lint/format gate (must exit 0) |
| `npm run lint:fix` | apply Biome's safe fixes (format + safe lint) |
| `npm run lint:fix:unsafe` | additionally apply unsafe (but reviewable) fixes |
| `npm run run:smoke` | record a fresh corpus from the live app (optionally `-- <scenario-id>…`) |
| `npm run validate:smoke` | offline validation of a recorded run (`-- <runId> --corpus-dir corpus`) |
| `npm run report:smoke` | render a run's reports (`-- <runId> --corpus-dir corpus`) |
| `npm run generate:sample` | deterministically mint the committed sample fixture (`corpus/example/`) |
| `npm run corpus:last-run` / `corpus:last-fail` / `corpus:list` | corpus handoff links (`bin/corpus-links.ts`) |
| `npm run screenshot:report` | dev-only headless-chromium rasterizer for a report HTML → PNG |

## The lint gate

`npm run lint` must pass (exit 0) before a story merges; CI runs the same
command as a green-only step right after typecheck. The Biome configuration
lives in [biome.jsonc](biome.jsonc) and **mirrors the codebase's existing
style** (double quotes, semicolons, 2-space indent, ~100-column). Two
conventions:

- Keep the diff mechanical. Formatter output and safe fixes only; apply
  `--unsafe` fixes selectively and review them.
- Never mass-edit source to satisfy a noisy rule. If a recommended rule
  fights the codebase, disable it in `biome.jsonc` with a rationale comment
  explaining why — the config is the record.
- Scope check: `biome.jsonc` gates everything (`**`) minus its explicit
  exclusions, so new source directories are covered by default. If you add a
  new tree that should be gated, verify no `files.includes` exclusion swallows
  it — a wrongly broad exclusion would let it silently escape the gate.

## Development workflow (BMad)

This project is developed with the [BMad](AGENTS.md) method: AI agents drive
stories from spec through implementation to review. The flow for a new
capability:

1. **Write a Gherkin feature** in `features/` — business intent, tagged
   `@plan:<name>`, not implementation detail.
2. **Distil it into the model** — the executable SSOT in `model/`:
   states in `model/fsm.ts`, contracts in `model/contracts.ts`, shared shapes
   in `model/schemas.ts`.
3. **Implement actions** — the Playwright locators in
   `orchestrator/action-map.ts`.
4. **Cut a story spec** — follow whichever convention applies to the work and
   search both locations: epic-driven story specs live under
   `_bmad-output/implementation-artifacts/` (the existing specs there are the
   templates), while spec-kernel stories live under
   `_bmad-output/specs/<spec>/stories/`. Search both before assuming a story
   does not exist.
5. **Run `bmad-build`** — drives implementation, tests, review, and the PR.
6. **Land it** on a `feat/story-<N>-<slug>` branch as a single rebased
   commit, merged to `main` via a PR.

For a concrete walkthrough see
[docs/authoring-example.md](docs/authoring-example.md); for picking up work,
see the [sprint status](_bmad-output/implementation-artifacts/sprint-status.yaml)
and [deferred work](_bmad-output/implementation-artifacts/deferred-work.md).

## Conventions the code enforces

- **The model is the single source of truth.** Features, plans, corpora, and
  reports are derived byproducts. `model/smoke.test-plan.ts` pins a
  `modelVersion` — the SHA-256 of the model files — and
  `model/model-version.test.ts` asserts it, so **any byte change under
  `model/` requires regenerating the plan pin and the committed fixture**:
  update the pinned `modelVersion` in `model/smoke.test-plan.ts`, then run
  `npm run generate:sample` and commit the refreshed `corpus/example/`
  reports. CI's determinism gate fails on any drift.
- **Determinism (NFR-1).** Everything except `run:smoke` is offline and
  deterministic: same inputs → byte-identical outputs. Never hand-edit
  generated artifacts (`corpus/example/`, `model/smoke.test-plan.ts`) —
  regenerate them.
- **Evidence hygiene.** `corpus/` is gitignored except the committed
  `corpus/example/` fixture subtree; failing evidence (`fail-demo`) is never
  committed and never publishable — CI enforces this.
- **Code style** follows the functional-TS conventions in
  [AGENTS.md](AGENTS.md) (immutability first, data-flow pipelines,
  expression-oriented); Biome now mechanically enforces the formatting part.

## Branch & PR policy

- **Never** commit a story directly to `main`.
- Each story is developed on a `feat/story-<N>-<slug>` branch, its commits
  locally rebased into a **single commit**, then merged to `main` via a PR.
- This is a working rule, not enforced by CI or branch protection.

## License

MIT — see [LICENSE](LICENSE). By contributing you agree your contributions
are licensed under the same terms.
