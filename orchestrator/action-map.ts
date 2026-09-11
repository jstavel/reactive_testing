import type { ContractAction } from "../model/contracts.js";

/**
 * Static contractId → Playwright action lookup.
 * New contracts require a manual entry — this is intentional for determinism.
 *
 * The 7 navigation entries were discovered live against the authenticated Kraken
 * Pro home page (Story 2.6): each opens the left-sidebar History/Portfolio menu
 * (a single exact-named sidebar button) then clicks the exact-named menu item
 * that navigates to the contract's postcondition URL, then waits for that URL
 * (the action owns its nav wait). All locators are strict-mode single-target
 * (verified single match); no runtime AI (AD-4/NFR-1).
 *
 * gh-22 (2026-09-09) live re-verification amended three entries: Earn left the
 * Portfolio menu for a dedicated sidebar button, the History Assets filter is a
 * combobox (not a button), and the ledger pager next-control is an unnamed
 * chevron icon button. Contract ids, FSM transitions, and postcondition URLs
 * are unchanged.
 *
 * The 3 Portfolio Summary dialog entries (openPortfolioSummary, closePortfolioSummary,
 * toggleEyeIcon) were discovered live against the authenticated home page
 * (decision 2a): the open uses the nav-scoped value button (value-agnostic —
 * matches any magnitude and the masked form), the eye is the dialog's
 * button:has(svg[name="Eye"|"EyeOff"]), and close focuses inside the dialog
 * before Escape (a bare Escape only closes when an inner element has focus).
 */
export const actionMap: Record<string, ContractAction> = {
  clickHistoryMenuMain: async ({ page }) => {
    await page.getByRole("button", { name: "History", exact: true }).click();
    await page.getByRole("menuitem", { name: "Main", exact: true }).click();
    await page.waitForURL("**/app/history/main/ledger");
  },

  clickHistoryMenuFutures: async ({ page }) => {
    await page.getByRole("button", { name: "History", exact: true }).click();
    await page.getByRole("menuitem", { name: "Futures", exact: true }).click();
    await page.waitForURL("**/app/history/derivatives/ledger");
  },

  clickPortfolioMenuOverview: async ({ page }) => {
    await page.getByRole("button", { name: "Portfolio", exact: true }).click();
    await page.getByRole("menuitem", { name: "Overview", exact: true }).click();
    await page.waitForURL("**/app/portfolio/overview");
  },

  clickPortfolioMenuMain: async ({ page }) => {
    await page.getByRole("button", { name: "Portfolio", exact: true }).click();
    await page.getByRole("menuitem", { name: "Main", exact: true }).click();
    await page.waitForURL("**/app/portfolio/main");
  },

  clickPortfolioMenuFutures: async ({ page }) => {
    await page.getByRole("button", { name: "Portfolio", exact: true }).click();
    await page.getByRole("menuitem", { name: "Futures", exact: true }).click();
    await page.waitForURL("**/app/portfolio/derivatives");
  },

  clickPortfolioMenuLoans: async ({ page }) => {
    await page.getByRole("button", { name: "Portfolio", exact: true }).click();
    await page.getByRole("menuitem", { name: "Loans", exact: true }).click();
    await page.waitForURL("**/app/portfolio/loans");
  },

  clickPortfolioMenuEarn: async ({ page }) => {
    // Earn left the Portfolio menu (Overview/Main/TradFi futures/Futures/Loans/
    // DEX remain) for a dedicated sidebar entry — which the app names "Yield";
    // it navigates to the standalone earn page at /app/earn (gh-22). The only
    // button named "Earn" is the home-body CTA, which opens the allocate
    // dialog (#dialog/earn-select/…) instead of navigating.
    await page.getByRole("button", { name: "Yield", exact: true }).click();
    await page.waitForURL("**/app/earn");
    // The click parks the pointer on the sidebar entry, so the app keeps a
    // hover tooltip open that sets aria-hidden="true" on the app root — every
    // subsequent role locator (e.g. navigateHome's Home button) then resolves
    // to nothing. Move the pointer to the viewport center (portable across
    // viewports) to close it.
    const viewport = page.viewportSize();
    await page.mouse.move(
      Math.floor((viewport?.width ?? 1280) / 2),
      Math.floor((viewport?.height ?? 720) / 2),
    );
  },

  filterHistoryByAsset: async ({ page }) => {
    // The Assets filter is a combobox that opens the asset listbox (gh-22). The
    // BTC checkbox input is visually hidden (1×1, clipped) inside its label, so
    // the press goes to the visible box inside that label; the name is exact
    // because /bitcoin/i also matches "Bitcoin Cash (BCH)".
    await page.getByRole("combobox", { name: "Assets" }).click();
    await page
      .getByRole("checkbox", { name: "Bitcoin (BTC)", exact: true })
      .locator("xpath=..")
      .locator('[data-testid="checkbox-box"]')
      .click();
  },

  paginateHistoryNext: async ({ page }) => {
    // The pager buttons are unnamed icon buttons (gh-22); the next-page control
    // is the only svg[name="ChevronRightSmall"] on the page.
    await page.locator('button:has(svg[name="ChevronRightSmall"])').click();
  },

  openPortfolioSummary: async ({ page }) => {
    // The header portfolio value button, scoped to the nav. Matches any magnitude
    // and the masked form (text always ends in "USD"); value-agnostic by design.
    await page.getByRole("navigation").getByRole("button", { name: /USD$/ }).click();
  },

  closePortfolioSummary: async ({ page }) => {
    // Focus inside the dialog before Escape: the app only closes on Escape when an
    // element inside the dialog has focus (openPortfolioSummary leaves focus on the
    // header button, so a bare Escape would not close).
    await page.getByRole("dialog").press("Escape");
  },

  toggleEyeIcon: async ({ page }) => {
    await page
      .getByRole("dialog")
      .locator('button:has(svg[name="Eye"]), button:has(svg[name="EyeOff"])')
      .click();
  },

  clickTradeMenu: async ({ page }) => {
    // Trade menu navigation (Story 5-2, live-discovered 2026-09-10): the sidebar
    // "Trade" button (exact accessible name "Trade"; the only such button on the
    // home page) navigates to the Trade page at /app/trade/btc-usd.
    await page.getByRole("button", { name: "Trade", exact: true }).click();
    await page.waitForURL("**/app/trade/btc-usd");
  },

  selectOrderBookTab: async ({ page }) => {
    // Order Book tab selection (Story 5-2, pilot): the idempotent half of the
    // order-book interaction — clicking the existing tab in the Favorites bar.
    // The "+"-add action is non-idempotent and excluded from plan steps per the
    // spec; the operator establishes the precondition (tab present) via the run
    // protocol before the scenario runs.
    //
    // Live-discovered 2026-09-10: the board tabs are flexlayout DIVs, not
    // role=tab anchors — the label ("Order book") sits in the
    // .flexlayout__tab_button_content node, and the active board is marked with
    // .flexlayout__tab_button--selected. Scoped by class + label text.
    //
    // TAB_ABSENT precondition: fail fast with an actionable message when the tab
    // is not in the Favorites bar — deterministic failure, never a silent pass.
    const tab = page.locator(".flexlayout__tab_button", { hasText: "Order book" });
    const count = await tab.count();
    if (count === 0) {
      throw new Error(
        "Order Book tab not found in the Favorites bar. " +
          'Run-protocol precondition: add the Order Book tab via the "+" button, ' +
          "then re-run this scenario.",
      );
    }
    if (count > 1) {
      throw new Error(
        `Found ${count} tabs matching "Order book"; expected exactly one. ` +
          "Deterministic fail — duplicate tabs violate the single-board precondition.",
      );
    }
    await tab.first().click();
  },

  navigateHome: async ({ page }) => {
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await page.waitForURL("**/app/home");
  },
};
