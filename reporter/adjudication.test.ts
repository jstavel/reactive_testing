import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { TestPlan, ValidationResult } from "../model/schemas.js";
import type { AdjudicationDecision } from "./adjudication.js";
import { emitAdjudicationRecord } from "./adjudication.js";

let tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

function makeCorpusDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "adjudication-test-"));
  tempDirs.push(dir);
  return dir;
}

const MODEL_VERSION =
  "fab621435d1cbcad3cd10e730f56decf9fc62bc7e50648fb27b100b25348da7d";

const plan: TestPlan = {
  planId: "smoke",
  modelVersion: MODEL_VERSION,
  scenarios: [],
};

function failing(overrides: Partial<ValidationResult> = {}): ValidationResult {
  return {
    contractId: "portfolio-value-shown",
    passed: false,
    details: 'expected "value shown" ≥ 1 but observed 0',
    corpusRefs: ["snapshot:post", "probe:selected-view"],
    ...overrides,
  };
}

function passing(): ValidationResult {
  return {
    contractId: "portfolio-value-shown",
    passed: true,
    corpusRefs: ["snapshot:post"],
  };
}

function readRecord(corpusDir: string, runId: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(corpusDir, runId, "adjudication.json"), "utf8"),
  );
}

const APP_BUG_DECISION = { decision: "app-bug" as const, bugReportRef: "JIRA-1234" };
const SPEC_DRIFT_DECISION = { decision: "spec-drift" as const, proposal: "Update portfolio-value-shown contract to allow zero values" };

const APPROVED_BY = "Jan";
const APPROVED_AT = "2026-09-01T14:05:00Z";

describe("emitAdjudicationRecord", () => {
  it("writes adjudication.json for APP_BUG with correct record fields", () => {
    const corpusDir = makeCorpusDir();
    const runId = "2026-09-01T10:00:00Z";

    const written = emitAdjudicationRecord({
      corpusDir,
      runId,
      plan,
      results: [failing()],
      decision: APP_BUG_DECISION,
      approvedBy: APPROVED_BY,
      approvedAt: APPROVED_AT,
    });

    expect(written).toEqual([`${runId}/adjudication.json`]);
    expect(existsSync(join(corpusDir, runId, "adjudication.json"))).toBe(true);

    const record = readRecord(corpusDir, runId);
    expect(record.runId).toBe(runId);
    expect(record.plan).toEqual({ planId: "smoke", modelVersion: MODEL_VERSION });
    expect(record.contractIds).toEqual(["portfolio-value-shown"]);
    expect(record.decision).toBe("app-bug");
    expect(record.bugReportRef).toBe("JIRA-1234");
    expect(record.proposal).toBeUndefined();
    expect(record.updated).toBe(APPROVED_AT);
    expect(record.approvedBy).toBe(APPROVED_BY);
  });

  it("writes adjudication.json for SPEC_DRIFT with proposal and no bugReportRef", () => {
    const corpusDir = makeCorpusDir();
    const runId = "2026-09-01T10:00:00Z";

    const written = emitAdjudicationRecord({
      corpusDir,
      runId,
      plan,
      results: [failing()],
      decision: SPEC_DRIFT_DECISION,
      approvedBy: APPROVED_BY,
      approvedAt: APPROVED_AT,
    });

    expect(written).toEqual([`${runId}/adjudication.json`]);

    const record = readRecord(corpusDir, runId);
    expect(record.decision).toBe("spec-drift");
    expect(record.proposal).toBe(
      "Update portfolio-value-shown contract to allow zero values",
    );
    expect(record.bugReportRef).toBeUndefined();
    expect(record.updated).toBe(APPROVED_AT);
    expect(record.approvedBy).toBe(APPROVED_BY);
  });

  it("does not modify any model file (model untouched invariant)", () => {
    const corpusDir = makeCorpusDir();
    const runId = "2026-09-01T10:00:00Z";

    emitAdjudicationRecord({
      corpusDir,
      runId,
      plan,
      results: [failing()],
      decision: SPEC_DRIFT_DECISION,
      approvedBy: APPROVED_BY,
      approvedAt: APPROVED_AT,
    });

    // Only adjudication.json should exist in the run dir
    const runDir = join(corpusDir, runId);
    expect(existsSync(join(runDir, "adjudication.json"))).toBe(true);
    expect(existsSync(join(runDir, "run-manifest.json"))).toBe(false);
    expect(existsSync(join(runDir, "failure.feature"))).toBe(false);
  });

  it("returns [] and writes nothing when all results pass (PASS_ONLY)", () => {
    const corpusDir = makeCorpusDir();

    const written = emitAdjudicationRecord({
      corpusDir,
      runId: "run-green",
      plan,
      results: [passing(), passing()],
      decision: APP_BUG_DECISION,
      approvedBy: APPROVED_BY,
      approvedAt: APPROVED_AT,
    });

    expect(written).toEqual([]);
    expect(existsSync(join(corpusDir, "run-green"))).toBe(false);
  });

  it("returns [] and writes nothing for an empty result set (EMPTY)", () => {
    const corpusDir = makeCorpusDir();

    const written = emitAdjudicationRecord({
      corpusDir,
      runId: "run-empty",
      plan,
      results: [],
      decision: APP_BUG_DECISION,
      approvedBy: APPROVED_BY,
      approvedAt: APPROVED_AT,
    });

    expect(written).toEqual([]);
    expect(existsSync(join(corpusDir, "run-empty"))).toBe(false);
  });

  it("throws when decision is missing entirely (NO_DECISION)", () => {
    const corpusDir = makeCorpusDir();

    expect(() =>
      emitAdjudicationRecord({
        corpusDir,
        runId: "run-nd",
        plan,
        results: [failing()],
        decision: undefined as never,
        approvedBy: APPROVED_BY,
        approvedAt: APPROVED_AT,
      }),
    ).toThrow("half-decision is not allowed");
  });

  it("throws when decision is a plain object missing the decision key (HALF_DECISION)", () => {
    const corpusDir = makeCorpusDir();

    expect(() =>
      emitAdjudicationRecord({
        corpusDir,
        runId: "run-hd",
        plan,
        results: [failing()],
        decision: {} as AdjudicationDecision,
        approvedBy: APPROVED_BY,
        approvedAt: APPROVED_AT,
      }),
    ).toThrow("half-decision is not allowed");
  });

  it("throws when decision has an unknown type", () => {
    const corpusDir = makeCorpusDir();

    expect(() =>
      emitAdjudicationRecord({
        corpusDir,
        runId: "run-nd",
        plan,
        results: [failing()],
        decision: { decision: "unknown-type" } as never,
        approvedBy: APPROVED_BY,
        approvedAt: APPROVED_AT,
      }),
    ).toThrow('Unknown decision type: "unknown-type"');
  });

  it("throws when spec-drift decision is missing proposal", () => {
    const corpusDir = makeCorpusDir();

    expect(() =>
      emitAdjudicationRecord({
        corpusDir,
        runId: "run-nd",
        plan,
        results: [failing()],
        decision: { decision: "spec-drift" } as never,
        approvedBy: APPROVED_BY,
        approvedAt: APPROVED_AT,
      }),
    ).toThrow('Decision "spec-drift" requires a non-empty "proposal" field');
  });

  it("throws when app-bug decision is missing bugReportRef", () => {
    const corpusDir = makeCorpusDir();

    expect(() =>
      emitAdjudicationRecord({
        corpusDir,
        runId: "run-nd",
        plan,
        results: [failing()],
        decision: { decision: "app-bug" } as never,
        approvedBy: APPROVED_BY,
        approvedAt: APPROVED_AT,
      }),
    ).toThrow('Decision "app-bug" requires a non-empty "bugReportRef" field');
  });

  it("throws when approvedBy is missing (NO_APPROVAL)", () => {
    const corpusDir = makeCorpusDir();

    expect(() =>
      emitAdjudicationRecord({
        corpusDir,
        runId: "run-nd",
        plan,
        results: [failing()],
        decision: APP_BUG_DECISION,
        approvedBy: "",
        approvedAt: APPROVED_AT,
      }),
    ).toThrow("approvedBy is missing");
  });

  it("throws when approvedAt is missing (NO_APPROVAL)", () => {
    const corpusDir = makeCorpusDir();

    expect(() =>
      emitAdjudicationRecord({
        corpusDir,
        runId: "run-nd",
        plan,
        results: [failing()],
        decision: APP_BUG_DECISION,
        approvedBy: APPROVED_BY,
        approvedAt: "",
      }),
    ).toThrow("approvedAt is missing");
  });

  it("creates the run dir recursively when it does not exist (MISSING_RUN_DIR)", () => {
    const corpusDir = makeCorpusDir();
    const runId = "run-created";

    expect(existsSync(join(corpusDir, runId))).toBe(false);

    emitAdjudicationRecord({
      corpusDir,
      runId,
      plan,
      results: [failing()],
      decision: APP_BUG_DECISION,
      approvedBy: APPROVED_BY,
      approvedAt: APPROVED_AT,
    });

    expect(existsSync(join(corpusDir, runId))).toBe(true);
    expect(existsSync(join(corpusDir, runId, "adjudication.json"))).toBe(true);
  });

  it("re-emits byte-identical content, overwriting in place (RE_EMIT)", () => {
    const corpusDir = makeCorpusDir();
    const runId = "run-reemit";

    emitAdjudicationRecord({
      corpusDir,
      runId,
      plan,
      results: [failing()],
      decision: APP_BUG_DECISION,
      approvedBy: APPROVED_BY,
      approvedAt: APPROVED_AT,
    });
    const first = readFileSync(
      join(corpusDir, runId, "adjudication.json"),
      "utf8",
    );

    emitAdjudicationRecord({
      corpusDir,
      runId,
      plan,
      results: [failing()],
      decision: APP_BUG_DECISION,
      approvedBy: APPROVED_BY,
      approvedAt: APPROVED_AT,
    });
    const second = readFileSync(
      join(corpusDir, runId, "adjudication.json"),
      "utf8",
    );

    expect(second).toBe(first);
  });

  it("yields byte-identical records for identical inputs (NFR-1 determinism)", () => {
    const corpusDirA = makeCorpusDir();
    const corpusDirB = makeCorpusDir();
    const runId = "run-det";

    emitAdjudicationRecord({
      corpusDir: corpusDirA,
      runId,
      plan,
      results: [failing({ contractId: "betaContract" }), failing({ contractId: "alphaContract" })],
      decision: SPEC_DRIFT_DECISION,
      approvedBy: APPROVED_BY,
      approvedAt: APPROVED_AT,
    });
    const first = readFileSync(
      join(corpusDirA, runId, "adjudication.json"),
      "utf8",
    );

    emitAdjudicationRecord({
      corpusDir: corpusDirB,
      runId,
      plan,
      results: [failing({ contractId: "alphaContract" }), failing({ contractId: "betaContract" })],
      decision: SPEC_DRIFT_DECISION,
      approvedBy: APPROVED_BY,
      approvedAt: APPROVED_AT,
    });
    const second = readFileSync(
      join(corpusDirB, runId, "adjudication.json"),
      "utf8",
    );

    expect(second).toBe(first);
  });

  it("sorts contractIds deterministically regardless of result arrival order", () => {
    const corpusDir = makeCorpusDir();
    const runId = "run-sort";

    emitAdjudicationRecord({
      corpusDir,
      runId,
      plan,
      results: [
        failing({ contractId: "gammaContract" }),
        failing({ contractId: "alphaContract" }),
        failing({ contractId: "betaContract" }),
      ],
      decision: APP_BUG_DECISION,
      approvedBy: APPROVED_BY,
      approvedAt: APPROVED_AT,
    });

    const record = readRecord(corpusDir, runId);
    expect(record.contractIds).toEqual(["alphaContract", "betaContract", "gammaContract"]);
  });
});
