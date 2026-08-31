import { describe, expect, it } from "vitest";

import { computeModelVersion } from "./model-version.js";
import { smokeTestPlan } from "./smoke.test-plan.js";

// Retro item-4: pin the committed smoke plan's modelVersion against the real
// model files (un-mocked computeModelVersion). A model edit that forgets to
// regenerate the plan hash fails CI here, instead of a late "zero scenarios"
// modelVersion mismatch on the live smoke run (orchestrator.ts:48).
describe("modelVersion guard", () => {
  it("smokeTestPlan.modelVersion matches computeModelVersion() over the real model files", () => {
    expect(smokeTestPlan.modelVersion).toBe(computeModelVersion());
  });
});
