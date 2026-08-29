---
title: 'Story 2.6: Specify the real navigation actions against the live Kraken Pro home page (AI-assisted)'
type: 'feature'
created: '2026-08-29'
status: 'done'
review_loop_iteration: 0
baseline_commit: 'eafb25e9d9b192ec9b48d6a1f0e649b94935f1d6'
context:
  - _bmad-output/planning-artifacts/architecture/architecture-reactive-testing-2026-08-17/ARCHITECTURE-SPINE.md
  - _bmad-output/implementation-artifacts/epic-2-context.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 2.5 made attach/new-tab/readySelector/corpus work, but every navigation smoke scenario still **fails against the live Kraken Pro home page**: `orchestrator/action-map.ts` hardcodes role locators that return **0 matches** on the real DOM (`getByRole("link", { name: /history/|/portfolio/|/main/ })`), so each action burns Playwright's 30s auto-wait and throws `locator.click: Timeout`. The 7 navigation scenarios fail; live-driving is only demonstrable via mocks.

**Opportunity (human-confirmed):** AI-assisted authoring. Inspect the live authenticated home page, discover the real DOM node for each nav target (stable selector / role / aria-label), write the working `actionMap` entry — guesses become deterministic actions.

**Approach (offline, deterministic output):**
1. Connect over CDP (reuse 2.5), open the authenticated home page, wait the confirmed readySelector.
2. Per contract: dump the nav DOM/accessibility subtree, identify the exact target node, capture its stable locator.
3. Write the verified locator into the `actionMap` entry; satisfy the contract's postcondition.
4. Verify: re-run smoke scenarios 1-7 — each nav action reaches its postcondition URL.

Output stays a static, deterministic `actionMap` (AD-4, NFR-1) with **no AI call at runtime**.

**Live-run blockers (folded in by human renegotiation, 2026-08-29):** the locator rewrite alone does not make scenarios 1-7 PASS live — two mechanisms that were never exercised past the (previously broken) action now fail, so they are in scope:
1. **Bootstrap ready-wait** — the home page renders the hero `readySelector` in ~6.3s, but the smoke run's `stepTimeout 3_000` caps the bootstrap `waitForSelector` at 3s → every run dies at launch. Fix: raise the smoke `stepTimeout` to 10s (still fast-fails broken locators vs Playwright's 30s).
2. **Post-step settle-wait** — after each successful nav, the orchestrator waits for the home-only hero `readySelector`, which is absent on `/history/*`, `/portfolio/*`, `/earn` (live count = 0) → every nav scenario fails on the settle, not the action. Fix: nav actions own their nav wait (`page.waitForURL` to the postcondition URL), and the settle wait uses a page-agnostic shell selector (`settleSelector`, defaults to `readySelector` for non-nav actions).

**Scope (human split, [S]):** This story covers the **7 navigation contracts** (History menu + Portfolio menu) plus the two live-run blockers above. The dialog contracts (`openPortfolioSummary`, `toggleEyeIcon`, `closePortfolioSummary`) ship as their own story — registered in `deferred-work.md`.

## Boundaries & Constraints

**Always:** Discover locators only from the human's already-authenticated CDP browser (never a fresh launch — 2FA, per 2.5); `actionMap` stays static-deterministic, no runtime AI (AD-4, NFR-1); each action reaches its contract's `postconditions` and keeps invariants; all 7 broken nav contracts fixed; `import type` for type-only imports; English-only identifiers (NFR-4); `tsc --noEmit` clean; `npm test` green.

**Ask First (HALT):** a nav target has **no discoverable stable locator** on the live page → defer with a note, never guess; the live DOM shifts meaningfully between runs (live app — data/aria may move); one locator pattern fits several contracts (shared nav) → prefer a stable per-target locator over a shared fragile selector.

**Never:** wildcard/blind locators (bare `getByRole("link")` unanchored — must be strict-mode single-target or anchored); guess a locator instead of discovering it; any AI at runtime; touch `model/contracts.ts`, `model/fsm.ts`, or collector/corpus behavior; change 2.5's detach/connection behavior (`orchestrator/browser.ts` attach/new-tab/detach stays untouched); locators that read/store credentials, tokens, or 2FA secrets. (`model/schemas.ts` and `orchestrator/orchestrator.ts` are now in scope for the settle-selector fix only; `bin/run-smoke.ts` is in scope for the stepTimeout/settleSelector config.)

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Single-contract discovery | One nav contract, target reachable | Live DOM captured; strict-mode anchored locator written | No stable locator → flag & defer |
| 7 broken nav contracts | Home page, authenticated | Each action reaches postcondition URL + selected view | Still failing → investigate DOM, not ignored |
| Determinism | `actionMap` after authoring | Static record, no AI call, works repeatedly | N/A |
| Shared nav pattern | Contracts share the History/Portfolio menu | Strict anchored per-target locator each; no shared wildcard | Ambiguity → Ask First |
| Live plan re-run | Authenticated CDP browser | Scenarios 1-7 PASS; corpus written | Failing action reported per-scenario |

</frozen-after-approval>

## Code Map

- `orchestrator/action-map.ts` -- `Record<string, ContractAction>` (:7); each `(context: { page: Page }) => Promise<void>` (contracts.ts:6), dispatched at `orchestrator.ts:222` as `withTimeout(action({ page }), stepTimeout)`. **REWRITE the 7 nav entries** (anchors): `clickHistoryMenuMain` :8-11, `clickHistoryMenuFutures` :13-16, `clickPortfolioMenuOverview` :18-21, `clickPortfolioMenuMain` :23-26, `clickPortfolioMenuFutures` :28-31, `clickPortfolioMenuLoans` :33-36, `clickPortfolioMenuEarn` :38-41. Each nav entry additionally **owns its nav wait** — `page.waitForURL(<postcondition glob>)` after the menuitem click. Leave the 3 dialog entries (deferred). Parity: 10 keys, pinned at `orchestrator.test.ts:326-336`.
- `model/contracts.ts` -- READ-ONLY postcondition oracle (contract block → URL): `clickHistoryMenuMain` :34 → `/app/history/main/ledger`, `clickHistoryMenuFutures` :44 → `/app/history/derivatives/ledger`, `clickPortfolioMenuOverview` :56 → `/app/portfolio/overview`, `clickPortfolioMenuMain` :66 → `/app/portfolio/main`, `clickPortfolioMenuFutures` :76 → `/app/portfolio/derivatives`, `clickPortfolioMenuLoans` :86 → `/app/portfolio/loans`, `clickPortfolioMenuEarn` :96 → `/app/earn`. Invariants: main nav visible; portfolio value in header.
- `model/schemas.ts` -- ADD `settleSelector?: string` to `OrchestratorConfig` (selector waited for after each step; defaults to `readySelector`). No other schema change; `contracts.ts`/`fsm.ts` untouched.
- `orchestrator/orchestrator.ts` -- lookup :218, `withTimeout(action({ page }), stepTimeout)` :222; **MODIFY** settle :223 to wait `config.settleSelector ?? config.readySelector`.
- `orchestrator/browser.ts` -- READ-ONLY: `launchBrowser` (:31) opens a NEW tab, `goto(baseUrl)`, waits `readySelector`; `closeBrowser` (:105) closes only the run's tab, detaches (human's browser never closed).
- `bin/run-smoke.ts` -- **MODIFY**: `baseUrl https://pro.kraken.com/app/home`, confirmed `readySelector [data-testid="overview-portfolio-hero-value-text"]` (:14), `cdpUrl :9222`, `stepTimeout 3_000` → **`10_000`** (home hero renders ~6.3s; nav actions take up to ~5s), `settleSelector '[aria-label="Side navigation"]'` (persistent shell on every Kraken Pro page), `corpusDir corpus`; per-scenario `[PASS|FAIL]`; zero-scenario + all-failed guards.
- `model/smoke.test-plan.ts` -- READ-ONLY: plan `modelVersion` hashes `contracts.ts`+`fsm.ts`+`schemas.ts` only (model/model-version.ts:12-22) — **`action-map.ts` not hashed**. Scenarios 1-7 = the 7 nav contracts (:15, :19, :24, :28, :32, :36, :40).
- `bin/discover-actions.ts` (NEW, disposable) -- CDP attach, new tab at baseUrl, wait readySelector, dump accessibility/DOM subtree for the History/Portfolio menus; dev aid only, removable before commit.
- `orchestrator/action-map.test.ts` (NEW) -- mocked-page tests per rewritten entry (anchored, strict-mode, single-target, and `waitForURL` to the postcondition glob); no real browser in unit tests.

## Tasks & Acceptance

**Execution:**

Per-contract mode (human-approved): run `bin/discover-actions.ts` to each contract's live starting state, dump the nav subtree, write that contract's `actionMap` entry (anchored, strict-mode, single-target), verify it reaches the postcondition URL live — proceed only after Jan approves that contract.

- [x] `bin/discover-actions.ts` (NEW, disposable) -- attach + new tab + wait readySelector + dump History/Portfolio menu subtree. (Created, used for live discovery, then removed before commit per "disposable" plan.)
- [x] `orchestrator/action-map.ts` -- `clickHistoryMenuMain` -- History → Main; reach `/app/history/main/ledger` (Ledger selected).
- [x] `orchestrator/action-map.ts` -- `clickHistoryMenuFutures` -- History → Futures; reach `/app/history/derivatives/ledger`.
- [x] `orchestrator/action-map.ts` -- `clickPortfolioMenuOverview` -- Portfolio → Overview; reach `/app/portfolio/overview`.
- [x] `orchestrator/action-map.ts` -- `clickPortfolioMenuMain` -- Portfolio → Main; reach `/app/portfolio/main`.
- [x] `orchestrator/action-map.ts` -- `clickPortfolioMenuFutures` -- Portfolio → Futures; reach `/app/portfolio/derivatives`.
- [x] `orchestrator/action-map.ts` -- `clickPortfolioMenuLoans` -- Portfolio → Loans; reach `/app/portfolio/loans`.
- [x] `orchestrator/action-map.ts` -- `clickPortfolioMenuEarn` -- Portfolio → Earn; reach `/app/earn`.
- [x] `orchestrator/action-map.test.ts` (NEW) -- every rewritten entry: mocked-page test (anchored strict-mode single-target); parity: every `allContracts` id has an entry and vice versa (10 keys).
- [x] `model/schemas.ts` -- `OrchestratorConfig.settleSelector?: string` (post-step settle selector, defaults to `readySelector`).
- [x] `orchestrator/orchestrator.ts` -- settle wait (:223) uses `config.settleSelector ?? config.readySelector`.
- [x] `orchestrator/action-map.ts` -- each of the 7 nav entries owns its nav wait: `page.waitForURL(<postcondition glob>)` after the menuitem click.
- [x] `bin/run-smoke.ts` -- `stepTimeout 10_000` (bootstrap ~6.3s + nav ~5s) and `settleSelector '[aria-label="Side navigation"]'`.
- [x] Unit tests -- `action-map.test.ts` fake page gains `waitForURL` and asserts the postcondition glob; `orchestrator.test.ts` page mock gains `waitForURL`; new settle-selector test.
- [x] Live check (MANUAL — drives Jan's authenticated `:9222`): `npm run run:smoke` → scenarios 1-7 PASS (8-10 may still fail — deferred); corpus + `run-manifest.json` written.

**Acceptance Criteria:**
- Given the authenticated Kraken Pro home page (CDP `:9222`), when `run:smoke` executes scenarios 1-7, then each nav action reaches its postcondition URL (no `locator.click: Timeout`, no bootstrap ready-wait timeout, no post-step settle timeout on the home-only hero selector).
- Given any rewritten nav contract, when its `actionMap` entry runs, then it is static, deterministic, strict-mode single-target, owns its nav wait (`waitForURL`), satisfies `postconditions`/`invariants`, with no runtime AI.
- Given a non-nav step (dialog contract), when the settle wait runs, then it still waits `readySelector` (backward-compatible `settleSelector` default).
- Given `npm run typecheck` / `npm test`, when run, then exits 0 (76 → more).

## Spec Change Log

- **2026-08-28** — Initial story (human request after 2.5's live run confirmed attach/new-tab/readySelector/corpus work but every smoke scenario fails on `action-map.ts`'s guessed role locators — a named 2.5 follow-up, confirmed in Epic 2, recorded in `deferred-work.md`).
- **2026-08-28** — Renegotiated execution mode at checkpoint: one task per contract, human live-verifies each before the AI proceeds ("AI proposes, human approves"); corrected the broken count from 8 to 9 (2 History + 5 Portfolio/Earn + 2 dialog).
- **2026-08-29 (plan refresh)** — Code Map re-anchored from investigation: `Record<string, ContractAction>` (no `contractId` union), `(context: { page }) => Promise<void>`; `modelVersion` does NOT hash `action-map.ts`; `run-smoke` `stepTimeout 3_000`; run's tab closes, browser stays attached-detached.
- **2026-08-29 (plan split [S])** — Narrowed to the **7 navigation contracts** (SCOPE STANDARD token gate). Dialog contracts `openPortfolioSummary`/`toggleEyeIcon`/`closePortfolioSummary` → their own story in `deferred-work.md` (scenarios 8-10 + eye-control Ask-First risk). Frozen intent regenerated for the narrowed scope; acceptance for this story = scenarios 1-7 PASS.
- **2026-08-29 (implementation)** — Wrote the 7 live-discovered nav entries (exact-named sidebar `button` → exact-named `menuitem`) and `orchestrator/action-map.test.ts` (86 tests, 10 new). Two unplanned but required corrections: (1) **`model/smoke.test-plan.ts` `modelVersion` regenerated** — the pinned `b96a1b8c…` predated Story 2.4's `schemas.ts` change, so `orchestrator.ts`'s `modelVersion !== computeModelVersion()` guard would have zeroed every scenario (the "modelVersion unaffected" note below was wrong — action-map.ts is unaffected, but 2.4 already moved the hash); (2) `orchestrator/orchestrator.test.ts`'s `mockGetByRole` gained a direct `.click` alongside `.first().click()` (and the two timeout-test mock overrides were reshaped) because the new entries click the locator directly instead of via `.first()`. Disposable `bin/discover-actions.ts` (plus ad-hoc `bin/verify-actions.ts`, `bin/mvcheck.ts`) removed before commit.
- **2026-08-29 (renegotiation)** — Live verification exposed two mechanisms the locator rewrite could not fix (they were never exercised past the previously-broken action): (1) bootstrap `waitForSelector(readySelector)` capped at `stepTimeout 3_000` while the home hero renders in ~6.3s → every run died at launch; (2) the post-step settle waits the home-only hero selector, absent on every nav target → nav scenarios fail on the settle, not the action. Human folded both into 2.6: `stepTimeout 3_000 → 10_000`, nav actions own their nav wait (`page.waitForURL`), and the settle wait uses a page-agnostic `settleSelector` (`[aria-label="Side navigation"]`, defaulting to `readySelector`). Scope widening from "action implementations only" to also touching `model/schemas.ts`, `orchestrator/orchestrator.ts`, and `bin/run-smoke.ts`; `contracts.ts`/`fsm.ts`/collectors/corpus and `browser.ts` remain untouched.

## Design Notes

- **Missing half of Epic 2.** 2.5 proved attach/tab/wait/corpus; this proves actions actually drive the app — "run a scenario live and record corpus" becomes real, not mocked.
- **AI authors, never executes.** The pipeline (AD-4, NFR-1) is untouched: inspect the live DOM once, write static entries; runtime is pure Playwright.
- **Discover, never guess.** The current failure is guessed locators. Every entry is captured from the live DOM; no discoverable stable target → defer, don't fabricate.
- **Per-target strict selectors, not shared wildcards** — a live streaming app makes bare/shared roles fragile and non-deterministic; each contract gets an anchored single-target locator.
- **Postconditions are the oracle** — "fixed" = the action reaches its exact post-nav URL / selected view on the live run, not merely that a locator doesn't throw.
- **`modelVersion` unaffected by the action rewrite** — the hash covers contracts/fsm/schemas only, so editing `action-map.ts` alone never invalidates the plan. The pinned version was nevertheless regenerated this story because Story 2.4 had already changed `schemas.ts` without bumping it, leaving the plan stale.
- **`stepTimeout` is the fast-fail budget, not the bootstrap budget** — a 3s budget made the discovery loop fast, but the home hero renders in ~6.3s and nav actions take up to ~5s, so the smoke run uses 10s: still fails broken locators in 10s (vs Playwright's 30s) while leaving room for real navigation.
- **Actions own their nav waits** — a nav entry ends with `page.waitForURL(<postcondition>)`, so the corpus is captured on the target page, not the pre-nav home page; the settle wait only confirms the persistent app shell is alive (`settleSelector`, defaulting to `readySelector` for non-nav steps).

## Verification

**Commands:**
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: new action-map tests pass alongside existing suites (76 → more)
- `npm run run:smoke` (MANUAL, drives Jan's authenticated browser) -- expected: **scenarios 1-7 PASS** (8-10 may still fail — deferred); corpus + `run-manifest.json` written; run's tab closes; human's browser stays open

**Manual check:**
- Chromium on `:9222`, Kraken Pro logged in at `https://pro.kraken.com/app/home`; run the smoke plan; confirm scenarios 1-7 PASS (no `locator.click: Timeout` / 0-match failures) and corpus lands on disk; the run's tab closes, the human's browser stays open.