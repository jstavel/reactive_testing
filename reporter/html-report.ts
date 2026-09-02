// HTML report generator (Story 1) — renders a test run into a single
// self-contained HTML file with a green/red summary bar and a collapsible
// Gherkin feature tree.
//
// Pure + deterministic (NFR-1): same inputs → byte-identical output.
// No browser, no network, no AI in the loop. The only side effect is
// writing the derived HTML file.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type {
  RunMetadata,
  ScenarioResult,
  TestPlan,
} from "../model/schemas.js";

/** Inputs to `emitHtmlReport`. */
export interface EmitHtmlReportInput {
  /** Absolute path to the corpus output directory. */
  corpusDir: string;
  /** Metadata about the run (runId, timestamp). */
  run: RunMetadata;
  /** The test plan the run executed. */
  plan: TestPlan;
  /** Per-scenario results for the run. */
  results: ScenarioResult[];
}

/**
 * Render a test run into a self-contained HTML report (Story 1).
 *
 * The report is written to `{corpusDir}/{runId}/report.html`.
 *
 * @returns the corpus-relative path written.
 */
export function emitHtmlReport({
  corpusDir,
  run,
  plan,
  results,
}: EmitHtmlReportInput): string {
  const html = renderHtmlReport({ run, plan, results });
  const relPath = `${run.runId}/report.html`;
  mkdirSync(join(corpusDir, run.runId), { recursive: true });
  writeFileSync(join(corpusDir, relPath), html);
  return relPath;
}

/** Render the HTML report as a string. Pure — no side effects. */
export function renderHtmlReport({
  run,
  plan,
  results,
}: Omit<EmitHtmlReportInput, "corpusDir">): string {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;
  const barColor = failed > 0 ? "#e74c3c" : "#27ae60";
  const barLabel = failed > 0 ? "FAIL" : "PASS";

  const resultById = new Map(results.map((r) => [r.id, r]));

  const scenarioHtml = plan.scenarios
    .map((scenario) => {
      const result = resultById.get(scenario.id);
      const passed = result?.passed ?? false;
      const borderColor = passed ? "#27ae60" : "#e74c3c";
      const badgeColor = passed ? "#27ae60" : "#e74c3c";
      const badgeText = passed ? "PASS" : "FAIL";
      const errorHtml =
        result && !result.passed && result.error
          ? `<div class="error">${escapeHtml(result.error)}</div>`
          : "";

      const stepsHtml = scenario.steps
        .map(
          (step) =>
            `<li><span class="keyword">Given</span> <span class="state">${escapeHtml(step.stateId)}</span> → <span class="keyword">When</span> <span class="contract">${escapeHtml(step.contractId)}</span></li>`,
        )
        .join("\n        ");

      return `
      <details open>
        <summary class="scenario" style="border-left: 4px solid ${borderColor}; padding-left: 12px;">
          <span class="badge" style="background: ${badgeColor};">${badgeText}</span>
          <span class="scenario-id">${escapeHtml(scenario.id)}</span>
        </summary>
        <div class="scenario-body">
          <ul class="steps">
            ${stepsHtml}
          </ul>
          ${errorHtml}
        </div>
      </details>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Report — ${escapeHtml(plan.planId)} run ${escapeHtml(run.runId)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8f9fa; color: #212529; padding: 24px; }
    .summary { background: ${barColor}; color: white; padding: 16px 24px; border-radius: 8px; margin-bottom: 24px; display: flex; align-items: center; gap: 16px; }
    .summary h1 { font-size: 1.2em; font-weight: 600; }
    .summary .meta { font-size: 0.85em; opacity: 0.9; margin-left: auto; }
    .feature { background: white; border-radius: 8px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .feature-title { font-size: 1.1em; font-weight: 600; margin-bottom: 16px; color: #495057; }
    details { margin-bottom: 8px; }
    summary { cursor: pointer; padding: 8px 12px; border-radius: 4px; font-weight: 500; }
    summary:hover { background: #e9ecef; }
    .scenario { display: flex; align-items: center; gap: 8px; }
    .badge { color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.75em; font-weight: 600; }
    .scenario-id { font-weight: 500; }
    .scenario-body { padding: 8px 12px 8px 28px; }
    .steps { list-style: none; padding: 0; }
    .steps li { padding: 4px 0; font-size: 0.9em; color: #495057; }
    .keyword { color: #6c757d; font-weight: 500; }
    .state { color: #0d6efd; }
    .contract { color: #6f42c1; }
    .error { color: #e74c3c; font-size: 0.85em; margin-top: 4px; padding: 8px; background: #fdf2f2; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="summary">
    <h1>${barLabel}</h1>
    <span>${passed} passed, ${failed} failed, ${total} total</span>
    <span class="meta">plan: ${escapeHtml(plan.planId)} · model: ${escapeHtml(plan.modelVersion.slice(0, 8))}… · run: ${escapeHtml(run.runId)} · ${escapeHtml(run.timestamp)}</span>
  </div>
  <div class="feature">
    <div class="feature-title">Scenarios</div>
    ${scenarioHtml || '<div style="color: #6c757d;">No scenarios in this plan.</div>'}
  </div>
</body>
</html>`;
}

/** Minimal HTML entity escaping — &, <, >, ". */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
