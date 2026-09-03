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
import type { ScenarioRelation } from "../model/relations.js";
import { relationsByScenarioId } from "../model/relations.js";

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
  /**
   * Scenario↔model relation map (Story 2). When provided, the report groups
   * scenarios under their feature and shows the Gherkin↔model linkage. When
   * omitted, the report falls back to a flat scenario list (Story 1).
   */
  relations?: ScenarioRelation[];
  /**
   * Run-time Gherkin snapshot: `scenarioId → scenario source text`, captured
   * from the feature files at run time (see `gherkin-snapshot.ts`). The .feature
   * files are not part of the model and can drift, so the report embeds this
   * snapshot rather than an authored copy — it reflects exactly what was run
   * (CAP-4). When omitted, the report shows scenario titles only.
   */
  gherkinSource?: Readonly<Record<string, string>>;
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
  relations,
  gherkinSource,
}: EmitHtmlReportInput): string {
  const html = renderHtmlReport({ run, plan, results, relations, gherkinSource });
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
  relations,
  gherkinSource,
}: Omit<EmitHtmlReportInput, "corpusDir">): string {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;
  const barColor = failed > 0 ? "#e74c3c" : "#27ae60";
  const barLabel = failed > 0 ? "FAIL" : "PASS";

  const resultById = new Map(results.map((r) => [r.id, r]));
  const relById = relations ? relationsByScenarioId(relations) : undefined;

  const renderScenario = (scenario: TestPlan["scenarios"][number]): string => {
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

    // Model linkage from the relation map — which states/contracts this
    // scenario exercises (N:N, authored in model/relations.ts).
    const rel = relById?.get(scenario.id);
    const modelLinkHtml = rel
      ? `<div class="model-link">
           <span class="link-label">states:</span> ${rel.states.map((s) => `<span class="state">${escapeHtml(s)}</span>`).join(", ")}
           · <span class="link-label">contracts:</span> ${rel.contracts.map((c) => `<span class="contract">${escapeHtml(c)}</span>`).join(", ")}
         </div>`
      : "";
    // Run-time Gherkin snapshot (CAP-4): embed the feature-file text captured
    // at run time so the report reflects exactly what was run, not an authored
    // copy that could drift. Falls back to title-only when no snapshot exists.
    const gherkin = gherkinSource?.[scenario.id];
    const gherkinHtml = gherkin
      ? `<pre class="gherkin">${escapeHtml(gherkin)}</pre>`
      : "";

    const title = rel?.scenarioTitle ?? scenario.id;

    return `
      <details open>
        <summary class="scenario" style="border-left: 4px solid ${borderColor}; padding-left: 12px;">
          <span class="badge" style="background: ${badgeColor};">${badgeText}</span>
          <span class="scenario-id">${escapeHtml(title)}</span>
        </summary>
        <div class="scenario-body">
          ${gherkinHtml}
          <ul class="steps">
            ${stepsHtml}
          </ul>
          ${modelLinkHtml}
          ${errorHtml}
        </div>
      </details>`;
  };

  // Group scenarios under their feature when the relation map is present.
  let scenarioHtml: string;
  if (relById) {
    const grouped = new Map<string, TestPlan["scenarios"]>();
    for (const scenario of plan.scenarios) {
      const rel = relById.get(scenario.id);
      const feature = rel?.featureTitle ?? "Uncategorized";
      const list = grouped.get(feature) ?? [];
      list.push(scenario);
      grouped.set(feature, list);
    }

    scenarioHtml = [...grouped.entries()]
      .map(
        ([feature, scenarios]) => `
      <div class="feature-group">
        <div class="feature-name">${escapeHtml(feature)}</div>
        ${scenarios.map(renderScenario).join("\n")}
      </div>`,
      )
      .join("\n");
  } else {
    scenarioHtml = plan.scenarios.map(renderScenario).join("\n");
  }

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
    .feature-group { margin-bottom: 20px; }
    .feature-name { font-weight: 600; color: #343a40; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 2px solid #dee2e6; }
    .model-link { font-size: 0.8em; color: #6c757d; margin-top: 6px; padding: 6px 8px; background: #f8f9fa; border-radius: 4px; }
    .link-label { font-weight: 600; }
    .gherkin { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.8em; background: #f4f6f8; border-left: 3px solid #ced4da; padding: 8px 12px; border-radius: 0 4px 4px 0; margin-top: 6px; white-space: pre-wrap; color: #495057; }
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
