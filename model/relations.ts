// Scenario↔model relation map (Story 2) — the "second brain" linking Gherkin
// scenarios to the model (FSM states + contracts).
//
// Authored alongside scenario/model work, NOT the SSOT. The FSM (fsm.ts) and
// contracts (contracts.ts) remain the single source of truth; this map is a
// derived query surface declaring which scenarios exercise which states and
// contracts. Relations are N:N (one scenario may touch many contracts; one
// contract may appear in many scenarios) and updatable on the fly without a
// re-run or a model edit.
//
// The Gherkin source of each scenario is deliberately NOT embedded here. The
// .feature files are not part of the model and can drift during evolution, so
// the report snapshots the Gherkin at run time (see reporter/gherkin-snapshot.ts)
// rather than carrying an authored copy that could go stale (CAP-4).

/** One Gherkin scenario and the model elements it links to. */
export interface ScenarioRelation {
  /** Stable scenario id — matches `ScenarioPath.id` / `ScenarioResult.id`. */
  scenarioId: string;
  /** Feature file this scenario belongs to (kebab-case slug, no extension). */
  feature: string;
  /** Human-readable feature title, e.g. "Home page History menu". */
  featureTitle: string;
  /** Human-readable scenario title, e.g. "Clicking Main opens the History page…". */
  scenarioTitle: string;
  /** Model states the scenario traverses (FSM `stateId`s). */
  states: string[];
  /** Model contracts the scenario executes (`contractId`s). */
  contracts: string[];
}

/** The seeded relation map — one entry per authored scenario. */
export const relations: ScenarioRelation[] = [
  {
    scenarioId: "clicking-main-opens-the-history-page-for-the-main-account",
    feature: "home-page-history-menu",
    featureTitle: "Home page History menu",
    scenarioTitle: "Clicking Main opens the History page for the Main account",
    states: ["homePage", "historyMain"],
    contracts: ["clickHistoryMenuMain"],
  },
  {
    scenarioId: "clicking-futures-opens-the-history-page-for-the-futures-account",
    feature: "home-page-history-menu",
    featureTitle: "Home page History menu",
    scenarioTitle: "Clicking Futures opens the History page for the Futures account",
    states: ["homePage", "historyFutures"],
    contracts: ["clickHistoryMenuFutures"],
  },
  {
    scenarioId: "clicking-overview-opens-the-portfolio-page-with-the-overview-view",
    feature: "home-page-portfolio-menu",
    featureTitle: "Home page Portfolio menu",
    scenarioTitle: "Clicking Overview opens the Portfolio page with the Overview view",
    states: ["homePage", "portfolioOverview"],
    contracts: ["clickPortfolioMenuOverview"],
  },
  {
    scenarioId: "clicking-main-opens-the-portfolio-page-with-the-main-view",
    feature: "home-page-portfolio-menu",
    featureTitle: "Home page Portfolio menu",
    scenarioTitle: "Clicking Main opens the Portfolio page with the Main view",
    states: ["homePage", "portfolioMain"],
    contracts: ["clickPortfolioMenuMain"],
  },
  {
    scenarioId: "clicking-futures-opens-the-portfolio-page-with-the-futures-view",
    feature: "home-page-portfolio-menu",
    featureTitle: "Home page Portfolio menu",
    scenarioTitle: "Clicking Futures opens the Portfolio page with the Futures view",
    states: ["homePage", "portfolioFutures"],
    contracts: ["clickPortfolioMenuFutures"],
  },
  {
    scenarioId: "clicking-loans-opens-the-portfolio-page-with-the-loans-view",
    feature: "home-page-portfolio-menu",
    featureTitle: "Home page Portfolio menu",
    scenarioTitle: "Clicking Loans opens the Portfolio page with the Loans view",
    states: ["homePage", "portfolioLoans"],
    contracts: ["clickPortfolioMenuLoans"],
  },
  {
    scenarioId: "clicking-earn-navigates-to-the-standalone-earn-page",
    feature: "home-page-portfolio-menu",
    featureTitle: "Home page Portfolio menu",
    scenarioTitle: "Clicking Earn navigates to the standalone Earn page",
    states: ["homePage", "earn"],
    contracts: ["clickPortfolioMenuEarn"],
  },
  {
    scenarioId: "clicking-the-portfolio-value-opens-the-portfolio-summary-dialog",
    feature: "home-page-portfolio-summary-dialog",
    featureTitle: "Home page Portfolio Summary dialog",
    scenarioTitle: "Clicking the portfolio value opens the Portfolio Summary dialog",
    states: ["homePage", "portfolioSummaryDialog"],
    contracts: ["openPortfolioSummary", "closePortfolioSummary"],
  },
  {
    scenarioId: "pressing-escape-closes-the-portfolio-summary-dialog",
    feature: "home-page-portfolio-summary-dialog",
    featureTitle: "Home page Portfolio Summary dialog",
    scenarioTitle: "Pressing Escape closes the Portfolio Summary dialog",
    states: ["homePage", "portfolioSummaryDialog"],
    contracts: ["openPortfolioSummary", "closePortfolioSummary"],
  },
  {
    scenarioId: "the-eye-icon-toggles-value-visibility-immediately",
    feature: "home-page-portfolio-summary-dialog",
    featureTitle: "Home page Portfolio Summary dialog",
    scenarioTitle: "The eye icon toggles value visibility immediately",
    states: ["homePage", "portfolioSummaryDialog"],
    contracts: ["openPortfolioSummary", "toggleEyeIcon", "closePortfolioSummary"],
  },
];

/** Index relations by scenario id for O(1) lookup in the reporter. Accepts an
 * optional explicit list (e.g. a caller-supplied relation map); defaults to
 * the seeded `relations`. */
export function relationsByScenarioId(
  source: ScenarioRelation[] = relations,
): Map<string, ScenarioRelation> {
  return new Map(source.map((r) => [r.scenarioId, r]));
}
