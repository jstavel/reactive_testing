import { describe, expect, it } from "vitest";
import type { TestPlan } from "../model/schemas.js";
import { actionDiagnostics, distinctActionIds, scenarioForAction } from "./action-diagnostics.js";

const plan: TestPlan = {
  planId: "smoke",
  modelVersion: "version",
  scenarios: [
    {
      id: "history-filter",
      steps: [{ stateId: "historyMain", contractId: "filterHistoryByAsset" }],
    },
    {
      id: "dialog",
      steps: [
        { stateId: "homePage", contractId: "openPortfolioSummary" },
        { stateId: "portfolioSummaryDialog", contractId: "closePortfolioSummary" },
      ],
    },
  ],
};

describe("action diagnostics", () => {
  it("returns distinct action ids in plan order", () => {
    expect(distinctActionIds(plan)).toEqual([
      "filterHistoryByAsset",
      "openPortfolioSummary",
      "closePortfolioSummary",
    ]);
  });

  it("finds the scenario that exercises an action", () => {
    expect(scenarioForAction(plan, "closePortfolioSummary")?.id).toBe("dialog");
    expect(scenarioForAction(plan, "missing")).toBeUndefined();
  });

  it("prints evidence and adjudication guidance for a failed action", () => {
    expect(
      actionDiagnostics(
        plan,
        [{ id: "history-filter", passed: false, error: "locator timeout" }],
        "corpus",
      ),
    ).toEqual([
      "[ACTION DIAGNOSTIC] scenario=history-filter contract=filterHistoryByAsset state=historyMain",
      "  failure=locator timeout",
      "  evidence=corpus/@last-fail",
      "  classify: locator drift if the target is missing or ambiguous; app/spec drift if the target acts but the postcondition is wrong",
      "  next: inspect the failure snapshot and screenshot, then update action-map.ts only after live QA adjudication",
    ]);
  });
});
