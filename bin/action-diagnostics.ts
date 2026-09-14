import type { ScenarioPath, ScenarioResult, TestPlan } from "../model/schemas.js";

export interface ActionDiagnostic {
  readonly scenarioId: string;
  readonly contractId: string;
  readonly stateId: string;
  readonly result: ScenarioResult;
}

export function actionDiagnostics(
  plan: TestPlan,
  results: readonly ScenarioResult[],
  corpusDir: string,
): readonly string[] {
  return results.flatMap((result) => {
    if (result.passed) {
      return [];
    }
    const scenario = plan.scenarios.find(({ id }) => id === result.id);
    if (!scenario) {
      return [`[ACTION DIAGNOSTIC] scenario=${result.id} — no matching plan scenario`];
    }
    return formatScenarioDiagnostics(scenario, result, corpusDir);
  });
}

export function formatScenarioDiagnostics(
  scenario: ScenarioPath,
  result: ScenarioResult,
  corpusDir: string,
): readonly string[] {
  const step = result.failedStep ?? scenario.steps.at(-1);
  if (!step) {
    return [`[ACTION DIAGNOSTIC] scenario=${scenario.id} — no action step recorded`];
  }
  return [
    `[ACTION DIAGNOSTIC] scenario=${scenario.id} contract=${step.contractId} state=${step.stateId}`,
    `  failure=${result.error ?? "unknown failure"}`,
    `  evidence=${corpusDir}/@last-fail`,
    "  classify: locator drift if the target is missing or ambiguous; app/spec drift if the target acts but the postcondition is wrong",
    "  next: inspect the failure snapshot and screenshot, then update action-map.ts only after live QA adjudication",
  ];
}

export function distinctActionIds(plan: TestPlan): readonly string[] {
  return [
    ...new Set(plan.scenarios.flatMap(({ steps }) => steps.map(({ contractId }) => contractId))),
  ];
}

export function scenarioForAction(plan: TestPlan, contractId: string): ScenarioPath | undefined {
  return plan.scenarios.find(({ steps }) => steps.some((step) => step.contractId === contractId));
}
