---
id: SPEC-test-run-report
companions: []
sources:
  - ../brainstorming/brainstorm-test-report-2026-09-02/brainstorm-intent.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Test Run Report

## Why

Test run results need to be immediately inspectable — pass or fail — and debuggable without guesswork. Current test reports (e.g. Robot Framework) provide screenshots and color coding but lack structured architectural evidence (FSM state, contract assertions). A spec-first testing system produces richer data at each step; the report should surface it. This is a **pain to solve**: QE experts waste time reproducing failures that the system already knows about.

## Capabilities

- **CAP-1**
  - **intent:** The system generates a single self-contained HTML report after each test run.
  - **success:** A test run produces one `.html` file that opens in any browser with zero external dependencies (no server, no CDN, no local files).

- **CAP-2**
  - **intent:** The report presents results as a collapsible Gherkin feature tree with a pass/fail summary bar at the top.
  - **success:** Opening the report shows a green/red summary bar with pass/fail/total counts, followed by a feature tree where each scenario is collapsible and color-coded by result.

- **CAP-3**
  - **intent:** Each test step exposes expandable evidence: screenshot, FSM state, contract assertions, and timing.
  - **success:** Clicking a step reveals a screenshot, the FSM state at step entry/exit, contract assertion results (expected vs actual), and wall-clock duration. On failure, a DOM snapshot is also shown.

- **CAP-4**
  - **intent:** The report embeds the current Gherkin source text, preventing staleness.
  - **success:** The Gherkin text in the report matches the spec file used for the run, even if the spec has since changed. Opening the report after a spec update still shows the version that was actually tested.

- **CAP-5**
  - **intent:** Each step shows a simple error message on failure.
  - **success:** A failed step displays a human-readable assertion message with expected vs actual values (not a raw stack trace).

## Constraints

- Single self-contained HTML file per run. No multi-file output, no server dependency, no external assets.
- Progressive disclosure is the UX model: summary bar (always visible) → feature tree (always visible) → per-step details (expandable on click). No information overload in the default view.
- Screenshots are captured on every step. DOM snapshots are captured only on failure in v1 (to control file size bloat).
- Error presentation starts simple in v1 — plain assertion text — and iterates based on real usage.

## Non-goals

- Flakiness tracking (run-to-run pass rate, flaky test detection). Out of scope for v1.
- Clickable screenshot-to-DOM correlation (click a region of a screenshot to highlight the DOM element). Deferred.
- Diff view comparing two runs side by side. Deferred.
- Multi-file or dashboard-based reports. The single-file constraint is non-negotiable.
- Tag-based scenario filtering. Deferred to v2.
- Copy-Gherkin-to-clipboard button. Deferred to v2.

## Success signal

Opening a failing report immediately shows the failed step with screenshot + FSM state + contract assertion, enabling diagnosis without touching code or reproducing the test. The report can be shared as a single file and understood by both technical (QE, architects) and non-technical (PMs, team leads) audiences.

## Assumptions

- Screenshots can be inlined (base64 or blob URLs) without exceeding reasonable file sizes for typical test suites (assumed < 50 scenarios per run).
- FSM state is available at step granularity from the test runner.
- Contract assertions produce structured expected/actual values, not just boolean pass/fail.

## Open Questions

- Screenshot/DOM storage format and size limits for large test suites (inlining strategy and compression).
- DOM snapshot strategy: full DOM vs filtered/trimmed — needs profiling with real test output.
- FSM state representation: which state transitions to surface, how to avoid noise in stateful systems with many internal transitions.
