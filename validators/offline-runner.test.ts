import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { finishRun, startCorpusRun, writeCorpusFile } from "../orchestrator/corpus.js";
import type { CorpusRun, TestPlan } from "../model/schemas.js";
import { validationResultSchema } from "../model/schemas.js";
import { smokeTestPlan } from "../model/smoke.test-plan.js";
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
  finishRun(corpusDir, run, "2026-09-01T00:00:00.000Z", [], [], ["snapshot", "probe"]);
}

describe("runValidatorsOffline", () => {
  it("re-validates a recorded run end-to-end, producing conforming results (satisfied + violated)", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();

    // Step 0: clickHistoryMenuMain — satisfied (pre state + post url/view match).
    writeSnapshot(corpusDir, run, 0, { stateId: "homePage", url: "https://pro.kraken.com/app/home" }, "0.pre");
    writeSnapshot(corpusDir, run, 0, { stateId: "historyMain", url: "https://pro.kraken.com/app/history/main/ledger" });
    writeProbes(corpusDir, run, 0, [{ name: "selected-view", value: "Ledger" }]);

    // Step 1: clickHistoryMenuFutures — violated (wrong post url pathname).
    writeSnapshot(corpusDir, run, 1, { stateId: "homePage", url: "https://pro.kraken.com/app/home" }, "1.pre");
    writeSnapshot(corpusDir, run, 1, { stateId: "derivatives", url: "https://pro.kraken.com/app/history/main/ledger" });
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

  it("returns [] for an unknown run (UNKNOWN_RUN mirror)", () => {
    const corpusDir = makeCorpusDir();
    expect(runValidatorsOffline(corpusDir, "nope", smokeTestPlan)).toEqual([]);
  });

  it("narrows validation to a contractIds subset (PLAN_FILTER)", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();

    writeSnapshot(corpusDir, run, 0, { stateId: "homePage", url: "https://pro.kraken.com/app/home" }, "0.pre");
    writeSnapshot(corpusDir, run, 0, { stateId: "historyMain", url: "https://pro.kraken.com/app/history/main/ledger" });
    writeProbes(corpusDir, run, 0, [{ name: "selected-view", value: "Ledger" }]);

    writeSnapshot(corpusDir, run, 2, { stateId: "homePage", url: "https://pro.kraken.com/app/home" }, "2.pre");
    writeSnapshot(corpusDir, run, 2, { stateId: "portfolioOverview", url: "https://pro.kraken.com/app/portfolio/overview" });
    writeProbes(corpusDir, run, 2, [{ name: "selected-view", value: "overview" }]);

    finish(corpusDir, run);

    const filtered = runValidatorsOffline(
      corpusDir,
      run.runId,
      smokeTestPlan,
      ["clickHistoryMenuMain"],
    );

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

    writeSnapshot(corpusDir, run, 0, { stateId: "homePage", url: "https://pro.kraken.com/app/home" }, "0.pre");
    writeSnapshot(corpusDir, run, 0, { stateId: "historyMain", url: "https://pro.kraken.com/app/history/main/ledger" });
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
    writeSnapshot(corpusDir, run, 0, { stateId: "homePage", url: "https://pro.kraken.com/app/home" }, "0.pre");
    writeSnapshot(corpusDir, run, 0, { stateId: "historyMain", url: "https://pro.kraken.com/app/history/main/ledger" });
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
        scenarios: [
          { id: "s1", steps: [{ stateId: "homePage", contractId: NEW_CONTRACT }] },
        ],
      };

      const results = runValidatorsOffline(corpusDir, run.runId, plan);

      // The outcome derives purely from the recorded (unchanged) evidence.
      expect(results).toHaveLength(1);
      expect(results[0]!.contractId).toBe(NEW_CONTRACT);
      expect(results[0]!.passed).toBe(true);
      expect(results[0]!.corpusRefs).toEqual(["snapshot:post"]);
    } finally {
      delete validatorMap[NEW_CONTRACT];
    }
  });

  it("does not throw when a validator throws, and still returns the non-throwing results (PATCH 4)", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();

    // Thrower fails for the whole run.
    writeSnapshot(corpusDir, run, 0, { stateId: "homePage", url: "https://pro.kraken.com/app/home" }, "0.pre");
    writeSnapshot(corpusDir, run, 0, { stateId: "historyMain", url: "https://pro.kraken.com/app/history/main/ledger" });
    writeProbes(corpusDir, run, 0, [{ name: "selected-view", value: "Ledger" }]);

    // A well-behaved contract that still validates.
    writeSnapshot(corpusDir, run, 1, { stateId: "homePage", url: "https://pro.kraken.com/app/home" }, "1.pre");
    writeSnapshot(corpusDir, run, 1, { stateId: "portfolioOverview", url: "https://pro.kraken.com/app/portfolio/overview" });
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

      expect(() =>
        runValidatorsOffline(corpusDir, run.runId, plan),
      ).not.toThrow();

      const results = runValidatorsOffline(corpusDir, run.runId, plan);
      // The throwing validator's step yields no result; the non-throwing one does.
      expect(results.some((r) => r.contractId === THROWING)).toBe(false);
      expect(results.some((r) => r.contractId === "clickPortfolioMenuOverview")).toBe(true);
    } finally {
      delete validatorMap[THROWING];
    }
  });
});
