# Test Run Report — Intent

## What we're building

A single self-contained HTML test report generated after each run. It presents results as a Gherkin feature tree with progressive disclosure: summary bar at top, collapsible scenarios, and per-step expandable details (screenshot, DOM snapshot, FSM state, contract assertions, timing). The report doubles as a spec artifact — the Gherkin embedded in it is the seed for the next test run.

## Core concept

**Request → Answer.** Each Gherkin scenario is a request at the start of a run and becomes the answer at the end, enriched with execution evidence. The report closes the loop between intent (what we wanted to test) and proof (what actually happened).

## Design

### Report anatomy

1. **Summary bar** — green/red X passed / Y failed / Z total. Top of page, always visible.
2. **Gherkin feature tree** — collapsible scenarios under feature nodes. Mirrors the spec structure.
3. **Per-step expandable details** (click to reveal):
   - Screenshot captured at that step
   - DOM snapshot (full on failure, optional on pass)
   - FSM state at step entry/exit
   - Contract assertions: expected vs actual values
   - Timing (wall-clock duration of step)

### Output format

Single `.html` file, no external dependencies. All assets (screenshots, DOM) inlined or embedded. KISS — one file per run, portable, openable anywhere.

### Gherkin embedding

Current Gherkin source is embedded in the report HTML. This prevents staleness and enables copy-to-clipboard for creating new tests from the report.

## MoSCoW

| Priority | Item | Notes |
|----------|------|-------|
| Must | Single self-contained HTML file | No server, no external deps |
| Must | Green/red summary bar | X passed / Y failed / Z total |
| Must | Gherkin feature tree | Collapsible scenarios |
| Must | Screenshot per step | Sequence is minimum visual evidence |
| Must | Embedded Gherkin source | Copy button is v2, embedding is v1 |
| Must | Simple error messages | Start simple, iterate |
| Should | FSM state per step | Differentiator from Robot Framework |
| Should | Contract assertions (expected vs actual) | Structured, not just text |
| Should | Timing per step | Wall-clock duration |
| Should | Run metadata | Timestamp, environment, version |
| Should | DOM snapshot on failure | Full DOM when step fails |
| Could | Tag-based filters | e.g. show only @critical failures |
| Could | Copy-Gherkin button | Report as seed for new tests |
| Could | Severity gradient | Beyond pass/fail binary |
| Won't | Flakiness tracking | Out of scope |
| Won't | Clickable screenshot → DOM correlation | Out of scope |
| Won't | Diff view between runs | Out of scope |

## Key decisions

- **Single HTML file** over multi-file/dashboard — KISS, portability, zero infra.
- **Progressive disclosure** as the UX model — summary bar first, tree second, details on demand. Avoids cognitive overload for both quick scans and deep dives.
- **Gherkin as the structural backbone** — scenarios organize the report, not arbitrary test IDs. Aligns with how the audience thinks.
- **FSM state is the differentiator** — what separates this from Robot Framework. Show architectural state at each step.
- **Errors: simple first** — don't over-engineer error presentation in v1. Iterate based on real usage.
- **Screenshots are mandatory, DOM is conditional** — screenshots on every step (minimum visual evidence); DOM only on failure in v1 to control bloat.
- **Embedded Gherkin prevents staleness** — the report always reflects the spec it was generated from, even if the spec changes later.
- **Bloat risks acknowledged** — screenshot size, DOM size, FSM noise. Mitigate with compression, failure-only DOM, and filtered FSM state. False-green confidence mitigated by contract assertions showing actual values.

## Open questions

- Screenshot/DOM storage format and size limits for large test suites (inlining vs base64 vs blob URLs).
- DOM snapshot strategy: full DOM vs filtered/trimmed — needs profiling with real test output.
- FSM state representation: which state transitions to surface, how to avoid noise in stateful systems with many internal transitions.
