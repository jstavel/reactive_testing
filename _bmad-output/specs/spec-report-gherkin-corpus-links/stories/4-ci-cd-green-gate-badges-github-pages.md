---
title: 'CI/CD — green gate, badges, GitHub Pages'
type: 'feature'
created: '2026-09-11'
status: 'done'
review_loop_iteration: 0
baseline_commit: 0c12877bbf1529cfa36e0e789bd1b32700d3189f
context:
  - '_bmad-output/specs/spec-report-gherkin-corpus-links/SPEC.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The repo is provably green locally (483 tests, deterministic fixtures) but has no CI: a regression can land on main unnoticed, and the project does not yet meet the industry-standard expectation of a continuously verified pipeline with a live published sample report and visible status badges.

**Approach:** Add `.github/workflows/ci.yml` — a `ci` job that runs typecheck + tests + the fixture gates (determinism, validate/report on the committed sample, fail-demo git-ignore surface), and a `pages` job (main-only) that stages the committed sample fixture into `_site/`, uploads the Pages artifact, and deploys via `actions/deploy-pages`. Add README badges (CI status, live Tests count from the deployed `report.json`) and document the one-time Pages setting.

## Boundaries & Constraints

**Always:**
- All CI steps are **offline** — typecheck, vitest, the generator, the CLIs. No browser, no CDP, no `playwright install` (dropped from the earlier plan; nothing in the pipeline needs it). `npm ci` is the only network step.
- The `ci` job runs on `push` and `pull_request` and is the merge gate; the `pages` job runs only on `push` to `main` (not PRs) and depends on `ci` success.
- Fixture determinism gate: after `npm run generate:sample` (in-place regen), `git diff --exit-code -- corpus/example corpus/snapshots/example corpus/probes/example` must be empty — the committed fixture and the generator are in lockstep; any drift fails CI red.
- Verify-on-fixture: `npm run validate:smoke -- example --corpus-dir corpus` → `18/18`, and `npm run report:smoke -- example --corpus-dir corpus` → `14/14`, both exit 0 (green-only job).
- Fail-demhero surface (resolves the S2/S3 deferred git-ignore items): run `npm run generate:sample -- --fail` (writes the gitignored `corpus/fail-demo`), then assert `git check-ignore` matches all three fail-demo subtree roots and `git status --porcelain` shows no `corpus/fail-demo` entries — the demo can never become committable or publishable. This job stays green-only (the demo itself is never deployed).
- Pages staging excludes `fail-demo`: the job copies only `corpus/example/`, `corpus/snapshots/example/`, `corpus/probes/example/` into `_site/corpus/…` (mirroring the repo layout so URLs map 1:1), then `actions/upload-pages-artifact@…` + `actions/deploy-pages@…` with `permissions: contents: read, pages: write, id-token: write` and `environment: github-pages`.
- Badges in README: a CI status badge (workflow badge SVG) and a **live** Tests badge via shields.io dynamic JSON reading `summary.passed`/`summary.total` from the deployed `https://jstavel.github.io/reactive_testing/corpus/example/report.json`; plus TypeScript and License badges (static shields). A Pages URL that is not yet live shows an empty/blank dynamic badge — acceptable and documented.
- The one-time manual step is documented (repo Settings → Pages → Source: GitHub Actions); the workflow cannot enable it.
- The workflow uses `setup-node@…` with `node-version: 24` and npm cache, and a `concurrency` group that cancels superseded runs.

**Ask First:** None.

**Never:**
- No browser/Playwright in CI.
- No failing evidence (`fail-demo`) staged, published, or otherwise exposed to Pages/badges.
- No CI step that legitimately turns red as part of normal operation (every job is green-only).
- No gh-pages branch or third-party Pages builder — only official `actions/deploy-pages` (Pages source must be "GitHub Actions").

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| PUSH_MAIN | push to main | ci job green (all gates 0); pages job deploys; `report.json` live at the Pages URL | any gate red → job fails, no deploy |
| PR | pull request (any branch) | ci job runs and gates the PR; pages job skipped | — |
| FIXTURE_DRIFT | committed `corpus/example` differs from generator output | determinism `git diff --exit-code` fails → job red; fixture must be regenerated+committed | red job |
| GITIGNORE_RELAX | a change un-ignores `corpus/fail-demo/**` | check-ignore assertion fails → job red | red job |
| BADGE_BEFORE_DEPLOY | pages not yet enabled/deployed | dynamic badge renders blank/error; CI badge still live | documented, acceptable |
| PAGES_DISABLED | Settings → Pages source unset | deploy step errors on publish; documented manual step required | job fails, docs say how |

</frozen-after-approval>

## Code Map

- `.github/workflows/ci.yml` (NEW) — the whole story:
  - `name: ci` + `on: { push: { branches: [main] }, pull_request: {} }`, `concurrency: { group, cancel-in-progress }`.
  - job `ci` (`runs-on: ubuntu-latest`): `actions/checkout@v4`; `actions/setup-node@v4` (`node-version: 24`, `cache: npm`); `npm ci`; `npm run typecheck`; `npm test`; `npm run generate:sample`; `git diff --exit-code -- corpus/example corpus/snapshots/example corpus/probes/example`; `npm run validate:smoke -- example --corpus-dir corpus`; `npm run report:smoke -- example --corpus-dir corpus`; then the fail-demo gate (`npm run generate:sample -- --fail` + `git check-ignore corpus/fail-demo/run-manifest.json corpus/snapshots/fail-demo/3.json corpus/probes/fail-demo/3.json` must match all — use a shell test that fails when any is ignored-false + `! git status --porcelain | grep corpus/fail-demo`).
  - job `pages` (`needs: ci, if: github.ref == 'refs/heads/main' && github.event_name == 'push'`): checkout, setup-node, npm ci, stage (`mkdir -p _site/corpus/example _site/corpus/snapshots/example _site/corpus/probes/example` + copies), then the two official actions.
  - job-level `permissions` for `pages` job only.
- `README.md` — badges block under the title (CI status, live Tests dynamic badge, TypeScript, License) + a short "Live sample & CI" note pointing at the Pages URL and the one-time Settings step.
- `docs/usage.md` — "CI & GitHub Pages" subsection: what runs, how the fixture/fail gate protects the green signal, how to enable the one-time Pages source setting and look up the deployed URL.
- `package.json` — READ-ONLY (scripts exist; no new scripts unless a convenience alias is added).

## Tasks & Acceptance

**Execution:**
- [x] `.github/workflows/ci.yml` (new) — ci job with the offline gates + pages deploy job (Actions-deploy style, minimum permissions) -- the gate + the live site.
- [x] `README.md` -- badges row + live sample pointer -- the glanceable, standards-customary project status.
- [x] `docs/usage.md` -- CI & Pages subsection incl. the one-time Settings step + deployed URL -- operators know what CI enforces.

**Acceptance Criteria:**
- Given a push to `main` (or a PR), when the workflow runs, then the `ci` job is automatically green: typecheck, full vitest, generator determinism (`git diff --exit-code` empty), `validate:smoke example` (18/18 exit 0), `report:smoke example` (14/14 exit 0), and the fail-demo git-ignore assertions pass; a red condition fails the job.
- Given a push to `main` AND Pages enabled in Settings (source GitHub Actions), when the `pages` job runs, then `_site/corpus/example/report.html` (+ `report.json` and the evidence) is deployed and `https://<owner>.github.io/<repo>/corpus/example/report.json` serves the JSON the Tests badge reads.
- Given a PR to any branch, when it runs, then the pages job is skipped (no deploy from a PR) while ci gates the PR.
- Given a fixture drift (committed `corpus/example` differs from `generate:sample` output), when ci runs, then the determinism step fails red — regenerating and committing the fixture is the only way through.
- Given a `.gitignore` change that un-ignores any `corpus/fail-demo/**` path, when ci runs, then the fail gate fails red — the failing demo can never become committable or deployable.

## Design Notes

No code changes are required to the current modules for this story — it is pure CI/README/docs. The deployed site mirrors the repo layout (`_site/corpus/…`), which keeps the relative evidence links valid and maps 1:1 to the same paths a reader sees on GitHub — stable URLs for external consumers (a badge reading `report.json` depends on the path, so it stays addressable and unchanged by redesign).

Dynamic badge uses shields.io dynamic-json on the deployed `report.json` (e.g. `summary.passed of summary.total` single query or two badges); before first deploy it renders blank, documented as acceptable. Depends on the repo being public (it is) and Pages enabled (manual, documented).

## Verification

**Commands:**
- `npm run typecheck`, `npm test` -- locally green before opening the PR
- Manual: push this branch → the workflow must appear and go green on the PR; `curl -fsS https://action...`/ actions UI shows the gates.
- After merge to main: workflow runs the `pages` job; `curl` the deployed `report.json` URL and confirm the badge resolves (200, valid JSON).

**Manual checks (if no CLI):**
- Settings → Pages → Source "GitHub Actions" enabled once; then `curl -I https://<owner>.<github.io>/<repo>/corpus/example/report.html` — the manual curl is only an optional second source now: the `pages` job asserts the deployed `report.json` itself (a post-deploy curl piped through `jq -e '.schema == "report.v1"'`), and a manual **Run workflow** dispatch on `main` redeploys right after flipping the setting.
- The dynamic badges render a count on shields.io; before the first deploy they render shields's red "resource not found" state (expected); the CI badge shows the last run's state.

## Spec Change Log

<!-- Append-only -- populated by step-04 on review loopback. -->

## Suggested Review Order

**The merge gate (offline, green-only)**

- Workflow skeleton: offline-only pipeline, least privilege, no browser; the one network step is npm ci
  [`ci.yml:on/push`](../../../../.github/workflows/ci.yml#L3)
- The ci job gates (typecheck/test stub) leading into the fixture determinism gate — regenerate in place, tree must be unchanged (+ artifact `test -f` trio + anchored porcelain check)
  [`ci.yml:19`](../../../../.github/workflows/ci.yml#L19)
- Re-assert the tree clean AFTER report:smoke — the reporter rewrote reports past the first diff (drift catcher)
  [`ci.yml:55`](../../../../.github/workflows/ci.yml#L55)

**Green-only fail-demo surface**

- The four-way fail-demo gate: subtree roots gitignored, nothing tracked, porcelain clean, and a .gitignore negation scan — the throwaway can never become committable
  [`ci.yml:60`](../../../../.github/workflows/ci.yml#L60)

**Pages deploy (main-push + manual)**

- Staging excludes fail-demo, adds an index redirect; scoped permissions + own non-cancelling concurrency + post-deploy report.json assertion
  [`ci.yml:pages`](../../../../.github/workflows/ci.yml#L99)

**Supporting — badges + docs**

- Live dynamic badges read the deployed report.json (tests passed + checks) — no hardcoded denominator
  [`README.md:4`](../../../../README.md#L4)
- CI & Pages section: what runs, the gates, one-time Settings (Pages source + branch protection), rename caveat, post-deploy assertion
  [`usage.md:379`](../../../../docs/usage.md#L379)
