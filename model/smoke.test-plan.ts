// Smoke test plan — auto-generated from @plan:smoke tags in features/*.feature.
// Model version: SHA-256 of fsm.ts + contracts.ts + schemas.ts.
// Do not edit by hand; regenerate when model files or feature tags change.

import type { TestPlan } from "./schemas.js";

export const smokeTestPlan: TestPlan = {
  planId: "smoke",
  modelVersion: "150e526676b0b6769e5daff4b68d3e2a2316f05c2132d3f73948719c07f40328",
  scenarioIds: [
    // home-page-history-menu.feature
    "history-menu-contains-the-expected-items",
    "clicking-main-opens-the-history-page-for-the-main-account",
    "clicking-futures-opens-the-history-page-for-the-futures-account",
    // home-page-invariants.feature
    "main-navigation-is-visible",
    "portfolio-value-is-displayed-in-the-header",
    "no-error-overlay-is-present",
    // home-page-layout-menu.feature
    "clicking-the-layout-button-reveals-the-layout-configuration-menu",
    "clicking-the-layout-button-again-hides-the-layout-configuration-menu",
    // home-page-portfolio-menu.feature
    "portfolio-menu-contains-the-expected-items",
    "clicking-overview-opens-the-portfolio-page-with-the-overview-view",
    "clicking-main-opens-the-portfolio-page-with-the-main-view",
    "clicking-futures-opens-the-portfolio-page-with-the-futures-view",
    "clicking-loans-opens-the-portfolio-page-with-the-loans-view",
    "clicking-earn-navigates-to-the-standalone-earn-page",
    // home-page-portfolio-summary-dialog.feature
    "clicking-the-portfolio-value-opens-the-portfolio-summary-dialog",
    "pressing-escape-closes-the-portfolio-summary-dialog",
    "the-eye-icon-toggles-value-visibility-immediately",
    // home-page-portfolio-value.feature
    "current-portfolio-value-agrees-across-home-surfaces",
  ],
};
