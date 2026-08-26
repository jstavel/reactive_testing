import { afterEach, describe, expect, it, vi } from "vitest";

const MODEL_VERSION = "test-hash-abc123";

vi.mock("../model/model-version.js", () => ({
  computeModelVersion: vi.fn(() => MODEL_VERSION),
}));

const mockGoto = vi.fn();
const mockWaitForSelector = vi.fn();
const mockKeyboardPress = vi.fn();
const mockGetByRole = vi.fn(() => ({
  first: vi.fn(() => ({ click: vi.fn() })),
}));
const mockGetByText = vi.fn(() => ({
  first: vi.fn(() => ({ click: vi.fn() })),
}));
const mockBrowserClose = vi.fn();

vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn(() =>
      Promise.resolve({
        newContext: vi.fn(() =>
          Promise.resolve({
            newPage: vi.fn(() =>
              Promise.resolve({
                goto: mockGoto,
                waitForSelector: mockWaitForSelector,
                keyboard: { press: mockKeyboardPress },
                getByRole: mockGetByRole,
                getByText: mockGetByText,
              }),
            ),
          }),
        ),
        close: mockBrowserClose,
      }),
    ),
  },
}));

import { runTestPlan } from "./orchestrator.js";
import type { OrchestratorConfig, TestPlan } from "../model/schemas.js";

const baseConfig: OrchestratorConfig = {
  baseUrl: "http://localhost:3000",
  headless: true,
  readySelector: "#app",
  stepTimeout: 30_000,
  runTimeout: 300_000,
};

function makePlan(scenarios: TestPlan["scenarios"]): TestPlan {
  return {
    planId: "smoke",
    modelVersion: MODEL_VERSION,
    scenarios,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("runTestPlan", () => {
  it("navigates every scenario and returns all passed", async () => {
    const plan = makePlan([
      {
        id: "click-history-main",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
      },
      {
        id: "click-history-futures",
        steps: [
          { stateId: "homePage", contractId: "clickHistoryMenuFutures" },
        ],
      },
    ]);

    const result = await runTestPlan(plan, baseConfig);

    expect(result.planId).toBe("smoke");
    expect(result.modelVersion).toBe(MODEL_VERSION);
    expect(result.scenarios).toHaveLength(2);
    expect(result.scenarios.every((s) => s.passed)).toBe(true);
  });

  it("aborts immediately on modelVersion mismatch", async () => {
    const plan = makePlan([
      {
        id: "click-history-main",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
      },
    ]);
    plan.modelVersion = "stale-hash";

    const result = await runTestPlan(plan, baseConfig);

    expect(result.scenarios).toHaveLength(0);
    expect(mockGoto).not.toHaveBeenCalled();
  });

  it("records step timeout and continues to next scenario", async () => {
    const savedImpl = mockGetByRole.getMockImplementation();
    let callCount = 0;
    mockGetByRole.mockImplementation(() => ({
      first: vi.fn(() => ({
        click: vi.fn(() => {
          callCount++;
          if (callCount === 1) {
            return new Promise((resolve) => setTimeout(resolve, 100_000));
          }
          return Promise.resolve();
        }),
      })),
    }));

    const plan = makePlan([
      {
        id: "slow-step",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
      },
      {
        id: "fast-step",
        steps: [
          { stateId: "homePage", contractId: "clickHistoryMenuFutures" },
        ],
      },
    ]);

    const config = { ...baseConfig, stepTimeout: 50 };
    const result = await runTestPlan(plan, config);

    expect(result.scenarios[0]!.passed).toBe(false);
    expect(result.scenarios[0]!.error).toContain("timed out");
    expect(result.scenarios[1]!.passed).toBe(true);

    if (savedImpl) mockGetByRole.mockImplementation(savedImpl);
  });

  it("aborts remaining scenarios on run timeout", async () => {
    const savedImpl = mockGetByRole.getMockImplementation();
    let slowCall = true;
    mockGetByRole.mockImplementation(() => ({
      first: vi.fn(() => ({
        click: vi.fn(() => {
          if (slowCall) {
            slowCall = false;
            return new Promise((resolve) => setTimeout(resolve, 200));
          }
          return Promise.resolve();
        }),
      })),
    }));

    const plan = makePlan([
      {
        id: "first",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
      },
      {
        id: "second",
        steps: [
          { stateId: "homePage", contractId: "clickHistoryMenuFutures" },
        ],
      },
    ]);

    const config = { ...baseConfig, runTimeout: 10 };
    const result = await runTestPlan(plan, config);

    expect(result.scenarios[1]!.passed).toBe(false);
    expect(result.scenarios[1]!.error).toContain("Run timeout");

    if (savedImpl) mockGetByRole.mockImplementation(savedImpl);
  });

  it("closes browser after completion", async () => {
    const plan = makePlan([
      {
        id: "simple",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
      },
    ]);

    await runTestPlan(plan, baseConfig);

    expect(mockBrowserClose).toHaveBeenCalled();
  });

  it("throws on invalid stateId", async () => {
    const plan = makePlan([
      {
        id: "bad-state",
        steps: [{ stateId: "nonexistent", contractId: "clickHistoryMenuMain" }],
      },
    ]);

    await expect(runTestPlan(plan, baseConfig)).rejects.toThrow(
      'unknown stateId "nonexistent"',
    );
  });

  it("throws on invalid contractId", async () => {
    const plan = makePlan([
      {
        id: "bad-contract",
        steps: [{ stateId: "homePage", contractId: "nonexistent" }],
      },
    ]);

    await expect(runTestPlan(plan, baseConfig)).rejects.toThrow(
      'unknown contractId "nonexistent"',
    );
  });

  it("throws on unreachable path", async () => {
    const plan = makePlan([
      {
        id: "bad-path",
        steps: [
          { stateId: "homePage", contractId: "clickHistoryMenuMain" },
          { stateId: "homePage", contractId: "clickHistoryMenuFutures" },
        ],
      },
    ]);

    await expect(runTestPlan(plan, baseConfig)).rejects.toThrow(
      "leads to",
    );
  });

  it("executes the corresponding action for each contractId", async () => {
    const plan = makePlan([
      {
        id: "toggle-eye",
        steps: [
          { stateId: "homePage", contractId: "openPortfolioSummary" },
          {
            stateId: "portfolioSummaryDialog",
            contractId: "toggleEyeIcon",
          },
        ],
      },
    ]);

    const result = await runTestPlan(plan, baseConfig);

    expect(result.scenarios[0]!.passed).toBe(true);
    expect(mockGetByText).toHaveBeenCalled();
    expect(mockGetByRole).toHaveBeenCalled();
  });

  it("has an actionMap entry for every contract in allContracts", async () => {
    const { allContracts } = await import("../model/contracts.js");
    const { actionMap } = await import("./action-map.js");

    for (const contract of allContracts) {
      expect(actionMap).toHaveProperty(contract.contractId);
    }
    for (const key of Object.keys(actionMap)) {
      expect(allContracts.some((c) => c.contractId === key)).toBe(true);
    }
  });

  it("calls waitForSelector after each step action for settling", async () => {
    const plan = makePlan([
      {
        id: "toggle-eye",
        steps: [
          { stateId: "homePage", contractId: "openPortfolioSummary" },
          {
            stateId: "portfolioSummaryDialog",
            contractId: "toggleEyeIcon",
          },
        ],
      },
    ]);

    await runTestPlan(plan, baseConfig);

    // waitForSelector called once during bootstrap + once after each of 2 steps = 3 total
    expect(mockWaitForSelector).toHaveBeenCalledTimes(3);
    expect(mockWaitForSelector).toHaveBeenCalledWith("#app", expect.objectContaining({ timeout: expect.any(Number) }));
  });
});
