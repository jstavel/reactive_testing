// SSOT guard — verifies a derived TestPlan resolves against the Model (FR-9).
// Pure, no side effects, no browser, no AI.

import type { DialogContract } from "./contracts.js";
import type { FsmModel } from "./fsm.js";
import type { TestPlan } from "./schemas.js";

export interface ModelResolutionIssue {
  scenarioId: string;
  kind: "unknown-state" | "unknown-contract" | "unknown-transition" | "duplicate-id";
  message: string;
}

/**
 * Check every scenario step in `plan` against the FSM states, contracts, and
 * declared transitions. Also asserts scenario ids are unique.
 *
 * Returns `[]` when the plan fully resolves; otherwise every violation.
 */
export function resolveTestPlanAgainstModel(
  plan: TestPlan,
  fsm: FsmModel,
  contracts: readonly DialogContract[],
): ModelResolutionIssue[] {
  const stateIds = new Set(fsm.states.map((s) => s.stateId));
  const contractIds = new Set(contracts.map((c) => c.contractId));
  const transitionKeys = new Set(
    fsm.transitions.map((t) => `${t.from}\u0000${t.contractId}`),
  );

  const issues: ModelResolutionIssue[] = [];
  const seenIds = new Set<string>();

  for (const scenario of plan.scenarios) {
    // Duplicate id check
    if (seenIds.has(scenario.id)) {
      issues.push({
        scenarioId: scenario.id,
        kind: "duplicate-id",
        message: `duplicate scenario id "${scenario.id}"`,
      });
    }
    seenIds.add(scenario.id);

    for (const step of scenario.steps) {
      // Unknown state
      if (!stateIds.has(step.stateId)) {
        issues.push({
          scenarioId: scenario.id,
          kind: "unknown-state",
          message: `scenario "${scenario.id}" references unknown state "${step.stateId}"`,
        });
      }

      // Unknown contract
      if (!contractIds.has(step.contractId)) {
        issues.push({
          scenarioId: scenario.id,
          kind: "unknown-contract",
          message: `scenario "${scenario.id}" references unknown contract "${step.contractId}"`,
        });
      }

      // Unknown transition (only when both state and contract are individually valid)
      if (stateIds.has(step.stateId) && contractIds.has(step.contractId)) {
        const key = `${step.stateId}\u0000${step.contractId}`;
        if (!transitionKeys.has(key)) {
          issues.push({
            scenarioId: scenario.id,
            kind: "unknown-transition",
            message: `no transition from state "${step.stateId}" driven by contract "${step.contractId}"`,
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Throws if the plan does not fully resolve against the Model.
 * Convenience wrapper for guard-tool use.
 */
export function assertTestPlanResolvesToModel(
  plan: TestPlan,
  fsm: FsmModel,
  contracts: readonly DialogContract[],
): void {
  const issues = resolveTestPlanAgainstModel(plan, fsm, contracts);
  if (issues.length > 0) {
    throw new Error(
      `SSOT guard failed with ${issues.length} issue(s):\n` +
        issues.map((i) => `  [${i.kind}] ${i.message}`).join("\n"),
    );
  }
}
