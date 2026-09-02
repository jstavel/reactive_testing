import { existsSync, readFileSync, rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { RunMetadata, ScenarioResult, TestPlan } from "../model/schemas.js";
import { emitHtmlReport, renderHtmlReport } from "./html-report.js";

let tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

function makeCorpusDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "html-report-test-"));
  tempDirs.push(dir);
  return dir;
}

const MODEL_VERSION =
  "fab621435d1cbcad3cd10e730f56decf9fc62bc7e50648fb27b100b25348da7d";

const run: RunMetadata = {
  runId: "2026-09-02T10:00:00Z",
  timestamp: "2026-09-02T10:00:00.000Z",
};

function makePlan(scenarios: TestPlan["scenarios"]): TestPlan {
  return { planId: "smoke", modelVersion: MODEL_VERSION, scenarios };
}

function result(id: string, passed: boolean, error?: string): ScenarioResult {
  return { id, passed, error };
}

function readReport(corpusDir: string, runId: string): string {
  return readFileSync(join(corpusDir, runId, "report.html"), "utf8");
}

describe("renderHtmlReport", () => {
  it("ALL_PASS — green summary bar, all scenarios marked PASS", () => {
    const plan = makePlan([
      { id: "login", steps: [{ stateId: "home", contractId: "openLogin" }] },
      { id: "dashboard", steps: [{ stateId: "home", contractId: "viewDashboard" }] },
    ]);
    const results = [result("login", true), result("dashboard", true)];

    const html = renderHtmlReport({ run, plan, results });

    expect(html).toContain("#27ae60");
    expect(html).toContain("PASS");
    expect(html).toContain("2 passed, 0 failed, 2 total");
    expect(html).not.toContain("FAIL");
    expect(html).toContain("login");
    expect(html).toContain("dashboard");
  });

  it("SOME_FAIL — red summary bar, failed scenario highlighted", () => {
    const plan = makePlan([
      { id: "login", steps: [{ stateId: "home", contractId: "openLogin" }] },
      { id: "dashboard", steps: [{ stateId: "home", contractId: "viewDashboard" }] },
    ]);
    const results = [
      result("login", true),
      result("dashboard", false, "expected dashboard to load"),
    ];

    const html = renderHtmlReport({ run, plan, results });

    expect(html).toContain("#e74c3c");
    expect(html).toContain("FAIL");
    expect(html).toContain("1 passed, 1 failed, 2 total");
    expect(html).toContain("expected dashboard to load");
  });

  it("NO_SCENARIOS — renders empty feature with no crash", () => {
    const plan = makePlan([]);
    const results: ScenarioResult[] = [];

    const html = renderHtmlReport({ run, plan, results });

    expect(html).toContain("0 passed, 0 failed, 0 total");
    expect(html).toContain("No scenarios in this plan.");
    expect(html).toContain("PASS");
  });

  it("MISSING_RESULT — scenario with no matching result treated as failed", () => {
    const plan = makePlan([
      { id: "orphan", steps: [{ stateId: "home", contractId: "doThing" }] },
    ]);
    const results: ScenarioResult[] = [];

    const html = renderHtmlReport({ run, plan, results });

    expect(html).toContain("#e74c3c");
    expect(html).toContain("FAIL");
  });

  it("ESCAPES_HTML — special characters in scenario ids and step data", () => {
    const plan = makePlan([
      {
        id: 'script<script>alert("xss")</script>',
        steps: [{ stateId: "home&page", contractId: 'contract"with' }],
      },
    ]);
    const results = [result('script<script>alert("xss")</script>', true)];

    const html = renderHtmlReport({ run, plan, results });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("home&amp;page");
    expect(html).toContain("contract&quot;with");
  });

  it("INCLUDES_PLAN_META — plan id and model version in summary", () => {
    const plan = makePlan([]);
    const html = renderHtmlReport({ run, plan, results: [] });

    expect(html).toContain("plan: smoke");
    expect(html).toContain(`model: ${MODEL_VERSION.slice(0, 8)}`);
    expect(html).toContain(run.runId);
  });
});

describe("emitHtmlReport", () => {
  it("ALL_PASS_E2E — writes report.html under the run dir with green bar", () => {
    const corpusDir = makeCorpusDir();
    const plan = makePlan([
      { id: "login", steps: [{ stateId: "home", contractId: "openLogin" }] },
    ]);

    const relPath = emitHtmlReport({ corpusDir, run, plan, results: [result("login", true)] });

    expect(relPath).toBe(`${run.runId}/report.html`);
    const reportPath = join(corpusDir, run.runId, "report.html");
    expect(existsSync(reportPath)).toBe(true);

    const content = readReport(corpusDir, run.runId);
    expect(content).toContain("#27ae60");
    expect(content).toContain("1 passed, 0 failed, 1 total");
  });

  it("SOME_FAIL_E2E — writes report.html with red bar", () => {
    const corpusDir = makeCorpusDir();
    const plan = makePlan([
      { id: "login", steps: [{ stateId: "home", contractId: "openLogin" }] },
      { id: "fail", steps: [{ stateId: "home", contractId: "broken" }] },
    ]);

    emitHtmlReport({
      corpusDir,
      run,
      plan,
      results: [result("login", true), result("fail", false, "boom")],
    });

    const content = readReport(corpusDir, run.runId);
    expect(content).toContain("#e74c3c");
    expect(content).toContain("1 passed, 1 failed, 2 total");
    expect(content).toContain("boom");
  });

  it("DETERMINISTIC — same inputs produce byte-identical output (NFR-1)", () => {
    const corpusDir = makeCorpusDir();
    const plan = makePlan([
      { id: "alpha", steps: [{ stateId: "home", contractId: "openAlpha" }] },
      { id: "beta", steps: [{ stateId: "home", contractId: "openBeta" }] },
    ]);
    const results = [result("beta", false, "oops"), result("alpha", true)];

    emitHtmlReport({ corpusDir, run, plan, results });
    const first = readReport(corpusDir, run.runId);

    const otherDir = makeCorpusDir();
    emitHtmlReport({ corpusDir: otherDir, run, plan, results });
    const second = readReport(otherDir, run.runId);

    expect(second).toBe(first);
  });

  it("RE_EMIT — overwrites cleanly, same bytes", () => {
    const corpusDir = makeCorpusDir();
    const plan = makePlan([
      { id: "x", steps: [{ stateId: "home", contractId: "openX" }] },
    ]);

    emitHtmlReport({ corpusDir, run, plan, results: [result("x", true)] });
    const first = readReport(corpusDir, run.runId);

    emitHtmlReport({ corpusDir, run, plan, results: [result("x", true)] });
    const second = readReport(corpusDir, run.runId);

    expect(second).toBe(first);
  });

  it("CREATES_RUN_DIR — recursively creates the run directory", () => {
    const corpusDir = makeCorpusDir();
    expect(existsSync(join(corpusDir, run.runId))).toBe(false);

    emitHtmlReport({
      corpusDir,
      run,
      plan: makePlan([]),
      results: [],
    });

    expect(existsSync(join(corpusDir, run.runId))).toBe(true);
    expect(existsSync(join(corpusDir, run.runId, "report.html"))).toBe(true);
  });

  it("STEPS_RENDERED — each step shows Given state → When contract", () => {
    const corpusDir = makeCorpusDir();
    const plan = makePlan([
      {
        id: "journey",
        steps: [
          { stateId: "homePage", contractId: "openPortfolioSummary" },
          { stateId: "portfolioSummaryDialog", contractId: "closePortfolioSummary" },
        ],
      },
    ]);

    emitHtmlReport({ corpusDir, run, plan, results: [result("journey", true)] });
    const content = readReport(corpusDir, run.runId);

    expect(content).toContain("Given");
    expect(content).toContain("homePage");
    expect(content).toContain("openPortfolioSummary");
    expect(content).toContain("portfolioSummaryDialog");
    expect(content).toContain("closePortfolioSummary");
  });
});
