// Smoke test plan — auto-generated from @plan:smoke tags in features/*.feature.
// Model version: SHA-256 of fsm.ts + contracts.ts + schemas.ts.
// Do not edit by hand; regenerate when model files or feature tags change.
// Regenerated for the test-run report (Story 1) after schemas.ts gained RunMetadata.
// Regenerated (Story 3) after schemas.ts gained StepEvidence.
// Regenerated (corpus handoff links) after schemas.ts gained RunResult.runId.
// Regenerated (Story 5-2) after contracts.ts bound selectOrderBookTab's
// view-selected to the selected-board-tab probe and schemas.ts gained the
// view-selected probe binding field.
// Regenerated (Story 5-2 review) after contracts.ts pinned selectOrderBookTab's
// url-is postcondition and corrected the Trade-contract invariants.
// Regenerated (spec report-gherkin-corpus-links, story 1) after schemas.ts
// gave StepEvidence the four corpus ref fields.

import type { TestPlan } from "./schemas.js";

export const smokeTestPlan: TestPlan = {
  planId: "smoke",
  modelVersion: "e1acb826cdfbede1b0d8d9b31c8efd49bea5d3b8a04b742707adb9427d92c1c2",
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
      steps: [
        { stateId: "homePage", contractId: "openPortfolioSummary" },
        { stateId: "portfolioSummaryDialog", contractId: "closePortfolioSummary" },
      ],
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
        { stateId: "portfolioSummaryDialog", contractId: "closePortfolioSummary" },
      ],
    },
    // history-filter-pagination.feature
    {
      id: "open-the-assets-filter",
      steps: [{ stateId: "historyMain", contractId: "filterHistoryByAsset" }],
    },
    {
      id: "checking-a-filter-asset-narrows-the-ledger",
      steps: [{ stateId: "historyMain", contractId: "filterHistoryByAsset" }],
    },
    {
      id: "paginating-to-the-next-ledger-page",
      steps: [{ stateId: "historyMain", contractId: "paginateHistoryNext" }],
    },
    // trade-order-book.feature
    {
      id: "selecting-the-order-book-tab-shows-the-btc-usd-board",
      givenStateId: "orderBook",
      steps: [{ stateId: "orderBook", contractId: "selectOrderBookTab" }],
    },
  ],
};
