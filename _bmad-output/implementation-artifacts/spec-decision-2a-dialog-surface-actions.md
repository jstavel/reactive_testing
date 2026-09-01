---
title: 'Wire live locators for the Portfolio Summary dialog actions'
type: 'feature' # feature | bugfix | refactor | chore
created: '2026-09-01'
status: 'draft' # draft | ready-for-dev | in-progress | in-review | done
review_loop_iteration: 0 # incremented by step-04 before each review loopback
context: ['_bmad-output/implementation-artifacts/deferred-work.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The three Portfolio Summary dialog actions in `orchestrator/action-map.ts:57-68` use locators that do not resolve against the live Kraken Pro app: `openPortfolioSummary` uses `getByText(/portfolio value/i)` (0 matches), `toggleEyeIcon` uses `getByRole("button", { name: /eye/i })` (0 matches — the icon is an `<svg name=​"Eye"|"EyeOff">` with no accessible name), and `closePortfolioSummary` presses bare `Escape` which only works when an element inside the dialog already has focus. Smoke scenarios 8-10 (`model/smoke.test-plan.ts:44-60`) therefore fail.

**Approach:** Replace the three action-map locators with live-verified, unique selectors (discovered on the authenticated home page): open = the header value button scoped to the navigation, eye = the dialog's `button:has(svg[name="Eye"/"EyeOff"])`, close = `getByRole("dialog").press("Escape")`. No contract or model changes — the dialog predicates are not evaluatable, so scenario pass still means the actions run + settle. The actions stay value-agnostic (match the value's shape, never a concrete USD figure); referencing specific values belongs to the parked "load app state" RFE (see `deferred-work.md`).

## Boundaries & Constraints

**Always:**
- `orchestrator/action-map.ts:57-68` (the three dialog entries) change. No contract, FSM, schema, status validator, or `corpusDependenciesFor` change.
- Feature + smoke-plan change (human-approved, option 1): make each dialog scenario end with the dialog closed, so the shared-page smoke model stays clean between scenarios — no state-reset feature added. App state-loading semantics stay parked in the RFE.
- Each locator must resolve to EXACTLY one element on the live home page (strict-mode single-match) with the dialog closed.
- `openPortfolioSummary` must work both when the portfolio value is visible (`4,976.38 USD`) AND hidden by the eye (`·········· USD`) — the value button text always ends in `USD`.
- `toggleEyeIcon` must toggle the value mask (values masked/unmasked) and remain within the open dialog.
- `closePortfolioSummary` must use a dialog-scoped Escape so focus is inside the dialog, closing it reliably regardless of where focus was after `openPortfolioSummary`.
- Locators stay deterministic (no runtime AI) and survive the dialog state persisting across open/close.

**Ask First:** none — the live discovery resolved the earlier deferred risk (the eye control DOES have a discoverable stable locator).

**Never:**
- No new contract, FSM transition, schema field, validator/predicate, or `corpusDependenciesFor` change — nothing beyond the value-agnostic locator fix and the scenario self-close (approved).
- Do not broaden the `/USD$/` match to a bare `getByRole("button", { name: /USD/i })` (31 matches — market tickers) or otherwise relax strict single-match.
- Do not change the settle/ready selectors or the smoke runner config.
- Do NOT embed, hard-code, or assert any concrete USD figure (e.g. `4,976.38`) in the action bodies or anywhere in the story. The actions are value-agnostic: they match the value's *shape* (`/USD$/`, masked or not), never its magnitude or current level, because portfolio values drift (~$4k now, >$5k before). Referencing a specific value is owned by the parked "load app state" RFE, not this story.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH_OPEN | on home, value visible `4,976.38 USD` | scoped nav `/USD$/` button = 1 match; click opens dialog with all six wallet sections | n/a |
| MASKED_VALUE_OPEN | eye toggled, value shows `·········· USD` | same locator still 1 match; click opens dialog | n/a |
| EYE_TOGGLE | dialog open, eye `EyeOff` (visible) | click flips to `Eye` and masks values to `··········` | n/a |
| EYE_UNTOGGLE | dialog open, eye `Eye` (hidden) | click flips to `EyeOff` and unmasks values | n/a |
| ESC_CLOSE_AFTER_OPEN | dialog just opened via value button, focus on header button | `getByRole("dialog").press("Escape")` closes it | n/a |
| NAV_SCOPE_COLLISION | any state | scoped nav `/USD$/` yields exactly 1 (never the market rows which also end in `USD` but live outside `role=navigation`) | strict-mode throws on >1; do not regress |

</frozen-after-approval>

## Code Map

- `orchestrator/action-map.ts:57-68` — primary change surface: the three `openPortfolioSummary`, `closePortfolioSummary`, `toggleEyeIcon` entries. Live-verified replacing locators (see Design Notes for the exact selectors proven against the authenticated page).
- `features/home-page-portfolio-summary-dialog.feature` — Gherkin SSOT: scenarios 8 and 10 now end by closing the dialog so the shared-page smoke model stays clean (human-approved option 1).
- `model/smoke.test-plan.ts:44-68` — the `@plan:smoke` plan: scenario 8 (`…opens-the-portfolio-summary-dialog`) gains a trailing `closePortfolioSummary`; scenario 10 (`…eye-icon-toggles…`) gains a trailing close; scenario 9 (`pressing-escape…`) already self-closes. No model/contract/FSM change, so the embedded modelVersion hash stays valid.
- `bin/run-smoke.ts` — live verification harness (read-only): `readySelector` = `[data-testid="overview-portfolio-hero-value-text"]`, `settleSelector` = `[aria-label="Side navigation"]`, attaches via CDP `http://127.0.0.1:9222`. The sidebar settle survives dialog open/close.
- `validators/dependencies.ts:31-32` — read-only: `dialog-open`/`dialog-closed` are not evaluatable, so no validator consumes dialog state; scenario pass is action-level.
- `$live` CDP session on `http://127.0.0.1:9222` — the signed-in Kraken Pro home page used for verification.

## Tasks & Acceptance

**Execution:**
- [x] `orchestrator/action-map.ts` -- replace the three dialog action bodies with the live-verified locators (open for `openPortfolioSummary`; dialog + Escape for `closePortfolioSummary`; dialog-scoped eye button for `toggleEyeIcon`) -- the current locators resolve to 0 matches and fail the dialog scenarios.
- [x] `features/home-page-portfolio-summary-dialog.feature` + `model/smoke.test-plan.ts` -- make every dialog scenario end with the dialog closed (scenario 8 and 10 gain a trailing close; scenario 9 already self-closes) -- the shared single page in `run-smoke` carries dialog state across scenarios, so a left-open dialog from one scenario obstructs the next scenario's `openPortfolioSummary` click (verified live).
- [x] `orchestrator/orchestrator.test.ts` -- update the Playwright mocks to be fluent (each locator call returns a locator that exposes `click`/`press`/`locator`/`first`/`getByRole`) and drop the `getByText` assertion from the action-execution test -- the old shallow mocks and the `getByText(/portfolio value/i)` expectation encode the replaced broken locators.

**Acceptance Criteria:**
- Given a signed-in Kraken Pro home page with the dialog closed, when `openPortfolioSummary` runs, then the value button (scoped `role=navigation`, text matching `/USD$/`) is found uniquely and the Portfolio Summary dialog opens with the six sections (Main, Spot, Margin, Futures, Loans, Earn), whether the value is masked or unmasked.
- Given the dialog is open, when `toggleEyeIcon` runs, then the eye `svg[name]` flips `Eye`↔`EyeOff` and the dialog values flip between masked (`··········`) and visible, with exactly one eligible eye button.
- Given the dialog is open (regardless of where focus was after opening), when `closePortfolioSummary` runs, then the dialog closes (0 `role=dialog` on the page).
- Given smoke scenarios 8-10, when `npm run run:smoke` runs against the live CDP session, then scenarios `…opens-the-portfolio-summary-dialog`, `pressing-escape-closes…`, and `the-eye-icon-toggles-value-visibility-immediately` report PASS (and the total pass count rises accordingly).

## Spec Change Log

## Design Notes

Live-verified selectors (authenticated home page, CDP on 9222):

- **open** — the top-nav value button: `getByRole("navigation").getByRole("button", { name: /USD$/ })`. Scoping to `role=navigation` is what makes it unique (1 match) — a bare `getByRole("button", { name: /USD$/ })` yields 2 (the header value at top PLUS a market row `…1.162234…USD` elsewhere). The `$`-anchor means the masked `·········· USD` still matches, so open works whether or not the eye has hidden values.
- **eye** — `getByRole("dialog").locator('button:has(svg[name="Eye"]), button:has(svg[name="EyeOff"])')`. Exactly one such button while open. The svg `name` attribute flips on click (`EyeOff`=values visible → `Eye`=hidden). Not a text-based role, hence no accessible name to match.
- **close** — `getByRole("dialog").press("Escape")`: Playwright focuses the dialog and sends Escape within it, so it closes even though `openPortfolioSummary` left focus on the header value button outside the dialog. A bare `page.keyboard.press("Escape")` leaves focus on the header button and does NOT close.

The eye-visibility state persists across open/close, so `openPortfolioSummary` must not depend on the digit pattern.

## Verification

**Commands:**
- `npm run typecheck` -- expected: exit 0.
- `npm test` -- expected: all files pass (14 files / 178 tests).
- `npm run run:smoke` -- expected: scenarios 8-10 (`…opens-the-portfolio-summary-dialog`, `pressing-escape-closes…`, `the-eye-icon-toggles…`) PASS against the live CDP session; final "passed/total" reflects them.

**Manual checks (if no CLI):** none — smoke run is the end-to-end proof.
