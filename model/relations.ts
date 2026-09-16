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
  // history-filter-pagination.feature (Story 5-1, pilot)
  {
    scenarioId: "open-the-assets-filter",
    feature: "history-filter-pagination",
    featureTitle: "History ledger filter",
    scenarioTitle: "Open the assets filter",
    states: ["historyMain"],
    contracts: ["filterHistoryByAsset"],
  },
  {
    scenarioId: "checking-a-filter-asset-narrows-the-ledger",
    feature: "history-filter-pagination",
    featureTitle: "History ledger filter",
    scenarioTitle: "Checking a filter asset narrows the ledger",
    states: ["historyMain"],
    contracts: ["filterHistoryByAsset"],
  },
  {
    scenarioId: "paginating-to-the-next-ledger-page",
    feature: "history-filter-pagination",
    featureTitle: "History ledger filter",
    scenarioTitle: "Paginating to the next ledger page",
    states: ["historyMain"],
    contracts: ["paginateHistoryNext"],
  },
  // trade-order-book.feature (Story 5-2, pilot)
  {
    scenarioId: "selecting-the-order-book-tab-shows-the-btc-usd-board",
    feature: "trade-order-book",
    featureTitle: "Trade order book — selected view",
    scenarioTitle: "Selecting the Order Book tab shows the BTC/USD board",
    states: ["orderBook"],
    contracts: ["clickTradeMenu", "selectOrderBookTab"],
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

/**
 * Derive the scenario id for a scenario title: lowercase, collapse every run
 * of non-alphanumeric characters to a single `-`, trim leading/trailing `-`.
 * ASCII-lenient by design — punctuation like "/" in "BTC/USD" derives
 * `btc-usd`. Every seeded `scenarioId` is exactly this derivation of its
 * `scenarioTitle` (pinned by model/relations.test.ts).
 */
export function deriveScenarioId(scenarioTitle: string): string {
  return scenarioTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Throw when `relations` is not well-formed, collecting EVERY violation into
 * one deterministic error (never warns; mirrors ssot-guard's aggregated
 * failure report):
 * - duplicate `scenarioId` across the array,
 * - an empty `scenarioId`,
 * - a `scenarioId` that is not `deriveScenarioId(scenarioTitle)`,
 * - a duplicate `(feature, scenarioTitle)` pair (the same scenario listed
 *   twice under one feature).
 * Id-keyed consumers (id-keyed maps, run-time snapshot grouping) must never
 * silently overwrite or mis-derive, so malformed relations throw at the
 * source of truth.
 */
export function assertUniqueScenarioIds(rels: readonly ScenarioRelation[]): void {
  const issues: string[] = [];
  const seenIds = new Set<string>();
  const seenPairs = new Set<string>();

  for (const rel of rels) {
    if (rel.scenarioId === "") {
      issues.push(
        `empty scenarioId (scenarioTitle "${rel.scenarioTitle}" in feature "${rel.feature}")`,
      );
    }
    if (seenIds.has(rel.scenarioId)) {
      issues.push(`duplicate scenario id "${rel.scenarioId}"`);
    }
    seenIds.add(rel.scenarioId);

    const derived = deriveScenarioId(rel.scenarioTitle);
    if (rel.scenarioId !== derived) {
      issues.push(
        `scenarioId "${rel.scenarioId}" does not derive from scenarioTitle "${rel.scenarioTitle}" (expected "${derived}")`,
      );
    }

    const pair = `${rel.feature}\u0000${rel.scenarioTitle}`;
    if (seenPairs.has(pair)) {
      issues.push(`duplicate feature/scenarioTitle pair "${rel.feature}" / "${rel.scenarioTitle}"`);
    }
    seenPairs.add(pair);
  }

  if (issues.length > 0) {
    throw new Error(
      `relation guard failed with ${issues.length} issue(s):\n` +
        issues.map((issue) => `  ${issue}`).join("\n"),
    );
  }
}

/** Index relations by scenario id for O(1) lookup in the reporter. Accepts an
 * optional explicit list (e.g. a caller-supplied relation map); defaults to
 * the seeded `relations`. Malformed relations throw instead of silently
 * overwriting (see `assertUniqueScenarioIds`). */
export function relationsByScenarioId(
  source: readonly ScenarioRelation[] = relations,
): Map<string, ScenarioRelation> {
  assertUniqueScenarioIds(source);
  return new Map(source.map((r) => [r.scenarioId, r]));
}
