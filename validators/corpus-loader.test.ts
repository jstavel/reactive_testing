import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { finishRun, startCorpusRun, writeCorpusFile } from "../orchestrator/corpus.js";
import type { CollectorName, CorpusRun, TestPlan } from "../model/schemas.js";
import { loadCorpusSteps } from "./corpus-loader.js";

let tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

function makeCorpusDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "corpus-loader-test-"));
  tempDirs.push(dir);
  return dir;
}

/** Write the run-manifest so the loader can discover the file list. */
function finish(corpusDir: string, run: CorpusRun, collectors: CollectorName[] = ["snapshot", "probe"]): void {
  finishRun(corpusDir, run, "2026-09-01T00:00:00.000Z", [], [], collectors);
}

function writeSnapshot(
  corpusDir: string,
  run: CorpusRun,
  stepIndex: number,
  record: { stateId: string; url: string; capturedAt: string },
  stem?: string,
): void {
  writeCorpusFile(
    corpusDir,
    run,
    "snapshots",
    stepIndex,
    "json",
    JSON.stringify({ ...record, snapshot: "" }),
    stem,
  );
}

function writeProbes(
  corpusDir: string,
  run: CorpusRun,
  stepIndex: number,
  probes: Array<{ name: string; value: string; capturedAt: string }>,
): void {
  writeCorpusFile(corpusDir, run, "probes", stepIndex, "json", JSON.stringify(probes));
}

const twoStepPlan: TestPlan = {
  planId: "smoke",
  modelVersion: "x",
  scenarios: [
    { id: "s1", steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }] },
    { id: "s2", steps: [{ stateId: "homePage", contractId: "clickHistoryMenuFutures" }] },
  ],
};

describe("loadCorpusSteps", () => {
  it("rebuilds satisfied evidence (pre/post + probes) per step, tagged with contractId (OFFLINE_SATISFIED)", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();

    writeSnapshot(corpusDir, run, 0, { stateId: "homePage", url: "https://pro.kraken.com/app/home", capturedAt: "t" }, "0.pre");
    writeSnapshot(corpusDir, run, 0, { stateId: "historyMain", url: "https://pro.kraken.com/app/history/main/ledger", capturedAt: "t" });
    writeProbes(corpusDir, run, 0, [{ name: "selected-view", value: "Ledger", capturedAt: "t" }]);
    writeSnapshot(corpusDir, run, 1, { stateId: "homePage", url: "https://pro.kraken.com/app/home", capturedAt: "t" }, "1.pre");
    finish(corpusDir, run);

    const steps = loadCorpusSteps(corpusDir, run.runId, twoStepPlan);

    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({
      stepIndex: 0,
      contractId: "clickHistoryMenuMain",
      evidence: {
        pre: { stateId: "homePage", url: "https://pro.kraken.com/app/home", snapshot: "", capturedAt: "t" },
        post: { stateId: "historyMain", url: "https://pro.kraken.com/app/history/main/ledger", snapshot: "", capturedAt: "t" },
        probes: [{ name: "selected-view", value: "Ledger", capturedAt: "t" }],
      },
    });
    // Global counter walks scenarios: step 1 is the second scenario's step.
    expect(steps[1]!.stepIndex).toBe(1);
    expect(steps[1]!.contractId).toBe("clickHistoryMenuFutures");
  });

  it("preserves the recorded (violating) post-state instead of guessing (OFFLINE_VIOLATED)", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();

    writeSnapshot(corpusDir, run, 0, { stateId: "homePage", url: "https://pro.kraken.com/app/home", capturedAt: "t" }, "0.pre");
    writeSnapshot(corpusDir, run, 0, { stateId: "historyMain", url: "https://pro.kraken.com/app/history/main/wrong", capturedAt: "t" });
    writeProbes(corpusDir, run, 0, [{ name: "selected-view", value: "Orders", capturedAt: "t" }]);
    finish(corpusDir, run);

    const steps = loadCorpusSteps(corpusDir, run.runId, twoStepPlan);

    expect(steps[0]!.evidence.post?.url).toBe("https://pro.kraken.com/app/history/main/wrong");
    expect(steps[0]!.evidence.probes).toEqual([
      { name: "selected-view", value: "Orders", capturedAt: "t" },
    ]);
  });

  it("yields undefined post evidence when the post-snapshot file is absent from the manifest (MISSING_EVIDENCE)", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();

    writeSnapshot(corpusDir, run, 0, { stateId: "homePage", url: "https://pro.kraken.com/app/home", capturedAt: "t" }, "0.pre");
    // No post snapshot written — a collector gap leaves it out of manifest files.
    finish(corpusDir, run);

    const steps = loadCorpusSteps(corpusDir, run.runId, twoStepPlan);

    expect(steps[0]!.evidence.post).toBeUndefined();
    expect(steps[0]!.evidence.pre).toBeDefined();
  });

  it("yields undefined probes when the probe file is absent from the manifest (COLLECTOR_GAP_ONLY)", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();

    writeSnapshot(corpusDir, run, 0, { stateId: "homePage", url: "https://pro.kraken.com/app/home", capturedAt: "t" }, "0.pre");
    writeSnapshot(corpusDir, run, 0, { stateId: "historyMain", url: "https://pro.kraken.com/app/history/main/ledger", capturedAt: "t" });
    // No probe file written — a probe collector gap.
    finish(corpusDir, run);

    const steps = loadCorpusSteps(corpusDir, run.runId, twoStepPlan);

    expect(steps[0]!.evidence.probes).toBeUndefined();
    expect(steps[0]!.evidence.post).toBeDefined();
  });

  it("preserves each occurrence of a repeated contract as its own StepEvidence (REPEATED_CONTRACT)", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();

    const repeatedPlan: TestPlan = {
      planId: "smoke",
      modelVersion: "x",
      scenarios: [
        {
          id: "s1",
          steps: [
            { stateId: "homePage", contractId: "openPortfolioSummary" },
            { stateId: "homePage", contractId: "openPortfolioSummary" },
          ],
        },
      ],
    };

    writeSnapshot(corpusDir, run, 0, { stateId: "homePage", url: "https://pro.kraken.com/app/home", capturedAt: "t" }, "0.pre");
    writeSnapshot(corpusDir, run, 0, { stateId: "portfolioSummaryDialog", url: "https://pro.kraken.com/app/home", capturedAt: "t" });
    writeSnapshot(corpusDir, run, 1, { stateId: "homePage", url: "https://pro.kraken.com/app/home", capturedAt: "t" }, "1.pre");
    writeSnapshot(corpusDir, run, 1, { stateId: "portfolioSummaryDialog", url: "https://pro.kraken.com/app/home", capturedAt: "t" });
    finish(corpusDir, run);

    const steps = loadCorpusSteps(corpusDir, run.runId, repeatedPlan);

    expect(steps).toHaveLength(2);
    expect(steps[0]!.stepIndex).toBe(0);
    expect(steps[0]!.contractId).toBe("openPortfolioSummary");
    expect(steps[1]!.stepIndex).toBe(1);
    expect(steps[1]!.contractId).toBe("openPortfolioSummary");
    expect(steps[0]!.evidence.post?.stateId).toBe("portfolioSummaryDialog");
    expect(steps[1]!.evidence.post?.stateId).toBe("portfolioSummaryDialog");
  });

  it("returns [] for an unknown runId/dir (UNKNOWN_RUN)", () => {
    const corpusDir = makeCorpusDir();
    expect(loadCorpusSteps(corpusDir, "does-not-exist", twoStepPlan)).toEqual([]);
  });

  it("is deterministic: the same run loads identical evidence twice (DETERMINISM)", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();

    writeSnapshot(corpusDir, run, 0, { stateId: "homePage", url: "https://pro.kraken.com/app/home", capturedAt: "t" }, "0.pre");
    writeSnapshot(corpusDir, run, 0, { stateId: "historyMain", url: "https://pro.kraken.com/app/history/main/ledger", capturedAt: "t" });
    finish(corpusDir, run);

    const a = loadCorpusSteps(corpusDir, run.runId, twoStepPlan);
    const b = loadCorpusSteps(corpusDir, run.runId, twoStepPlan);

    expect(a).toEqual(b);
  });

  it("degrades to undefined evidence for a listed-but-corrupt file instead of throwing", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();

    writeSnapshot(corpusDir, run, 0, { stateId: "homePage", url: "https://pro.kraken.com/app/home", capturedAt: "t" }, "0.pre");
    // The post-snapshot path IS listed in the manifest files, but the on-disk
    // file is corrupt (invalid JSON) — the loader must yield undefined post
    // evidence rather than throw.
    writeCorpusFile(corpusDir, run, "snapshots", 0, "json", "{not valid json!!");
    // A listed-but-physically-missing file also degrades (probe batch).
    writeCorpusFile(corpusDir, run, "probes", 0, "json", "[]");
    finish(corpusDir, run);
    // Physically remove the (listed) probe file so only the manifest knows it.
    rmSync(join(corpusDir, `probes/${run.runId}/0.json`), { force: true });

    expect(() => loadCorpusSteps(corpusDir, run.runId, twoStepPlan)).not.toThrow();
    const steps = loadCorpusSteps(corpusDir, run.runId, twoStepPlan);

    expect(steps[0]!.evidence.post).toBeUndefined();
    expect(steps[0]!.evidence.probes).toBeUndefined();
    // The pre snapshot still loads fine.
    expect(steps[0]!.evidence.pre).toBeDefined();
  });

  it("returns [] for a malformed plan instead of throwing (PATCH 3)", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();
    writeSnapshot(corpusDir, run, 0, { stateId: "homePage", url: "https://pro.kraken.com/app/home", capturedAt: "t" }, "0.pre");
    writeSnapshot(corpusDir, run, 0, { stateId: "historyMain", url: "https://pro.kraken.com/app/history/main/ledger", capturedAt: "t" });
    finish(corpusDir, run);

    expect(loadCorpusSteps(corpusDir, run.runId, null as unknown as TestPlan)).toEqual([]);
    expect(
      loadCorpusSteps(corpusDir, run.runId, { scenarios: "nope" } as unknown as TestPlan),
    ).toEqual([]);
  });

  it("defensively skips malformed scenarios/steps rather than throwing", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();
    writeSnapshot(corpusDir, run, 0, { stateId: "homePage", url: "https://pro.kraken.com/app/home", capturedAt: "t" }, "0.pre");
    writeSnapshot(corpusDir, run, 0, { stateId: "historyMain", url: "https://pro.kraken.com/app/history/main/ledger", capturedAt: "t" });
    finish(corpusDir, run);

    const plan = {
      scenarios: [
        // A scenario with a malformed (non-array) steps.
        { id: "bad", steps: "nope" },
        // A scenario with a step lacking a string contractId (skipped).
        { id: "bad2", steps: [{ stateId: "homePage", contractId: 42 }] },
        // A well-formed scenario that still loads.
        { id: "good", steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }] },
      ],
    } as unknown as TestPlan;

    const steps = loadCorpusSteps(corpusDir, run.runId, plan);
    expect(steps).toHaveLength(1);
    expect(steps[0]!.stepIndex).toBe(0);
    expect(steps[0]!.contractId).toBe("clickHistoryMenuMain");
    expect(steps[0]!.evidence.post).toBeDefined();
  });
});
