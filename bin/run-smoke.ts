// Minimal runner: point the orchestrator at a live, logged-in browser via CDP
// and produce a real corpus on disk (Epic 2 goal). The smoke plan's actions
// still return 0 matches on the live home page (action compatibility is a
// follow-up story), but this wires the CDP-attach connection + new tab +
// confirmed readySelector and leaves the human's browser open.

import { smokeTestPlan } from "../model/smoke.test-plan.js";
import type { OrchestratorConfig } from "../model/schemas.js";
import { runTestPlan } from "../orchestrator/orchestrator.js";

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
  ],
  cdpUrl: "http://127.0.0.1:9222",
  stepTimeout: 10_000,
  runTimeout: 180_000,
};

const startedAt = Date.now();
console.log(
  `Connecting to CDP ${config.cdpUrl} → ${config.baseUrl} ` +
    `(plan "${smokeTestPlan.planId}", modelVersion ${smokeTestPlan.modelVersion.slice(0, 8)}…)`,
);
console.log(`Ready selector: ${config.readySelector}`);
console.log(`Listening for ${smokeTestPlan.scenarios.length} scenario(s)…`);

const result = await runTestPlan(smokeTestPlan, config, (scenario) => {
  const status = scenario.passed ? "PASS" : "FAIL";
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `[${scenario.passed ? "PASS" : "FAIL"}] ${scenario.id} (${elapsed}s)` +
      (scenario.error ? ` — ${scenario.error}` : ""),
  );
});

const passed = result.scenarios.filter((s) => s.passed).length;
const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

if (result.scenarios.length === 0) {
  console.error(
    `Run produced zero scenarios (plan "${result.planId}", modelVersion "${result.modelVersion}"). ` +
      `This is usually a modelVersion mismatch: the smoke plan's embedded modelVersion does not ` +
      `match the current model. Regenerate the test plan or check for stale model files.`,
  );
  process.exit(1);
}

if (passed === 0) {
  console.error(
    `Run failed: ${passed}/${result.scenarios.length} scenarios passed in ${elapsed}s. ` +
      `All scenarios failed — inspect the per-scenario errors above and the corpus in ` +
      `${config.corpusDir}/ to diagnose. Exiting non-zero.`,
  );
  process.exit(1);
}

console.log(
  `Run complete: ${passed}/${result.scenarios.length} scenarios passed in ${elapsed}s. ` +
    `CDP connection closed on completion; the human's browser stays open (detached, never closed). ` +
    `Corpus written to ${config.corpusDir}/.`,
);
