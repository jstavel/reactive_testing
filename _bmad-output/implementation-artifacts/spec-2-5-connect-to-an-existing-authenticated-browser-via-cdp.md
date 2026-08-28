---
title: 'Story 2.5: Connect to an existing authenticated browser via CDP'
type: 'feature'
created: '2026-08-28'
status: 'in-progress'
review_loop_iteration: 0
baseline_commit: '277e8878449f4f32ca395558e91145d0c5df74b2'
context:
  - _bmad-output/planning-artifacts/architecture/architecture-reactive-testing-2026-08-17/ARCHITECTURE-SPINE.md
  - _bmad-output/implementation-artifacts/epic-2-context.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** AD-4 says the Orchestrator "drives the browser via Playwright/CDP", but the current browser layer (`orchestrator/browser.ts`) only ever does `chromium.launch()` + `page.goto(baseUrl)` — a fresh, anonymous session. Kraken Pro requires 2FA login, so a machine-launched browser can never authenticate. The only viable connection mode is **attaching to a browser a human has already logged into**. A fresh-launch run is therefore not an option but a dead end — the orchestrator must connect over CDP to an already-authenticated browser session.

**Approach:** Add a CDP-attach connection mode as the primary (and, for the real product, only) way to run a plan against the live app:

- `launchBrowser` gains an attach path: `chromium.connectOverCDP(config.cdpUrl)` instead of `chromium.launch()`, reusing the human's authenticated browser profile.
- The run opens a **new tab in the existing authenticated context** and navigates it to `baseUrl` (a same-app navigation, not a fresh login), so 2FA session state is preserved.
- `closeBrowser()` **detaches** (disconnects) from the user's browser — it must never call `browser.close()` on a CDP-attached session.
- A minimal runner entry point (`bin/run-smoke.ts`) wires `runTestPlan` against the smoke plan so Jan can point the orchestrator at a live, logged-in browser and produce a real corpus on disk.

This closes the gap that currently keeps Epic 2's stated goal — "run a scenario against the live app and produce a recorded corpus" — demonstrable only via mocked tests.

## Boundaries & Constraints

**Always:** Connect over CDP to an already-authenticated browser (AD-4 "via Playwright/CDP"); open a new tab in the authenticated context and navigate within the app so 2FA state is preserved; the run remains offline and deterministic (AD-4, NFR-1); config (`cdpUrl`) is a shared shape living in `schemas.ts` (AD-13); `import type` for type-only imports (verbatimModuleSyntax); English-only identifiers (NFR-4); `tsc --noEmit` clean.

**Ask First:** HALT if any of these surfaces and is not already specified: (1) ~~how the runner picks WHICH authenticated context/tab to drive when the attached browser exposes more than one~~ — RESOLVED by live probe: the attached browser exposes exactly ONE CDP context containing the Kraken pages, so the authenticated context is deterministic (contexts[0]); the run still opens its own new tab in it to avoid tab-guessing; (2) ~~whether the smoke plan's expected starting state differs from the live home page and its real readySelector~~ — RESOLVED by live probe: the real home page does NOT render `#app` (it is `#root` → `#app-shell`), so the current `readySelector` (`#app`) is wrong; the confirmed live home selector is `[data-testid="overview-portfolio-hero-value-text"]` (visible ~4.6s after nav, reflects the authenticated portfolio value); (3) whether to keep `chromium.launch()` as a fallback for CI/anonymous fixtures (recommend: keep the existing launch path behind the current default `headless` launch ONLY for local tests, but the live run always attaches).

**Never:** Close the human's browser on a CDP-attached session — the run does not own it. On a `connectOverCDP` handle, `browser.close()` only disconnects the CDP WebSocket and leaves the user's Chromium running; that is the correct detach and is the ONLY way to release the connection (there is no `disconnect()` primitive on a CDP handle). What is forbidden is anything that terminates the human's browser process/window; read or store credentials, tokens, or 2FA secrets (the human owns authentication); cross the 2FA/login boundary by logging in programmatically; drive a random/unspecified tab instead of a deliberately opened, navigated page; change the collection or corpus-persistence behavior of other stories (2-2, 2-3, 2-4).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Live attach happy path | CDP endpoint `http://127.0.0.1:9222` reachable; human logged in | `runTestPlan` attaches, opens an authenticated tab, navigates to `baseUrl`, runs steps, writes corpus + manifest | CDP unreachable → clear error, no browser closure |
| Fresh tab preserves auth | Attached browser with a session cookie | New tab navigates to same-app `baseUrl` and stays authenticated | N/A |
| Detach (not close) | Run completes / fails | `closeBrowser()` disconnects the CDP WebSocket (`browser.close()` on the CDP handle — a disconnect, not a close) and resets `activeSession`; the human's browser stays open | Disconnect failure logged; the user's browser is never terminated |
| Multiple contexts/tabs | CDP browser exposes >1 context/page | Run opens its OWN new tab in the authenticated context and navigates it; does not guess an existing tab | Ambiguity → explicit error guiding the operator |
| No CDP endpoint | `cdpUrl` unreachable | `runTestPlan` fails fast with an actionable "connect over CDP" error | Thrown, no partial run |
| `readySelector` mismatch | Live home page lacks the smoke plan's ready selector | `waitForSelector` times out with a clear selector/timout message | Existing step-timeout handling |

</frozen-after-approval>

## Code Map

- `orchestrator/browser.ts:12` — `launchBrowser(config)`; today only `chromium.launch({ headless })` + `page.goto(baseUrl)`; ADD a CDP-attach path: `chromium.connectOverCDP(config.cdpUrl)` → authenticated context → new tab → `goto(baseUrl)`
- `orchestrator/browser.ts:38` — `closeBrowser()`; today calls `browser.close()`; CHANGE to detach/disconnect on CDP-attached sessions (never close the human's browser)
- `model/schemas.ts:129` — `OrchestratorConfig`; ADD `cdpUrl` (default `http://127.0.0.1:9222`) per AD-13 — shared config shape
- `orchestrator/orchestrator.ts:56` — `launchBrowser({ baseUrl, headless, readySelector })` call site; thread the new `cdpUrl` connection mode through
- `bin/run-smoke.ts` (NEW) — minimal runner: builds `OrchestratorConfig` (cdpUrl + baseUrl + readySelector + corpusDir), calls `runTestPlan(smokeTestPlan, config)`, prints the summary, leaves the browser running
- `model/smoke.test-plan.ts` — the `smokeTestPlan` the runner executes (verify its `modelVersion` matches the current model before a live run)
- `vitest.config.ts` / `package.json` — add a `run:smoke` script if a runner is added, and keep `npm run typecheck` / `npm test` green

## Tasks & Acceptance

**Execution:**
- [x] `model/schemas.ts` -- ADD `cdpUrl?: string` to `OrchestratorConfig` (default `http://127.0.0.1:9222`) -- shared config shape, AD-13
- [x] `orchestrator/browser.ts` -- ADD CDP-attach connection mode: `chromium.connectOverCDP(cdpUrl)` (wrapped in a timeout so a stalled endpoint fails fast), reuse the authenticated context (`contexts[0]`), open a NEW tab, `goto(baseUrl)`; keep the existing anonymous `chromium.launch()` path available for local/CI tests -- AD-4 "via CDP"; reset `activeSession` on detach so a later run in the same process can re-attach
- [x] `orchestrator/browser.ts` -- CHANGE `closeBrowser()` to DETACH on CDP-attached sessions: `browser.close()` on a `connectOverCDP` handle is a disconnect (never terminates the human's browser); reset `activeSession` so a later run in the same process can re-attach
- [x] `orchestrator/orchestrator.ts` -- Thread the new connection mode (config.cdpUrl) through `launchBrowser`; no change to collection/corpus logic
- [x] `model/smoke.test-plan.ts` -- Regenerate `modelVersion` for the changed model (`schemas.ts` gained `cdpUrl`); the CONFIRMED live readySelector (`[data-testid="overview-portfolio-hero-value-text"]`) lives in `OrchestratorConfig.readySelector`, set by the runner
- [x] `bin/run-smoke.ts` (NEW) -- Minimal runner entry point that calls `runTestPlan(smokeTestPlan, config)` with `{ cdpUrl, baseUrl, readySelector, corpusDir, probes }` (no `headless` — it is meaningless under CDP-attach), prints the run summary, reports an explicit error when `runTestPlan` returns zero scenarios (e.g. `modelVersion` mismatch), and detaches (never closes) the attached browser; no forced `process.exit()` needed since `closeBrowser()` releases the CDP connection
- [x] Add/update tests: a browser-layer test that a CDP-attached session is DETACHED via `browser.close()` (= disconnect) and that an unreachable `cdpUrl` fails fast; keep `npm run typecheck` clean and `npm test` passing (43 passed)
- [ ] Live check: run `bin/run-smoke.ts` against the live logged-in browser (Chromium `:9222` + `https://pro.kraken.com/app/home`) and confirm a corpus + `run-manifest.json` land on disk -- Epic 2 goal demonstrated for the first time (MANUAL — drives Jan's live authenticated browser)

**Acceptance Criteria:**
- Given Chromium running with CDP on `http://127.0.0.1:9222` and Kraken Pro logged in, when I run the smoke plan, then the orchestrator attaches via CDP, opens an authenticated tab, navigates to the app home, waits on the CONFIRMED `[data-testid="overview-portfolio-hero-value-text"]` readySelector, executes the steps, and writes a namespaced corpus + `run-manifest.json` (AD-4, AD-15).
- Given a CDP-attached run, when it finishes (success or failure), then the human's browser is left open and running — only a disconnect occurs (`browser.close()` on the CDP handle, which never terminates the browser), and `activeSession` is reset so a subsequent run in the same process can re-attach.
- Given a run with no reachable CDP endpoint, when it runs, then it fails fast with an actionable error and no partial corpus.
- Given `npm run typecheck` / `npm test`, when run, then exits 0.

## Spec Change Log

- **2026-08-28** — Initial story. Created after a checkpoint review of Story 2-3 surfaced that Epic 2's stated goal ("run against the live app") is not yet demonstrable: the browser layer only supports fresh `chromium.launch()`, which cannot work for Kraken Pro's 2FA. The human confirmed CDP-attach to an already-authenticated browser is the only viable connection mode (not a fallback), and that opening a new tab + same-app navigation preserves login. This story makes the "via CDP" half of AD-4 concrete.
- **2026-08-28** — Revised after a live CDP probe of `:9222`: confirmed the real home page renders `#root` → `#app-shell` (NOT `#app`), so the smoke plan's `#app` readySelector is wrong; the confirmed live selector is `[data-testid="overview-portfolio-hero-value-text"]` (visible ~4.6s after nav). Confirmed the attached browser exposes a single CDP context (authenticated context = `contexts[0]`). Folded in review findings: attach wrapped in a timeout; `activeSession` reset on detach (re-run safe); runner drops the dead `headless` flag and reports zero-scenario (`modelVersion` mismatch) explicitly. Flagged out-of-scope: the smoke plan's role-based action locators return 0 matches on the live home page (action compatibility is a follow-up story, not 2.5).
- **2026-08-28** — Human renegotiated the `Never` detach rule (Option A): `browser.close()` on a `connectOverCDP` handle is a **disconnect**, not a close — it leaves the human's Chromium running and is the only way to release the CDP connection (no `disconnect()` primitive exists). The original "never call `browser.close()`" wording was based on a Playwright misconception and pushed the implementation toward a leaky handle-drop. Renegotiated Never block, I/O Matrix "Detach" row, Task, AC, and Design Note to reflect that `closeBrowser()` uses `browser.close()` (= disconnect) on CDP-attached sessions without ever terminating the browser; dropped the forced `process.exit()` need in the runner.

## Design Notes

- **CDP-attach is the primary connection mode, not a fallback.** Kraken Pro's 2FA means a machine-launched browser can never log in, so `chromium.connectOverCDP()` to the human's already-authenticated Chromium is the only real path to a live run (AD-4's "Playwright/CDP").
- **New tab, not tab-guessing.** To avoid ambiguity when the attached browser exposes multiple contexts/tabs, the run always opens its own new tab in the authenticated context and navigates it to `baseUrl`. `baseUrl` remains meaningful (same-app navigation), and `readySelector` signals the home view is rendered. Live probe: the attached browser exposes a single context, so the authenticated context is simply `contexts[0]` — but the new-tab rule still holds.
- **Confirmed live readySelector.** The real home page renders `#root` → `#app-shell`, NOT `#app`; the current `readySelector` (`#app`) is wrong for Kraken Pro. Confirmed working selector: `[data-testid="overview-portfolio-hero-value-text"]` — a stable, specific element that only exists once the authenticated portfolio hero has rendered its live value (~4.6s after nav). This is the selector the smoke plan must use for the live run.
- **Scope flag: action compatibility is OUT of 2.5.** Live probe found the smoke plan's role-based action locators (`getByRole("link", { name: /history/i })`, `/portfolio/i`) return **0 matches** on the real home page. Story 2.5 only wires the CDP connection + new tab + readySelector; making the action layer drive real Kraken actions is a separate follow-up (it cannot be demoed in the same story).
- **Detach, never close.** The user's browser is not owned by the run. On a `connectOverCDP` handle, `browser.close()` is a **disconnect** — it releases the CDP WebSocket and leaves the human's Chromium running; it can never terminate a browser you only connected to. This is the only way to release the connection (a CDP handle has no `disconnect()`), and there is no `finally`-reset needed in `launchBrowser`'s happy path because `closeBrowser()` resets `activeSession` itself. This is the highest-blast-radius rule in the story.
- **No credentials handled here.** The human authenticates outside the run; the orchestrator never reads or stores secrets, tokens, or 2FA material.

## Verification

**Commands:**
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: new browser-layer tests pass along with existing suites
- `npm run run:smoke` (once added) -- expected: attaches to `:9222`, runs the smoke plan, writes `corpus/{kind}/{runId}/{stepIndex}.{ext}` + `run-manifest.json`, prints the summary, and leaves Chromium open

**Manual check:**
- Keep Chromium on `:9222` with Kraken Pro logged in at `https://pro.kraken.com/app/home`; run the smoke plan; confirm corpus files appear and that the browser tab is STILL open and authenticated afterward (never closed).
