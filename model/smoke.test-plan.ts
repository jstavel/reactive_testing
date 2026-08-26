// Smoke test plan — auto-generated from @plan:smoke tags in features/*.feature.
// Model version: SHA-256 of fsm.ts + contracts.ts + schemas.ts.
// Do not edit by hand; regenerate when model files or feature tags change.

import type { TestPlan } from "./schemas.js";

export const smokeTestPlan: TestPlan = {
  planId: "smoke",
  modelVersion: "3531f20ba0265537a32763bb5b51b5deca95771b41d33e1d72443a6c1446e51e",
  scenarios: [
    // home-page-history-menu.feature
    {
      id: "clicking-main-opens-the-history-page-for-the-main-account",
      steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
    },
    {
      id: "clicking-futures-opens-the-history-page-for-the-futures-account",
      steps: [{ stateId: "homePage", contractId: "clickHistoryMenuFutures" }],
    },
    // home-page-portfolio-menu.feature
    {
      id: "clicking-overview-opens-the-portfolio-page-with-the-overview-view",
      steps: [{ stateId: "homePage", contractId: "clickPortfolioMenuOverview" }],
    },
    {
      id: "clicking-main-opens-the-portfolio-page-with-the-main-view",
      steps: [{ stateId: "homePage", contractId: "clickPortfolioMenuMain" }],
    },
    {
      id: "clicking-futures-opens-the-portfolio-page-with-the-futures-view",
      steps: [{ stateId: "homePage", contractId: "clickPortfolioMenuFutures" }],
    },
    {
      id: "clicking-loans-opens-the-portfolio-page-with-the-loans-view",
      steps: [{ stateId: "homePage", contractId: "clickPortfolioMenuLoans" }],
    },
    {
      id: "clicking-earn-navigates-to-the-standalone-earn-page",
      steps: [{ stateId: "homePage", contractId: "clickPortfolioMenuEarn" }],
    },
    // home-page-portfolio-summary-dialog.feature
    {
      id: "clicking-the-portfolio-value-opens-the-portfolio-summary-dialog",
      steps: [{ stateId: "homePage", contractId: "openPortfolioSummary" }],
    },
    {
      id: "pressing-escape-closes-the-portfolio-summary-dialog",
      steps: [
        { stateId: "homePage", contractId: "openPortfolioSummary" },
        { stateId: "portfolioSummaryDialog", contractId: "closePortfolioSummary" },
      ],
    },
    {
      id: "the-eye-icon-toggles-value-visibility-immediately",
      steps: [
        { stateId: "homePage", contractId: "openPortfolioSummary" },
        { stateId: "portfolioSummaryDialog", contractId: "toggleEyeIcon" },
      ],
    },
  ],
};
