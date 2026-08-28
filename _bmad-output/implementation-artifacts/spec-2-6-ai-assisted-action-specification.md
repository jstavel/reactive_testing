---
title: 'Story 2.6: Specify the real per-contract actions against the live Kraken Pro home page (AI-assisted)'
type: 'feature'
created: '2026-08-28'
status: 'backlog'
review_loop_iteration: 0
baseline_commit: '277e8878449f4f32ca395558e91145d0c5df74b2'
context:
  - _bmad-output/planning-artifacts/architecture/architecture-reactive-testing-2026-08-17/ARCHITECTURE-SPINE.md
  - _bmad-output/implementation-artifacts/epic-2-context.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 2.5 wired the CDP-attach connection, new tab, confirmed readySelector, and corpus persistence — but every smoke-plan scenario **fails against the live Kraken Pro home page**. The reason is not the connection layer (proven working by live diagnostic) but the **action layer**: `orchestrator/action-map.ts` hardcodes role-based locators that return **0 matches** on the real DOM:

- `getByRole("link", { name: /history/i })`, `/portfolio/i`, `/main/i`, etc. → 0 matches
- `getByText(/portfolio value/i)` for the summary toggle → likely 0/ambiguous matches
- `getByRole("button", { name: /eye/i })` for the eye toggle → 0 matches

Each broken action burns Playwright's ~30s default auto-wait, then throws a `locator.click: Timeout`, so all 8 navigation + dialog-scenario contracts fail. Epic 2's goal — "run a scenario against the live app and produce a recorded corpus" — is still only demonstrable via mocked tests because the actions cannot actually drive the app.

**Opportunity (human-confirmed):** This is precisely the case for **AI-assisted authoring**. The AI inspects the live authenticated Kraken Pro home page, discovers the real DOM element for each contract's target (stable selector, accessible role, or aria-label), and writes the correct `actionMap` entry for that contract — converting the current hardcoded guesses into working, deterministic actions.

**Approach (AI-assisted, offline, deterministic output):**
1. Connect over CDP to the authenticated browser (reuse Story 2.5's layer).
2. For each contract in `model/contracts.ts`, drive the live page to the target's starting state and **discover** the real element: dump the DOM/accessibility snapshot, identify the exact node the action must target, and capture its stable locator.
3. Write the verified locator into the corresponding `actionMap` entry alongside the existing navigation sequence.
4. Verify: re-run the smoke plan; each action must reach its contract's postcondition (confirmed readySelector or exact post-nav URL).

The output `actionMap` stays **static and deterministic** (AD-4, NFR-1): the AI assists the *authoring* step offline; there is **no AI call at runtime**.

## Boundaries & Constraints

**Always:** Discover real locators only from the human's already-authenticated CDP browser (never a fresh launch — 2FA, per Story 2.5); the produced `actionMap` remains a static, deterministic `Record<contractId, ContractAction>` with **no AI at runtime** (AD-4, NFR-1); each action must satisfy its contract's `postconditions` (reach the expected URL / view / dialog) and preserve invariants; every broken contract (all 8 that fail on live) is fixed; `import type` for type-only imports; English-only identifiers (NFR-4); `tsc --noEmit` clean; `npm test` green.

**Ask First:** HALT if any of these surfaces and is not already specified: (1) a contract's target has **no discoverable stable locator** on the live page (e.g. the element is only reachable through a nav that isn't clickable in isolation) — flag it and defer with an explicit note rather than guessing; (2) the live DOM differs meaningfully between runs (Kraken Pro is a live trading app — market data and aria-labels may shift); (3) whether a locator that works on Kraken Pro's live DOM should be backed by the same attribute across multiple contracts (a shared nav pattern) — prefer a stable per-target locator over a shared fragile selector.

**Never:** Use wildcard/blind locators that could match the wrong element (e.g. bare `getByRole("link")` without an anchored name — must stay strict-mode single-target or anchored); hardcode a locator by guessing instead of discovering it from the live DOM; run any AI at runtime during plan execution; modify `model/contracts.ts`, `model/schemas.ts`, `model/fsm.ts`, or collector/corpus behavior — this story only replaces the **action implementations** in `orchestrator/action-map.ts`; change the detach/connection behavior of Story 2.5; introduce a locator that reads or stores credentials/tokens/2FA secrets.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Single-contract discovery | One contract, target reachable from home | AI captures the live DOM, identifies the exact element, writes a strict-mode locator into `actionMap` | No stable locator → flag & defer, never guess |
| All 8 broken navigation contracts | Home page, authenticated | Each action reaches its contract's postcondition (exact post-nav URL / dialog open) | Action still failing → investigate DOM, not ignored |
| Dialog eye toggle | Portfolio Summary dialog open | `toggleEyeIcon` targets the real eye button/anchor, values hide/show | No eye control discovered → defer with note |
| Determinism | `actionMap` after authoring | Static `Record<contractId, ContractAction>`, no AI call, works repeatedly | N/A |
| Live plan re-run | Authenticated CDP browser | All smoke-plan scenarios PASS; corpus written | Failing action reported per-scenario (existing runner output) |
| Shared nav pattern | Several contracts share a menu bar | Each contract still gets a strict, anchored per-target locator; no shared fragile wildcard | Ambiguity → Ask First |

</frozen-after-approval>

## Code Map

- `orchestrator/action-map.ts` — **REWRITE the 8 broken entries** with locators discovered from the live DOM. The `Record<contractId, ContractAction>` shape and determinism contract stay. Only the locator implementations change:
  - `clickHistoryMenuMain`, `clickHistoryMenuFutures` (History menu nav)
  - `clickPortfolioMenuOverview`, `clickPortfolioMenuMain`, `clickPortfolioMenuFutures`, `clickPortfolioMenuLoans`, `clickPortfolioMenuEarn` (Portfolio menu nav / Earn)
  - `openPortfolioSummary`, `toggleEyeIcon` (summary dialog + eye toggle)
  - (`closePortfolioSummary` — Escape — is already correct; verify, leave unchanged unless live differs)
- `orchestrator/browser.ts`, `orchestrator/orchestrator.ts`, `bin/run-smoke.ts` — **unchanged**; reused for discovery (connect over CDP, new tab, navigate) and for verification (re-run the smoke plan). No changes to Story 2.5 logic.
- A temporary/disposable discovery helper **may** live under `bin/` or `scripts/` (e.g. `bin/discover-actions.ts`) to drive a contract's starting state and dump the relevant DOM/accessibility subtree; it is a dev aid, not shipped in the deterministic path.
- `model/contracts.ts`, `model/schemas.ts`, `model/fsm.ts`, `collectors/` — **unchanged** (boundary).
- `orchestrator/action-map.test.ts` (NEW or extended) — assert each contract's action reaches its postcondition against a mocked page (strict-mode, single-target) so `npm test` proves the selectors are well-formed and deterministic.

## Tasks & Acceptance

**Execution:**
- [ ] Discovery pass: connect to the authenticated browser over CDP (reuse 2.5), open a new tab at `https://pro.kraken.com/app/home`, wait on the CONFIRMED readySelector (`[data-testid="overview-portfolio-hero-value-text"]`), and dump the accessibility/DOM subtree covering the main navigation, the Portfolio Summary trigger, and the eye toggle.
- [ ] For each of the 8 broken contracts, identify the exact live element (stable selector / role / aria-label) and write the corresponding `actionMap` entry (strict-mode, anchored, single-target); confirm each action reaches its contract's postcondition URL / dialog state.
- [ ] `closePortfolioSummary` — verify Escape still correct on live; change only if discovered otherwise.
- [ ] Add/extend `action-map.test.ts`: for every contract, a mocked-page test asserting the action runs (well-formed locator) and that no entry is a bare/unanchored wildcard; keep `npm run typecheck` clean and `npm test` passing.
- [ ] Live check (MANUAL — drives Jan's authenticated browser): `npm run run:smoke` → all smoke-plan scenarios PASS; corpus + `run-manifest.json` written; browser stays open & authenticated.

**Acceptance Criteria:**
- Given the authenticated Kraken Pro home page (CDP `:9222`), when I run the smoke plan, then **all scenarios PASS** (every broken contract's action reaches its postcondition).
- Given any contract in `allContracts`, when its `actionMap` entry runs, then it is static, deterministic, strict-mode single-target, and satisfies the contract's `postconditions`/`invariants` — with no AI call at runtime.
- Given `npm run typecheck` / `npm test`, when run, then exits 0.

## Spec Change Log

- **2026-08-28** — Initial story. Created by the human request after Story 2.5's live run confirmed the connection layer works (attach + new tab + confirmed readySelector + clean detach) but every smoke-plan scenario FAILs because `orchestrator/action-map.ts`'s hardcoded role-based locators return 0 matches on the live home page. Story 2.5's scope flag (spec line 88) named this a follow-up; the human confirmed it belongs in Epic 2. This story makes the AI-assisted authoring step concrete: discover the real DOM target per contract and write working, deterministic actions — completing Epic 2's "run against the live app" goal. Recorded in `deferred-work.md` with the Epic 2 placement prior to drafting.

## Design Notes

- **This is the missing half of Epic 2's goal.** Story 2.5 proved we can attach, tab, wait, and write corpus; Story 2.6 proves the actions can actually *drive* the app. Together they make "run a scenario against the live app and produce a recorded corpus" real rather than mocked.
- **AI assists authoring, not execution.** The deterministic pipeline (AD-4, NFR-1) is untouched: the AI inspects the live DOM once, during development, and writes static `actionMap` entries. At runtime the orchestrator is pure Playwright — no model calls. This preserves the project's "no AI in the loop" invariant.
- **Discover, never guess.** The current failure is literally a set of guessed locators. The rule for 2.6 is that every locator is captured from the live DOM (via the confirmed readySelector + a DOM/accessibility dump), never written blind. Anything without a discoverable stable target is flagged and deferred, not fabricated.
- **Per-target strict selectors over shared wildcards.** Kraken Pro's nav is a live, streaming app; a bare `getByRole("link")` or a shared fragile wildcard could hit the wrong element and violate determinism. Each contract gets an anchored, strict-mode locator.
- **Contract postconditions are the oracle.** A contract is "fixed" only when its action reaches the stated postcondition (exact post-nav URL, ledger/view selected, dialog open, values toggled) — verified against the live run, not just that a locator doesn't throw.
- **Scope boundary is the implementation only.** `contracts.ts`, `schemas.ts`, `fsm.ts`, collectors, and the 2.5 connection/corpus logic are out of scope. Only the action implementations (and their tests + a disposable discovery aid) change.

## Verification

**Commands:**
- `npm run typecheck` -- expected: exit 0
- `npm test` -- expected: new action-map tests pass along with existing suites (44 → more)
- `npm run run:smoke` (MANUAL, drives Jan's authenticated browser) -- expected: all scenarios PASS; corpus + `run-manifest.json` written; browser tab stays open & authenticated

**Manual check:**
- Keep Chromium on `:9222` with Kraken Pro logged in at `https://pro.kraken.com/app/home`; run the smoke plan; confirm **all scenarios PASS** (no `locator.click: Timeout` / 0-match failures) and that the corpus lands on disk; the browser stays open.
