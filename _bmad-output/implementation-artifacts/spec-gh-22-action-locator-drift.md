---
title: 'Action-map locator drift fixes (gh-22)'
type: 'bugfix'
created: '2026-09-09'
baseline_commit: 'fe2660f86fc3604d166e89d3213ed1378c7603ac'
status: 'done'
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
  - `filterHistoryByAsset`: click `getByRole("combobox", { name: "Assets" })` (opens the listbox), then press the visible `[data-testid="checkbox-box"]` inside the label of `getByRole("checkbox", { name: "Bitcoin (BTC)", exact: true })` — the checkbox input is visually hidden (1×1, clipped) so `.check()` cannot press it; the name is exact because `/bitcoin/i` matches both "Bitcoin (BTC)" and "Bitcoin Cash (BCH)".
  - `paginateHistoryNext`: click `locator('button:has(svg[name="ChevronRightSmall"])')` (exactly 1 match; pager buttons have no accessible name).
  - `clickPortfolioMenuEarn`: click `getByRole("button", { name: "Yield", exact: true })` — the sidebar entry navigating to `/app/earn` (its tooltip reads "Earn"; the Portfolio menu now holds Overview/Main/TradFi futures/Futures/Loans/DEX only; the only button actually named "Earn" is the home-body CTA, which opens the allocate dialog instead of navigating) — then `waitForURL("**/app/earn")`, then move the mouse to the viewport center: the click parks the pointer on the sidebar and the app keeps a hover tooltip open that sets `aria-hidden="true"` on the app root, blinding every subsequent role locator.
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
| EARN_NAV | run `clicking-earn-navigates-to-the-standalone-earn-page` isolated | passes: sidebar Yield button navigates to `/app/earn` | timeout → fail with evidence |
| CHECK_UNIQUENESS | strict-mode locator audit | each replacement matches exactly 1 element on the live page | multi-match → fail loudly, never pick first |

</frozen-after-approval>

## Code Map

- `orchestrator/action-map.ts` -- the three entries to fix: `filterHistoryByAsset` (line ~64), `paginateHistoryNext` (line ~70), `clickPortfolioMenuEarn` (line ~58). Action-map is NOT hashed into `modelVersion` — no plan regeneration needed.
- `orchestrator/action-map.test.ts` -- `NAV_CONTRACTS` table (line ~26) drives per-entry locator assertions; `clickPortfolioMenuEarn`'s entry must switch from menu-button+menuitem to the sidebar button pattern.
- `orchestrator/orchestrator.test.ts` -- mocks `getByRole`/fluent locators; new locator shapes (combobox, `locator('button:has(svg…)')`) must still resolve through the fluent mock.
- Evidence: run `9dc3a8a9…` failure snapshot (Portfolio menu open, no Earn item); run `353dbf5a…` snapshots 14/16.pre (combobox Assets, unnamed chevron pager buttons); issue #22.

## Tasks & Acceptance

**Execution:**
- [x] `orchestrator/action-map.ts` -- rewrite the three action implementations with the live-verified locators -- resolve the drift
- [x] `orchestrator/action-map.test.ts` -- update the `clickPortfolioMenuEarn` locator assertions (sidebar button, no menu open) and add combobox/chevron coverage -- pin the new locators
- [x] Live verification -- run the three scenarios isolated via `npm run run:smoke -- …` against the CDP session -- prove the fix against the real app

**Acceptance Criteria:**
- Given the live app, when `npm run run:smoke -- clicking-earn-navigates-to-the-standalone-earn-page` runs, then it passes.
- Given the live app, when the two History ledger scenarios run isolated, then both pass.
- Given `npm run typecheck` and `npm test`, both exit 0 with the updated locator assertions.

## Spec Change Log

<!-- Append-only. Populated by step-04 during review loops. Do not modify or delete existing entries. -->

- **2026-09-09 (review round 1)** — Three review lenses (blind-hunter, edge-case, verification-gap) triaged. PATCHED: (1) BTC checkbox locator tightened to `{ name: "Bitcoin (BTC)", exact: true }` (the frozen text's truncated `"Bitcoin (BTC"` relied on substring semantics); (2) tooltip-dismissal `mouse.move` now targets the viewport center via `page.viewportSize()` instead of hard-coded `(700, 400)`; (3) test-title and entry-count-description typos; (4) test mock gained `viewportSize`. DEFERRED (deferred-work.md): observable-effect validation (BTC checked / pager advanced), locator scoping for chevron/Yield, click-attribution in mocks. **Frozen-block amended (human-approved [A] 2026-09-09):** the sidebar entry navigating to `/app/earn` is accessible-named "Yield" (tooltip "Earn") — the only button named "Earn" is the home-body CTA that opens the allocate dialog; `.check()` cannot press the visually-hidden checkbox input, so the verified press is the label's visible `[data-testid="checkbox-box"]`. Live evidence: isolated `clicking-earn-navigates-to-the-standalone-earn-page` PASS (×2, incl. viewport-center dismissal), combined three-scenario run 3/3, full plan 13/13 in 53.6s (up from 9/13).

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

## Suggested Review Order

**The three drifted locators (adjudicated live)**

- Earn: sidebar "Yield" button + tooltip-dismissal mouse move (viewport center).
  [`action-map.ts:64`](../../orchestrator/action-map.ts#L64)

- Assets combobox opens the listbox; exact-name BTC checkbox pressed via its visible box.
  [`action-map.ts:87`](../../orchestrator/action-map.ts#L87)

- Unnamed chevron pager button is the unique next control.
  [`action-map.ts:101`](../../orchestrator/action-map.ts#L101)

**Pinned contracts**

- Drifted entries get dedicated assertions (no menuitem, exact names, dismissal call).
  [`action-map.test.ts:76`](../../orchestrator/action-map.test.ts#L76)

**Pipeline boundary**

- Contract ids, FSM, and postconditions unchanged — action-map is not modelVersion-hashed.
  [`action-map.ts:11`](../../orchestrator/action-map.ts#L11)