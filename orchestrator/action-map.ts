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
    await page
      .getByRole("navigation")
      .getByRole("button", { name: /USD$/ })
      .click();
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

  navigateHome: async ({ page }) => {
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await page.waitForURL("**/app/home");
  },
};
