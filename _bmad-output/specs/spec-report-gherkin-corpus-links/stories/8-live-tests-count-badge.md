---
title: 'Live tests-count badge'
type: 'feature'
created: '2026-09-11'
status: 'done'
review_loop_iteration: 0
baseline_commit: dc3b4cc320f6e34b2e1c496319b033e311e4febe
context:
  - '_bmad-output/specs/spec-report-gherkin-corpus-links/SPEC.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The README shows the CI status but no test count; a hardcoded "531" badge would silently drift as the suite grows.

**Approach:** CI emits a `tests.json` summary (passed/total, from vitest's JSON reporter) into the GitHub Pages artifact, and the README shows a **live** dynamic "tests passed" badge that reads the deployed `tests.json` — the count stays truthful with zero manual maintenance.

## Boundaries & Constraints

**Always:**
- `tests.json` is generated **in the `ci` job** (offline, green-only): a step runs `npx vitest run --reporter=json --outputFile=vitest-summary.json`, then a node one-liner writes `tests.json` = `{"passed":<numPassedTests>,"total":<numTotalTests>}` (from the vitest JSON reporter's numbers). The file is uploaded via `actions/upload-artifact` as `tests-summary`.
- The `pages` job (already `needs: ci`) stages the artifact as `_site/tests.json` (`actions/download-artifact` → `cp` into `_site/`), so it deploys beside the corpus sample report (root-relative path `tests.json` → `https://<owner>.github.io/<repo>/tests.json`).
- README adds **one** dynamic badge reading `query=passed` (labels `tests passed`, green) plus documents that before the first successful main-push deploy the shield renders shields's error state ("resource not found") — the same caveat as before, now expected.
- The existing CI+TypeScript+License badges are unchanged; everything stays green-only and offline; `npm test` in-place is untouched (the JSON reporter runs as its own step after it).
- If `numPassedTests`/`numTotalTests` are absent from the summary the step fails loudly (never writes a bogus `tests.json`).

**Ask First:** None.

**Never:**
- No hardcoded count anywhere (neither the badge nor tests.json).
- No changes to the determinism/fail-demo/validate/report gates.
- No committing `tests.json` or `vitest-summary.json` into the repo (generated artifact only, gitignored or kept out).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| SUCCESS_DEPLOY | main push, ci green | `tests.json` staged+deployed at `<site>/tests.json`; badge reads `passed` count | N/A |
| SUMMARY_MISSING | vitest JSON lacks counts | step fails red (no bogus file) | ::error:: + exit 1 |
| PRE_DEPLOY | Pages not yet deployed | shield renders shields error state, documented | expected |
| OFFILNE | local `npm test` | unchanged (badge is CI/deploy-only) | N/A |

</frozen-after-approval>

## Code Map

- `.github/workflows/ci.yml` — in the `ci` job after the existing `npm test` step: JSON-summary + `tests.json` step (node `-e` reading `vitest-summary.json`, writing `tests.json`, failing if counts are absent), then `actions/upload-artifact@v4` (`path: tests.json`, `name: tests-summary`, `if-no-files-found: error`); in the `pages` job before `upload-pages-artifact`: `actions/download-artifact@v4` (`name: tests-summary`, `path: _site`) — staged next to the corpus dirs.
- `README.md` — badges row gains the dynamic tests badge: `https://img.shields.io/badge/dynamic/json?url=<encoded site>/tests.json&query=passed&label=tests%20passed&color=brightgreen`; the CI & live-sample note gains the pre-first-deploy caveat sentence.
- `.gitignore` — add `vitest-summary.json` (generated).

## Tasks & Acceptance

**Execution:**
- [x] `.github/workflows/ci.yml` -- ci: vitest JSON summary → tests.json + upload-artifact; pages: download-artifact into `_site/`.
- [x] `README.md` -- the live tests-passed badge + caveat sentence.
- [x] `.gitignore` -- `vitest-summary.json`.

**Acceptance Criteria:**
- Given a main push with a green ci job, when the pages job runs, then `_site/tests.json` is staged and the deployed site serves `<site>/tests.json` whose `passed` equals the real vitest pass count (531 today).
- Given a vitest summary missing its counts, when the tests.json step runs, then the ci job fails red with a clear error and no `tests.json` is produced.
- Given the README, when read, then it shows one dynamic tests badge (query=passed) with CI/TypeScript/License unchanged, and documents the pre-first-deploy shield state.
- Given a local checkout, when `git status` runs, then no `tests.json`/`vitest-summary.json` appears (generated files never committed).

## Design Notes

The badge is a shield reading the deployed artifact, so it can never lie about the suite size: when tests grow, CI writes a new count at deploy time. `passed` (not `total`) is the query because the CI badge already owns the pass/fail signal; a static `total` would just reintroduce the drift we're removing.

## Verification

**Commands:**
- `npm test` — expected: green (unchanged); locally confirm `npx vitest run --reporter=json --outputFile=vitest-summary.json` yields 531/531 with the expected keys.
- `git check-ignore vitest-summary.json` — expected: matched.
- Manual after merge: the deployed `<site>/tests.json` serves `{"passed":N,"total":N}` and the badge renders that number.

**Manual checks (if no CLI):**
- Post-merge main push → open `https://jstavel.github.io/reactive_testing/tests.json` and the README badge.

## Spec Change Log

<!-- Append-only -- populated by step-04 on review loopback. -->


## Suggested Review Order

**The feed producer (tested, not inline)**

- The tested transform: validates counts are finite non-negative ints, passed <= total, refuses to write a bogus file
  [`tests-summary.ts:27`](../../../../bin/tests-summary.ts#L27)

- ci.yml: the JSON-summary step calls the script; artifact uploaded with 1-day retention
  [`ci.yml:tests-summary`](../../../../.github/workflows/ci.yml#L76)

**The reader (badge + deployed feed)**

- README's single live "tests passed" badge reading the deployed tests.json, with the pre-deploy caveat (and no conflict markers)
  [`README.md:4`](../../../../README.md#L4)

- pages job: staged tests.json existence guard + post-deploy curl/jq numbers-equal verify
  [`ci.yml:pages`](../../../../.github/workflows/ci.yml#L176)

**Supporting pins**

- README hygiene pins (badge URL, caveat, no conflict markers) + the tests-summary unit suite
  [`repo-hygiene.test.ts:71`](../../../../scripts/repo-hygiene.test.ts#L71)
