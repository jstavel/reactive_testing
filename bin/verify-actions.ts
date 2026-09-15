import type { OrchestratorConfig, TestPlan } from "../model/schemas.js";
import { smokeTestPlan } from "../model/smoke.test-plan.js";
import { runTestPlan } from "../orchestrator/orchestrator.js";
import { actionDiagnostics, distinctActionIds, scenarioForAction } from "./action-diagnostics.js";
import { PORTFOLIO_VALUE_PROBE } from "./smoke-config.js";

const config: OrchestratorConfig = {
  baseUrl: "https://pro.kraken.com/app/home",
  readySelector: '[data-testid="overview-portfolio-hero-value-text"]',
  settleSelector: '[aria-label="Side navigation"]',
  corpusDir: "corpus",
  probes: [
    PORTFOLIO_VALUE_PROBE,
    { name: "selected-view", selector: 'a[role="tab"][aria-current="page"]', optional: true },
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

function singleActionPlan(contractId: string): TestPlan {
  const scenario = scenarioForAction(smokeTestPlan, contractId);
  if (!scenario) {
    throw new Error(`No smoke scenario covers contractId "${contractId}".`);
  }
  return { ...smokeTestPlan, scenarios: [scenario] };
}

const startedAt = Date.now();
const contracts = distinctActionIds(smokeTestPlan);
console.log(`Verifying ${contracts.length} action-map entries against the live CDP browser…`);

let failed = 0;
for (const contractId of contracts) {
  const plan = singleActionPlan(contractId);
  const result = await runTestPlan(plan, config);
  const scenarioResult = result.scenarios[0];
  if (!scenarioResult?.passed) {
    failed += 1;
    console.error(`[FAIL] ${contractId} — ${scenarioResult?.error ?? "no result"}`);
    for (const line of actionDiagnostics(plan, result.scenarios, config.corpusDir)) {
      console.error(line);
    }
    continue;
  }
  console.log(`[PASS] ${contractId} — ${plan.scenarios[0]!.id}`);
}

const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(
  `${contracts.length - failed}/${contracts.length} action-map entries passed in ${elapsed}s`,
);
process.exit(failed === 0 ? 0 : 1);
