// FSM model — seeded with Home Page critical-path data (Story 1.2).
// States, transitions, and the initial state. No Playwright dependency.

/** Abstract guard predicate. The Orchestrator supplies the runtime context in Epic 2. */
export type FsmGuard = (context: unknown) => boolean;

/** A screen/dialog in a concrete condition, classified per state-granularity.md. */
export interface FsmState {
  /** Stable camelCase id matching the screen/dialog name (e.g. "orderBook"). */
  stateId: string;
  /** Human-readable label. */
  label: string;
  /** Id of the parent state for a nested dialog, if any. */
  parentStateId?: string;
}

/** A directed edge between two states, driven by a contract. */
export interface FsmTransition {
  /** Source state id. */
  from: string;
  /** Target state id. */
  to: string;
  /** Id of the contract that drives this transition. */
  contractId: string;
  /** Optional guard that must hold for the transition to be available. */
  guard?: FsmGuard;
}

/** The finite-state model: states, transitions, and the initial state. */
export interface FsmModel {
  states: FsmState[];
  transitions: FsmTransition[];
  /** Id of the initial state. */
  initialStateId: string;
}

// ---------------------------------------------------------------------------
// Seed data — Home Page (Story 1.2, scoped)
// ---------------------------------------------------------------------------

const states: FsmState[] = [
  { stateId: "homePage", label: "Home Page" },
  { stateId: "portfolioSummaryDialog", label: "Portfolio Summary dialog", parentStateId: "homePage" },

  // History page states (reached from Home Page via navigation menu)
  { stateId: "historyMain", label: "History — Main" },
  { stateId: "historyFutures", label: "History — Futures" },

  // Portfolio page states (reached from Home Page via navigation menu)
  { stateId: "portfolioOverview", label: "Portfolio — Overview" },
  { stateId: "portfolioMain", label: "Portfolio — Main" },
  { stateId: "portfolioFutures", label: "Portfolio — Futures" },
  { stateId: "portfolioLoans", label: "Portfolio — Loans" },

  // Standalone pages (reached from Home Page via navigation menu)
  { stateId: "earn", label: "Earn" },
];

const transitions: FsmTransition[] = [
  // History menu → History page states
  { from: "homePage", to: "historyMain", contractId: "clickHistoryMenuMain" },
  { from: "homePage", to: "historyFutures", contractId: "clickHistoryMenuFutures" },

  // Portfolio menu → Portfolio page states
  { from: "homePage", to: "portfolioOverview", contractId: "clickPortfolioMenuOverview" },
  { from: "homePage", to: "portfolioMain", contractId: "clickPortfolioMenuMain" },
  { from: "homePage", to: "portfolioFutures", contractId: "clickPortfolioMenuFutures" },
  { from: "homePage", to: "portfolioLoans", contractId: "clickPortfolioMenuLoans" },
  { from: "homePage", to: "earn", contractId: "clickPortfolioMenuEarn" },

  // Portfolio Summary dialog (nested state — self-loops on homePage)
  { from: "homePage", to: "portfolioSummaryDialog", contractId: "openPortfolioSummary" },
  { from: "portfolioSummaryDialog", to: "homePage", contractId: "closePortfolioSummary" },

  // Eye toggle (dialog self-loop — UI change only, no URL transition)
  { from: "portfolioSummaryDialog", to: "portfolioSummaryDialog", contractId: "toggleEyeIcon" },
];

/** The Home Page critical-path model. */
export const homePageModel: FsmModel = {
  states,
  transitions,
  initialStateId: "homePage",
};
