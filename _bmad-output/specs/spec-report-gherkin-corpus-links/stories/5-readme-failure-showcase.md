---
title: 'README failure showcase'
type: 'feature'
created: '2026-09-11'
status: 'done'
review_loop_iteration: 0
baseline_commit: 4cf905fe589bf2726bde24e52e8b234822c78d90
context:
  - '_bmad-output/specs/spec-report-gherkin-corpus-links/SPEC.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** S3 produced the throwaway red report (`corpus/fail-demo/`), but the failure face is still invisible to anyone who opens the repo — only someone who runs the generator can see it. The project should *show* what a failing check looks like (expected-vs-actual diagnostics, reading quality) without committing any failing evidence.

**Approach:** A dev-only Playwright rasterizer (`bin/screenshot-report.ts` + `screenshot:report`) renders the on-demand fail-demo report to a committed, human-reviewed `docs/report-failure.png`; the README gains an "Error report showcase" block (image, regenerate commands, and the explicit not-committed / not-CI-guarded frame); `docs/usage.md` documents the tool. Completes the S3 deferred split.

## Boundaries & Constraints

**Always:**
- The rasterizer is a **manual dev tool**: headless chromium, local `file://` only, args `<reportHtmlPath> <pngPath>`, `fullPage` screenshot, prints the PNG path, exit 0 on success. It is never CI-guarded, never part of the report pipeline, and never touches the browser-based recording flow.
- Unit tests cover the **argument/error surface only** (`bin/screenshot-report.test.ts`) — no chromium launch in the test suite or CI. The only fs checks are path validation (`test -f`-equivalent before launch).
- The committed `docs/report-failure.png` is a **one-off, human-reviewed artifact** — produced once during implementation (from `corpus/fail-demo/report.html` after `generate:sample -- --fail`), committed; regenerating it is documented but never automated.
- The README block is framed around **diagnostic quality** (expected-vs-actual url-is error, red summary bar, green remainder) with the plain statement that the failing fixture is throwaway — never committed, never CI-guarded. No outreach/marketing language.
- `corpus/fail-demo/**` stays gitignored and untracked; the only new committed files are the code, tests, package script, docs, and the PNG.
- Rasterization output is not deterministic byte-for-byte (font/rendering variance) — the PNG is a snapshot; regeneration is allowed to differ. This is **not** an NFR-1 violation: the report pipeline itself stays deterministic.

**Ask First:** None.

**Never:**
- No chromium/browser in unit tests or CI.
- No CI job that runs the rasterizer or regenerates the PNG.
- No failing evidence committed — only the rendered PNG.
- No changes to the report emitters/validators/generator (they are consumers of the existing `--fail` output).
- No outreach language in the README/docs block.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY | valid `<reportHtmlPath> <pngPath>` | PNG written, path printed, exit 0 | N/A |
| MISSING_ARGS | 0 or 1 arg | usage + exit 1, no PNG | mirrored arg guard |
| EXTRA_ARGS | 3+ args | usage + exit 1, no PNG | mirrored arg guard |
| MISSING_INPUT | html path nonexistent | error + exit 1, no PNG | clean error, no stack trace |
| FULL_FLOW | `generate:sample -- --fail` + rasterize | `docs/report-failure.png` shows the red report (human-revised as a PNG artifact) | N/A |

</frozen-after-approval>

## Code Map

- `bin/screenshot-report.ts` (NEW) — dev-only rasterizer: positional-only `[<reportHtmlPath> <pngPath>]`, flag guard (reject `-`-prefixed), fs checks (`existsSync` on the html; `mkdirSync` for the png's parent if needed), `chromium.launch()` from `playwright`, `goto("file://" + resolvedPath)`, `waitForLoadState("load")`, `page.screenshot({ fullPage: true, path })`, browser close in a `finally`, prints the PNG path; exit 0/1; the clear-error/main-guard pattern used by the repo's other bins (e.g. `bin/report-smoke.ts`).
- `package.json` — add `"screenshot:report": "tsx bin/screenshot-report.ts"`.
- `bin/screenshot-report.test.ts` (NEW) — argument/error-surface tests only (no chromium): MISSING_ARGS, EXTRA_ARGS, MISSING_INPUT, flag rejection, and the happy path *only* up to the launch boundary (assert the fs assertions run before any browser call — e.g. inject a fake launch or assert the pure argv/fs helper output). If a clean seam doesn't exist, keep the pure arg/fs validation as an exported helper and unit-test only that.
- `README.md` — new `## Error report showcase` section (placed after the intro/mermaid block, before `## Quick start`): the PNG, the two regenerate commands, and the not-committed / not-CI-guarded note.
- `docs/usage.md` — document `screenshot:report` + the showcase flow in the fixture/demo context.

## Tasks & Acceptance

**Execution:**
- [x] `bin/screenshot-report.ts` (new) -- dev-only Playwright rasterizer with a clean arg/error surface -- the PNG's producer.
- [x] `bin/screenshot-report.test.ts` (new) -- arg/error-surface tests, no chromium -- the SCREENSHOT matrix rows are pinned.
- [x] `package.json` -- `screenshot:report` script -- documented entry point.
- [x] `README.md` -- `## Error report showcase` section (PNG, commands, not-committed/not-CI-guarded) -- the visible failure face.
- [x] `docs/usage.md` -- `screenshot:report` documentation -- operator docs stay current.
- [x] Commit `docs/report-failure.png` (human-reviewed) -- the only committed failing-face artifact.

**Acceptance Criteria:**
- Given a local `corpus/fail-demo/report.html` (produced by `generate:sample -- --fail`), when `npm run screenshot:report corpus/fail-demo/report.html docs/report-failure.png` runs, then the PNG is created (non-trivial dimensions), its path is printed, and the exit code is 0.
- Given invalid invocation (0/1 args, 3+ args, a `-` flag, or a nonexistent html path), when the CLI runs, then a usage/error message is printed, no PNG is written, and the exit code is 1.
- Given the full flow, when the PNG is committed and the README block added, then a reader of the README sees the red report, the two regenerate commands, and the explicit statement that the failing fixture is throwaway (never committed, never CI-guarded).
- Given the committed showcase, then `git status` shows `docs/report-failure.png` + the code/docs changes as tracked, while `corpus/fail-demo/` remains fully untracked/gitignored.
- Given the README block, then it contains no outreach/marketing language (industry-standards diagnostics framing only).

## Design Notes

The rasterizer stays strictly outside the report pipeline: the generator/validators/reporters never launch a browser; `screenshot:report` is a separate manual tool for human consumption of an existing artifact. The PNG is intentionally a *rendered snapshot* (non-deterministic across machines) — committing a reviewed copy trades byte-reproducibility for inspectability, and the NFR-1 determinism guarantee covers the reports, not this developer aid.

The README block uses the existing `--fail` output as-is: `url-is "/app/portfolio/main" but url pathname is "/app/portfolio/futures"` alongside the red summary bar — a self-contained demonstration of expected-vs-actual diagnostics.

## Verification

**Commands:**
- `npm run typecheck` — expected: no errors
- `npm test` — expected: all green (incl. the new surface-only suite)
- `npm run generate:sample -- --fail` — expected: exit 0, fail-demo report written
- `npm run screenshot:report corpus/fail-demo/report.html docs/report-failure.png` — expected: PNG written, path printed, exit 0 (manual; then eyeball the PNG)
- `git status --short` — expected: the code/docs/PNG changes tracked; **no** `corpus/fail-demo` entries

**Manual checks (if no CLI):**
- Open `docs/report-failure.png` — red summary bar, one red scenario exposing the `url-is` expected-vs-actual line, 13 green; README renders it next to the regenerate commands.

## Spec Change Log

<!-- Append-only -- populated by step-04 on review loopback. -->

## Suggested Review Order

**The rasterizer (dev-only, never in the pipeline/CI)**

- Arg/fs seam: validations happen before any browser work, PNG-dir rejection, cwd-relative paths
  [`screenshot-report.ts:63`](../../../../bin/screenshot-report.ts#L63)
- file:// URL built via pathToFileURL — spaces/#/%/Windows-safe
  [`screenshot-report.ts:111`](../../../../bin/screenshot-report.ts#L111)
- The launch/goto/screenshot/browser-close lifecycle (manual-invoked dev tool)
  [`screenshot-report.ts:main`](../../../../bin/screenshot-report.ts#L120)

**The showcase artifact + documentation**

- Surface-only suite: arg/fs/URL seams + spawn-level invalid-arg CLI (no chromium)
  [`screenshot-report.test.ts:seam`](../../../../bin/screenshot-report.test.ts#L35)
- README error-showcase block: PNG, regenerate commands, not-committed frame
  [`README.md:showcase`](../../../../README.md#L57)
- usage.md: cwd note, binary prerequisite, never-commit-fail-demo guidance
  [`usage.md:demo`](../../../../docs/usage.md#L190)
