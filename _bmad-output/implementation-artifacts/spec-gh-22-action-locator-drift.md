---
title: 'Action-map locator drift fixes (gh-22)'
type: 'bugfix'
created: '2026-09-09'
status: 'draft'
review_loop_iteration: 0
context:
  - _bmad-output/implementation-artifacts/deferred-work.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Three smoke scenarios fail live because their action-map locators no longer match the app (issue #22): the History "Assets" filter is now a `combobox`, not a button; the ledger pager buttons are unnamed icon buttons; and the Portfolio menu no longer contains an "Earn" item (Earn moved to a dedicated sidebar button).

**Approach:** Adjudicate as testware locator drift — update the three action implementations in `orchestrator/action-map.ts` against live-verified locators. Contract ids, FSM states, and postcondition URLs are unchanged (the declared behavior still holds; only the concrete UI path changed).

## Boundaries & Constraints

**Always:**
- Locators are the ones verified live on 2026-09-09 (single-target, strict-mode safe):
  - `filterHistoryByAsset`: click `getByRole("combobox", { name: "Assets" })` (opens the listbox), then check `getByRole("checkbox", { name: "Bitcoin (BTC")` — exact name, because `/bitcoin/i` matches both "Bitcoin (BTC)" and "Bitcoin Cash (BCH)".
  - `paginateHistoryNext`: click `locator('button:has(svg[name="ChevronRightSmall"])')` (exactly 1 match; pager buttons have no accessible name).
  - `clickPortfolioMenuEarn`: click `getByRole("button", { name: "Earn", exact: true })` in the sidebar, then `waitForURL("**/app/earn")` — the Portfolio menu now holds Overview/Main/TradFi futures/Futures/Loans/DEX only.
- Keep contract ids (`clickPortfolioMenuEarn` etc.), FSM transitions, and contracts.ts declarations unchanged — the postconditions (`url-is /app/earn`, etc.) still describe the app truthfully.
- Live verification is part of done: the affected scenarios pass in isolation via `npm run run:smoke -- …`.

**Ask First:** none — locator choices were probed live this session.

**Never:**
- No model edits (fsm.ts/contracts.ts/schemas.ts), no plan regeneration, no new contracts.
- No fixes for other surfaces; the timeout investigation closes with this story (the remaining cause was exactly this drift).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HISTORY_FILTER | run `open-the-assets-filter` isolated | passes: combobox click opens listbox, BTC checkbox checks | timeout → fail with evidence |
| HISTORY_PAGINATE | run `paginating-to-the-next-ledger-page` isolated | passes: chevron button click advances pager | timeout → fail with evidence |
| EARN_NAV | run `clicking-earn-navigates-to-the-standalone-earn-page` isolated | passes: sidebar Earn button navigates to `/app/earn` | timeout → fail with evidence |
| CHECK_UNIQUENESS | strict-mode locator audit | each replacement matches exactly 1 element on the live page | multi-match → fail loudly, never pick first |

</frozen-after-approval>

## Code Map

- `orchestrator/action-map.ts` -- the three entries to fix: `filterHistoryByAsset` (line ~64), `paginateHistoryNext` (line ~70), `clickPortfolioMenuEarn` (line ~58). Action-map is NOT hashed into `modelVersion` — no plan regeneration needed.
- `orchestrator/action-map.test.ts` -- `NAV_CONTRACTS` table (line ~26) drives per-entry locator assertions; `clickPortfolioMenuEarn`'s entry must switch from menu-button+menuitem to the sidebar button pattern.
- `orchestrator/orchestrator.test.ts` -- mocks `getByRole`/fluent locators; new locator shapes (combobox, `locator('button:has(svg…)')`) must still resolve through the fluent mock.
- Evidence: run `9dc3a8a9…` failure snapshot (Portfolio menu open, no Earn item); run `353dbf5a…` snapshots 14/16.pre (combobox Assets, unnamed chevron pager buttons); issue #22.

## Tasks & Acceptance

**Execution:**
- [ ] `orchestrator/action-map.ts` -- rewrite the three action implementations with the live-verified locators -- resolve the drift
- [ ] `orchestrator/action-map.test.ts` -- update the `clickPortfolioMenuEarn` locator assertions (sidebar button, no menu open) and add combobox/chevron coverage -- pin the new locators
- [ ] Live verification -- run the three scenarios isolated via `npm run run:smoke -- …` against the CDP session -- prove the fix against the real app

**Acceptance Criteria:**
- Given the live app, when `npm run run:smoke -- clicking-earn-navigates-to-the-standalone-earn-page` runs, then it passes.
- Given the live app, when the two History ledger scenarios run isolated, then both pass.
- Given `npm run typecheck` and `npm test`, both exit 0 with the updated locator assertions.

## Spec Change Log

<!-- Append-only. Populated by step-04 during review loops. Do not modify or delete existing entries. -->

## Design Notes

- Adjudication: **spec drift in the action layer only.** The model's declared behavior (homePage → earn at `/app/earn`; historyMain self-loops for filter/paginate) remains true; the concrete UI path changed (menu → sidebar; button → combobox; named pager → icon button). This is exactly the "action implementations live in action-map" split the repo settled in Story 2.6.
- Naming wart left as-is: `clickPortfolioMenuEarn` now clicks the sidebar button, not the Portfolio menu. Renaming the contract id would cascade through fsm/contracts/relations/plan/modelVersion for zero behavioral gain — recorded here instead.

## Verification

**Commands:**
- `npm run typecheck` -- expected: exits 0
- `npm test` -- expected: exits 0
- `npm run run:smoke -- clicking-earn-navigates-to-the-standalone-earn-page open-the-assets-filter paginating-to-the-next-ledger-page` -- expected: 3/3 pass against the live CDP session

**Manual checks:**
- Full plan run shows the three previously-failing scenarios green; per-step failure evidence remains available via `corpus/@last-fail` for any future failure.