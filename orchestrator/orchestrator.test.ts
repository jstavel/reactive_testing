import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const MODEL_VERSION = "test-hash-abc123";

const networkMocks = vi.hoisted(() => ({
  finish: vi.fn(async () => []),
  close: vi.fn(),
  start: vi.fn(),
}));
const writeOrder = vi.hoisted(() => ({ current: undefined as string[] | undefined }));
const networkContractIds = vi.hoisted(() => new Set<string>());

vi.mock("../model/model-version.js", () => ({
  computeModelVersion: vi.fn(() => MODEL_VERSION),
}));

const mockGoto = vi.fn();
const mockWaitForSelector = vi.fn();
const mockWaitForURL = vi.fn();
const mockKeyboardPress = vi.fn();
const fluentLocator = (): unknown => ({
  click: vi.fn(async () => {}),
  check: vi.fn(async () => {}),
  press: vi.fn(async () => {}),
  locator: vi.fn(() => fluentLocator()),
  first: vi.fn(() => fluentLocator()),
  getByRole: vi.fn(() => fluentLocator()),
});
const mockGetByRole = vi.fn(() => fluentLocator());
const mockGetByText = vi.fn(() => fluentLocator());
const mockBrowserClose = vi.fn();
const mockConnectOverCDP = vi.fn();

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
                waitForURL: mockWaitForURL,
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
    connectOverCDP: (...args: unknown[]) => mockConnectOverCDP(...args),
  },
}));

const mockCorpusRun: { runId: string; files: string[] } = { runId: "mock-run-id", files: [] };
vi.mock("./corpus.js", async (importOriginal) => ({
  ...(await importOriginal()),
  startCorpusRun: vi.fn((runId?: string) => {
    const run = { runId: runId ?? "mock-run-id", files: [] };
    if (runId === undefined) {
      mockCorpusRun.runId = run.runId;
      mockCorpusRun.files = run.files;
    }
    return run;
  }),
  writeCorpusFile: vi.fn(
    (
      _corpusDir: string,
      run: { runId: string; files: string[] },
      kind: string,
      stepIndex: number,
      ext: string,
      _data: unknown,
      stem?: string,
    ) => {
      if (writeOrder.current !== undefined && kind === "snapshots" && stem?.endsWith(".pre")) {
        writeOrder.current.push("snapshotWrite");
      }
      const name = stem ?? String(stepIndex);
      const path = `${kind}/${run.runId}/${name}.${ext}`;
      run.files.push(path);
      return path;
    },
  ),
  finishRun: vi.fn(),
}));

vi.mock("../collectors/collect.js", () => ({
  collectors: {
    snapshot: vi.fn(async () => ({ stateId: "", snapshot: "", capturedAt: "" })),
    network: vi.fn(async () => []),
    screenshot: vi.fn(async () => ({ buffer: Buffer.from("png"), capturedAt: "" })),
    probe: vi.fn(async () => []),
  },
}));

networkMocks.start.mockImplementation(() => ({
  finish: networkMocks.finish,
  close: networkMocks.close,
}));

vi.mock("../collectors/collect-network.js", () => ({
  startNetworkCapture: networkMocks.start,
}));

vi.mock("../validators/dependencies.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../validators/dependencies.js")>();
  return {
    ...actual,
    corpusDependenciesFor: vi.fn((contractId: string) => [
      ...actual.corpusDependenciesFor(contractId),
      ...(networkContractIds.has(contractId) ? (["network"] as const) : []),
    ]),
  };
});

import type { OrchestratorConfig, TestPlan } from "../model/schemas.js";
import { runTestPlan, validatePlan } from "./orchestrator.js";

const baseConfig: OrchestratorConfig = {
  baseUrl: "http://localhost:3000",
  headless: true,
  readySelector: "#app",
  stepTimeout: 30_000,
  runTimeout: 300_000,
  corpusDir: "/tmp/test-corpus",
  probes: [
    { name: "selected-view", selector: 'a[role="tab"][aria-current="page"]' },
    { name: "portfolio-value", selector: '[data-testid="overview-portfolio-hero-value-text"]' },
  ],
};

function makePlan(scenarios: TestPlan["scenarios"]): TestPlan {
  return {
    planId: "smoke",
    modelVersion: MODEL_VERSION,
    scenarios,
  };
}

/** Build a CDP-style browser handle that yields a functioning page for runTestPlan. */
function makeCdpBrowserForOrchestrator() {
  const page = {
    goto: mockGoto,
    waitForSelector: mockWaitForSelector,
    waitForURL: mockWaitForURL,
    keyboard: { press: mockKeyboardPress },
    getByRole: mockGetByRole,
    getByText: mockGetByText,
    close: mockBrowserClose,
  };
  const context = { newPage: vi.fn(() => Promise.resolve(page)) };
  return {
    contexts: vi.fn(() => [context]),
    newContext: vi.fn(() => Promise.resolve(context)),
    close: mockBrowserClose,
  };
}

afterEach(() => {
  vi.clearAllMocks();
  writeOrder.current = undefined;
  networkContractIds.clear();
  mockGetByRole.mockImplementation(() => fluentLocator());
  mockWaitForSelector.mockReset();
  networkMocks.start.mockImplementation(() => ({
    finish: networkMocks.finish,
    close: networkMocks.close,
  }));
  networkMocks.finish.mockResolvedValue([]);
  networkMocks.close.mockImplementation(() => {});
  mockCorpusRun.files.length = 0;
});

describe("runTestPlan", () => {
  it("uses a provided runId for corpus writes without generating one", async () => {
    const { startCorpusRun, finishRun, writeCorpusFile } = await import("./corpus.js");
    const providedRunId = "11111111-1111-4111-8111-111111111111";
    const plan = makePlan([
      {
        id: "provided-run-id",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
      },
    ]);

    const result = await runTestPlan(plan, { ...baseConfig, runId: providedRunId });

    expect(result.runId).toBe(providedRunId);
    expect(startCorpusRun).toHaveBeenCalledWith(providedRunId);
    expect(
      (writeCorpusFile as unknown as ReturnType<typeof vi.fn>).mock.calls.some(
        ([, run]) => run.runId === providedRunId,
      ),
    ).toBe(true);
    expect(finishRun).toHaveBeenCalledWith({
      corpusDir: baseConfig.corpusDir,
      run: { runId: providedRunId, files: expect.any(Array) },
      timestamp: expect.any(String),
      planModelVersion: MODEL_VERSION,
      errors: expect.any(Array),
      failures: expect.any(Array),
      collectors: expect.any(Array),
      bootstrap: expect.any(Array),
      handoff: { failed: false },
    });
  });

  it.each(["../evil", "run/x", ""])(
    "rejects an unsafe provided runId %j before launch",
    async (runId) => {
      const { startCorpusRun } = await import("./corpus.js");
      const plan = makePlan([
        {
          id: "invalid-run-id",
          steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
        },
      ]);

      await expect(runTestPlan(plan, { ...baseConfig, runId })).rejects.toThrow(/Invalid runId/);
      expect(startCorpusRun).not.toHaveBeenCalled();
      expect(mockGoto).not.toHaveBeenCalled();
    },
  );

  it("rejects a provided runId that already exists before launch", async () => {
    const providedRunId = "existing-run-id";
    const runDir = join(baseConfig.corpusDir, providedRunId);
    mkdirSync(runDir, { recursive: true });
    const plan = makePlan([
      {
        id: "existing-run-id",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
      },
    ]);

    try {
      await expect(runTestPlan(plan, { ...baseConfig, runId: providedRunId })).rejects.toThrow(
        /already exists/,
      );
      expect(mockGoto).not.toHaveBeenCalled();
    } finally {
      rmSync(runDir, { recursive: true, force: true });
    }
  });

  it("generates a runId through startCorpusRun when none is provided", async () => {
    const { startCorpusRun } = await import("./corpus.js");
    const plan = makePlan([
      {
        id: "generated-run-id",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
      },
    ]);

    const result = await runTestPlan(plan, baseConfig);

    expect(result.runId).toBe(mockCorpusRun.runId);
    expect(startCorpusRun).toHaveBeenCalledOnce();
  });

  it("navigates every scenario and returns all passed", async () => {
    const plan = makePlan([
      {
        id: "click-history-main",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
      },
      {
        id: "click-history-futures",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuFutures" }],
      },
    ]);

    const result = await runTestPlan(plan, baseConfig);

    expect(result.planId).toBe("smoke");
    expect(result.modelVersion).toBe(MODEL_VERSION);
    expect(result.scenarios).toHaveLength(2);
    expect(result.scenarios.every((s) => s.passed)).toBe(true);
  });

  it("reports each scenario via the onScenario progress callback", async () => {
    const plan = makePlan([
      {
        id: "click-history-main",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
      },
      {
        id: "click-history-futures",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuFutures" }],
      },
    ]);

    const seen: Array<{ id: string; passed: boolean }> = [];
    const result = await runTestPlan(plan, baseConfig, (scenario) => {
      seen.push({ id: scenario.id, passed: scenario.passed });
    });

    expect(seen).toEqual([
      { id: "click-history-main", passed: true },
      { id: "click-history-futures", passed: true },
    ]);
    expect(seen.map((s) => s.id)).toEqual(result.scenarios.map((s) => s.id));
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
    // A modelVersion mismatch never starts a corpus run — no runId to surface.
    expect(result.runId).toBeUndefined();
  });

  it("records step timeout and continues to next scenario", async () => {
    const savedImpl = mockGetByRole.getMockImplementation();
    let callCount = 0;
    mockGetByRole.mockImplementation(() => ({
      click: vi.fn(() => {
        callCount++;
        if (callCount === 1) {
          return new Promise((resolve) => setTimeout(resolve, 100_000));
        }
        return Promise.resolve();
      }),
      first: vi.fn(() => ({ click: vi.fn() })),
    }));

    const plan = makePlan([
      {
        id: "slow-step",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
      },
      {
        id: "fast-step",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuFutures" }],
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
    const { finishRun } = await import("./corpus.js");
    const savedImpl = mockGetByRole.getMockImplementation();
    let slowCall = true;
    mockGetByRole.mockImplementation(() => ({
      click: vi.fn(() => {
        if (slowCall) {
          slowCall = false;
          return new Promise((resolve) => setTimeout(resolve, 200));
        }
        return Promise.resolve();
      }),
      first: vi.fn(() => ({ click: vi.fn() })),
    }));

    const plan = makePlan([
      {
        id: "first",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
      },
      {
        id: "second",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuFutures" }],
      },
    ]);

    const config = { ...baseConfig, runTimeout: 10 };
    const result = await runTestPlan(plan, config);

    expect(result.scenarios[1]!.passed).toBe(false);
    expect(result.scenarios[1]!.error).toContain("Run timeout");
    // The aborted run is a failed run — the handoff re-points @last-fail.
    const calls = (finishRun as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.at(-1)![0].handoff).toEqual({ failed: true });

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

  it("re-grounds at home via navigateHome when a previous scenario failed", async () => {
    const savedImpl = mockGetByRole.getMockImplementation();
    let calls = 0;
    mockGetByRole.mockImplementation(() => ({
      // Only the very first click fails; the home recovery and later steps run.
      click: vi.fn(() => (++calls === 1 ? Promise.reject(new Error("boom")) : Promise.resolve())),
      check: vi.fn(async () => {}),
      first: vi.fn(() => ({ click: vi.fn() })),
    }));

    const plan = makePlan([
      { id: "broken", steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }] },
      {
        id: "after-failure",
        steps: [{ stateId: "historyMain", contractId: "filterHistoryByAsset" }],
      },
    ]);

    try {
      const result = await runTestPlan(plan, baseConfig);

      expect(result.scenarios[0]!.passed).toBe(false);
      // The second scenario still ran: bootstrap re-grounded at home.
      expect(result.scenarios).toHaveLength(2);
      expect(result.scenarios[1]!.error ?? "").not.toContain("Bootstrap state is unknown");
      expect(mockWaitForURL).toHaveBeenCalledWith("**/app/home");
    } finally {
      if (savedImpl) mockGetByRole.mockImplementation(savedImpl);
    }
  });

  it("bootstraps an isolated History scenario from the initial state", async () => {
    const plan = makePlan([
      {
        id: "open-assets-filter",
        steps: [{ stateId: "historyMain", contractId: "filterHistoryByAsset" }],
      },
    ]);

    const result = await runTestPlan(plan, baseConfig);

    expect(result.scenarios).toEqual([{ id: "open-assets-filter", passed: true }]);
    expect(result.setup).toEqual([{ id: "open-assets-filter", passed: true }]);
    expect(mockWaitForURL).toHaveBeenCalledWith("**/app/history/main/ledger");
  });

  it("throws on invalid stateId", async () => {
    const plan = makePlan([
      {
        id: "bad-state",
        steps: [{ stateId: "nonexistent", contractId: "clickHistoryMenuMain" }],
      },
    ]);

    await expect(runTestPlan(plan, baseConfig)).rejects.toThrow('unknown stateId "nonexistent"');
  });

  it("throws on invalid contractId", async () => {
    const plan = makePlan([
      {
        id: "bad-contract",
        steps: [{ stateId: "homePage", contractId: "nonexistent" }],
      },
    ]);

    await expect(runTestPlan(plan, baseConfig)).rejects.toThrow('unknown contractId "nonexistent"');
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

    await expect(runTestPlan(plan, baseConfig)).rejects.toThrow("leads to");
  });

  it("rejects a plan whose scenario has no steps (validatePlan admission)", () => {
    const plan = makePlan([
      {
        id: "stepless",
        steps: [],
      },
    ]);

    expect(() => validatePlan(plan)).toThrow('Scenario "stepless" has no steps.');
  });

  it("rejects a scenario whose givenStateId does not match its first step stateId", () => {
    const plan = makePlan([
      {
        id: "mismatched-given",
        givenStateId: "homePage",
        steps: [{ stateId: "historyMain", contractId: "filterHistoryByAsset" }],
      },
    ]);

    expect(() => validatePlan(plan)).toThrow(
      'Scenario "mismatched-given" givenStateId "homePage" does not match first step stateId "historyMain".',
    );
  });

  it("accepts a scenario whose givenStateId matches its first step stateId", () => {
    const plan = makePlan([
      {
        id: "matched-given",
        givenStateId: "historyMain",
        steps: [{ stateId: "historyMain", contractId: "filterHistoryByAsset" }],
      },
    ]);

    expect(() => validatePlan(plan)).not.toThrow();
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
    expect(mockWaitForSelector).toHaveBeenCalledWith(
      "#app",
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
  });

  it("settles on settleSelector when provided instead of readySelector", async () => {
    const plan = makePlan([
      {
        id: "click-history-main",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
      },
    ]);

    await runTestPlan(plan, { ...baseConfig, settleSelector: ".app-shell" });

    // bootstrap waits readySelector, the settle waits settleSelector
    expect(mockWaitForSelector).toHaveBeenCalledWith(
      "#app",
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
    expect(mockWaitForSelector).toHaveBeenCalledWith(
      ".app-shell",
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
  });

  it("attaches over CDP when cdpUrl is set and writes a corpus on success", async () => {
    const { finishRun, writeCorpusFile } = await import("./corpus.js");
    const browser = makeCdpBrowserForOrchestrator();
    mockConnectOverCDP.mockResolvedValue(browser);

    const plan = makePlan([
      {
        id: "cdp-attach",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
      },
    ]);
    const config = {
      ...baseConfig,
      cdpUrl: "http://127.0.0.1:9222",
    };

    const result = await runTestPlan(plan, config);

    // (a) attached via connectOverCDP, not launch
    expect(mockConnectOverCDP).toHaveBeenCalledWith("http://127.0.0.1:9222");
    expect((await import("playwright")).chromium.launch).not.toHaveBeenCalled();
    // (b) scenario passes and a corpus is written + finalized
    expect(result.scenarios).toHaveLength(1);
    expect(result.scenarios[0]!.passed).toBe(true);
    expect(writeCorpusFile).toHaveBeenCalled();
    expect(finishRun).toHaveBeenCalled();
  });

  it("returns all scenarios failed with no partial corpus when CDP attach fails", async () => {
    const { startCorpusRun, finishRun } = await import("./corpus.js");
    mockConnectOverCDP.mockRejectedValue(new Error("ECONNREFUSED 127.0.0.1:9222"));

    const plan = makePlan([
      {
        id: "cdp-fail",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
      },
    ]);
    const config = {
      ...baseConfig,
      cdpUrl: "http://127.0.0.1:9222",
    };

    const result = await runTestPlan(plan, config);

    expect(result.scenarios).toHaveLength(1);
    expect(result.scenarios[0]!.passed).toBe(false);
    expect(result.scenarios[0]!.error).toMatch(/Browser launch failed/);
    // No partial corpus: the launch failure path never starts/finishes a run.
    expect(startCorpusRun).not.toHaveBeenCalled();
    expect(finishRun).not.toHaveBeenCalled();
    // So there is no corpus runId to surface either.
    expect(result.runId).toBeUndefined();
  });

  it("shields a throwing onScenario callback and still finishes the run with a manifest", async () => {
    const { finishRun } = await import("./corpus.js");

    const plan = makePlan([
      {
        id: "cb-throws",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
      },
    ]);

    const result = await runTestPlan(plan, baseConfig, () => {
      throw new Error("caller callback exploded");
    });

    // A throwing progress callback must not abort the run.
    expect(result.scenarios).toHaveLength(1);
    expect(result.scenarios[0]!.passed).toBe(true);
    expect(finishRun).toHaveBeenCalled();
  });
});

describe("corpus wiring", () => {
  it("surfaces the corpus runId on RunResult and marks the handoff clean on a passing run", async () => {
    const { finishRun } = await import("./corpus.js");

    const plan = makePlan([
      {
        id: "single",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
      },
    ]);

    const result = await runTestPlan(plan, baseConfig);

    // The runner learns the authoritative runId so it can print the handoff path.
    expect(result.runId).toBe(mockCorpusRun.runId);
    expect(finishRun).toHaveBeenCalledWith(
      expect.objectContaining({
        corpusDir: baseConfig.corpusDir,
        run: mockCorpusRun,
        timestamp: expect.any(String),
        planModelVersion: MODEL_VERSION,
        errors: expect.any(Array),
        failures: expect.any(Array),
        collectors: expect.any(Array),
        bootstrap: expect.any(Array),
        handoff: { failed: false },
      }),
    );
  });

  it("marks the handoff failed when any scenario fails", async () => {
    const { finishRun } = await import("./corpus.js");
    const savedImpl = mockGetByRole.getMockImplementation();
    mockGetByRole.mockImplementation(() => ({
      click: vi.fn(() => Promise.reject(new Error("locator boom"))),
      first: vi.fn(() => ({ click: vi.fn() })),
    }));

    const plan = makePlan([
      { id: "broken", steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }] },
    ]);

    try {
      const result = await runTestPlan(plan, baseConfig);

      expect(result.scenarios[0]!.passed).toBe(false);
      expect(finishRun).toHaveBeenCalledWith(
        expect.objectContaining({
          corpusDir: baseConfig.corpusDir,
          run: mockCorpusRun,
          timestamp: expect.any(String),
          planModelVersion: MODEL_VERSION,
          errors: expect.any(Array),
          failures: expect.any(Array),
          collectors: expect.any(Array),
          bootstrap: expect.any(Array),
          handoff: { failed: true },
        }),
      );
    } finally {
      if (savedImpl) mockGetByRole.mockImplementation(savedImpl);
    }
  });

  it("marks the handoff failed when a setup/bootstrap failure aborts a scenario", async () => {
    const { finishRun } = await import("./corpus.js");
    const savedImpl = mockGetByRole.getMockImplementation();
    // The first click fails (scenario 1, state unknown); the home-recovery
    // click succeeds but its settle wait fails, aborting scenario 2's bootstrap.
    let clicks = 0;
    mockGetByRole.mockImplementation(() => ({
      click: vi.fn(() =>
        ++clicks === 1 ? Promise.reject(new Error("locator boom")) : Promise.resolve(),
      ),
      first: vi.fn(() => ({ click: vi.fn() })),
    }));
    mockWaitForSelector
      .mockResolvedValueOnce(undefined) // launch ready-wait
      .mockRejectedValueOnce(new Error("recovery settle boom")); // home-recovery settle

    const plan = makePlan([
      { id: "broken", steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }] },
      {
        id: "needs-recovery",
        steps: [{ stateId: "historyMain", contractId: "filterHistoryByAsset" }],
      },
    ]);

    try {
      const result = await runTestPlan(plan, baseConfig);

      expect(result.scenarios[0]!.passed).toBe(false);
      expect(result.scenarios[1]!.error).toContain("Setup failed");
      // A setup/bootstrap failure is still a failed run for the handoff.
      const calls = (finishRun as unknown as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.at(-1)![0].handoff).toEqual({ failed: true });
    } finally {
      if (savedImpl) mockGetByRole.mockImplementation(savedImpl);
    }
  });

  it("names bootstrap failure evidence with its scenario and step", async () => {
    const { writeCorpusFile } = await import("./corpus.js");
    const savedImpl = mockGetByRole.getMockImplementation();
    let clicks = 0;
    mockGetByRole.mockImplementation(() => ({
      click: vi.fn(() =>
        ++clicks === 3 ? Promise.reject(new Error("bootstrap locator boom")) : Promise.resolve(),
      ),
      first: vi.fn(() => ({ click: vi.fn() })),
    }));

    const plan = makePlan([
      { id: "reach-history", steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }] },
      {
        id: "bootstrap-to-dialog",
        steps: [{ stateId: "portfolioSummaryDialog", contractId: "toggleEyeIcon" }],
      },
    ]);

    try {
      const result = await runTestPlan(plan, baseConfig);
      expect(result.scenarios[0]!.passed).toBe(true);
      expect(result.scenarios[1]!.error).toContain("Setup failed");

      const writeCalls = (writeCorpusFile as unknown as ReturnType<typeof vi.fn>).mock.calls;
      const failureStems = writeCalls
        .map((call) => call[6])
        .filter((stem): stem is string => typeof stem === "string" && stem.endsWith(".failure"));
      expect(failureStems).toContain("b.bootstrap-to-dialog.2.failure");
    } finally {
      if (savedImpl) mockGetByRole.mockImplementation(savedImpl);
    }
  });

  it("persists one file per kind per step and finishes with a manifest", async () => {
    const { collectors } = await import("../collectors/collect.js");
    const { writeCorpusFile, finishRun } = await import("./corpus.js");

    const plan = makePlan([
      {
        id: "single",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
      },
    ]);

    await runTestPlan(plan, baseConfig);

    expect(collectors.snapshot).toHaveBeenCalledTimes(2);
    expect(collectors.screenshot).toHaveBeenCalledTimes(0);
    expect(collectors.probe).toHaveBeenCalledTimes(1);

    expect(writeCorpusFile).toHaveBeenCalledTimes(3);
    const kinds = (writeCorpusFile as unknown as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => c[2],
    );
    expect(kinds.sort()).toEqual(["probes", "snapshots", "snapshots"]);

    expect(finishRun).toHaveBeenCalledTimes(1);
    expect(mockCorpusRun.files).toHaveLength(3);
  });

  it("starts network capture before the action and finishes after settle", async () => {
    networkContractIds.add("clickHistoryMenuMain");
    const { writeCorpusFile } = await import("./corpus.js");
    const order: string[] = [];
    let actionCalls = 0;
    let waitCalls = 0;
    writeOrder.current = order;
    networkMocks.finish.mockImplementation(async () => {
      order.push("finish");
      return [];
    });
    mockGetByRole.mockImplementation(() => ({
      click: vi.fn(async () => {
        actionCalls += 1;
        if (actionCalls === 1) order.push("action");
      }),
      first: vi.fn(() => ({ click: vi.fn() })),
    }));
    mockWaitForSelector.mockImplementation(async () => {
      waitCalls += 1;
      if (waitCalls === 2) order.push("settle");
    });
    networkMocks.start.mockImplementation(() => {
      order.push("start");
      return { finish: networkMocks.finish, close: networkMocks.close };
    });

    await runTestPlan(
      makePlan([
        {
          id: "network-step",
          steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
        },
      ]),
      baseConfig,
    );
    expect(order).toEqual(["snapshotWrite", "start", "action", "settle", "finish"]);
    expect(writeCorpusFile).toHaveBeenCalledWith(
      baseConfig.corpusDir,
      expect.anything(),
      "network",
      0,
      "json",
      expect.any(String),
      undefined,
    );
    expect(networkMocks.start).toHaveBeenCalledWith(expect.anything());
    expect(networkMocks.close).not.toHaveBeenCalled();
  });

  it("closes network capture after an action failure without finishing or writing", async () => {
    networkContractIds.add("clickHistoryMenuMain");
    const { writeCorpusFile } = await import("./corpus.js");
    mockGetByRole.mockImplementation(() => ({
      click: vi.fn(() => Promise.reject(new Error("action boom"))),
      first: vi.fn(() => ({ click: vi.fn() })),
    }));

    const result = await runTestPlan(
      makePlan([
        {
          id: "network-failure",
          steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
        },
      ]),
      baseConfig,
    );
    expect(result.scenarios[0]!.passed).toBe(false);
    expect(networkMocks.close).toHaveBeenCalledOnce();
    expect(networkMocks.finish).not.toHaveBeenCalled();
    expect(
      (writeCorpusFile as unknown as ReturnType<typeof vi.fn>).mock.calls.some(
        (call) => call[2] === "network",
      ),
    ).toBe(false);
  });

  it("records a network start gap and continues without writing network evidence", async () => {
    networkContractIds.add("clickHistoryMenuMain");
    const { finishRun, writeCorpusFile } = await import("./corpus.js");
    networkMocks.start.mockImplementationOnce(() => {
      throw new Error("page closed");
    });

    const result = await runTestPlan(
      makePlan([
        {
          id: "network-start-gap",
          steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
        },
      ]),
      baseConfig,
    );

    expect(result.scenarios[0]!.passed).toBe(true);
    expect(networkMocks.finish).not.toHaveBeenCalled();
    expect(
      (writeCorpusFile as unknown as ReturnType<typeof vi.fn>).mock.calls.some(
        (call) => call[2] === "network",
      ),
    ).toBe(false);
    expect((finishRun as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0].errors).toEqual(
      [expect.objectContaining({ collector: "network", stepIndex: 0, error: "page closed" })],
    );
  });

  it("isolates a network finish failure as a gap", async () => {
    networkContractIds.add("clickHistoryMenuMain");
    const { finishRun, writeCorpusFile } = await import("./corpus.js");
    networkMocks.finish.mockRejectedValueOnce(new Error("finish boom"));

    const result = await runTestPlan(
      makePlan([
        {
          id: "network-finish-gap",
          steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
        },
      ]),
      baseConfig,
    );

    expect(result.scenarios[0]!.passed).toBe(true);
    expect(
      (writeCorpusFile as unknown as ReturnType<typeof vi.fn>).mock.calls.some(
        (call) => call[2] === "network",
      ),
    ).toBe(false);
    expect((finishRun as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0].errors).toEqual(
      [expect.objectContaining({ collector: "network", stepIndex: 0, error: "finish boom" })],
    );
  });

  it("does not touch network capture when it is unplanned", async () => {
    await runTestPlan(
      makePlan([
        { id: "no-network", steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }] },
      ]),
      baseConfig,
    );

    expect(networkMocks.start).not.toHaveBeenCalled();
    expect(networkMocks.finish).not.toHaveBeenCalled();
    expect(networkMocks.close).not.toHaveBeenCalled();
  });

  it("closes on settle failure without finishing or writing network evidence", async () => {
    networkContractIds.add("clickHistoryMenuMain");
    const { writeCorpusFile } = await import("./corpus.js");
    mockWaitForSelector
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("settle boom"));

    const result = await runTestPlan(
      makePlan([
        {
          id: "network-settle-failure",
          steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
        },
      ]),
      baseConfig,
    );

    expect(result.scenarios[0]!.passed).toBe(false);
    expect(networkMocks.close).toHaveBeenCalledOnce();
    expect(networkMocks.finish).not.toHaveBeenCalled();
    expect(
      (writeCorpusFile as unknown as ReturnType<typeof vi.fn>).mock.calls.some(
        (call) => call[2] === "network",
      ),
    ).toBe(false);
  });

  it("creates and finishes a fresh network handle for every step", async () => {
    networkContractIds.add("clickHistoryMenuMain");
    networkContractIds.add("filterHistoryByAsset");
    const { writeCorpusFile } = await import("./corpus.js");
    const plan = makePlan([
      {
        id: "network-multi-step",
        steps: [
          { stateId: "homePage", contractId: "clickHistoryMenuMain" },
          { stateId: "historyMain", contractId: "filterHistoryByAsset" },
        ],
      },
    ]);

    const result = await runTestPlan(plan, baseConfig);

    expect(result.scenarios[0]!.passed).toBe(true);
    expect(networkMocks.start).toHaveBeenCalledTimes(2);
    expect(networkMocks.finish).toHaveBeenCalledTimes(2);
    expect(networkMocks.close).not.toHaveBeenCalled();
    expect(mockCorpusRun.files).toContain("network/mock-run-id/0.json");
    expect(mockCorpusRun.files).toContain("network/mock-run-id/1.json");
    expect(
      (writeCorpusFile as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[2] === "network",
      ),
    ).toHaveLength(2);
  });

  it("preserves a start gap when the action also fails", async () => {
    networkContractIds.add("clickHistoryMenuMain");
    const { finishRun } = await import("./corpus.js");
    mockGetByRole.mockImplementation(() => ({
      click: vi.fn(() => Promise.reject(new Error("action boom"))),
      first: vi.fn(() => ({ click: vi.fn() })),
    }));
    networkMocks.start.mockImplementationOnce(() => {
      throw new Error("start boom");
    });

    const result = await runTestPlan(
      makePlan([
        {
          id: "network-start-action-failure",
          steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
        },
      ]),
      baseConfig,
    );

    expect(result.scenarios[0]!.passed).toBe(false);
    const finishArgs = (finishRun as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
    expect(finishArgs[0].errors).toEqual([
      expect.objectContaining({ collector: "network", error: "start boom" }),
    ]);
    expect(finishArgs[0].failures).toEqual([expect.objectContaining({ error: "action boom" })]);
  });

  it("persists the exact events returned by finish", async () => {
    networkContractIds.add("clickHistoryMenuMain");
    const { writeCorpusFile } = await import("./corpus.js");
    const events = [
      {
        url: "https://example.test/a",
        method: "GET",
        status: 200,
        capturedAt: "2026-09-17T00:00:00.000Z",
      },
      {
        url: "https://example.test/b",
        method: "POST",
        error: "reset",
        capturedAt: "2026-09-17T00:00:01.000Z",
      },
    ] as never[];
    networkMocks.finish.mockResolvedValueOnce(events);

    await runTestPlan(
      makePlan([
        {
          id: "network-persistence",
          steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
        },
      ]),
      baseConfig,
    );

    const networkCall = (writeCorpusFile as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (call) => call[2] === "network",
    );
    expect(networkCall?.[5]).toBe(JSON.stringify(events));
  });

  it("passes the live page to startNetworkCapture", async () => {
    networkContractIds.add("clickHistoryMenuMain");
    let capturedPage: unknown;
    networkMocks.start.mockImplementation((page: unknown) => {
      capturedPage = page;
      return { finish: networkMocks.finish, close: networkMocks.close };
    });

    await runTestPlan(
      makePlan([
        {
          id: "network-page-reference",
          steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
        },
      ]),
      baseConfig,
    );

    expect(networkMocks.start).toHaveBeenCalledWith(capturedPage);
    expect(capturedPage).toEqual(expect.objectContaining({ getByRole: mockGetByRole }));
  });

  it("does not create network capture for a non-network contract", async () => {
    const { writeCorpusFile } = await import("./corpus.js");
    await runTestPlan(
      makePlan([
        {
          id: "no-network",
          steps: [{ stateId: "homePage", contractId: "clickHistoryMenuFutures" }],
        },
      ]),
      baseConfig,
    );

    expect(networkMocks.start).not.toHaveBeenCalled();
    expect(
      (writeCorpusFile as unknown as ReturnType<typeof vi.fn>).mock.calls.some(
        (call) => call[2] === "network",
      ),
    ).toBe(false);
  });

  it("increments stepIndex globally across steps and scenarios with no collisions", async () => {
    const { writeCorpusFile } = await import("./corpus.js");

    const plan = makePlan([
      {
        id: "multi-step",
        steps: [
          { stateId: "homePage", contractId: "openPortfolioSummary" },
          { stateId: "portfolioSummaryDialog", contractId: "toggleEyeIcon" },
        ],
      },
      {
        id: "second-scenario",
        route: [{ stateId: "portfolioSummaryDialog", contractId: "closePortfolioSummary" }],
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuFutures" }],
      },
    ]);

    await runTestPlan(plan, baseConfig);

    const snapshotCalls = (
      writeCorpusFile as unknown as ReturnType<typeof vi.fn>
    ).mock.calls.filter((c) => c[2] === "snapshots");
    const stepIndexes = snapshotCalls.map((c) => c[3]);
    // pre + post snapshots per step; the step index stays global across scenarios.
    expect(stepIndexes).toEqual([0, 0, 1, 1, 3, 3, 2, 2]);
    expect(new Set(stepIndexes).size).toBe(4);
  });

  it("collects only the planned collectors — no validator/assertion logic", async () => {
    const { collectors } = await import("../collectors/collect.js");
    const { writeCorpusFile } = await import("./corpus.js");

    const plan = makePlan([
      {
        id: "collect-only",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
      },
    ]);

    await runTestPlan(plan, baseConfig);

    expect(Object.keys(collectors).sort()).toEqual(["network", "probe", "screenshot", "snapshot"]);
    const writeCalls = (writeCorpusFile as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const kinds = writeCalls.map((c) => c[2]);
    expect(new Set(kinds)).toEqual(new Set(["probes", "snapshots"]));
  });

  it("isolates a collector throw into a gap: scenario passes, siblings run, manifest errors recorded", async () => {
    const { finishRun, writeCorpusFile } = await import("./corpus.js");
    const { collectors } = await import("../collectors/collect.js");
    (collectors.probe as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("collector boom"),
    );

    const plan = makePlan([
      {
        id: "fails-collection",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
      },
    ]);

    const result = await runTestPlan(plan, baseConfig);

    // A collector throw is a gap, not a scenario failure.
    expect(result.scenarios).toHaveLength(1);
    expect(result.scenarios[0]!.passed).toBe(true);
    expect(result.scenarios[0]!.error).toBeUndefined();
    // The pre-step and post-action snapshots still ran (2 calls).
    expect(collectors.snapshot).toHaveBeenCalledTimes(2);
    // The failed collector's file is absent; the manifest records the gap.
    const writeCalls = (writeCorpusFile as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(writeCalls.some((c) => c[2] === "probes")).toBe(false);
    // The sibling snapshots were still written at the same stepIndex.
    const kindsAtStepZero = writeCalls.filter((c) => c[3] === 0).map((c) => c[2]);
    expect(kindsAtStepZero).toEqual(["snapshots", "snapshots"]);
    expect(finishRun).toHaveBeenCalledWith(
      expect.objectContaining({
        corpusDir: baseConfig.corpusDir,
        run: mockCorpusRun,
        timestamp: expect.any(String),
        planModelVersion: MODEL_VERSION,
        errors: [{ collector: "probe", stepIndex: 0, error: "collector boom" }],
        failures: [],
        collectors: ["probe", "snapshot"],
        bootstrap: [],
        handoff: { failed: false },
      }),
    );
  });

  it("records gaps with true global step indexes across multi-step scenarios", async () => {
    const { finishRun } = await import("./corpus.js");
    const { collectors } = await import("../collectors/collect.js");
    // probe runs once per step (not duplicated pre/post), so the queue is
    // simple: step 0 succeeds, step 1 of scenario 1 fails, scenario 2's step fails.
    (collectors.probe as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("step-1 boom"))
      .mockRejectedValueOnce(new Error("scenario-2 boom"));

    const plan = makePlan([
      {
        id: "multi-step",
        steps: [
          { stateId: "homePage", contractId: "openPortfolioSummary" },
          { stateId: "portfolioSummaryDialog", contractId: "toggleEyeIcon" },
        ],
      },
      {
        id: "second-scenario",
        route: [{ stateId: "portfolioSummaryDialog", contractId: "closePortfolioSummary" }],
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuFutures" }],
      },
    ]);

    const result = await runTestPlan(plan, baseConfig);

    // Both scenarios completed; the probe gaps never failed them.
    expect(result.scenarios).toHaveLength(2);
    expect(result.scenarios.every((s) => s.passed)).toBe(true);
    // Step indexes are global: scenario 1's step 1 → 1, scenario 2's step 0 → 2.
    expect(finishRun).toHaveBeenCalledWith(
      expect.objectContaining({
        errors: [
          { collector: "probe", stepIndex: 1, error: "step-1 boom" },
          { collector: "probe", stepIndex: 3, error: "scenario-2 boom" },
        ],
        failures: [],
        collectors: ["probe", "snapshot"],
        handoff: { failed: false },
      }),
    );
  });

  it("persists partial probe results and records a gap when the probe collector fails partway", async () => {
    const { ProbePartialError } = await import("../collectors/collect-probe.js");
    const { finishRun, writeCorpusFile } = await import("./corpus.js");
    const { collectors } = await import("../collectors/collect.js");
    (collectors.probe as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new ProbePartialError(
        'Probe "balance" selector "[data-balance]" failed: boom',
        [{ name: "title", value: "Portfolio", capturedAt: "t" }],
        "balance",
      ),
    );

    const plan = makePlan([
      {
        id: "partial-probe",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
      },
    ]);

    const result = await runTestPlan(plan, baseConfig);

    expect(result.scenarios[0]!.passed).toBe(true);
    // Partial probe results were persisted to the probes corpus file.
    const probeWrite = (writeCorpusFile as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[2] === "probes",
    );
    expect(probeWrite).toBeTruthy();
    expect(JSON.parse(probeWrite![5] as string)).toEqual([
      { name: "title", value: "Portfolio", capturedAt: "t" },
    ]);
    // And the missing probe is recorded as a gap for a future reporter.
    expect(finishRun).toHaveBeenCalledWith(
      expect.objectContaining({
        errors: [
          {
            collector: "probe",
            stepIndex: 0,
            error: expect.stringContaining('Probe "balance"'),
          },
        ],
        failures: [],
        collectors: ["probe", "snapshot"],
        handoff: { failed: false },
      }),
    );
  });

  it("fails the scenario when a collector exceeds stepTimeout (timeout is not a gap)", async () => {
    const { finishRun } = await import("./corpus.js");
    const { collectors } = await import("../collectors/collect.js");
    (collectors.snapshot as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      new Promise(() => {}),
    );

    const plan = makePlan([
      {
        id: "hung-collector",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
      },
    ]);

    const result = await runTestPlan(plan, { ...baseConfig, stepTimeout: 50 });

    // A collector that exceeds stepTimeout still fails the scenario; the run
    // finalizes with a manifest but no gap is recorded.
    expect(result.scenarios).toHaveLength(1);
    expect(result.scenarios[0]!.passed).toBe(false);
    expect(result.scenarios[0]!.error).toContain("timed out");
    expect(finishRun).toHaveBeenCalledWith(
      expect.objectContaining({
        errors: [],
        failures: [],
        collectors: ["probe", "snapshot"],
        handoff: { failed: true },
      }),
    );
  });

  it("does not isolate a corpus-write IO failure: the scenario fails and no gap is recorded", async () => {
    const { finishRun, writeCorpusFile } = await import("./corpus.js");
    (writeCorpusFile as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("disk full");
    });

    const plan = makePlan([
      {
        id: "io",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
      },
    ]);

    const result = await runTestPlan(plan, baseConfig);

    // Corpus-write IO is orchestrator-authoritative: a write failure is a
    // scenario failure, never silenced into a collector gap (I/O matrix).
    expect(result.scenarios).toHaveLength(1);
    expect(result.scenarios[0]!.passed).toBe(false);
    expect(result.scenarios[0]!.error).toContain("disk full");
    expect(finishRun).toHaveBeenCalledWith(
      expect.objectContaining({
        errors: [],
        failures: [],
        collectors: ["probe", "snapshot"],
        handoff: { failed: true },
      }),
    );
  });

  it("writes a pre-step snapshot before the action and a post snapshot with the target state", async () => {
    const { writeCorpusFile } = await import("./corpus.js");
    const { collectors } = await import("../collectors/collect.js");

    const plan = makePlan([
      {
        id: "single",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
      },
    ]);

    await runTestPlan(plan, baseConfig);

    // Pre-step uses the from-state; post-step uses the target state (historyMain).
    expect(collectors.snapshot).toHaveBeenCalledWith(expect.anything(), {
      stateId: "homePage",
    });
    expect(collectors.snapshot).toHaveBeenCalledWith(expect.anything(), {
      stateId: "historyMain",
    });

    const writeCalls = (writeCorpusFile as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const pre = writeCalls.find((c) => c[2] === "snapshots" && c[6] === "0.pre");
    const post = writeCalls.find((c) => c[2] === "snapshots" && c[6] === undefined);
    expect(pre).toBeTruthy();
    expect(post).toBeTruthy();
    expect(writeCalls.indexOf(pre!)).toBeLessThan(writeCalls.indexOf(post!));
  });

  it("captures best-effort failure evidence and records a StepFailure when the action throws", async () => {
    const { finishRun, writeCorpusFile } = await import("./corpus.js");
    const savedImpl = mockGetByRole.getMockImplementation();
    mockGetByRole.mockImplementation(() => ({
      click: vi.fn(() => Promise.reject(new Error("locator boom"))),
      first: vi.fn(() => ({ click: vi.fn() })),
    }));

    const plan = makePlan([
      {
        id: "action-fails",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
      },
    ]);

    const result = await runTestPlan(plan, baseConfig);

    expect(result.scenarios[0]!.passed).toBe(false);
    expect(result.scenarios[0]!.error).toContain("locator boom");

    // Pre-step snapshot written before the action; failure snapshot + screenshot after.
    const writeCalls = (writeCorpusFile as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(writeCalls.some((c) => c[2] === "snapshots" && c[6] === "0.pre")).toBe(true);
    expect(writeCalls.some((c) => c[2] === "snapshots" && c[6] === "0.failure")).toBe(true);
    expect(
      writeCalls.some((c) => c[2] === "screenshots" && c[6] === "0.failure" && c[4] === "png"),
    ).toBe(true);

    expect(finishRun).toHaveBeenCalledWith(
      expect.objectContaining({
        errors: [],
        failures: [
          {
            stepIndex: 0,
            contractId: "clickHistoryMenuMain",
            stateId: "homePage",
            error: "locator boom",
          },
        ],
        collectors: ["probe", "snapshot"],
        handoff: { failed: true },
      }),
    );

    if (savedImpl) mockGetByRole.mockImplementation(savedImpl);
  });

  it("names failure evidence per step so two failing steps never overwrite each other", async () => {
    const { writeCorpusFile } = await import("./corpus.js");
    const savedImpl = mockGetByRole.getMockImplementation();
    // Odd clicks fail (each scenario's History button click); the even-numbered
    // home-recovery click (navigateHome) succeeds so scenario 2 still runs.
    let clicks = 0;
    mockGetByRole.mockImplementation(() => ({
      click: vi.fn(() =>
        ++clicks % 2 === 1 ? Promise.reject(new Error("locator boom")) : Promise.resolve(),
      ),
      first: vi.fn(() => ({ click: vi.fn() })),
    }));

    const plan = makePlan([
      { id: "fails-first", steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }] },
      {
        id: "fails-second",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuFutures" }],
      },
    ]);

    try {
      const result = await runTestPlan(plan, baseConfig);

      expect(result.scenarios.map((s) => s.passed)).toEqual([false, false]);

      const writeCalls = (writeCorpusFile as unknown as ReturnType<typeof vi.fn>).mock.calls;
      // Failure snapshots are written per failing step (global step indexes 0 and 1).
      const failureSnapshotStems = writeCalls
        .filter((c) => c[2] === "snapshots")
        .map((c) => c[6])
        .filter((s): s is string => typeof s === "string" && s.endsWith(".failure"));
      expect(failureSnapshotStems.sort()).toEqual(["0.failure", "1.failure"]);
      // Failure screenshots land on distinct per-step files — no shared `failure` name.
      const failureScreenshotStems = writeCalls
        .filter((c) => c[2] === "screenshots" && c[4] === "png")
        .map((c) => c[6]);
      expect(failureScreenshotStems.sort()).toEqual(["0.failure", "1.failure"]);
      // The corpus file list contains no duplicate failure path (no overwrite).
      const failurePaths = mockCorpusRun.files.filter((f) => f.includes(".failure."));
      expect(new Set(failurePaths).size).toBe(failurePaths.length);
    } finally {
      if (savedImpl) mockGetByRole.mockImplementation(savedImpl);
    }
  });

  it("records a StepFailure when the settle wait throws", async () => {
    const { finishRun } = await import("./corpus.js");
    mockWaitForSelector
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("settle boom"));

    const plan = makePlan([
      {
        id: "settle-fails",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
      },
    ]);

    const result = await runTestPlan(plan, baseConfig);

    expect(result.scenarios[0]!.passed).toBe(false);
    expect(result.scenarios[0]!.error).toContain("settle boom");
    expect(finishRun).toHaveBeenCalledWith(
      expect.objectContaining({
        errors: [],
        failures: [
          {
            stepIndex: 0,
            contractId: "clickHistoryMenuMain",
            stateId: "homePage",
            error: "settle boom",
          },
        ],
        collectors: ["probe", "snapshot"],
        handoff: { failed: true },
      }),
    );
  });

  it("swallows a failure-capture error and still records the StepFailure", async () => {
    const { finishRun } = await import("./corpus.js");
    const { collectors } = await import("../collectors/collect.js");
    const savedImpl = mockGetByRole.getMockImplementation();
    mockGetByRole.mockImplementation(() => ({
      click: vi.fn(() => Promise.reject(new Error("locator boom"))),
      first: vi.fn(() => ({ click: vi.fn() })),
    }));
    (collectors.screenshot as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("failure screenshot boom"),
    );

    const plan = makePlan([
      {
        id: "action-fails",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
      },
    ]);

    const result = await runTestPlan(plan, baseConfig);

    // The failure screenshot threw, but the run still finalized and the
    // StepFailure was recorded (failure capture is best-effort).
    expect(result.scenarios[0]!.passed).toBe(false);
    expect(finishRun).toHaveBeenCalledWith(
      expect.objectContaining({
        errors: [],
        failures: [
          {
            stepIndex: 0,
            contractId: "clickHistoryMenuMain",
            stateId: "homePage",
            error: "locator boom",
          },
        ],
        collectors: ["probe", "snapshot"],
        handoff: { failed: true },
      }),
    );

    if (savedImpl) mockGetByRole.mockImplementation(savedImpl);
  });

  it("plans only the declared collectors and records them in the manifest", async () => {
    const { finishRun } = await import("./corpus.js");
    const { collectors } = await import("../collectors/collect.js");

    const plan = makePlan([
      {
        id: "nav-only",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
      },
    ]);

    await runTestPlan(plan, baseConfig);

    // network + screenshot are never declared by any contract, so they are skipped.
    expect(collectors.screenshot).not.toHaveBeenCalled();
    // The manifest records the planned post-step set.
    expect(finishRun).toHaveBeenCalledWith(
      expect.objectContaining({
        errors: [],
        failures: [],
        collectors: ["probe", "snapshot"],
        handoff: { failed: false },
      }),
    );
  });

  it("fails fast when a contract declares view-selected but the plan lacks a selected-view probe", async () => {
    const plan = makePlan([
      {
        id: "needs-probe",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
      },
    ]);

    await expect(runTestPlan(plan, { ...baseConfig, probes: [] })).rejects.toThrow(
      /not configured: selected-view/,
    );
    expect((await import("playwright")).chromium.launch).not.toHaveBeenCalled();
    expect(mockConnectOverCDP).not.toHaveBeenCalled();
  });

  it("fails preflight before CDP launch when the configured probes omit the registry-derived portfolio-value probe", async () => {
    // AC pin (spec INVARIANT matrix, PROBE_NOT_CONFIGURED): a config carrying
    // every contract probe but the invariant's own probe must be rejected with
    // the missing probe named — the spec task claimed this coverage.
    const plan = makePlan([
      {
        id: "needs-invariant",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
      },
    ]);
    const probes = baseConfig.probes.filter(({ name }) => name !== "portfolio-value");

    await expect(runTestPlan(plan, { ...baseConfig, probes })).rejects.toThrow(
      /not configured: portfolio-value/,
    );
  });

  it("rejects a duplicate probe name before browser launch", async () => {
    const plan = makePlan([
      {
        id: "duplicate-probe",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
      },
    ]);
    const probes = [
      { name: "a", selector: "[data-a]" },
      { name: "a", selector: "[data-b]" },
      { name: "x", selector: "[data-x]" },
    ];

    await expect(runTestPlan(plan, { ...baseConfig, probes })).rejects.toThrow(
      /^Duplicate probe name\(s\) configured: "a"\.$/,
    );
    expect((await import("playwright")).chromium.launch).not.toHaveBeenCalled();
    expect(mockConnectOverCDP).not.toHaveBeenCalled();
  });

  it("reports multiple duplicate probe names in first-occurrence order", async () => {
    const plan = makePlan([
      {
        id: "duplicate-probes",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
      },
    ]);
    const probes = [
      { name: "a", selector: "[data-a]" },
      { name: "a", selector: "[data-a-2]" },
      { name: "b", selector: "[data-b]" },
      { name: "b", selector: "[data-b-2]" },
    ];

    await expect(runTestPlan(plan, { ...baseConfig, probes })).rejects.toThrow(
      /^Duplicate probe name\(s\) configured: "a", "b"\.$/,
    );
    expect((await import("playwright")).chromium.launch).not.toHaveBeenCalled();
    expect(mockConnectOverCDP).not.toHaveBeenCalled();
  });

  it("rejects duplicate names even when one probe is optional", async () => {
    const plan = makePlan([
      {
        id: "optional-duplicate-probe",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
      },
    ]);
    const probes = [
      { name: "a", selector: "[data-a]" },
      { name: "a", selector: "[data-a-optional]", optional: true },
    ];

    await expect(runTestPlan(plan, { ...baseConfig, probes })).rejects.toThrow(
      /^Duplicate probe name\(s\) configured: "a"\.$/,
    );
    expect((await import("playwright")).chromium.launch).not.toHaveBeenCalled();
    expect(mockConnectOverCDP).not.toHaveBeenCalled();
  });

  it("reports a duplicate required probe name instead of missing it", async () => {
    const plan = makePlan([
      {
        id: "duplicate-required-probe",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
      },
    ]);
    const probes = [
      { name: "selected-view", selector: "[data-selected-view]" },
      { name: "selected-view", selector: "[data-selected-view-2]" },
      { name: "portfolio-value", selector: "[data-portfolio-value]" },
    ];

    await expect(runTestPlan(plan, { ...baseConfig, probes })).rejects.toThrow(
      /^Duplicate probe name\(s\) configured: "selected-view"\.$/,
    );
    expect((await import("playwright")).chromium.launch).not.toHaveBeenCalled();
    expect(mockConnectOverCDP).not.toHaveBeenCalled();
  });

  it("reports interleaved duplicate names in first-occurrence order", async () => {
    const plan = makePlan([
      {
        id: "interleaved-duplicates",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
      },
    ]);
    const probes = [
      { name: "b", selector: "[data-b]" },
      { name: "a", selector: "[data-a]" },
      { name: "a", selector: "[data-a-2]" },
      { name: "b", selector: "[data-b-2]" },
    ];

    await expect(runTestPlan(plan, { ...baseConfig, probes })).rejects.toThrow(
      /^Duplicate probe name\(s\) configured: "b", "a"\.$/,
    );
  });

  it("reports a triple-occurring duplicate once", async () => {
    const plan = makePlan([
      {
        id: "triple-duplicate",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
      },
    ]);
    const probes = [
      { name: "a", selector: "[data-a]" },
      { name: "a", selector: "[data-a-2]" },
      { name: "a", selector: "[data-a-3]" },
    ];

    await expect(runTestPlan(plan, { ...baseConfig, probes })).rejects.toThrow(
      /^Duplicate probe name\(s\) configured: "a"\.$/,
    );
  });

  it("rejects duplicate names when both probes are optional", async () => {
    const plan = makePlan([
      {
        id: "two-optional-duplicates",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
      },
    ]);
    const probes = [
      { name: "a", selector: "[data-a]", optional: true },
      { name: "a", selector: "[data-a-2]", optional: true },
    ];

    await expect(runTestPlan(plan, { ...baseConfig, probes })).rejects.toThrow(
      /^Duplicate probe name\(s\) configured: "a"\.$/,
    );
  });

  it("reports duplicate names before unrelated missing required probes", async () => {
    const plan = makePlan([
      {
        id: "duplicate-before-missing",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
      },
    ]);
    const probes = [
      { name: "a", selector: "[data-a]" },
      { name: "a", selector: "[data-a-2]" },
    ];

    await expect(runTestPlan(plan, { ...baseConfig, probes })).rejects.toThrow(/Duplicate probe/);
    await expect(runTestPlan(plan, { ...baseConfig, probes })).rejects.not.toThrow(
      /not configured/,
    );
  });

  it("allows distinct probe names that differ only by case", async () => {
    const plan = makePlan([
      {
        id: "case-sensitive-probes",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
      },
    ]);
    const probes = [
      { name: "Portfolio", selector: "[data-portfolio-upper]" },
      { name: "portfolio", selector: "[data-portfolio-lower]" },
      ...baseConfig.probes.filter(({ name }) => name !== "portfolio" && name !== "Portfolio"),
    ];

    await expect(runTestPlan(plan, { ...baseConfig, probes })).resolves.toMatchObject({
      planId: "smoke",
    });
    expect((await import("playwright")).chromium.launch).toHaveBeenCalledTimes(1);
  });
});
