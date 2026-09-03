import { existsSync, readFileSync, rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { RunMetadata, ScenarioResult, StepEvidence, TestPlan } from "../model/schemas.js";
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

describe("renderHtmlReport with relations (Story 2)", () => {
  function relation(overrides: Partial<import("../model/relations.js").ScenarioRelation>): import("../model/relations.js").ScenarioRelation {
    return {
      scenarioId: "scenario-a",
      feature: "home-page-history-menu",
      featureTitle: "Home page History menu",
      scenarioTitle: "Scenario A",
      states: ["homePage"],
      contracts: ["clickHistoryMenuMain"],
      ...overrides,
    };
  }

  it("GROUPS_BY_FEATURE — scenarios rendered under their feature headings", () => {
    const rels = [
      relation({
        scenarioId: "a",
        scenarioTitle: "Scenario A",
        featureTitle: "Feature One",
        feature: "feature-one",
      }),
      relation({
        scenarioId: "b",
        scenarioTitle: "Scenario B",
        featureTitle: "Feature One",
        feature: "feature-one",
      }),
      relation({
        scenarioId: "c",
        scenarioTitle: "Scenario C",
        featureTitle: "Feature Two",
        feature: "feature-two",
      }),
    ];
    const plan = makePlan([
      { id: "a", steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }] },
      { id: "b", steps: [{ stateId: "homePage", contractId: "clickHistoryMenuFutures" }] },
      { id: "c", steps: [{ stateId: "homePage", contractId: "clickPortfolioMenuMain" }] },
    ]);
    const results = [result("a", true), result("b", true), result("c", true)];

    const html = renderHtmlReport({ run, plan, results, relations: rels });

    // Feature headings present.
    expect(html).toContain("Feature One");
    expect(html).toContain("Feature Two");
    // Scenario titles (not raw ids) shown.
    expect(html).toContain("Scenario A");
    expect(html).toContain("Scenario B");
    expect(html).toContain("Scenario C");
    // Model linkage rendered.
    expect(html).toContain("states:");
    expect(html).toContain("contracts:");
    expect(html).toContain("clickHistoryMenuMain");
  });

  it("N_TO_N — a contract shared by multiple scenarios appears for each", () => {
    const rels = [
      relation({
        scenarioId: "a",
        featureTitle: "F",
        contracts: ["openPortfolioSummary"],
        states: ["homePage"],
      }),
      relation({
        scenarioId: "b",
        featureTitle: "F",
        contracts: ["openPortfolioSummary"],
        states: ["homePage"],
      }),
    ];
    const plan = makePlan([
      { id: "a", steps: [{ stateId: "homePage", contractId: "openPortfolioSummary" }] },
      { id: "b", steps: [{ stateId: "homePage", contractId: "openPortfolioSummary" }] },
    ]);
    const results = [result("a", true), result("b", true)];

    const html = renderHtmlReport({ run, plan, results, relations: rels });

    // Both scenarios show the shared contract (N:N — no dedup).
    expect(html.match(/openPortfolioSummary/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("EMBEDS_GHERKIN_SNAPSHOT — relation-agnostic gherkinSource is rendered", () => {
    const rels = [relation({ scenarioId: "a", scenarioTitle: "Scenario A" })];
    const plan = makePlan([
      { id: "a", steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }] },
    ]);
    const results = [result("a", true)];

    const html = renderHtmlReport({
      run,
      plan,
      results,
      relations: rels,
      gherkinSource: { a: "Scenario: Scenario A\n  Given some precondition\n  Then something holds" },
    });

    expect(html).toContain("Scenario: Scenario A");
    expect(html).toContain("Given some precondition");
    expect(html).toContain("Then something holds");
  });

  it("GHERKIN_TIMEOUT_FALLBACK — scenario with no snapshot shows title only", () => {
    const rels = [relation({ scenarioId: "a", scenarioTitle: "Scenario A" })];
    const plan = makePlan([
      { id: "a", steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }] },
    ]);
    const results = [result("a", true)];

    const html = renderHtmlReport({ run, plan, results, relations: rels, gherkinSource: {} });

    // Title still shown; no <pre class="gherkin"> because no snapshot text.
    expect(html).toContain("Scenario A");
    expect(html).not.toContain("<pre class=\"gherkin\">");
  });

  it("FALLBACK_FLAT — without relations, no feature headings and raw scenario ids", () => {
    const plan = makePlan([
      { id: "scenario-a", steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }] },
    ]);
    const results = [result("scenario-a", true)];

    const html = renderHtmlReport({ run, plan, results });

    expect(html).toContain("scenario-a");
    expect(html).not.toContain("<div class=\"feature-group\">");
    expect(html).not.toContain("<div class=\"model-link\">");
  });

  it("UNCATEGORIZED — scenario with no matching relation grouped under 'Uncategorized'", () => {
    const rels = [relation({ scenarioId: "known" })];
    const plan = makePlan([
      { id: "known", steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }] },
      { id: "mystery", steps: [{ stateId: "homePage", contractId: "clickPortfolioMenuMain" }] },
    ]);
    const results = [result("known", true), result("mystery", true)];

    const html = renderHtmlReport({ run, plan, results, relations: rels });

    expect(html).toContain("Uncategorized");
    expect(html).toContain("mystery");
  });

  it("DETERMINISTIC_GROUP — grouped report is byte-identical for identical inputs", () => {
    const rels = [
      relation({ scenarioId: "a", featureTitle: "F1" }),
      relation({ scenarioId: "b", featureTitle: "F2" }),
    ];
    const plan = makePlan([
      { id: "a", steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }] },
      { id: "b", steps: [{ stateId: "homePage", contractId: "clickPortfolioMenuMain" }] },
    ]);
    const results = [result("a", true), result("b", true)];

    const first = renderHtmlReport({ run, plan, results, relations: rels });
    const second = renderHtmlReport({ run, plan, results, relations: rels });

    expect(second).toBe(first);
  });
});

describe("renderHtmlReport with stepEvidence (Story 3)", () => {
  it("TIMING_ONLY — step with timing but no screenshot shows timing text", () => {
    const plan = makePlan([
      { id: "sc", steps: [{ stateId: "home", contractId: "openLogin" }] },
    ]);
    const results = [result("sc", true)];
    const stepEvidence: Record<string, StepEvidence[]> = {
      sc: [{ timingMs: 42 }],
    };

    const html = renderHtmlReport({ run, plan, results, stepEvidence });

    // Step is inside a <details> element.
    expect(html).toContain("<details>");
    // Timing text is present.
    expect(html).toContain("42 ms");
    // No <img> — no screenshot.
    expect(html).not.toContain("<img");
  });

  it("WITH_SCREENSHOT — step with timing and screenshot shows both", () => {
    const plan = makePlan([
      { id: "sc", steps: [{ stateId: "home", contractId: "openLogin" }] },
    ]);
    const results = [result("sc", true)];
    const stepEvidence: Record<string, StepEvidence[]> = {
      sc: [{ timingMs: 120, screenshot: { filePath: "screenshots/run1/0.png", capturedAt: "2026-09-03T10:00:00Z" } }],
    };

    const html = renderHtmlReport({ run, plan, results, stepEvidence });

    expect(html).toContain("<details>");
    expect(html).toContain("120 ms");
    expect(html).toContain('<img src="screenshots/run1/0.png"');
  });

  it("MISSING_EVIDENCE — step absent from stepEvidence renders as plain line", () => {
    const plan = makePlan([
      { id: "sc", steps: [{ stateId: "home", contractId: "openLogin" }] },
    ]);
    const results = [result("sc", true)];
    // stepEvidence is present but empty — no entry for "sc".
    const stepEvidence: Record<string, StepEvidence[]> = {};

    const html = renderHtmlReport({ run, plan, results, stepEvidence });

    // Should still render the flat Given → When line.
    expect(html).toContain("Given");
    expect(html).toContain("home");
    expect(html).toContain("openLogin");
    // No expandable evidence — no <details> wrapping the step.
    expect(html).not.toContain("<details>");
  });

  it("STEP_EVIDENCE_OMITTED — omitting stepEvidence entirely matches Story 2 output", () => {
    const plan = makePlan([
      { id: "sc", steps: [{ stateId: "home", contractId: "openLogin" }] },
    ]);
    const results = [result("sc", true)];

    const without = renderHtmlReport({ run, plan, results });
    const withEmpty = renderHtmlReport({ run, plan, results, stepEvidence: {} });

    expect(without).toBe(withEmpty);
  });

  it("EMPTY_FILEPATH — screenshot ref with empty filePath omits <img> but shows timing", () => {
    const plan = makePlan([
      { id: "sc", steps: [{ stateId: "home", contractId: "openLogin" }] },
    ]);
    const results = [result("sc", true)];
    const stepEvidence: Record<string, StepEvidence[]> = {
      sc: [{ timingMs: 55, screenshot: { filePath: "", capturedAt: "2026-09-03T10:00:00Z" } }],
    };

    const html = renderHtmlReport({ run, plan, results, stepEvidence });

    expect(html).toContain("<details>");
    expect(html).toContain("55 ms");
    expect(html).not.toContain("<img");
  });

  it("MIXED_EVIDENCE — scenario with some steps having evidence and some not", () => {
    const plan = makePlan([
      {
        id: "sc",
        steps: [
          { stateId: "home", contractId: "openLogin" },
          { stateId: "loginDialog", contractId: "submitCredentials" },
        ],
      },
    ]);
    const results = [result("sc", true)];
    const stepEvidence: Record<string, StepEvidence[]> = {
      sc: [
        { timingMs: 30, screenshot: { filePath: "screenshots/run1/0.png", capturedAt: "2026-09-03T10:00:00Z" } },
        { timingMs: 80 },
      ],
    };

    const html = renderHtmlReport({ run, plan, results, stepEvidence });

    // Both steps get expandable evidence.
    const detailsMatches = html.match(/<details>/g);
    expect(detailsMatches?.length ?? 0).toBe(2);
    // Timing for both steps.
    expect(html).toContain("30 ms");
    expect(html).toContain("80 ms");
    // Screenshot only for the first step.
    expect(html).toContain('<img src="screenshots/run1/0.png"');
    // Second step has no screenshot — no second <img>.
    expect(html.match(/<img/g)?.length ?? 0).toBe(1);
  });

  it("CLOSED_BY_DEFAULT — step-level <details> has no open attribute", () => {
    const plan = makePlan([
      { id: "sc", steps: [{ stateId: "home", contractId: "openLogin" }] },
    ]);
    const results = [result("sc", true)];
    const stepEvidence: Record<string, StepEvidence[]> = {
      sc: [{ timingMs: 10 }],
    };

    const html = renderHtmlReport({ run, plan, results, stepEvidence });

    // The step-level details must be closed by default: the step's <details>
    // tag carries no `open` attribute (unlike the scenario wrapper's
    // <details open>).
    expect(html).toContain("<details>\n              <summary>");
    expect(html).not.toContain("<details open>\n              <summary>");
  });

  it("EMIT_FORWARDS — emitHtmlReport writes stepEvidence into the report file", () => {
    const corpusDir = makeCorpusDir();
    const plan = makePlan([
      { id: "sc", steps: [{ stateId: "home", contractId: "openLogin" }] },
    ]);
    const results = [result("sc", true)];
    const stepEvidence: Record<string, StepEvidence[]> = {
      sc: [{ timingMs: 77, screenshot: { filePath: "screenshots/run1/0.png", capturedAt: "2026-09-03T10:00:00Z" } }],
    };

    emitHtmlReport({ corpusDir, run, plan, results, stepEvidence });

    const written = readReport(corpusDir, run.runId);
    expect(written).toContain("77 ms");
    expect(written).toContain('<img src="screenshots/run1/0.png"');
  });
});
