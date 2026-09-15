import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import type { CorpusRun, TestPlan } from "../model/schemas.js";
import { validationResultSchema } from "../model/schemas.js";
import { smokeTestPlan } from "../model/smoke.test-plan.js";
import { finishRun, startCorpusRun, writeCorpusFile } from "../orchestrator/corpus.js";
import { crossViewInvariants } from "./cross-view.js";
import { runValidatorsOffline } from "./offline-runner.js";
import { validatorMap } from "./validator-map.js";

let tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

function makeCorpusDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "offline-runner-test-"));
  tempDirs.push(dir);
  return dir;
}

function writeSnapshot(
  corpusDir: string,
  run: CorpusRun,
  stepIndex: number,
  record: { stateId: string; url: string },
  stem?: string,
): void {
  writeCorpusFile(
    corpusDir,
    run,
    "snapshots",
    stepIndex,
    "json",
    JSON.stringify({ ...record, snapshot: "", capturedAt: "t" }),
    stem,
  );
}

function writeProbes(
  corpusDir: string,
  run: CorpusRun,
  stepIndex: number,
  values: Array<{ name: string; value: string }>,
): void {
  writeCorpusFile(
    corpusDir,
    run,
    "probes",
    stepIndex,
    "json",
    JSON.stringify(values.map((p) => ({ ...p, capturedAt: "t" }))),
  );
}

function finish(corpusDir: string, run: CorpusRun): void {
  finishRun(corpusDir, run, "2026-09-01T00:00:00.000Z", "plan-hash", [], [], ["snapshot", "probe"]);
}

function runContractValidators(corpusDir: string, runId: string, plan: TestPlan) {
  return runValidatorsOffline(
    corpusDir,
    runId,
    plan,
    plan.scenarios.flatMap((scenario) => scenario.steps.map((step) => step.contractId)),
  );
}

describe("runValidatorsOffline", () => {
  it("re-validates a recorded run end-to-end, producing conforming results (satisfied + violated)", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();

    // Step 0: clickHistoryMenuMain — satisfied (pre state + post url/view match).
    writeSnapshot(
      corpusDir,
      run,
      0,
      { stateId: "homePage", url: "https://pro.kraken.com/app/home" },
      "0.pre",
    );
    writeSnapshot(corpusDir, run, 0, {
      stateId: "historyMain",
      url: "https://pro.kraken.com/app/history/main/ledger",
    });
    writeProbes(corpusDir, run, 0, [{ name: "selected-view", value: "Ledger" }]);

    // Step 1: clickHistoryMenuFutures — violated (wrong post url pathname).
    writeSnapshot(
      corpusDir,
      run,
      1,
      { stateId: "homePage", url: "https://pro.kraken.com/app/home" },
      "1.pre",
    );
    writeSnapshot(corpusDir, run, 1, {
      stateId: "derivatives",
      url: "https://pro.kraken.com/app/history/main/ledger",
    });
    writeProbes(corpusDir, run, 1, [{ name: "selected-view", value: "Ledger" }]);

    finish(corpusDir, run);

    const results = runValidatorsOffline(corpusDir, run.runId, smokeTestPlan);

    // Every result conforms to the ValidationResult shape (AD-14).
    for (const result of results) {
      expect(validationResultSchema.safeParse(result).success).toBe(true);
    }

    const satisfied = results.filter((r) => r.contractId === "clickHistoryMenuMain");
    expect(satisfied).toHaveLength(1);
    expect(satisfied[0]!.passed).toBe(true);
    expect(satisfied[0]!.details).toBeUndefined();
    expect(satisfied[0]!.corpusRefs).toEqual(
      expect.arrayContaining(["snapshot:pre", "snapshot:post", "probe:selected-view"]),
    );

    const violated = results.filter((r) => r.contractId === "clickHistoryMenuFutures");
    expect(violated).toHaveLength(1);
    expect(violated[0]!.passed).toBe(false);
    expect(violated[0]!.details).toContain("url-is");
  });

  it("appends a passing cross-view result after contract results", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();
    const plan: TestPlan = {
      planId: "smoke",
      modelVersion: "x",
      scenarios: [
        { id: "open", steps: [{ stateId: "homePage", contractId: "openPortfolioSummary" }] },
        {
          id: "close",
          steps: [{ stateId: "portfolioSummaryDialog", contractId: "closePortfolioSummary" }],
        },
      ],
    };
    writeSnapshot(corpusDir, run, 0, { stateId: "portfolioSummaryDialog", url: "home" });
    writeProbes(corpusDir, run, 0, [{ name: "portfolio-value", value: "100.00" }]);
    writeSnapshot(corpusDir, run, 1, { stateId: "homePage", url: "home" });
    writeProbes(corpusDir, run, 1, [{ name: "portfolio-value", value: "100.00" }]);
    finish(corpusDir, run);
    const results = runValidatorsOffline(corpusDir, run.runId, plan);
    expect(results.at(-1)).toMatchObject({
      contractId: "current-portfolio-value-agrees-across-surfaces",
      passed: true,
    });
  });

  it("fails divergent values through the offline runner", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();
    const plan: TestPlan = {
      planId: "smoke",
      modelVersion: "x",
      scenarios: [
        { id: "open", steps: [{ stateId: "homePage", contractId: "openPortfolioSummary" }] },
        {
          id: "close",
          steps: [{ stateId: "portfolioSummaryDialog", contractId: "closePortfolioSummary" }],
        },
      ],
    };
    writeSnapshot(corpusDir, run, 0, { stateId: "portfolioSummaryDialog", url: "home" });
    writeProbes(corpusDir, run, 0, [{ name: "portfolio-value", value: "100.00" }]);
    writeSnapshot(corpusDir, run, 1, { stateId: "homePage", url: "home" });
    writeProbes(corpusDir, run, 1, [{ name: "portfolio-value", value: "101.00" }]);
    finish(corpusDir, run);
    const result = runValidatorsOffline(corpusDir, run.runId, plan).at(-1);
    expect(result).toMatchObject({
      contractId: "current-portfolio-value-agrees-across-surfaces",
      passed: false,
    });
    expect(result?.details).toContain('surface "homePage" shows "101.00"');
    expect(result?.details).toContain('surface "portfolioSummaryDialog" shows "100.00"');
  });

  it("fails the invariant when the run manifest is invalid (no silent count shrink)", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();
    const plan: TestPlan = {
      planId: "smoke",
      modelVersion: "x",
      scenarios: [
        { id: "open", steps: [{ stateId: "homePage", contractId: "openPortfolioSummary" }] },
      ],
    };
    finish(corpusDir, run);
    writeFileSync(join(corpusDir, run.runId, "run-manifest.json"), "{not json");
    const results = runValidatorsOffline(corpusDir, run.runId, plan);
    expect(results).toContainEqual(
      expect.objectContaining({
        contractId: "openPortfolioSummary",
        passed: false,
        details: "cannot validate: run manifest invalid",
      }),
    );
    expect(results).toContainEqual(
      expect.objectContaining({
        contractId: "current-portfolio-value-agrees-across-surfaces",
        passed: false,
        details: "cannot validate: run manifest invalid",
      }),
    );
  });

  it("fails the invariant when the plan is malformed (never vanishes)", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();
    finish(corpusDir, run);
    const malformedPlan: TestPlan = {
      planId: "smoke",
      modelVersion: "x",
      scenarios: [
        {
          id: "broken",
          steps: "not-an-array" as unknown as TestPlan["scenarios"][number]["steps"],
        },
      ],
    };
    const results = runValidatorsOffline(corpusDir, run.runId, malformedPlan);
    expect(results).toContainEqual(
      expect.objectContaining({
        contractId: "current-portfolio-value-agrees-across-surfaces",
        passed: false,
        details: "cannot validate: plan malformed",
      }),
    );
  });

  it("runs only selected invariants when the registry has multiple entries", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();
    const plan: TestPlan = {
      planId: "smoke",
      modelVersion: "x",
      scenarios: [
        { id: "open", steps: [{ stateId: "homePage", contractId: "openPortfolioSummary" }] },
      ],
    };
    finish(corpusDir, run);
    crossViewInvariants.push({ ...crossViewInvariants[0]!, invariantId: "second-invariant" });
    try {
      const results = runValidatorsOffline(corpusDir, run.runId, plan, [
        "current-portfolio-value-agrees-across-surfaces",
      ]);
      expect(results).toHaveLength(1);
      expect(results[0]?.contractId).toBe("current-portfolio-value-agrees-across-surfaces");
    } finally {
      crossViewInvariants.pop();
    }
  });

  it("returns [] for an unknown run (UNKNOWN_RUN mirror)", () => {
    const corpusDir = makeCorpusDir();
    expect(runValidatorsOffline(corpusDir, "nope", smokeTestPlan)).toEqual([]);
  });

  it("narrows validation to a contractIds subset (PLAN_FILTER)", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();

    writeSnapshot(
      corpusDir,
      run,
      0,
      { stateId: "homePage", url: "https://pro.kraken.com/app/home" },
      "0.pre",
    );
    writeSnapshot(corpusDir, run, 0, {
      stateId: "historyMain",
      url: "https://pro.kraken.com/app/history/main/ledger",
    });
    writeProbes(corpusDir, run, 0, [{ name: "selected-view", value: "Ledger" }]);

    writeSnapshot(
      corpusDir,
      run,
      2,
      { stateId: "homePage", url: "https://pro.kraken.com/app/home" },
      "2.pre",
    );
    writeSnapshot(corpusDir, run, 2, {
      stateId: "portfolioOverview",
      url: "https://pro.kraken.com/app/portfolio/overview",
    });
    writeProbes(corpusDir, run, 2, [{ name: "selected-view", value: "overview" }]);

    finish(corpusDir, run);

    const filtered = runValidatorsOffline(corpusDir, run.runId, smokeTestPlan, [
      "clickHistoryMenuMain",
    ]);

    expect(filtered.length).toBeGreaterThan(0);
    for (const result of filtered) {
      expect(result.contractId).toBe("clickHistoryMenuMain");
    }
    // The subset only ever produces results for the requested contract.
    expect(filtered.some((r) => r.contractId === "clickPortfolioMenuOverview")).toBe(false);
  });

  it("is deterministic: the same run yields identical results twice (DETERMINISM)", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();

    writeSnapshot(
      corpusDir,
      run,
      0,
      { stateId: "homePage", url: "https://pro.kraken.com/app/home" },
      "0.pre",
    );
    writeSnapshot(corpusDir, run, 0, {
      stateId: "historyMain",
      url: "https://pro.kraken.com/app/history/main/ledger",
    });
    writeProbes(corpusDir, run, 0, [{ name: "selected-view", value: "Ledger" }]);
    finish(corpusDir, run);

    const a = runValidatorsOffline(corpusDir, run.runId, smokeTestPlan);
    const b = runValidatorsOffline(corpusDir, run.runId, smokeTestPlan);

    expect(a).toEqual(b);
  });

  it("re-validates recorded evidence with a new rule without re-running the scenario (FR-6)", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();

    // A run recorded earlier, before the "new rule" existed. Only its evidence
    // is on disk — nothing here launches a browser or re-navigates.
    writeSnapshot(
      corpusDir,
      run,
      0,
      { stateId: "homePage", url: "https://pro.kraken.com/app/home" },
      "0.pre",
    );
    writeSnapshot(corpusDir, run, 0, {
      stateId: "historyMain",
      url: "https://pro.kraken.com/app/history/main/ledger",
    });
    writeProbes(corpusDir, run, 0, [{ name: "selected-view", value: "Ledger" }]);
    finish(corpusDir, run);

    // The "new rule" is registered in the validator map AFTER the run was
    // recorded — it only reads the recorded evidence, never re-runs the app.
    const NEW_CONTRACT = "revalidateRecordedEvidence";
    validatorMap[NEW_CONTRACT] = [
      (evidence) => ({
        contractId: NEW_CONTRACT,
        passed: evidence.post?.url === "https://pro.kraken.com/app/history/main/ledger",
        corpusRefs: ["snapshot:post"],
      }),
    ];
    try {
      const plan: TestPlan = {
        planId: "smoke",
        modelVersion: "x",
        scenarios: [{ id: "s1", steps: [{ stateId: "homePage", contractId: NEW_CONTRACT }] }],
      };

      const results = runContractValidators(corpusDir, run.runId, plan);

      // The outcome derives purely from the recorded (unchanged) evidence.
      expect(results).toHaveLength(1);
      expect(results[0]!.contractId).toBe(NEW_CONTRACT);
      expect(results[0]!.passed).toBe(true);
      expect(results[0]!.corpusRefs).toEqual(["snapshot:post"]);
    } finally {
      delete validatorMap[NEW_CONTRACT];
    }
  });

  it("reports an unknown contract instead of dropping its expected check", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();
    finish(corpusDir, run);
    const plan: TestPlan = {
      planId: "smoke",
      modelVersion: "x",
      scenarios: [
        { id: "unknown", steps: [{ stateId: "homePage", contractId: "missingContract" }] },
      ],
    };
    expect(runContractValidators(corpusDir, run.runId, plan)).toEqual([
      expect.objectContaining({
        contractId: "missingContract",
        passed: false,
        details: "missingContract — unvalidated gap",
      }),
    ]);
  });

  it("reports manifest and file corruption without vacuous passes", () => {
    const corpusDir = makeCorpusDir();
    const invalidRun = startCorpusRun();
    finish(corpusDir, invalidRun);
    writeFileSync(join(corpusDir, invalidRun.runId, "run-manifest.json"), "{not json");
    const oneStep: TestPlan = {
      planId: "smoke",
      modelVersion: "x",
      scenarios: [
        { id: "one", steps: [{ stateId: "homePage", contractId: "openPortfolioSummary" }] },
      ],
    };
    expect(runContractValidators(corpusDir, invalidRun.runId, oneStep)).toEqual([
      expect.objectContaining({
        contractId: "openPortfolioSummary",
        passed: false,
        details: "cannot validate: run manifest invalid",
      }),
    ]);

    const corruptRun = startCorpusRun();
    writeCorpusFile(corpusDir, corruptRun, "snapshots", 0, "json", "{not json");
    finish(corpusDir, corruptRun);
    const INDEPENDENT = "__independentValidator";
    validatorMap[INDEPENDENT] = [() => ({ contractId: INDEPENDENT, passed: true, corpusRefs: [] })];
    try {
      const corruptPlan = {
        ...oneStep,
        scenarios: [{ id: "one", steps: [{ stateId: "homePage", contractId: INDEPENDENT }] }],
      };
      const results = runContractValidators(corpusDir, corruptRun.runId, corruptPlan);
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        contractId: INDEPENDENT,
        passed: false,
        details: expect.stringContaining(`snapshots/${corruptRun.runId}/0.json`),
      });
    } finally {
      delete validatorMap[INDEPENDENT];
    }
  });

  it("fails schema-invalid evidence and preserves missing-file validator failures", () => {
    const corpusDir = makeCorpusDir();
    const schemaRun = startCorpusRun();
    writeCorpusFile(corpusDir, schemaRun, "probes", 0, "json", "{}");
    finish(corpusDir, schemaRun);
    const INDEPENDENT = "__schemaIndependentValidator";
    validatorMap[INDEPENDENT] = [() => ({ contractId: INDEPENDENT, passed: true, corpusRefs: [] })];
    try {
      const plan: TestPlan = {
        planId: "smoke",
        modelVersion: "x",
        scenarios: [{ id: "one", steps: [{ stateId: "homePage", contractId: INDEPENDENT }] }],
      };
      const schemaResults = runContractValidators(corpusDir, schemaRun.runId, plan);
      expect(schemaResults).toContainEqual(
        expect.objectContaining({
          contractId: INDEPENDENT,
          passed: false,
          details: expect.stringContaining(`probes/${schemaRun.runId}/0.json`),
        }),
      );
    } finally {
      delete validatorMap[INDEPENDENT];
    }

    const missingRun = startCorpusRun();
    const relPath = writeCorpusFile(corpusDir, missingRun, "probes", 0, "json", "[]");
    finish(corpusDir, missingRun);
    rmSync(join(corpusDir, relPath), { force: true });
    const missingPlan: TestPlan = {
      planId: "smoke",
      modelVersion: "x",
      scenarios: [
        { id: "one", steps: [{ stateId: "homePage", contractId: "openPortfolioSummary" }] },
      ],
    };
    const missingResults = runContractValidators(corpusDir, missingRun.runId, missingPlan);
    expect(missingResults).toHaveLength(1);
    expect(missingResults[0]?.details).toContain("missing snapshot evidence");
    expect(missingResults[0]?.details).not.toContain("corrupt file");
  });

  it("suppresses all passing results when plan alignment is malformed", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();
    writeSnapshot(
      corpusDir,
      run,
      0,
      { stateId: "homePage", url: "https://pro.kraken.com/app/home" },
      "0.pre",
    );
    writeSnapshot(corpusDir, run, 0, {
      stateId: "portfolioSummaryDialog",
      url: "https://pro.kraken.com/app/home",
    });
    writeSnapshot(
      corpusDir,
      run,
      1,
      { stateId: "homePage", url: "https://pro.kraken.com/app/home" },
      "1.pre",
    );
    writeSnapshot(corpusDir, run, 1, {
      stateId: "portfolioSummaryDialog",
      url: "https://pro.kraken.com/app/home",
    });
    writeFileSync(
      join(corpusDir, "snapshots", run.runId, "0.json"),
      JSON.stringify({
        stateId: "portfolioSummaryDialog",
        url: "https://pro.kraken.com/app/home",
        snapshot: '<div role="dialog">portfolio</div>',
        capturedAt: "t",
      }),
    );
    writeFileSync(
      join(corpusDir, "snapshots", run.runId, "1.json"),
      JSON.stringify({
        stateId: "portfolioSummaryDialog",
        url: "https://pro.kraken.com/app/home",
        snapshot: '<div role="dialog">portfolio</div>',
        capturedAt: "t",
      }),
    );
    finish(corpusDir, run);
    const plan = {
      planId: "smoke",
      modelVersion: "x",
      scenarios: [
        { id: "bad", steps: [{ stateId: "homePage", contractId: 42 }] },
        { id: "good", steps: [{ stateId: "homePage", contractId: "openPortfolioSummary" }] },
      ],
    } as unknown as TestPlan;
    const wellFormedPlan: TestPlan = {
      planId: "smoke",
      modelVersion: "x",
      scenarios: [
        { id: "good", steps: [{ stateId: "homePage", contractId: "openPortfolioSummary" }] },
      ],
    };
    expect(runContractValidators(corpusDir, run.runId, wellFormedPlan)).toEqual([
      expect.objectContaining({ contractId: "openPortfolioSummary", passed: true }),
    ]);
    const results = runContractValidators(corpusDir, run.runId, plan);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(({ contractId, passed }) => contractId === "(corpus)" && !passed)).toBe(
      true,
    );
  });

  it("does not report a collector gap as a reconciliation gap", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();
    finish(corpusDir, run);
    const plan: TestPlan = {
      planId: "smoke",
      modelVersion: "x",
      scenarios: [
        { id: "one", steps: [{ stateId: "homePage", contractId: "openPortfolioSummary" }] },
      ],
    };
    const results = runContractValidators(corpusDir, run.runId, plan);
    expect(results).toHaveLength(1);
    expect(results[0]?.contractId).toBe("openPortfolioSummary");
    expect(results[0]?.details).not.toContain("corrupt");
  });

  it("does not throw when a validator throws, and still returns the non-throwing results (PATCH 4)", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();

    // Thrower fails for the whole run.
    writeSnapshot(
      corpusDir,
      run,
      0,
      { stateId: "homePage", url: "https://pro.kraken.com/app/home" },
      "0.pre",
    );
    writeSnapshot(corpusDir, run, 0, {
      stateId: "historyMain",
      url: "https://pro.kraken.com/app/history/main/ledger",
    });
    writeProbes(corpusDir, run, 0, [{ name: "selected-view", value: "Ledger" }]);

    // A well-behaved contract that still validates.
    writeSnapshot(
      corpusDir,
      run,
      1,
      { stateId: "homePage", url: "https://pro.kraken.com/app/home" },
      "1.pre",
    );
    writeSnapshot(corpusDir, run, 1, {
      stateId: "portfolioOverview",
      url: "https://pro.kraken.com/app/portfolio/overview",
    });
    writeProbes(corpusDir, run, 1, [{ name: "selected-view", value: "overview" }]);

    finish(corpusDir, run);

    const THROWING = "__throwingValidator";
    validatorMap[THROWING] = [
      () => {
        throw new Error("boom");
      },
    ];
    try {
      const plan: TestPlan = {
        planId: "smoke",
        modelVersion: "x",
        scenarios: [
          // Step 0: throwing contract — its validator throws and is skipped.
          { id: "s1", steps: [{ stateId: "homePage", contractId: THROWING }] },
          // Step 1: well-behaved — still produces a result after the throw was absorbed.
          { id: "s2", steps: [{ stateId: "homePage", contractId: "clickPortfolioMenuOverview" }] },
        ],
      };

      expect(() => runContractValidators(corpusDir, run.runId, plan)).not.toThrow();

      const results = runContractValidators(corpusDir, run.runId, plan);
      expect(results).toContainEqual(
        expect.objectContaining({
          contractId: THROWING,
          passed: false,
          details: expect.stringContaining("validator threw"),
        }),
      );
      expect(results.some((r) => r.contractId === "clickPortfolioMenuOverview")).toBe(true);
    } finally {
      delete validatorMap[THROWING];
    }
  });
});
