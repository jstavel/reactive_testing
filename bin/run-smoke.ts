// Minimal runner: point the orchestrator at a live, logged-in browser via CDP
// and produce a real corpus on disk (Epic 2 goal). Actions come from the
// live-discovered action-map (Story 2.6), so this wires the CDP-attach
// connection + new tab + confirmed readySelector and leaves the human's
// browser open.

import type { OrchestratorConfig, TestPlan } from "../model/schemas.js";
import { smokeTestPlan } from "../model/smoke.test-plan.js";
import { runTestPlan } from "../orchestrator/orchestrator.js";
import { finishRun } from "./run-smoke-finish.js";
import { selectScenarios } from "./scenario-select.js";

const selectedIds = process.argv.slice(2);
let plan: TestPlan;
try {
  plan = selectScenarios(smokeTestPlan, selectedIds);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const config: OrchestratorConfig = {
  baseUrl: "https://pro.kraken.com/app/home",
  // Confirmed live readySelector: reflects the authenticated portfolio value.
  // The home hero renders in ~6.3s, so stepTimeout must exceed that AND real
  // nav actions (up to ~5s); 10s still fast-fails broken locators vs Playwright's 30s.
  readySelector: '[data-testid="overview-portfolio-hero-value-text"]',
  // After a nav action the home hero is absent (history/portfolio/earn pages),
  // so the settle wait targets the persistent side-nav shell instead.
  settleSelector: '[aria-label="Side navigation"]',
  corpusDir: "corpus",
  // Selected-view probe (Story 2.7): the active sub-view tab (e.g. "Ledger",
  // "Overview", "Futures") is marked `aria-current="page"` on History/Portfolio
  // pages. Optional — absent on the home/dialog surfaces, it records an empty
  // value there rather than a collection gap.
  probes: [
    { name: "selected-view", selector: 'a[role="tab"][aria-current="page"]', optional: true },
    // Board-tab probe (Story 5-2, live-discovered 2026-09-10): the Trade page's
    // board tabs are flexlayout divs (no role=tab / aria-current); the active
    // board is .flexlayout__tab_button--selected with its label in the content
    // node. selectOrderBookTab binds view-selected to this probe.
    {
      name: "selected-board-tab",
      selector: ".flexlayout__tab_button--selected .flexlayout__tab_button_content",
      optional: true,
    },
  ],
  cdpUrl: "http://127.0.0.1:9222",
  stepTimeout: 20_000,
  runTimeout: 180_000,
};

const startedAt = Date.now();
console.log(
  `Connecting to CDP ${config.cdpUrl} → ${config.baseUrl} ` +
    `(plan "${plan.planId}", modelVersion ${plan.modelVersion.slice(0, 8)}…)`,
);
console.log(`Ready selector: ${config.readySelector}`);
console.log(`Listening for ${plan.scenarios.length} scenario(s)…`);
if (selectedIds.length > 0) {
  console.log(`Selected scenarios: ${plan.scenarios.map(({ id }) => id).join(", ")}`);
}

const result = await runTestPlan(plan, config, (scenario) => {
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `[${scenario.passed ? "PASS" : "FAIL"}] ${scenario.id} (${elapsed}s)` +
      (scenario.error ? ` — ${scenario.error}` : ""),
  );
});

const finish = finishRun(result, config.corpusDir, (Date.now() - startedAt) / 1000);
for (const error of finish.err) {
  console.error(error);
}
for (const line of finish.out) {
  console.log(line);
}
process.exit(finish.exitCode);
