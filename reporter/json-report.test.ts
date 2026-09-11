import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import type { ScenarioRelation } from "../model/relations.js";
import type { RunMetadata, ScenarioResult, StepEvidence, TestPlan } from "../model/schemas.js";
import { emitJsonReport, REPORT_SCHEMA, renderJsonReport } from "./json-report.js";

let tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

function makeCorpusDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "json-report-test-"));
  tempDirs.push(dir);
  return dir;
}

const MODEL_VERSION = "832c258f35e4e6806e2d1fd731b3df2ca0f3f44d8ffd96b8c8c6315ccaee0c6c";

const run: RunMetadata = {
  runId: "run-abc123",
  timestamp: "2026-09-11T09:00:00.000Z",
};

function makePlan(scenarios: TestPlan["scenarios"]): TestPlan {
  return { planId: "smoke", modelVersion: MODEL_VERSION, scenarios };
}

function result(id: string, passed: boolean, error?: string): ScenarioResult {
  return { id, passed, error };
}

function relation(overrides: Partial<ScenarioRelation>): ScenarioRelation {
  return {
    scenarioId: "sc",
    feature: "home-page-navigation",
    featureTitle: "Home page navigation",
    scenarioTitle: "Overview opens the portfolio page",
    states: ["homePage"],
    contracts: ["openLogin"],
    ...overrides,
  };
}

const fullStep: StepEvidence = {
  timingMs: 412,
  screenshot: { filePath: "screenshots/run-abc123/0.png", capturedAt: "2026-09-11T09:00:00.412Z" },
  snapshotPre: "snapshots/run-abc123/0.pre.json",
  snapshotPost: "snapshots/run-abc123/0.json",
  probes: "probes/run-abc123/0.json",
  network: "network/run-abc123/0.json",
};

describe("renderJsonReport", () => {
  it("GOLDEN_SHAPE — fixed member order, schema tag, counts, plan-order scenarios", () => {
    const plan = makePlan([
      { id: "sc-a", steps: [{ stateId: "homePage", contractId: "openPortfolioSummary" }] },
      { id: "sc-b", steps: [{ stateId: "home", contractId: "openLogin" }] },
    ]);
    const results = [result("sc-a", true), result("sc-b", true)];
    const stepEvidence: Record<string, StepEvidence[]> = {
      "sc-a": [fullStep],
    };

    const json = renderJsonReport({ run, plan, results, stepEvidence });

    expect(json).toBe(`{
  "schema": "report.v1",
  "runId": "run-abc123",
  "timestamp": "2026-09-11T09:00:00.000Z",
  "planId": "smoke",
  "modelVersion": "${MODEL_VERSION}",
  "summary": {
    "total": 2,
    "passed": 2,
    "failed": 0
  },
  "scenarios": [
    {
      "id": "sc-a",
      "title": "sc-a",
      "passed": true,
      "steps": [
        {
          "stateId": "homePage",
          "contractId": "openPortfolioSummary",
          "timingMs": 412,
          "snapshotPre": "snapshots/run-abc123/0.pre.json",
          "snapshotPost": "snapshots/run-abc123/0.json",
          "probes": "probes/run-abc123/0.json",
          "network": "network/run-abc123/0.json",
          "screenshot": {
            "filePath": "screenshots/run-abc123/0.png",
            "capturedAt": "2026-09-11T09:00:00.412Z"
          }
        }
      ]
    },
    {
      "id": "sc-b",
      "title": "sc-b",
      "passed": true,
      "steps": [
        {
          "stateId": "home",
          "contractId": "openLogin"
        }
      ]
    }
  ]
}`);
  });

  it("TITLE_FEATURE — title/feature come from relations; absent relation falls back to id / omits feature", () => {
    const plan = makePlan([
      { id: "related", steps: [{ stateId: "home", contractId: "openLogin" }] },
      { id: "unrelated", steps: [{ stateId: "home", contractId: "openLogin" }] },
    ]);
    const results = [result("related", true), result("unrelated", true)];
    const relations = [relation({ scenarioId: "related" })];

    const parsed = JSON.parse(renderJsonReport({ run, plan, results, relations })) as {
      scenarios: Array<Record<string, unknown>>;
    };

    expect(parsed.scenarios[0]).toMatchObject({
      id: "related",
      title: "Overview opens the portfolio page",
      feature: "Home page navigation",
    });
    expect(parsed.scenarios[1]).toEqual({
      id: "unrelated",
      title: "unrelated",
      passed: true,
      steps: [{ stateId: "home", contractId: "openLogin" }],
    });
  });

  it("COUNTS_MATCH_SUMMARY_BAR — summary numbers are the derived results, failures carry their error", () => {
    const plan = makePlan([
      { id: "ok", steps: [{ stateId: "home", contractId: "openLogin" }] },
      { id: "broken", steps: [{ stateId: "home", contractId: "openLogin" }] },
    ]);
    const results = [result("ok", true), result("broken", false, "expected dialog")];
    const stepEvidence: Record<string, StepEvidence[]> = {
      ok: [{ timingMs: 10 }],
      // FAILED_STEP: a failing scenario still lists its step refs.
      broken: [fullStep],
    };

    const parsed = JSON.parse(renderJsonReport({ run, plan, results, stepEvidence })) as {
      summary: { total: number; passed: number; failed: number };
      scenarios: Array<Record<string, unknown>>;
    };

    expect(parsed.summary).toEqual({ total: 2, passed: 1, failed: 1 });
    expect(parsed.scenarios[0]).toMatchObject({ id: "ok", passed: true });
    expect(parsed.scenarios[1]).toMatchObject({
      id: "broken",
      passed: false,
      error: "expected dialog",
    });
    // Refs survive the failure — failure evidence is the most valuable.
    expect(parsed.scenarios[1].steps).toEqual([
      {
        stateId: "home",
        contractId: "openLogin",
        timingMs: 412,
        snapshotPre: "snapshots/run-abc123/0.pre.json",
        snapshotPost: "snapshots/run-abc123/0.json",
        probes: "probes/run-abc123/0.json",
        network: "network/run-abc123/0.json",
        screenshot: {
          filePath: "screenshots/run-abc123/0.png",
          capturedAt: "2026-09-11T09:00:00.412Z",
        },
      },
    ]);
  });

  it("MISSING_KIND — a ref kind absent from the evidence is omitted from the step entry", () => {
    const plan = makePlan([{ id: "sc", steps: [{ stateId: "home", contractId: "openLogin" }] }]);
    const results = [result("sc", true)];
    const { network: _absent, screenshot: _noShot, ...partial } = fullStep;

    const parsed = JSON.parse(
      renderJsonReport({ run, plan, results, stepEvidence: { sc: [partial] } }),
    ) as { scenarios: Array<{ steps: Array<Record<string, unknown>> }> };

    expect(parsed.scenarios[0].steps[0]).toEqual({
      stateId: "home",
      contractId: "openLogin",
      timingMs: 412,
      snapshotPre: "snapshots/run-abc123/0.pre.json",
      snapshotPost: "snapshots/run-abc123/0.json",
      probes: "probes/run-abc123/0.json",
    });
  });

  it("NO_STEP_EVIDENCE — steps list only stateId+contractId when stepEvidence is omitted or empty", () => {
    const plan = makePlan([{ id: "sc", steps: [{ stateId: "home", contractId: "openLogin" }] }]);
    const results = [result("sc", true)];

    const without = JSON.parse(renderJsonReport({ run, plan, results })) as {
      scenarios: Array<{ steps: Array<Record<string, unknown>> }>;
    };
    const withEmpty = JSON.parse(renderJsonReport({ run, plan, results, stepEvidence: {} })) as {
      scenarios: Array<{ steps: Array<Record<string, unknown>> }>;
    };

    expect(without.scenarios[0].steps).toEqual([{ stateId: "home", contractId: "openLogin" }]);
    expect(withEmpty.scenarios[0].steps).toEqual([{ stateId: "home", contractId: "openLogin" }]);
  });

  it("MODEL_VERSION_FULL — the full model version hash is carried, not truncated", () => {
    const plan = makePlan([]);

    const parsed = JSON.parse(renderJsonReport({ run, plan, results: [] })) as {
      modelVersion: string;
    };

    expect(parsed.modelVersion).toBe(MODEL_VERSION);
  });

  it("BYTE_DETERMINISM — two renders of the same inputs are byte-identical (NFR-1)", () => {
    const plan = makePlan([{ id: "sc", steps: [{ stateId: "home", contractId: "openLogin" }] }]);
    const results = [result("sc", false, "boom")];
    const stepEvidence: Record<string, StepEvidence[]> = { sc: [fullStep] };

    const first = renderJsonReport({ run, plan, results, relations: [relation({})], stepEvidence });
    const second = renderJsonReport({
      run,
      plan,
      results,
      relations: [relation({})],
      stepEvidence,
    });

    expect(second).toBe(first);
    expect(second.endsWith("\n")).toBe(false);
  });

  it("SCHEMA_TAG — the versioned tag is exposed for CI consumers", () => {
    const plan = makePlan([]);

    const parsed = JSON.parse(renderJsonReport({ run, plan, results: [] })) as {
      schema: string;
    };

    expect(parsed.schema).toBe("report.v1");
    expect(REPORT_SCHEMA).toBe("report.v1");
  });
});

describe("emitJsonReport", () => {
  it("writes report.json beside report.html under the run dir and returns the corpus-relative path", () => {
    const corpusDir = makeCorpusDir();
    const plan = makePlan([{ id: "sc", steps: [{ stateId: "home", contractId: "openLogin" }] }]);

    const relPath = emitJsonReport({
      corpusDir,
      run,
      plan,
      results: [result("sc", true)],
      stepEvidence: { sc: [fullStep] },
    });

    expect(relPath).toBe(`${run.runId}/report.json`);
    const written = readFileSync(join(corpusDir, run.runId, "report.json"), "utf8");
    const parsed = JSON.parse(written) as { schema: string; summary: unknown };
    expect(parsed.schema).toBe("report.v1");
    expect(parsed.summary).toEqual({ total: 1, passed: 1, failed: 0 });
    expect(existsSync(join(corpusDir, run.runId, "report.json"))).toBe(true);
  });

  it("DETERMINISTIC_EMIT — same inputs in a fresh dir produce byte-identical files", () => {
    const plan = makePlan([{ id: "sc", steps: [{ stateId: "home", contractId: "openLogin" }] }]);
    const input = {
      run,
      plan,
      results: [result("sc", true)],
      stepEvidence: { sc: [fullStep] } as Record<string, StepEvidence[]>,
    };

    const firstDir = makeCorpusDir();
    emitJsonReport({ corpusDir: firstDir, ...input });
    const first = readFileSync(join(firstDir, run.runId, "report.json"), "utf8");

    const secondDir = makeCorpusDir();
    emitJsonReport({ corpusDir: secondDir, ...input });
    const second = readFileSync(join(secondDir, run.runId, "report.json"), "utf8");

    expect(second).toBe(first);
  });
});
