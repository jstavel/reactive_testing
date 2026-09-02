import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { finishRun, startCorpusRun, writeCorpusFile } from "../orchestrator/corpus.js";
import type { CorpusRun, TestPlan } from "../model/schemas.js";
import { validationResultSchema } from "../model/schemas.js";
import {
  crossViewInvariants,
  runCrossViewInvariants,
} from "./cross-view.js";

let tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

function makeCorpusDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "cross-view-test-"));
  tempDirs.push(dir);
  return dir;
}

/** A plan whose steps land (post-snapshot) on the two seed surfaces: step 0 →
 * homePage (closePortfolioSummary closes the dialog), step 1 →
 * portfolioSummaryDialog (openPortfolioSummary opens it). */
function twoSurfacePlan(): TestPlan {
  return {
    planId: "smoke",
    modelVersion: "x",
    scenarios: [
      { id: "s1", steps: [{ stateId: "portfolioSummaryDialog", contractId: "closePortfolioSummary" }] },
      { id: "s2", steps: [{ stateId: "homePage", contractId: "openPortfolioSummary" }] },
    ],
  };
}

function writePostSnapshot(
  corpusDir: string,
  run: CorpusRun,
  stepIndex: number,
  stateId: string,
): void {
  writeCorpusFile(
    corpusDir,
    run,
    "snapshots",
    stepIndex,
    "json",
    JSON.stringify({ stateId, url: "https://pro.kraken.com/app/home", snapshot: "", capturedAt: "t" }),
  );
}

function writeProbes(
  corpusDir: string,
  run: CorpusRun,
  stepIndex: number,
  values: Array<{ name: string; value: string; capturedAt?: string }>,
): void {
  writeCorpusFile(
    corpusDir,
    run,
    "probes",
    stepIndex,
    "json",
    JSON.stringify(values.map((p) => ({ ...p, capturedAt: p.capturedAt ?? "t" }))),
  );
}

function finish(corpusDir: string, run: CorpusRun): void {
  finishRun(corpusDir, run, "2026-09-01T00:00:00.000Z", [], [], ["snapshot", "probe"]);
}

const SEED_INVARIANT_ID = "current-portfolio-value-agrees-across-surfaces";

/** Run the cross-view invariants, returning only the seed invariant's result. */
function runSeed(corpusDir: string, run: CorpusRun, plan: TestPlan) {
  return runCrossViewInvariants(corpusDir, run.runId, plan).find(
    (result) => result.contractId === SEED_INVARIANT_ID,
  );
}

describe("runCrossViewInvariants", () => {
  it("AGREE: passes when every declared surface records the same fact value (FR-13)", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();

    writePostSnapshot(corpusDir, run, 0, "homePage");
    writeProbes(corpusDir, run, 0, [{ name: "portfolio-value", value: "5,034.89 USD" }]);
    writePostSnapshot(corpusDir, run, 1, "portfolioSummaryDialog");
    writeProbes(corpusDir, run, 1, [{ name: "portfolio-value", value: "5,034.89 USD" }]);
    finish(corpusDir, run);

    const results = runCrossViewInvariants(corpusDir, run.runId, twoSurfacePlan());
    // One result per declared invariant, each conforming to AD-14.
    expect(results).toHaveLength(crossViewInvariants.length);
    for (const result of results) {
      expect(validationResultSchema.safeParse(result).success).toBe(true);
    }

    const result = results.find((r) => r.contractId === SEED_INVARIANT_ID)!;
    expect(result.passed).toBe(true);
    expect(result.details).toBeUndefined();
    expect(result.corpusRefs).toEqual(["probe:portfolio-value@0", "probe:portfolio-value@1"]);
  });

  it("DIVERGE: diverging surfaces fail with the offending views and values named", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();

    writePostSnapshot(corpusDir, run, 0, "homePage");
    writeProbes(corpusDir, run, 0, [{ name: "portfolio-value", value: "5,034.89 USD" }]);
    writePostSnapshot(corpusDir, run, 1, "portfolioSummaryDialog");
    writeProbes(corpusDir, run, 1, [{ name: "portfolio-value", value: "6,001.00 USD" }]);
    finish(corpusDir, run);

    const result = runSeed(corpusDir, run, twoSurfacePlan());
    expect(result!.passed).toBe(false);
    expect(result!.details).toContain('surface "homePage" shows "5,034.89 USD"');
    expect(result!.details).toContain('surface "portfolioSummaryDialog" shows "6,001.00 USD"');
  });

  it("MISSING_SURFACE: a declared surface with no recorded probe fails naming the surface", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();

    writePostSnapshot(corpusDir, run, 0, "homePage");
    writeProbes(corpusDir, run, 0, [{ name: "portfolio-value", value: "5,034.89 USD" }]);
    // Step 1 lands on the dialog surface but records no portfolio-value probe.
    writePostSnapshot(corpusDir, run, 1, "portfolioSummaryDialog");
    writeProbes(corpusDir, run, 1, [{ name: "selected-view", value: "overview" }]);
    finish(corpusDir, run);

    const result = runSeed(corpusDir, run, twoSurfacePlan());
    expect(result!.passed).toBe(false);
    expect(result!.details).toContain('surface "portfolioSummaryDialog"');
    expect(result!.details).toContain('no "portfolio-value" probe recorded on this surface');
  });

  it("MISSING_SURFACE: an empty probe value is missing evidence, never a pass", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();

    writePostSnapshot(corpusDir, run, 0, "homePage");
    writeProbes(corpusDir, run, 0, [{ name: "portfolio-value", value: "5,034.89 USD" }]);
    writePostSnapshot(corpusDir, run, 1, "portfolioSummaryDialog");
    writeProbes(corpusDir, run, 1, [{ name: "portfolio-value", value: "  " }]);
    finish(corpusDir, run);

    const result = runSeed(corpusDir, run, twoSurfacePlan());
    expect(result!.passed).toBe(false);
    expect(result!.details).toContain('surface "portfolioSummaryDialog"');
    expect(result!.details).toContain('empty value');
  });

  it("NORMALIZE: formatting-only differences agree after the declared normalize (no false positive)", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();

    writePostSnapshot(corpusDir, run, 0, "homePage");
    writeProbes(corpusDir, run, 0, [{ name: "portfolio-value", value: "  5,034.89   USD  " }]);
    writePostSnapshot(corpusDir, run, 1, "portfolioSummaryDialog");
    writeProbes(corpusDir, run, 1, [{ name: "portfolio-value", value: "5,034.89 USD" }]);
    finish(corpusDir, run);

    const result = runSeed(corpusDir, run, twoSurfacePlan());
    expect(result!.passed).toBe(true);
    expect(result!.details).toBeUndefined();
  });

  it("agreement semantics: a pending-marker divergence declared irrelevant passes (no false positive)", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();

    writePostSnapshot(corpusDir, run, 0, "homePage");
    writeProbes(corpusDir, run, 0, [{ name: "purchase-status", value: "5,034.89 USD (pending)" }]);
    writePostSnapshot(corpusDir, run, 1, "portfolioSummaryDialog");
    writeProbes(corpusDir, run, 1, [{ name: "purchase-status", value: "5,034.89 USD" }]);
    finish(corpusDir, run);

    // A fact whose declared semantics say the pending marker is irrelevant to
    // agreement: the two recordings differ as strings but normalize equal, so
    // the divergence is legitimate, not a stale view.
    const INVARIANT_ID = "purchase-status-agrees-across-surfaces";
    crossViewInvariants.push({
      invariantId: INVARIANT_ID,
      fact: "Purchase status",
      probeName: "purchase-status",
      surfaces: ["homePage", "portfolioSummaryDialog"],
      normalize: (v) => v.replace(/\(pending\)/g, "").replace(/\s+/g, " ").trim(),
    });
    try {
      const result = runCrossViewInvariants(corpusDir, run.runId, twoSurfacePlan()).find(
        (r) => r.contractId === INVARIANT_ID,
      );
      expect(result!.passed).toBe(true);
      expect(result!.details).toBeUndefined();
    } finally {
      crossViewInvariants.pop();
    }
  });

  it("uses the LATEST recorded observation per surface, ordered by capturedAt", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();

    // Step 0: an early homePage landing showing the old value.
    writePostSnapshot(corpusDir, run, 0, "homePage");
    writeProbes(corpusDir, run, 0, [{
      name: "portfolio-value",
      value: "4,000.00 USD",
      capturedAt: "2026-09-01T10:00:00.000Z",
    }]);
    // Step 1: a later homePage landing (the latest observation wins).
    writePostSnapshot(corpusDir, run, 1, "homePage");
    writeProbes(corpusDir, run, 1, [{
      name: "portfolio-value",
      value: "5,034.89 USD",
      capturedAt: "2026-09-01T12:00:00.000Z",
    }]);
    // Step 2: the dialog surface.
    writePostSnapshot(corpusDir, run, 2, "portfolioSummaryDialog");
    writeProbes(corpusDir, run, 2, [{ name: "portfolio-value", value: "5,034.89 USD" }]);
    finish(corpusDir, run);

    const plan: TestPlan = {
      planId: "smoke",
      modelVersion: "x",
      scenarios: [
        { id: "s1", steps: [{ stateId: "portfolioSummaryDialog", contractId: "closePortfolioSummary" }] },
        { id: "s2", steps: [{ stateId: "portfolioSummaryDialog", contractId: "closePortfolioSummary" }] },
        { id: "s3", steps: [{ stateId: "homePage", contractId: "openPortfolioSummary" }] },
      ],
    };

    // The latest homePage observation (5,034.89 USD) is compared — the stale
    // 4,000.00 USD landing is not part of the comparison.
    const result = runSeed(corpusDir, run, plan);
    expect(result!.passed).toBe(true);
    expect(result!.corpusRefs).toContain("probe:portfolio-value@1");
    expect(result!.corpusRefs).not.toContain("probe:portfolio-value@0");
  });

  it("NO_OBSERVATIONS: a corpus with no step landing on any declared surface fails naming every missing surface", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();

    // The run stays entirely on historyMain — neither seed surface observed.
    writePostSnapshot(corpusDir, run, 0, "historyMain");
    writeProbes(corpusDir, run, 0, [{ name: "selected-view", value: "Ledger" }]);
    finish(corpusDir, run);

    const results = runCrossViewInvariants(corpusDir, run.runId, twoSurfacePlan());
    const result = results.find((r) => r.contractId === SEED_INVARIANT_ID)!;
    expect(results).toHaveLength(crossViewInvariants.length);
    expect(result.passed).toBe(false);
    expect(result.details).toContain('surface "homePage"');
    expect(result.details).toContain('surface "portfolioSummaryDialog"');
    expect(result.details).toContain("no recorded step lands on this surface");
  });

  it("UNMODELED_SURFACE: a declared surface absent from homePageModel.states throws at entry", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();
    finish(corpusDir, run);

    crossViewInvariants.push({
      invariantId: "__unmodeled",
      fact: "Unmodeled fact",
      probeName: "portfolio-value",
      surfaces: ["homePage", "notAStateId"],
      normalize: (v) => v,
    });
    try {
      expect(() => runCrossViewInvariants(corpusDir, run.runId, twoSurfacePlan())).toThrow(
        /unmodeled surface "notAStateId"/,
      );
    } finally {
      crossViewInvariants.pop();
    }
  });

  it("EMPTY SURFACES: an invariant declaring no surfaces throws at entry naming the invariant", () => {
    const INVARIANT_ID = "__emptySurfaces";
    crossViewInvariants.push({
      invariantId: INVARIANT_ID,
      fact: "Unmodeled fact",
      probeName: "portfolio-value",
      surfaces: [],
      normalize: (v) => v,
    });
    try {
      expect(() =>
        runCrossViewInvariants("corpus", "run", twoSurfacePlan()),
      ).toThrow(/declares no surfaces/);
      expect(() =>
        runCrossViewInvariants("corpus", "run", twoSurfacePlan()),
      ).toThrow(INVARIANT_ID);
    } finally {
      crossViewInvariants.pop();
    }
  });

  it("DUPLICATE SURFACE: an invariant listing a stateId twice throws naming the invariant and surface", () => {
    const INVARIANT_ID = "__duplicateSurface";
    crossViewInvariants.push({
      invariantId: INVARIANT_ID,
      fact: "Unmodeled fact",
      probeName: "portfolio-value",
      surfaces: ["homePage", "homePage"],
      normalize: (v) => v,
    });
    try {
      expect(() =>
        runCrossViewInvariants("corpus", "run", twoSurfacePlan()),
      ).toThrow(`declares surface "homePage" more than once`);
      expect(() =>
        runCrossViewInvariants("corpus", "run", twoSurfacePlan()),
      ).toThrow(INVARIANT_ID);
    } finally {
      crossViewInvariants.pop();
    }
  });

  it("DUPLICATE INVARIANT ID: two invariants sharing an invariantId throw naming it", () => {
    const INVARIANT_ID = "__duplicateId";
    crossViewInvariants.push(
      { invariantId: INVARIANT_ID, fact: "Duplicate A", probeName: "portfolio-value", surfaces: ["homePage"], normalize: (v) => v },
      { invariantId: INVARIANT_ID, fact: "Duplicate B", probeName: "portfolio-value", surfaces: ["homePage"], normalize: (v) => v },
    );
    try {
      expect(() =>
        runCrossViewInvariants("corpus", "run", twoSurfacePlan()),
      ).toThrow(`duplicate cross-view invariant id "${INVARIANT_ID}"`);
    } finally {
      crossViewInvariants.pop();
      crossViewInvariants.pop();
    }
  });

  it("empty-value LATEST: a surface whose latest observation is empty fails as missing evidence, never reusing an older value", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();

    // Step 0: an early homePage landing with a value.
    writePostSnapshot(corpusDir, run, 0, "homePage");
    writeProbes(corpusDir, run, 0, [{
      name: "portfolio-value",
      value: "5,034.89 USD",
      capturedAt: "2026-09-01T10:00:00.000Z",
    }]);
    // Step 1: a LATER homePage landing whose probe is empty (values hidden via
    // the eye icon) — this must supersede step 0, not be skipped in its favour.
    writePostSnapshot(corpusDir, run, 1, "homePage");
    writeProbes(corpusDir, run, 1, [{
      name: "portfolio-value",
      value: "  ",
      capturedAt: "2026-09-01T12:00:00.000Z",
    }]);
    // Step 2: the dialog surface still shows the value.
    writePostSnapshot(corpusDir, run, 2, "portfolioSummaryDialog");
    writeProbes(corpusDir, run, 2, [{
      name: "portfolio-value",
      value: "5,034.89 USD",
      capturedAt: "2026-09-01T13:00:00.000Z",
    }]);
    finish(corpusDir, run);

    const plan: TestPlan = {
      planId: "smoke",
      modelVersion: "x",
      scenarios: [
        { id: "s1", steps: [{ stateId: "portfolioSummaryDialog", contractId: "closePortfolioSummary" }] },
        { id: "s2", steps: [{ stateId: "portfolioSummaryDialog", contractId: "closePortfolioSummary" }] },
        { id: "s3", steps: [{ stateId: "homePage", contractId: "openPortfolioSummary" }] },
      ],
    };

    const result = runSeed(corpusDir, run, plan);
    expect(result!.passed).toBe(false);
    expect(result!.details).toContain('surface "homePage"');
    expect(result!.details).toContain('"portfolio-value" probe recorded an empty value on this surface');
    // Only the dialog surface is observed; the hidden homePage value is missing
    // evidence, and the stale non-empty step is never compared.
    expect(result!.corpusRefs).toEqual(["probe:portfolio-value@2"]);
    expect(result!.corpusRefs).not.toContain("probe:portfolio-value@0");
  });

  it("is deterministic: the same corpus yields identical results twice (NFR-1)", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();

    writePostSnapshot(corpusDir, run, 0, "homePage");
    writeProbes(corpusDir, run, 0, [{ name: "portfolio-value", value: "5,034.89 USD" }]);
    writePostSnapshot(corpusDir, run, 1, "portfolioSummaryDialog");
    writeProbes(corpusDir, run, 1, [{ name: "portfolio-value", value: "6,001.00 USD" }]);
    finish(corpusDir, run);

    const a = runCrossViewInvariants(corpusDir, run.runId, twoSurfacePlan());
    const b = runCrossViewInvariants(corpusDir, run.runId, twoSurfacePlan());

    expect(a).toEqual(b);
    for (const result of [...a, ...b]) {
      expect(validationResultSchema.safeParse(result).success).toBe(true);
    }
  });
});