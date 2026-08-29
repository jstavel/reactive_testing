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
    await page.getByText(/portfolio value/i).first().click();
  },

  closePortfolioSummary: async ({ page }) => {
    await page.keyboard.press("Escape");
  },

  toggleEyeIcon: async ({ page }) => {
    await page.getByRole("button", { name: /eye/i }).first().click();
  },
};
