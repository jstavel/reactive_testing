import { describe, expect, it } from "vitest";

import { smokeTestPlan } from "../model/smoke.test-plan.js";
import { selectScenarios } from "./scenario-select.js";

describe("selectScenarios", () => {
  it("selects one scenario", () => {
    const selected = selectScenarios(smokeTestPlan, [
      "clicking-earn-navigates-to-the-standalone-earn-page",
    ]);

    expect(selected.scenarios.map(({ id }) => id)).toEqual(["clicking-earn-navigates-to-the-standalone-earn-page"]);
  });

  it("selects multiple scenarios in plan order", () => {
    const selected = selectScenarios(smokeTestPlan, [
      "pressing-escape-closes-the-portfolio-summary-dialog",
      "clicking-earn-navigates-to-the-standalone-earn-page",
      "clicking-main-opens-the-history-page-for-the-main-account",
    ]);

    expect(selected.scenarios.map(({ id }) => id)).toEqual([
      "clicking-main-opens-the-history-page-for-the-main-account",
      "clicking-earn-navigates-to-the-standalone-earn-page",
      "pressing-escape-closes-the-portfolio-summary-dialog",
    ]);
  });

  it("deduplicates selected scenarios", () => {
    const selected = selectScenarios(smokeTestPlan, [
      "clicking-earn-navigates-to-the-standalone-earn-page",
      "clicking-earn-navigates-to-the-standalone-earn-page",
      "pressing-escape-closes-the-portfolio-summary-dialog",
    ]);

    expect(selected.scenarios.map(({ id }) => id)).toEqual([
      "clicking-earn-navigates-to-the-standalone-earn-page",
      "pressing-escape-closes-the-portfolio-summary-dialog",
    ]);
  });

  it("throws with the unknown and every valid scenario id", () => {
    expect(() => selectScenarios(smokeTestPlan, ["not-a-scenario"])).toThrow(
      /Unknown scenario id\(s\): not-a-scenario.*Valid scenario ids:.*clicking-earn-navigates-to-the-standalone-earn-page/s,
    );
  });

  it("returns the plan unchanged when no scenarios are selected", () => {
    expect(selectScenarios(smokeTestPlan, [])).toBe(smokeTestPlan);
  });

  it("preserves plan metadata when selecting scenarios", () => {
    const selected = selectScenarios(smokeTestPlan, ["clicking-earn-navigates-to-the-standalone-earn-page"]);

    expect(selected.planId).toBe(smokeTestPlan.planId);
    expect(selected.modelVersion).toBe(smokeTestPlan.modelVersion);
  });
});
