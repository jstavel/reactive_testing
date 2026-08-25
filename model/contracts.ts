// Dialog-contract type declaration + Home Page seed data (Story 1.2).
// No Playwright dependency — the action is an abstract signature the Orchestrator supplies in Epic 2.

/** Abstract action signature. The Orchestrator supplies the concrete implementation (via Playwright) in Epic 2. */
export type ContractAction = (context: unknown) => Promise<void>;

/** A dialog/screen's behavioral declaration: preconditions, action, postconditions, invariants. */
export interface DialogContract {
  /** Stable camelCase verb-phrase id (e.g. "filterByType"). */
  contractId: string;
  /** Conditions that must hold before the action may run. */
  preconditions: string[];
  /** The action the contract describes; the concrete implementation is supplied by the Orchestrator. */
  action: ContractAction;
  /** Conditions that must hold after the action succeeds. */
  postconditions: string[];
  /** Conditions that must hold at all times within the contract's scope. */
  invariants: string[];
}

// ---------------------------------------------------------------------------
// Seed data — Home Page contracts (Story 1.2, scoped)
// ---------------------------------------------------------------------------

/** Placeholder action — the Orchestrator replaces this with Playwright calls in Epic 2. */
const placeholder: ContractAction = async () => {
  /* implemented by Orchestrator in Epic 2 */
};

const homePageContracts: DialogContract[] = [
  // --- History menu navigation ---
  {
    contractId: "clickHistoryMenuMain",
    preconditions: ["user is on the Home Page"],
    action: placeholder,
    postconditions: [
      "History page is displayed at /app/history/main/ledger",
      "Ledger sub-view is selected",
    ],
    invariants: ["main navigation is visible", "portfolio value is displayed in the header"],
  },
  {
    contractId: "clickHistoryMenuFutures",
    preconditions: ["user is on the Home Page"],
    action: placeholder,
    postconditions: [
      "History page is displayed at /app/history/derivatives/ledger",
      "Ledger sub-view is selected",
    ],
    invariants: ["main navigation is visible", "portfolio value is displayed in the header"],
  },

  // --- Portfolio menu navigation ---
  {
    contractId: "clickPortfolioMenuOverview",
    preconditions: ["user is on the Home Page"],
    action: placeholder,
    postconditions: [
      "Portfolio page is displayed at /app/portfolio/overview",
      "Overview view is selected",
    ],
    invariants: ["main navigation is visible", "portfolio value is displayed in the header"],
  },
  {
    contractId: "clickPortfolioMenuMain",
    preconditions: ["user is on the Home Page"],
    action: placeholder,
    postconditions: [
      "Portfolio page is displayed at /app/portfolio/main",
      "Main view is selected",
    ],
    invariants: ["main navigation is visible", "portfolio value is displayed in the header"],
  },
  {
    contractId: "clickPortfolioMenuFutures",
    preconditions: ["user is on the Home Page"],
    action: placeholder,
    postconditions: [
      "Portfolio page is displayed at /app/portfolio/derivatives",
      "Futures view is selected",
    ],
    invariants: ["main navigation is visible", "portfolio value is displayed in the header"],
  },
  {
    contractId: "clickPortfolioMenuLoans",
    preconditions: ["user is on the Home Page"],
    action: placeholder,
    postconditions: [
      "Portfolio page is displayed at /app/portfolio/loans",
      "Loans view is selected",
    ],
    invariants: ["main navigation is visible", "portfolio value is displayed in the header"],
  },
  {
    contractId: "clickPortfolioMenuEarn",
    preconditions: ["user is on the Home Page"],
    action: placeholder,
    postconditions: ["application navigates to /app/earn"],
    invariants: ["main navigation is visible", "portfolio value is displayed in the header"],
  },

  // --- Portfolio Summary dialog ---
  {
    contractId: "openPortfolioSummary",
    preconditions: ["user is on the Home Page", "portfolio value is displayed in the header"],
    action: placeholder,
    postconditions: [
      "Portfolio Summary dialog is open",
      "dialog shows total portfolio value in USD",
      "dialog shows sections for: Main, Spot, Margin, Futures, Loans, Earn",
    ],
    invariants: ["main navigation is visible"],
  },
  {
    contractId: "closePortfolioSummary",
    preconditions: ["Portfolio Summary dialog is open"],
    action: placeholder,
    postconditions: ["Portfolio Summary dialog is closed"],
    invariants: [],
  },

  // --- Eye toggle (dialog) ---
  {
    contractId: "toggleEyeIcon",
    preconditions: ["Portfolio Summary dialog is open"],
    action: placeholder,
    postconditions: [
      "values become hidden if icon was showing EyeOff",
      "values become visible if icon was showing Eye",
    ],
    invariants: ["dialog remains open"],
  },
];

/** All seeded contracts. The Orchestrator indexes these by contractId at runtime. */
export const allContracts: DialogContract[] = homePageContracts;
