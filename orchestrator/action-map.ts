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
    await page.getByRole("button", { name: "Portfolio", exact: true }).click();
    await page.getByRole("menuitem", { name: "Earn", exact: true }).click();
    await page.waitForURL("**/app/earn");
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
    // The eye control (svg[name="Eye"|"EyeOff"], no accessible text name).
    await page
      .getByRole("dialog")
      .locator('button:has(svg[name="Eye"]), button:has(svg[name="EyeOff"])')
      .click();
  },
};
