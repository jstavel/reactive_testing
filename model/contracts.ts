// Dialog-contract type declaration + Home Page seed data (Story 1.2).
//
// Story 3.1: pre/postconditions are machine-compatible predicate declarations
// (typed `ContractPredicate` objects); the human-readable prose lives in the
// Gherkin layer as the trace (FR-9), never in the model. The action's concrete
// implementation lives in orchestrator/action-map.ts (retro F1) — the contract
// carries no behavior.

import type { Page } from "playwright";

import type { ContractPredicate } from "./schemas.js";

/** Action signature. The Orchestrator supplies the concrete implementation (via Playwright). */
export type ContractAction = (context: { page: Page }) => Promise<void>;

/** A dialog/screen's behavioral declaration: preconditions, postconditions, invariants. */
export interface DialogContract {
  /** Stable camelCase verb-phrase id (e.g. "filterByType"). */
  contractId: string;
  /** Conditions that must hold before the action may run (evaluated against the pre-step snapshot). */
  preconditions: ContractPredicate[];
  /** Conditions that must hold after the action succeeds (evaluated against the post-step snapshot). */
  postconditions: ContractPredicate[];
  /** Conditions that must hold at all times within the contract's scope (Epic 4 standing invariants). */
  invariants: string[];
}

// ---------------------------------------------------------------------------
// Seed data — Home Page contracts (Story 1.2, migrated to predicates in 3.1)
// ---------------------------------------------------------------------------

const homePageContracts: DialogContract[] = [
  // --- History menu navigation ---
  {
    contractId: "clickHistoryMenuMain",
    preconditions: [{ assert: "state-is", stateId: "homePage" }],
    postconditions: [
      { assert: "url-is", url: "/app/history/main/ledger" },
      { assert: "view-selected", view: "ledger" },
    ],
    invariants: ["main navigation is visible", "portfolio value is displayed in the header"],
  },
  {
    contractId: "clickHistoryMenuFutures",
    preconditions: [{ assert: "state-is", stateId: "homePage" }],
    postconditions: [
      { assert: "url-is", url: "/app/history/derivatives/ledger" },
      { assert: "view-selected", view: "ledger" },
    ],
    invariants: ["main navigation is visible", "portfolio value is displayed in the header"],
  },

  // --- Portfolio menu navigation ---
  {
    contractId: "clickPortfolioMenuOverview",
    preconditions: [{ assert: "state-is", stateId: "homePage" }],
    postconditions: [
      { assert: "url-is", url: "/app/portfolio/overview" },
      { assert: "view-selected", view: "overview" },
    ],
    invariants: ["main navigation is visible", "portfolio value is displayed in the header"],
  },
  {
    contractId: "clickPortfolioMenuMain",
    preconditions: [{ assert: "state-is", stateId: "homePage" }],
    postconditions: [
      { assert: "url-is", url: "/app/portfolio/main" },
      { assert: "view-selected", view: "main" },
    ],
    invariants: ["main navigation is visible", "portfolio value is displayed in the header"],
  },
  {
    contractId: "clickPortfolioMenuFutures",
    preconditions: [{ assert: "state-is", stateId: "homePage" }],
    postconditions: [
      { assert: "url-is", url: "/app/portfolio/derivatives" },
      { assert: "view-selected", view: "futures" },
    ],
    invariants: ["main navigation is visible", "portfolio value is displayed in the header"],
  },
  {
    contractId: "clickPortfolioMenuLoans",
    preconditions: [{ assert: "state-is", stateId: "homePage" }],
    postconditions: [
      { assert: "url-is", url: "/app/portfolio/loans" },
      { assert: "view-selected", view: "loans" },
    ],
    invariants: ["main navigation is visible", "portfolio value is displayed in the header"],
  },
  {
    contractId: "clickPortfolioMenuEarn",
    preconditions: [{ assert: "state-is", stateId: "homePage" }],
    postconditions: [{ assert: "url-is", url: "/app/earn" }],
    invariants: ["main navigation is visible", "portfolio value is displayed in the header"],
  },

  // --- Portfolio Summary dialog ---
  // The un-mappable prose postconditions ("shows total value in USD", "shows
  // sections for…", "values hidden/visible") have no predicate yet — they stay
  // in the Gherkin layer and are re-added by the dialog-surface story.
  {
    contractId: "openPortfolioSummary",
    preconditions: [{ assert: "state-is", stateId: "homePage" }],
    postconditions: [{ assert: "dialog-open" }],
    invariants: ["main navigation is visible"],
  },
  {
    contractId: "closePortfolioSummary",
    preconditions: [{ assert: "dialog-open" }],
    postconditions: [{ assert: "dialog-closed" }],
    invariants: [],
  },
  {
    contractId: "toggleEyeIcon",
    preconditions: [{ assert: "dialog-open" }],
    postconditions: [],
    invariants: ["dialog remains open"],
  },
];

/** All seeded contracts. The Orchestrator indexes these by contractId at runtime. */
export const allContracts: DialogContract[] = homePageContracts;
