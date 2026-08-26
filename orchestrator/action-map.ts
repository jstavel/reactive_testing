import type { ContractAction } from "../model/contracts.js";

/**
 * Static contractId → Playwright action lookup.
 * New contracts require a manual entry — this is intentional for determinism.
 */
export const actionMap: Record<string, ContractAction> = {
  clickHistoryMenuMain: async ({ page }) => {
    await page.getByRole("link", { name: /history/i }).first().click();
    await page.getByRole("link", { name: /main/i }).first().click();
  },

  clickHistoryMenuFutures: async ({ page }) => {
    await page.getByRole("link", { name: /history/i }).first().click();
    await page.getByRole("link", { name: /futures/i }).first().click();
  },

  clickPortfolioMenuOverview: async ({ page }) => {
    await page.getByRole("link", { name: /portfolio/i }).first().click();
    await page.getByRole("link", { name: /overview/i }).first().click();
  },

  clickPortfolioMenuMain: async ({ page }) => {
    await page.getByRole("link", { name: /portfolio/i }).first().click();
    await page.getByRole("link", { name: /main/i }).first().click();
  },

  clickPortfolioMenuFutures: async ({ page }) => {
    await page.getByRole("link", { name: /portfolio/i }).first().click();
    await page.getByRole("link", { name: /futures/i }).first().click();
  },

  clickPortfolioMenuLoans: async ({ page }) => {
    await page.getByRole("link", { name: /portfolio/i }).first().click();
    await page.getByRole("link", { name: /loans/i }).first().click();
  },

  clickPortfolioMenuEarn: async ({ page }) => {
    await page.getByRole("link", { name: /portfolio/i }).first().click();
    await page.getByRole("link", { name: /earn/i }).first().click();
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
