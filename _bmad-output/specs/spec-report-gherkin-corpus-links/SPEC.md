---
id: SPEC-report-gherkin-corpus-links
companions: []
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Presentation Report — Gherkin ↔ Corpus Links

## Why

This is an **opportunity to capture**: the reactive-testing repo already *is* a compelling story for a Senior QE / AI-Quality Engineer position — spec-first model as SSOT, offline validators, per-step evidence — but it does not yet *speak for itself* when a headhunter or their AI assistant opens it. The test-run report exists as a single self-contained HTML file with a Gherkin tree, but it surfaces only screenshots as evidence, is invisible to text-based AI assistants, and has no committed example anyone can open without running a live authenticated session. The ask is to make the report and the repo browsable *and* machine-readable with zero live-browser participation, backed by a CI/CD facade that is conclusively green.

## Capabilities

- **CAP-1**
  - **intent:** The system generates, for every completed run, a deterministic machine-readable `report.json` sibling to `report.html` — a scenario index with per-step evidence paths and CI-facing top-level counts.
  - **success:** A run's report folder contains `report.json` alongside `report.html`; feeding the same corpus to the same generator twice yields byte-identical JSON; an AI assistant or a `jq` consumer can derive every scenario's pass/fail and its evidence file paths without rendering HTML or walking the manifest.

- **CAP-2**
  - **intent:** Per-step evidence in the report covers all captured kinds — snapshot (pre/post), probe, network, and screenshot — as explicit links/refs, not only screenshots.
  - **success:** The generated report links each step to its actual corpus evidence files (snapshot before/after, probe results, network events, screenshot) and still opens identically offline with zero external dependencies.

- **CAP-3**
  - **intent:** The repository commits one all-passing mock fixture corpus under `corpus/example/` that is indistinguishable in shape from a real recorded run and browsable by humans and AI alike.
  - **success:** `npm run validate:smoke -- corpus/example` and the report CLI pass over the committed fixture with no browser, no CDP, and no live app; the fixture (snapshots, probes, screenshots, manifest, reports) is a normal git path any reader can open.

- **CAP-4**
  - **intent:** A deterministic sample-report generator produces the fixture corpus and its reports from mock data with no live recording.
  - **success:** Running the generator twice produces byte-identical output (NFR-1); a CI step that regenerates into a temp dir and diffs against the committed fixture exits 0, proving fixture and generator are in lockstep.

- **CAP-5**
  - **intent:** CI/CD runs the full offline pipeline over the committed fixture and publishes a green status + the sample report to GitHub Pages.
  - **success:** A push/PR to main runs typecheck, unit tests, `validate:smoke` on `corpus/example`, the determinism diff gate, and — on success — the README CI/tests badges are green and `https://<user>.github.io/<repo>/` serves the self-contained sample report.

- **CAP-6**
  - **intent:** The failure presentation (red report) is demonstrable without ever committing failing evidence or breaking the green CI badge.
  - **success:** An operator can produce a throwaway red sample report (on-demand generator flag) and/or a README screenshot shows what a FAIL report looks like; no failing scenario, fixture, or artifact is committed and no CI gate can turn red because of the demo itself.

## Constraints

- The committed example corpus is **mock/derived data only** — never a real recording. Live snapshots contain real Kraken account balances (personal financial data); `corpus/` stays gitignored and `corpus/example/` is the sole un-ignored exception (`corpus/*` + `!corpus/example`).
- No failing evidence is ever committed: the CI badge must stay 100% green. Failure showcases are generated on demand or shown as static README content, never CI-guarded.
- `report.json` is **versioned** at the top (`"schema": "report.v1"`) because CI consumes it; bump the version when the shape changes. Arrays ordered deterministically (NFR-1 byte-stability).
- `report.json` is a **scenario-facing index**, not a copy of `run-manifest.json` (which stays the storage inventory). Both are produced by the same pure builders; nothing in CI re-derives results by walking the manifest.
- `validate:smoke` and `report:smoke` gain a `--corpus-dir` flag so CI and the sample flow target `corpus/example` without touching local recorded runs.
- The report CLI stays offline-only: reads corpus evidence, never launches a browser, executes no actions, no AI in the loop (NFR-1 parity with `validate:smoke`).
- The committed fixture contains no `@last-run`/`@last-fail` symlink fans — those stay a local-run convenience; the fixture is plain directories a git reader can walk.

## Non-goals

- Committing any real recorded corpus (privacy). Live recording remains available only to the repo owner, locally.
- A failing scenario or red fixture inside `corpus/example/`, or any CI job that legitimately goes red as part of the demo.
- JUnit/XML or other CI-format emitters — `report.json` is the CI/AI contract; the "xunit / CI output reporters" roadmap item is retired.
- Live-browser CI (authenticated Kraken recording) — impossible without secrets and out of scope.
- Report features beyond this repo's presentation scope: flakiness trending, cross-run diff views, dashboard aggregation, WH/CDN-hosted assets.
- Changing the existing single-self-contained-HTML contract of the report itself (CAP-1 of spec-test-run-report is preserved).

## Success signal

A headhunter or AI assistant can open the repo, read `corpus/example/`, click from a Gherkin scenario to its snapshot/probe/network/screenshot evidence, and trust the CI README badges and GitHub Pages report — all green, all offline-derived — because the committed fixture and the generator provably agree, and a FAIL example is visible only where it cannot poison that signal.

## Assumptions

- The committed fixture mirrors the current smoke plan shape (14 scenarios) and omits screenshots/network in v1 — the report renders per-step evidence links only (MISSING_KIND exercised naturally; supersedes the earlier representative-screenshots assumption).
- The same pure report builder that emits `report.html` emits `report.json` in the same invocation; there is no separate JSON pipeline to keep in sync.
- GitHub Pages serves the sample report from the committed fixture generated by CI (or the CI artifact), so relative evidence links work in the published site.