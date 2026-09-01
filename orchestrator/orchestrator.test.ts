import { afterEach, describe, expect, it, vi } from "vitest";

const MODEL_VERSION = "test-hash-abc123";

vi.mock("../model/model-version.js", () => ({
  computeModelVersion: vi.fn(() => MODEL_VERSION),
}));

const mockGoto = vi.fn();
const mockWaitForSelector = vi.fn();
const mockWaitForURL = vi.fn();
const mockKeyboardPress = vi.fn();
const fluentLocator = (): unknown => ({
  click: vi.fn(async () => {}),
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
vi.mock("./corpus.js", () => ({
  startCorpusRun: vi.fn(() => mockCorpusRun),
  writeCorpusFile: vi.fn((_corpusDir: string, run: { runId: string; files: string[] }, kind: string, stepIndex: number, ext: string, _data: unknown, stem?: string) => {
    const name = stem ?? String(stepIndex);
    const path = `${kind}/${run.runId}/${name}.${ext}`;
    run.files.push(path);
    return path;
  }),
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

import { runTestPlan } from "./orchestrator.js";
import type { OrchestratorConfig, TestPlan } from "../model/schemas.js";

const baseConfig: OrchestratorConfig = {
  baseUrl: "http://localhost:3000",
  headless: true,
  readySelector: "#app",
  stepTimeout: 30_000,
  runTimeout: 300_000,
  corpusDir: "/tmp/test-corpus",
  probes: [{ name: "selected-view", selector: 'a[role="tab"][aria-current="page"]' }],
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
  mockCorpusRun.files.length = 0;
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

  it("reports each scenario via the onScenario progress callback", async () => {
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

    const seen: Array<{ id: string; passed: boolean }> = [];
    const result = await runTestPlan(plan, baseConfig, (scenario) => {
      seen.push({ id: scenario.id, passed: scenario.passed });
    });

    expect(seen).toEqual([
      { id: "click-history-main", passed: true },
      { id: "click-history-futures", passed: true },
    ]);
    expect(seen.map((s) => s.id)).toEqual(
      result.scenarios.map((s) => s.id),
    );
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
    expect(
      (await import("playwright")).chromium.launch,
    ).not.toHaveBeenCalled();
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
    expect(collectors.network).toHaveBeenCalledTimes(0);
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
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuFutures" }],
      },
    ]);

    await runTestPlan(plan, baseConfig);

    const snapshotCalls = (writeCorpusFile as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => c[2] === "snapshots",
    );
    const stepIndexes = snapshotCalls.map((c) => c[3]);
    // pre + post snapshots per step; the step index stays global across scenarios.
    expect(stepIndexes).toEqual([0, 0, 1, 1, 2, 2]);
    expect(new Set(stepIndexes).size).toBe(3);
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

    expect(Object.keys(collectors).sort()).toEqual([
      "network",
      "probe",
      "screenshot",
      "snapshot",
    ]);
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
    const kindsAtStepZero = writeCalls
      .filter((c) => c[3] === 0)
      .map((c) => c[2]);
    expect(kindsAtStepZero).toEqual(["snapshots", "snapshots"]);
    expect(finishRun).toHaveBeenCalledWith(
      baseConfig.corpusDir,
      mockCorpusRun,
      expect.any(String),
      [{ collector: "probe", stepIndex: 0, error: "collector boom" }],
      [],
      ["probe", "snapshot"],
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
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuFutures" }],
      },
    ]);

    const result = await runTestPlan(plan, baseConfig);

    // Both scenarios completed; the probe gaps never failed them.
    expect(result.scenarios).toHaveLength(2);
    expect(result.scenarios.every((s) => s.passed)).toBe(true);
    // Step indexes are global: scenario 1's step 1 → 1, scenario 2's step 0 → 2.
    expect(finishRun).toHaveBeenCalledWith(
      baseConfig.corpusDir,
      mockCorpusRun,
      expect.any(String),
      [
        { collector: "probe", stepIndex: 1, error: "step-1 boom" },
        { collector: "probe", stepIndex: 2, error: "scenario-2 boom" },
      ],
      [],
      ["probe", "snapshot"],
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
      baseConfig.corpusDir,
      mockCorpusRun,
      expect.any(String),
      [
        {
          collector: "probe",
          stepIndex: 0,
          error: expect.stringContaining('Probe "balance"'),
        },
      ],
      [],
      ["probe", "snapshot"],
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
      baseConfig.corpusDir,
      mockCorpusRun,
      expect.any(String),
      [],
      [],
      ["probe", "snapshot"],
    );
  });

  it("does not isolate a corpus-write IO failure: the scenario fails and no gap is recorded", async () => {
    const { finishRun, writeCorpusFile } = await import("./corpus.js");
    (writeCorpusFile as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () => {
        throw new Error("disk full");
      },
    );

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
      baseConfig.corpusDir,
      mockCorpusRun,
      expect.any(String),
      [],
      [],
      ["probe", "snapshot"],
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
    const pre = writeCalls.find((c) => c[2] === "snapshots" && c[6] === "pre");
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
    expect(writeCalls.some((c) => c[2] === "snapshots" && c[6] === "pre")).toBe(true);
    expect(writeCalls.some((c) => c[2] === "snapshots" && c[6] === "failure")).toBe(true);
    expect(
      writeCalls.some((c) => c[2] === "screenshots" && c[6] === "failure" && c[4] === "png"),
    ).toBe(true);

    expect(finishRun).toHaveBeenCalledWith(
      baseConfig.corpusDir,
      mockCorpusRun,
      expect.any(String),
      [],
      [
        {
          stepIndex: 0,
          contractId: "clickHistoryMenuMain",
          stateId: "homePage",
          error: "locator boom",
        },
      ],
      ["probe", "snapshot"],
    );

    if (savedImpl) mockGetByRole.mockImplementation(savedImpl);
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
      baseConfig.corpusDir,
      mockCorpusRun,
      expect.any(String),
      [],
      [
        {
          stepIndex: 0,
          contractId: "clickHistoryMenuMain",
          stateId: "homePage",
          error: "settle boom",
        },
      ],
      ["probe", "snapshot"],
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
      baseConfig.corpusDir,
      mockCorpusRun,
      expect.any(String),
      [],
      [
        {
          stepIndex: 0,
          contractId: "clickHistoryMenuMain",
          stateId: "homePage",
          error: "locator boom",
        },
      ],
      ["probe", "snapshot"],
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
    expect(collectors.network).not.toHaveBeenCalled();
    expect(collectors.screenshot).not.toHaveBeenCalled();
    // The manifest records the planned post-step set.
    expect(finishRun).toHaveBeenCalledWith(
      baseConfig.corpusDir,
      mockCorpusRun,
      expect.any(String),
      [],
      [],
      ["probe", "snapshot"],
    );
  });

  it("fails fast when a contract declares view-selected but the plan lacks a selected-view probe", async () => {
    const plan = makePlan([
      {
        id: "needs-probe",
        steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
      },
    ]);

    await expect(
      runTestPlan(plan, { ...baseConfig, probes: [] }),
    ).rejects.toThrow(/not configured: selected-view/);
  });
});
