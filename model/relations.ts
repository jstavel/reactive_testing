// Scenario↔model relation map (Story 2) — the "second brain" linking Gherkin
// scenarios to the model (FSM states + contracts).
//
// Authored alongside scenario/model work, NOT the SSOT. The FSM (fsm.ts) and
// contracts (contracts.ts) remain the single source of truth; this map is a
// derived query surface declaring which scenarios exercise which states and
// contracts. Relations are N:N (one scenario may touch many contracts; one
// contract may appear in many scenarios) and updatable on the fly without a
// re-run or a model edit. The Gherkin source of each scenario is embedded here
// so the report reflects exactly what was run (CAP-4).
//
// The map is plain data so the reporter can group a run's scenarios under
// their feature and show the Gherkin↔model linkage.

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
  /** The Gherkin source text of this scenario (verbatim from the feature file).
   * Embedded in the report so it reflects exactly what was run (CAP-4). */
  gherkin: string;
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
    gherkin: [
      "Scenario: Clicking Main opens the History page for the Main account",
      '  Given I am on the Kraken Pro home page',
      '  When I click "Main" in the History menu',
      '  Then the History page is displayed at "/app/history/main/ledger"',
      '  And the "Ledger" sub-view is selected within the "Main" history',
    ].join("\n"),
    states: ["homePage", "historyMain"],
    contracts: ["clickHistoryMenuMain"],
  },
  {
    scenarioId: "clicking-futures-opens-the-history-page-for-the-futures-account",
    feature: "home-page-history-menu",
    featureTitle: "Home page History menu",
    scenarioTitle: "Clicking Futures opens the History page for the Futures account",
    gherkin: [
      "Scenario: Clicking Futures opens the History page for the Futures account",
      '  Given I am on the Kraken Pro home page',
      '  When I click "Futures" in the History menu',
      '  Then the History page is displayed at "/app/history/derivatives/ledger"',
      '  And the "Ledger" sub-view is selected within the "Futures" history',
    ].join("\n"),
    states: ["homePage", "historyFutures"],
    contracts: ["clickHistoryMenuFutures"],
  },
  {
    scenarioId: "clicking-overview-opens-the-portfolio-page-with-the-overview-view",
    feature: "home-page-portfolio-menu",
    featureTitle: "Home page Portfolio menu",
    scenarioTitle: "Clicking Overview opens the Portfolio page with the Overview view",
    gherkin: [
      "Scenario: Clicking Overview opens the Portfolio page with the Overview view",
      '  Given I am on the Kraken Pro home page',
      '  When I click "Overview" in the Portfolio menu',
      '  Then the Portfolio page is displayed at "/app/portfolio/overview"',
      '  And the "Overview" view is selected',
    ].join("\n"),
    states: ["homePage", "portfolioOverview"],
    contracts: ["clickPortfolioMenuOverview"],
  },
  {
    scenarioId: "clicking-main-opens-the-portfolio-page-with-the-main-view",
    feature: "home-page-portfolio-menu",
    featureTitle: "Home page Portfolio menu",
    scenarioTitle: "Clicking Main opens the Portfolio page with the Main view",
    gherkin: [
      "Scenario: Clicking Main opens the Portfolio page with the Main view",
      '  Given I am on the Kraken Pro home page',
      '  When I click "Main" in the Portfolio menu',
      '  Then the Portfolio page is displayed at "/app/portfolio/main"',
      '  And the "Main" view is selected',
    ].join("\n"),
    states: ["homePage", "portfolioMain"],
    contracts: ["clickPortfolioMenuMain"],
  },
  {
    scenarioId: "clicking-futures-opens-the-portfolio-page-with-the-futures-view",
    feature: "home-page-portfolio-menu",
    featureTitle: "Home page Portfolio menu",
    scenarioTitle: "Clicking Futures opens the Portfolio page with the Futures view",
    gherkin: [
      "Scenario: Clicking Futures opens the Portfolio page with the Futures view",
      '  Given I am on the Kraken Pro home page',
      '  When I click "Futures" in the Portfolio menu',
      '  Then the Portfolio page is displayed at "/app/portfolio/derivatives"',
      '  And the "Futures" view is selected',
    ].join("\n"),
    states: ["homePage", "portfolioFutures"],
    contracts: ["clickPortfolioMenuFutures"],
  },
  {
    scenarioId: "clicking-loans-opens-the-portfolio-page-with-the-loans-view",
    feature: "home-page-portfolio-menu",
    featureTitle: "Home page Portfolio menu",
    scenarioTitle: "Clicking Loans opens the Portfolio page with the Loans view",
    gherkin: [
      "Scenario: Clicking Loans opens the Portfolio page with the Loans view",
      '  Given I am on the Kraken Pro home page',
      '  When I click "Loans" in the Portfolio menu',
      '  Then the Portfolio page is displayed at "/app/portfolio/loans"',
      '  And the "Loans" view is selected',
    ].join("\n"),
    states: ["homePage", "portfolioLoans"],
    contracts: ["clickPortfolioMenuLoans"],
  },
  {
    scenarioId: "clicking-earn-navigates-to-the-standalone-earn-page",
    feature: "home-page-portfolio-menu",
    featureTitle: "Home page Portfolio menu",
    scenarioTitle: "Clicking Earn navigates to the standalone Earn page",
    gherkin: [
      "Scenario: Clicking Earn navigates to the standalone Earn page",
      '  Given I am on the Kraken Pro home page',
      '  When I click "Earn" in the Portfolio menu',
      '  Then the application navigates to "/app/earn"',
    ].join("\n"),
    states: ["homePage", "earn"],
    contracts: ["clickPortfolioMenuEarn"],
  },
  {
    scenarioId: "clicking-the-portfolio-value-opens-the-portfolio-summary-dialog",
    feature: "home-page-portfolio-summary-dialog",
    featureTitle: "Home page Portfolio Summary dialog",
    scenarioTitle: "Clicking the portfolio value opens the Portfolio Summary dialog",
    gherkin: [
      "Scenario: Clicking the portfolio value opens the Portfolio Summary dialog",
      '  Given I am on the Kraken Pro home page',
      '  When I click the portfolio value shown in the header',
      '  Then the Portfolio Summary dialog opens showing the total portfolio value in USD',
    ].join("\n"),
    states: ["homePage", "portfolioSummaryDialog"],
    contracts: ["openPortfolioSummary", "closePortfolioSummary"],
  },
  {
    scenarioId: "pressing-escape-closes-the-portfolio-summary-dialog",
    feature: "home-page-portfolio-summary-dialog",
    featureTitle: "Home page Portfolio Summary dialog",
    scenarioTitle: "Pressing Escape closes the Portfolio Summary dialog",
    gherkin: [
      "Scenario: Pressing Escape closes the Portfolio Summary dialog",
      '  Given I am on the Kraken Pro home page',
      '  And the Portfolio Summary dialog is open',
      '  When I press "Escape"',
      '  Then the Portfolio Summary dialog is closed',
    ].join("\n"),
    states: ["homePage", "portfolioSummaryDialog"],
    contracts: ["openPortfolioSummary", "closePortfolioSummary"],
  },
  {
    scenarioId: "the-eye-icon-toggles-value-visibility-immediately",
    feature: "home-page-portfolio-summary-dialog",
    featureTitle: "Home page Portfolio Summary dialog",
    scenarioTitle: "The eye icon toggles value visibility immediately",
    gherkin: [
      "Scenario: The eye icon toggles value visibility immediately",
      '  Given I am on the Kraken Pro home page',
      '  And the Portfolio Summary dialog is open',
      '  When I click the eye icon in the dialog header',
      '  Then the values become hidden if the icon was showing "EyeOff"',
      '  And the values become visible again if the icon was showing "Eye"',
    ].join("\n"),
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
