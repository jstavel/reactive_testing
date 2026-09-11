// JSON report generator (CAP-1) — the machine-readable sibling of the HTML
// report. Emitted from the same inputs as `report.html` in the same CLI
// invocation: same corpus, same inputs → byte-identical output (NFR-1) via
// `JSON.stringify` over objects built in a fixed member order.
//
// Refs only: steps cite corpus-relative evidence paths (snapshot pre/post,
// probes, network, screenshot) — never evidence payloads. Counts are the
// already-derived scenario results (the same numbers as the HTML summary
// bar); nothing is re-validated or recomputed here.
//
// Pure + deterministic (NFR-1): no browser, no network, no AI, no filesystem
// reads. The only side effect is writing the derived JSON file.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type {
  RunMetadata,
  ScenarioResult,
  StepEvidence,
  TestPlan,
} from "../model/schemas.js";
import type { ScenarioRelation } from "../model/relations.js";
import { relationsByScenarioId } from "../model/relations.js";

/** Top-level schema tag — bumped when the report shape changes (CI consumes it). */
export const REPORT_SCHEMA = "report.v1";

/** Inputs to `emitJsonReport`. */
export interface EmitJsonReportInput {
  /** Absolute path to the corpus output directory. */
  corpusDir: string;
  /** Metadata about the run (runId, timestamp). */
  run: RunMetadata;
  /** The test plan the run executed. */
  plan: TestPlan;
  /** Per-scenario results for the run. */
  results: ScenarioResult[];
  /**
   * Scenario↔model relation map (Story 2). When provided, each scenario's
   * `title`/`feature` come from it (as in the HTML report). When a scenario
   * has no relation, `title` falls back to `scenario.id` and `feature` is
   * omitted.
   */
  relations?: ScenarioRelation[];
  /**
   * Per-step evidence: `scenarioId → StepEvidence[]`, aligned by index to
   * `plan.scenarios[id].steps`. Refs are echoed verbatim — a step with no
   * entry lists only `stateId`+`contractId` (no ref fields).
   */
  stepEvidence?: Readonly<Record<string, StepEvidence[]>>;
}

/**
 * Render the JSON report as a string (pure — no side effects). Scenarios are
 * in plan order; every object is built with a fixed member sequence so the
 * output is byte-stable for identical inputs (NFR-1).
 */
export function renderJsonReport({
  run,
  plan,
  results,
  relations,
  stepEvidence,
}: Omit<EmitJsonReportInput, "corpusDir">): string {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  const resultById = new Map(results.map((r) => [r.id, r]));
  const relById = relations ? relationsByScenarioId(relations) : undefined;

  const report = {
    schema: REPORT_SCHEMA,
    runId: run.runId,
    timestamp: run.timestamp,
    planId: plan.planId,
    modelVersion: plan.modelVersion,
    summary: { total: results.length, passed, failed },
    scenarios: plan.scenarios.map((scenario) => {
      const result = resultById.get(scenario.id);
      const rel = relById?.get(scenario.id);
      return {
        id: scenario.id,
        title: rel?.scenarioTitle ?? scenario.id,
        ...(rel?.featureTitle !== undefined ? { feature: rel.featureTitle } : {}),
        passed: result?.passed ?? false,
        ...(result && !result.passed && result.error ? { error: result.error } : {}),
        steps: scenario.steps.map((step, idx) =>
          renderStep(step, stepEvidence?.[scenario.id]?.[idx]),
        ),
      };
    }),
  };
  return JSON.stringify(report, null, 2);
}

/** One step's JSON entry: `stateId`+`contractId` always; timing and evidence
 * refs only when the step has evidence (refs echoed, never content). */
function renderStep(
  step: TestPlan["scenarios"][number]["steps"][number],
  ev: StepEvidence | undefined,
): object {
  if (ev === undefined) {
    return { stateId: step.stateId, contractId: step.contractId };
  }
  return {
    stateId: step.stateId,
    contractId: step.contractId,
    timingMs: ev.timingMs,
    ...(ev.snapshotPre !== undefined ? { snapshotPre: ev.snapshotPre } : {}),
    ...(ev.snapshotPost !== undefined ? { snapshotPost: ev.snapshotPost } : {}),
    ...(ev.probes !== undefined ? { probes: ev.probes } : {}),
    ...(ev.network !== undefined ? { network: ev.network } : {}),
    ...(ev.screenshot !== undefined ? { screenshot: ev.screenshot } : {}),
  };
}

/**
 * Write the JSON report to `{corpusDir}/{runId}/report.json` — the sibling of
 * `report.html`, emitted from the same inputs in the same invocation.
 *
 * @returns the corpus-relative path written.
 */
export function emitJsonReport({
  corpusDir,
  run,
  plan,
  results,
  relations,
  stepEvidence,
}: EmitJsonReportInput): string {
  const json = renderJsonReport({ run, plan, results, relations, stepEvidence });
  const relPath = `${run.runId}/report.json`;
  mkdirSync(join(corpusDir, run.runId), { recursive: true });
  writeFileSync(join(corpusDir, relPath), json);
  return relPath;
}
