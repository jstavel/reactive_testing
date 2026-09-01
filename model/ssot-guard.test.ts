import { describe, expect, it } from "vitest";

import { homePageModel } from "./fsm.js";
import { allContracts } from "./contracts.js";
import { smokeTestPlan } from "./smoke.test-plan.js";
import type { TestPlan } from "./schemas.js";
import {
  resolveTestPlanAgainstModel,
  assertTestPlanResolvesToModel,
} from "./ssot-guard.js";

describe("resolveTestPlanAgainstModel", () => {
  it("passes the committed smokeTestPlan against the real model (RESOLVES)", () => {
    const issues = resolveTestPlanAgainstModel(smokeTestPlan, homePageModel, allContracts);
    expect(issues).toEqual([]);
  });

  it("assertTestPlanResolvesToModel does not throw for the committed plan", () => {
    expect(() =>
      assertTestPlanResolvesToModel(smokeTestPlan, homePageModel, allContracts),
    ).not.toThrow();
  });

  it("assertTestPlanResolvesToModel throws naming the issue kind and scenario id on violation", () => {
    const plan: TestPlan = {
      planId: "smoke",
      modelVersion: smokeTestPlan.modelVersion,
      scenarios: [
        {
          id: "bad-state",
          steps: [{ stateId: "nonexistentPage", contractId: "clickHistoryMenuMain" }],
        },
      ],
    };

    expect(() =>
      assertTestPlanResolvesToModel(plan, homePageModel, allContracts),
    ).toThrow(Error);
    expect(() =>
      assertTestPlanResolvesToModel(plan, homePageModel, allContracts),
    ).toThrow(/unknown-state/);
    expect(() =>
      assertTestPlanResolvesToModel(plan, homePageModel, allContracts),
    ).toThrow(/bad-state/);
  });

  it("returns [] for an empty scenarios list", () => {
    const plan: TestPlan = {
      planId: "smoke",
      modelVersion: smokeTestPlan.modelVersion,
      scenarios: [],
    };

    expect(resolveTestPlanAgainstModel(plan, homePageModel, allContracts)).toEqual([]);
  });

  it("returns [] for a scenario with empty steps", () => {
    const plan: TestPlan = {
      planId: "smoke",
      modelVersion: smokeTestPlan.modelVersion,
      scenarios: [{ id: "no-steps", steps: [] }],
    };

    expect(resolveTestPlanAgainstModel(plan, homePageModel, allContracts)).toEqual([]);
  });

  it("flags an empty-string stateId as unknown-state", () => {
    const plan: TestPlan = {
      planId: "smoke",
      modelVersion: smokeTestPlan.modelVersion,
      scenarios: [
        { id: "empty-state", steps: [{ stateId: "", contractId: "clickHistoryMenuMain" }] },
      ],
    };

    const issues = resolveTestPlanAgainstModel(plan, homePageModel, allContracts);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("unknown-state");
    expect(issues[0].scenarioId).toBe("empty-state");
  });

  it("flags an empty-string contractId as unknown-contract", () => {
    const plan: TestPlan = {
      planId: "smoke",
      modelVersion: smokeTestPlan.modelVersion,
      scenarios: [
        { id: "empty-contract", steps: [{ stateId: "homePage", contractId: "" }] },
      ],
    };

    const issues = resolveTestPlanAgainstModel(plan, homePageModel, allContracts);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("unknown-contract");
    expect(issues[0].scenarioId).toBe("empty-contract");
  });

  it("does not flag a unique scenario id as duplicate (id-is-seen-once)", () => {
    const issues = resolveTestPlanAgainstModel(smokeTestPlan, homePageModel, allContracts);
    expect(issues.filter((i) => i.kind === "duplicate-id")).toEqual([]);
  });

  it("flags an unknown state (UNKNOWN_STATE)", () => {
    const plan: TestPlan = {
      planId: "smoke",
      modelVersion: smokeTestPlan.modelVersion,
      scenarios: [
        {
          id: "bad-state",
          steps: [{ stateId: "nonexistentPage", contractId: "clickHistoryMenuMain" }],
        },
      ],
    };

    const issues = resolveTestPlanAgainstModel(plan, homePageModel, allContracts);
    expect(issues).toEqual([
      {
        scenarioId: "bad-state",
        kind: "unknown-state",
        message: 'scenario "bad-state" references unknown state "nonexistentPage"',
      },
    ]);
  });

  it("flags an unknown contract (UNKNOWN_CONTRACT)", () => {
    const plan: TestPlan = {
      planId: "smoke",
      modelVersion: smokeTestPlan.modelVersion,
      scenarios: [
        {
          id: "bad-contract",
          steps: [{ stateId: "homePage", contractId: "nonexistentContract" }],
        },
      ],
    };

    const issues = resolveTestPlanAgainstModel(plan, homePageModel, allContracts);
    expect(issues).toEqual([
      {
        scenarioId: "bad-contract",
        kind: "unknown-contract",
        message: 'scenario "bad-contract" references unknown contract "nonexistentContract"',
      },
    ]);
  });

  it("flags an unknown transition when state and contract are individually valid (UNKNOWN_TRANSITION)", () => {
    const plan: TestPlan = {
      planId: "smoke",
      modelVersion: smokeTestPlan.modelVersion,
      scenarios: [
        {
          id: "bad-transition",
          // earn state exists, clickHistoryMenuMain contract exists, but no transition between them
          steps: [{ stateId: "earn", contractId: "clickHistoryMenuMain" }],
        },
      ],
    };

    const issues = resolveTestPlanAgainstModel(plan, homePageModel, allContracts);
    expect(issues).toEqual([
      {
        scenarioId: "bad-transition",
        kind: "unknown-transition",
        message: 'no transition from state "earn" driven by contract "clickHistoryMenuMain"',
      },
    ]);
  });

  it("flags duplicate scenario ids (DUPLICATE_ID)", () => {
    const plan: TestPlan = {
      planId: "smoke",
      modelVersion: smokeTestPlan.modelVersion,
      scenarios: [
        {
          id: "same-id",
          steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
        },
        {
          id: "same-id",
          steps: [{ stateId: "homePage", contractId: "clickHistoryMenuFutures" }],
        },
      ],
    };

    const issues = resolveTestPlanAgainstModel(plan, homePageModel, allContracts);
    const duplicateIssues = issues.filter((i) => i.kind === "duplicate-id");
    expect(duplicateIssues).toHaveLength(1);
    expect(duplicateIssues[0]).toEqual({
      scenarioId: "same-id",
      kind: "duplicate-id",
      message: 'duplicate scenario id "same-id"',
    });
  });

  it("returns multiple issues when plan has several violations", () => {
    const plan: TestPlan = {
      planId: "smoke",
      modelVersion: smokeTestPlan.modelVersion,
      scenarios: [
        {
          id: "multi-bad",
          steps: [
            { stateId: "nonexistentPage", contractId: "clickHistoryMenuMain" },
            { stateId: "homePage", contractId: "nonexistentContract" },
          ],
        },
      ],
    };

    const issues = resolveTestPlanAgainstModel(plan, homePageModel, allContracts);
    expect(issues).toHaveLength(2);
    expect(issues.map((i) => i.kind)).toEqual(
      expect.arrayContaining(["unknown-state", "unknown-contract"]),
    );
  });
});
