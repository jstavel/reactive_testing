import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StepEvidence, TestPlan, ValidationResult } from "../model/schemas.js";
import { smokeTestPlan } from "../model/smoke.test-plan.js";
import { resolveLatestRun } from "./cli-shared.js";
import { generateSampleReport } from "./generate-sample-report.js";
import { buildStepEvidence, deriveScenarioResults, reportSmoke, USAGE } from "./report-smoke.js";

// Ghost-result injection: the offline runner is wrapped so one test can append
// a failing result for a contract no scenario references — proving the exit
// code reads ALL results. Every other test delegates to the real runner.
const ghostState = vi.hoisted(() => ({ appendGhostFailure: false }));

vi.mock("../validators/offline-runner.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../validators/offline-runner.js")>();
  const ghostResult: ValidationResult = {
    contractId: "ghostContract",
    passed: false,
    details: "orphan failure",
    corpusRefs: [],
  };
  return {
    ...actual,
    runValidatorsOffline: (
      corpusDir: string,
      runId: string,
      plan: TestPlan,
      contractIds?: string[],
    ) => {
      const results = actual.runValidatorsOffline(corpusDir, runId, plan, contractIds);
      return ghostState.appendGhostFailure ? [...results, ghostResult] : results;
    },
  };
});

const CAPTURED_AT = "2026-09-09T00:00:00.000Z";
const DIALOG_MARKER = 'role="dialog"';

// ---- Fixture corpus builders (mirroring bin/validate-smoke.test.ts) ----

function snapshot(stateId: string, url: string, snapshotBody = ""): unknown {
  return { stateId, url, snapshot: snapshotBody, capturedAt: CAPTURED_AT };
}

function writeSnapshot(
  corpusDir: string,
  runId: string,
  stepIndex: number,
  phase: "pre" | "post",
  record: unknown,
): void {
  const dir = join(corpusDir, "snapshots", runId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, phase === "pre" ? `${stepIndex}.pre.json` : `${stepIndex}.json`),
    JSON.stringify(record),
  );
}

function writeProbes(
  corpusDir: string,
  runId: string,
  stepIndex: number,
  records: unknown[],
): void {
  const dir = join(corpusDir, "probes", runId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${stepIndex}.json`), JSON.stringify(records));
}

function writeRunManifest(
  corpusDir: string,
  runId: string,
  files: string[],
  timestamp: string = CAPTURED_AT,
  planModelVersion: string | null = smokeTestPlan.modelVersion,
): void {
  mkdirSync(join(corpusDir, runId), { recursive: true });
  // `planModelVersion: null` omits the key — the legacy (pre-guard) manifest
  // shape the report guard must refuse. (`undefined` can't be the sentinel:
  // an explicit undefined would trigger the default.)
  writeFileSync(
    join(corpusDir, runId, "run-manifest.json"),
    JSON.stringify({
      runId,
      timestamp,
      ...(planModelVersion === null ? {} : { planModelVersion }),
      files,
    }),
  );
}

/** The post-step snapshot each contract's validator passes against (the
 * postconditions of model/contracts.ts, one row per contract). */
function postSnapshotFor(contractId: string): unknown {
  switch (contractId) {
    case "clickHistoryMenuMain":
      return snapshot("historyMain", "https://pro.kraken.com/app/history/main/ledger");
    case "clickHistoryMenuFutures":
      return snapshot("historyFutures", "https://pro.kraken.com/app/history/derivatives/ledger");
    case "clickPortfolioMenuOverview":
      return snapshot("portfolioOverview", "https://pro.kraken.com/app/portfolio/overview");
    case "clickPortfolioMenuMain":
      return snapshot("portfolioMain", "https://pro.kraken.com/app/portfolio/main");
    case "clickPortfolioMenuFutures":
      return snapshot("portfolioFutures", "https://pro.kraken.com/app/portfolio/derivatives");
    case "clickPortfolioMenuLoans":
      return snapshot("portfolioLoans", "https://pro.kraken.com/app/portfolio/loans");
    case "clickPortfolioMenuEarn":
      return snapshot("earn", "https://pro.kraken.com/app/earn");
    case "openPortfolioSummary":
      return snapshot("portfolioSummaryDialog", "https://pro.kraken.com/app/home", DIALOG_MARKER);
    case "toggleEyeIcon":
      return snapshot("portfolioSummaryDialog", "https://pro.kraken.com/app/home", DIALOG_MARKER);
    case "closePortfolioSummary":
      return snapshot("homePage", "https://pro.kraken.com/app/home");
    case "filterHistoryByAsset":
    case "paginateHistoryNext":
      return snapshot("historyMain", "https://pro.kraken.com/app/history/main/ledger");
    case "selectOrderBookTab":
      return snapshot("orderBook", "https://pro.kraken.com/app/trade/btc-usd");
    default:
      throw new Error(`fixture gap: no post snapshot for contract "${contractId}"`);
  }
}

/** The probe batch satisfying each contract's view-selected postcondition. */
function postProbesFor(contractId: string): unknown[] | undefined {
  const selectedView = (value: string): unknown[] => [
    { name: "selected-view", value, capturedAt: CAPTURED_AT },
  ];
  switch (contractId) {
    case "clickHistoryMenuMain":
    case "clickHistoryMenuFutures":
      return selectedView("Ledger");
    case "clickPortfolioMenuOverview":
      return selectedView("Overview");
    case "clickPortfolioMenuMain":
      return selectedView("Main");
    case "clickPortfolioMenuFutures":
      return selectedView("Futures");
    case "clickPortfolioMenuLoans":
      return selectedView("Loans");
    case "selectOrderBookTab":
      return [{ name: "selected-board-tab", value: "Order book", capturedAt: CAPTURED_AT }];
    default:
      return undefined;
  }
}

/** The pre-step snapshot each step's declared FSM state requires (dialog
 * preconditions evaluate the dialog marker against the pre snapshot). */
function preSnapshotFor(stateId: string): unknown {
  switch (stateId) {
    case "homePage":
      return snapshot("homePage", "https://pro.kraken.com/app/home");
    case "historyMain":
      return snapshot("historyMain", "https://pro.kraken.com/app/history/main/ledger");
    case "portfolioSummaryDialog":
      return snapshot("homePage", "https://pro.kraken.com/app/home", DIALOG_MARKER);
    case "orderBook":
      return snapshot("orderBook", "https://pro.kraken.com/app/trade/btc-usd");
    default:
      throw new Error(`fixture gap: no pre snapshot for state "${stateId}"`);
  }
}

/** A run over the real smoke plan whose 18 steps satisfy every declared
 * precondition and postcondition. */
function writeAllPassRun(
  corpusDir: string,
  runId: string,
  timestamp: string = CAPTURED_AT,
  planModelVersion: string | null = smokeTestPlan.modelVersion,
): void {
  const files: string[] = [];
  let stepIndex = 0;
  for (const scenario of smokeTestPlan.scenarios) {
    for (const step of scenario.steps) {
      writeSnapshot(corpusDir, runId, stepIndex, "pre", preSnapshotFor(step.stateId));
      files.push(`snapshots/${runId}/${stepIndex}.pre.json`);
      writeSnapshot(corpusDir, runId, stepIndex, "post", postSnapshotFor(step.contractId));
      files.push(`snapshots/${runId}/${stepIndex}.json`);
      const probes = postProbesFor(step.contractId);
      if (probes !== undefined) {
        writeProbes(corpusDir, runId, stepIndex, probes);
        files.push(`probes/${runId}/${stepIndex}.json`);
      }
      stepIndex += 1;
    }
  }
  writeRunManifest(corpusDir, runId, files, timestamp, planModelVersion);
}

/** Corrupt one step's post snapshot so its contract's validator fails while
 * the rest of the run stays green. */
function corruptPostUrl(corpusDir: string, runId: string, stepIndex: number, url: string): void {
  writeSnapshot(corpusDir, runId, stepIndex, "post", snapshot("homePage", url));
}

function linkLastRun(corpusDir: string, runId: string): void {
  mkdirSync(join(corpusDir, "@last-run"), { recursive: true });
  symlinkSync(join("..", runId), join(corpusDir, "@last-run", "manifest"));
}

/** Recursive file listing with a content hash — the read-only test compares
 * names AND bytes. Symlinks (the fan) are views, not files, and are skipped. */
function listFiles(dir: string, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      return listFiles(join(dir, entry.name), `${prefix}${entry.name}/`);
    }
    if (!entry.isFile()) {
      return [];
    }
    const digest = createHash("sha256")
      .update(readFileSync(join(dir, entry.name)))
      .digest("hex")
      .slice(0, 16);
    return [`${prefix}${entry.name} ${digest}`];
  });
}

// ---- deriveScenarioResults (pure) ----

/** A plan where one contract (c1) spans two scenarios and one scenario spans
 * two contracts — the queue-consumption shape of the real smoke plan (e.g.
 * openPortfolioSummary × 3 scenarios). */
const multiPlan: TestPlan = {
  planId: "smoke",
  modelVersion: "test-hash",
  scenarios: [
    {
      id: "a",
      steps: [
        { stateId: "s1", contractId: "c1" },
        { stateId: "s2", contractId: "c2" },
      ],
    },
    { id: "b", steps: [{ stateId: "s1", contractId: "c1" }] },
    { id: "c", steps: [{ stateId: "s1", contractId: "c3" }] },
  ],
};

function result(
  contractId: string,
  passed: boolean,
  details?: string,
): { contractId: string; passed: boolean; details?: string; corpusRefs: string[] } {
  return { contractId, passed, ...(details !== undefined ? { details } : {}), corpusRefs: [] };
}

describe("deriveScenarioResults", () => {
  it("consumes a contract's whole queue with the first referencing scenario, in plan-step order", () => {
    const results = [
      result("c1", true), // step 0 of scenario a
      result("c2", false, "boom"), // step 1 of scenario a
      result("c1", true), // step 2 of scenario b
    ];

    expect(deriveScenarioResults(multiPlan, results)).toEqual([
      // a owns both c1 results plus the failing c2 → fails with the detail.
      { id: "a", passed: false, error: "boom" },
      // b's c1 step was already consumed by a — zero checks, which don't veto.
      { id: "b", passed: true },
      { id: "c", passed: true },
    ]);
  });

  it("owns both results when the same contract appears twice within one scenario", () => {
    const twicePlan: TestPlan = {
      planId: "smoke",
      modelVersion: "test-hash",
      scenarios: [
        {
          id: "a",
          steps: [
            { stateId: "s1", contractId: "c1" },
            { stateId: "s2", contractId: "c1" },
          ],
        },
        { id: "b", steps: [{ stateId: "s1", contractId: "c2" }] },
      ],
    };
    const results = [result("c1", true), result("c1", false, "boom")];

    expect(deriveScenarioResults(twicePlan, results)).toEqual([
      { id: "a", passed: false, error: "boom" },
      { id: "b", passed: true },
    ]);
  });

  it("consumes the whole queue with the first consumer even when the failing step belongs to the second", () => {
    const sharedPlan: TestPlan = {
      planId: "smoke",
      modelVersion: "test-hash",
      scenarios: [
        { id: "first", steps: [{ stateId: "s1", contractId: "c1" }] },
        { id: "second", steps: [{ stateId: "s1", contractId: "c1" }] },
      ],
    };
    const results = [result("c1", true), result("c1", false, "late boom")];

    expect(deriveScenarioResults(sharedPlan, results)).toEqual([
      // Queue consumption: the first referencing scenario drains the whole
      // queue, so the second consumer's failing step still lands in "first".
      { id: "first", passed: false, error: "late boom" },
      { id: "second", passed: true },
    ]);
  });

  it("keeps plan order and aggregates a scenario's failures into one error string", () => {
    const results = [
      result("c1", false, "one"),
      result("c2", false, "two"),
      result("c3", false, "three"),
    ];

    expect(deriveScenarioResults(multiPlan, results)).toEqual([
      { id: "a", passed: false, error: "one; two" },
      { id: "b", passed: true },
      { id: "c", passed: false, error: "three" },
    ]);
  });

  it("fails a scenario whose consumed check lacks details, without an error string", () => {
    const results = [result("c2", false)];

    expect(deriveScenarioResults(multiPlan, results)).toEqual([
      { id: "a", passed: false },
      { id: "b", passed: true },
      { id: "c", passed: true },
    ]);
  });

  it("ignores results for contracts no scenario references (they land nowhere)", () => {
    const results = [result("ghost", false, "orphan")];

    expect(deriveScenarioResults(multiPlan, results)).toEqual([
      { id: "a", passed: true },
      { id: "b", passed: true },
      { id: "c", passed: true },
    ]);
  });

  it("passes every scenario when every check passed", () => {
    const results = [
      result("c1", true),
      result("c2", true),
      result("c1", true),
      result("c3", true),
    ];

    expect(deriveScenarioResults(multiPlan, results)).toEqual([
      { id: "a", passed: true },
      { id: "b", passed: true },
      { id: "c", passed: true },
    ]);
  });
});

// ---- reportSmoke (pure over argv + corpus state) ----

describe("reportSmoke", () => {
  let corpusDir: string;

  beforeEach(() => {
    corpusDir = mkdtempSync(join(tmpdir(), "report-smoke-"));
  });

  afterEach(() => {
    rmSync(corpusDir, { recursive: true, force: true });
  });

  it("writes the report and exits 0 with the path plus scenario/check summary", () => {
    writeAllPassRun(corpusDir, "run-1");

    const outcome = reportSmoke(["run-1"], { corpusDir });

    expect(outcome).toEqual({
      exitCode: 0,
      out: [
        `Report written: ${join(corpusDir, "run-1", "report.html")}, ${join(corpusDir, "run-1", "report.json")}`,
        "14/14 scenarios passed (18 checks)",
      ],
      err: [],
    });
    const report = readFileSync(join(corpusDir, "run-1", "report.html"), "utf8");
    expect(report).toContain("<h1>PASS</h1>");
    expect(report).toContain("14 passed, 0 failed, 14 total");
    expect(report).toContain("Clicking Main opens the History page for the Main account");
    // The CLI wiring reached the renderers: step 0 cites its fixture evidence…
    const reportJson = JSON.parse(
      readFileSync(join(corpusDir, "run-1", "report.json"), "utf8"),
    ) as {
      scenarios: Array<{ steps: Array<Record<string, string>> }>;
    };
    expect(reportJson.scenarios[0]?.steps[0]).toMatchObject({
      snapshotPre: "snapshots/run-1/0.pre.json",
      snapshotPost: "snapshots/run-1/0.json",
      probes: "probes/run-1/0.json",
    });
    // …and the html renders those refs as links.
    expect(report).toContain('class="step-link"');
  });

  it("defaults to the @last-run fan's run and writes its report", () => {
    writeAllPassRun(corpusDir, "r-older", "2026-09-08T00:00:00.000Z");
    writeAllPassRun(corpusDir, "r-newer", "2026-09-09T00:00:00.000Z");
    linkLastRun(corpusDir, "r-older");

    const outcome = reportSmoke([], { corpusDir });

    expect(outcome.exitCode).toBe(0);
    expect(outcome.out).toContain(
      `Report written: ${join(corpusDir, "r-older", "report.html")}, ${join(corpusDir, "r-older", "report.json")}`,
    );
    expect(existsSync(join(corpusDir, "r-older", "report.html"))).toBe(true);
    expect(existsSync(join(corpusDir, "r-newer", "report.html"))).toBe(false);
  });

  it("SAMPLE_RUN_DEFAULT — the implicit default reports the newest real run, never the mock fixture", () => {
    writeAllPassRun(corpusDir, "r-real", "2026-09-08T00:00:00.000Z");
    // The committed fixture's manifest carries a fixed future timestamp that
    // would otherwise always win the implicit default.
    writeRunManifest(corpusDir, "example", [], "2026-09-11T00:00:00.000Z");

    const outcome = reportSmoke([], { corpusDir });

    expect(outcome.exitCode).toBe(0);
    expect(outcome.out).toContain(
      `Report written: ${join(corpusDir, "r-real", "report.html")}, ${join(corpusDir, "r-real", "report.json")}`,
    );
    expect(existsSync(join(corpusDir, "example", "report.html"))).toBe(false);
  });

  it("NEWEST_SKIP — the implicit default never reports the fail-demo throwaway", () => {
    writeAllPassRun(corpusDir, "r-real", "2026-09-08T00:00:00.000Z");
    // The failure demo's throwaway carries the same fixed future timestamp;
    // a leftover red demo must never hijack the implicit default.
    writeRunManifest(corpusDir, "fail-demo", [], "2026-09-11T00:00:00.000Z");

    const outcome = reportSmoke([], { corpusDir });

    expect(outcome.exitCode).toBe(0);
    expect(outcome.out).toContain(
      `Report written: ${join(corpusDir, "r-real", "report.html")}, ${join(corpusDir, "r-real", "report.json")}`,
    );
    expect(existsSync(join(corpusDir, "fail-demo", "report.html"))).toBe(false);
  });

  it("NEWEST_SKIP — an explicit fail-demo runId still resolves and reports the throwaway run", () => {
    writeAllPassRun(corpusDir, "fail-demo", "2026-09-11T00:00:00.000Z");

    const outcome = reportSmoke(["fail-demo"], { corpusDir });

    expect(outcome.exitCode).toBe(0);
    expect(outcome.out).toContain(
      `Report written: ${join(corpusDir, "fail-demo", "report.html")}, ${join(corpusDir, "fail-demo", "report.json")}`,
    );
  });

  it("NEWEST_SKIP — a lone fail-demo run never becomes the implicit default", () => {
    writeRunManifest(corpusDir, "fail-demo", [], "2026-09-11T00:00:00.000Z");

    expect(resolveLatestRun(corpusDir)).toBeNull();

    const outcome = reportSmoke([], { corpusDir });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.err[0]).toBe(
      `No recorded run found in ${corpusDir}/ — record one first with \`npm run run:smoke\`.`,
    );
    expect(existsSync(join(corpusDir, "fail-demo", "report.html"))).toBe(false);
  });

  it("FAIL_DEMO_E2E — reports a real minted fail-demo fixture red: both reports written, exit 1, pinned error", () => {
    // A real fail-demo fixture (the --fail generator), not a synthetic run.
    expect(generateSampleReport(corpusDir, { fail: true }).exitCode).toBe(0);

    const outcome = reportSmoke(["fail-demo"], { corpusDir });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.err).toEqual([]);
    expect(outcome.out).toContain("13/14 scenarios passed (18 checks)");
    expect(existsSync(join(corpusDir, "fail-demo", "report.html"))).toBe(true);
    expect(existsSync(join(corpusDir, "fail-demo", "report.json"))).toBe(true);
    expect(readFileSync(join(corpusDir, "fail-demo", "report.html"), "utf8")).toContain(
      "<h1>FAIL</h1>",
    );
    const report = JSON.parse(
      readFileSync(join(corpusDir, "fail-demo", "report.json"), "utf8"),
    ) as { scenarios: Array<{ id: string; passed: boolean; error?: string }> };
    const failed = report.scenarios.filter((s) => !s.passed);
    expect(failed).toHaveLength(1);
    expect(failed[0]?.id).toBe("clicking-main-opens-the-portfolio-page-with-the-main-view");
    expect(failed[0]?.error).toBe(
      '[postcondition] url-is "/app/portfolio/main" but url pathname is "/app/portfolio/futures"',
    );
  });

  it("EMPTY_VALUE — an empty --corpus-dir value is rejected with the Invalid-argument(s) + usage error", () => {
    const outcome = reportSmoke(["--corpus-dir", ""], { corpusDir });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.out).toEqual([]);
    expect(outcome.err[0]).toContain("Invalid argument(s)");
    expect(outcome.err.at(-1)).toBe(USAGE);
  });

  it("still writes the report on failing checks and exits 1 with a red bar", () => {
    writeAllPassRun(corpusDir, "run-1");
    corruptPostUrl(corpusDir, "run-1", 1, "https://pro.kraken.com/app/wrong");

    const outcome = reportSmoke(["run-1"], { corpusDir });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.err).toEqual([]);
    expect(outcome.out.at(-1)).toBe("13/14 scenarios passed (18 checks)");
    const report = readFileSync(join(corpusDir, "run-1", "report.html"), "utf8");
    expect(report).toContain("<h1>FAIL</h1>");
    expect(report).toContain("13 passed, 1 failed, 14 total");
  });

  it("exits 1 with usage when the report cannot be written (no raw stack trace)", () => {
    writeAllPassRun(corpusDir, "run-1");
    // A directory where report.html must go makes writeFileSync throw EISDIR.
    mkdirSync(join(corpusDir, "run-1", "report.html"));

    const outcome = reportSmoke(["run-1"], { corpusDir });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.out).toEqual([]);
    expect(outcome.err[0]).toMatch(/^report could not be written: EISDIR/);
    expect(outcome.err.at(-1)).toBe(USAGE);
  });

  it("removes the half-written pair when report.json cannot be written (nothing left behind)", () => {
    writeAllPassRun(corpusDir, "run-1");
    // A directory where report.json must go makes the json write throw EISDIR
    // after the html half was already written.
    mkdirSync(join(corpusDir, "run-1", "report.json"));

    const outcome = reportSmoke(["run-1"], { corpusDir });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.out).toEqual([]);
    expect(outcome.err[0]).toMatch(/^report could not be written: EISDIR/);
    expect(outcome.err.at(-1)).toBe(USAGE);
    // The pair is atomic: the just-written report.html is rolled back.
    expect(existsSync(join(corpusDir, "run-1", "report.html"))).toBe(false);
  });

  it("exits 1 when a check failed for a contract no scenario references (ghost result)", () => {
    writeAllPassRun(corpusDir, "run-1");
    ghostState.appendGhostFailure = true;
    try {
      const outcome = reportSmoke(["run-1"], { corpusDir });

      // The orphan failure lands in no scenario, so the scenario summary stays
      // green — but the frozen exit code reads ALL validation results.
      expect(outcome.exitCode).toBe(1);
      expect(outcome.err).toEqual([]);
      expect(outcome.out).toEqual([
        `Report written: ${join(corpusDir, "run-1", "report.html")}, ${join(corpusDir, "run-1", "report.json")}`,
        "14/14 scenarios passed (19 checks)",
      ]);
      expect(existsSync(join(corpusDir, "run-1", "report.html"))).toBe(true);
    } finally {
      ghostState.appendGhostFailure = false;
    }
  });

  it("exits 1 with the unknown-run error and writes nothing for an unknown runId", () => {
    const outcome = reportSmoke(["missing-run"], { corpusDir });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.out).toEqual([]);
    expect(outcome.err[0]).toBe(
      `Unknown run "missing-run" — no run-manifest.json in ${corpusDir}/missing-run/.`,
    );
    expect(outcome.err.at(-1)).toBe(USAGE);
    expect(existsSync(join(corpusDir, "missing-run"))).toBe(false);
  });

  it("exits 1 with the unknown-run error for a runId that could escape the corpus", () => {
    const outcome = reportSmoke(["../evil"], { corpusDir });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.out).toEqual([]);
    expect(outcome.err[0]).toBe(
      `Unknown run "../evil" — no run-manifest.json in ${corpusDir}/../evil/.`,
    );
    expect(outcome.err.at(-1)).toBe(USAGE);
  });

  it("exits 1 with guidance when no run is recorded", () => {
    const outcome = reportSmoke([], { corpusDir });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.out).toEqual([]);
    expect(outcome.err[0]).toBe(
      `No recorded run found in ${corpusDir}/ — record one first with \`npm run run:smoke\`.`,
    );
    expect(outcome.err.at(-1)).toBe(USAGE);
  });

  it("exits 1 without writing a report when the manifest is unreadable (zero checks)", () => {
    mkdirSync(join(corpusDir, "run-1"), { recursive: true });
    writeFileSync(join(corpusDir, "run-1", "run-manifest.json"), "{not json");

    const outcome = reportSmoke(["run-1"], { corpusDir });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.out).toEqual([]);
    expect(outcome.err[0]).toBe(
      'no checks ran for "run-1" — the run manifest was unreadable or lacks a timestamp, or the plan declares no steps.',
    );
    expect(outcome.err.at(-1)).toBe(USAGE);
    expect(existsSync(join(corpusDir, "run-1", "report.html"))).toBe(false);
  });

  it("exits 1 without writing a report when the manifest parses but lacks a timestamp (zero checks)", () => {
    // Timestampless but provenance-MATCHING: the guard passes (MATCH) and the
    // header read fails → the existing zero-checks family (unchanged). A
    // timestampless manifest with a MISSING/MISMATCHED version is refused by
    // the guard instead — see the plan-version-guard describe below.
    mkdirSync(join(corpusDir, "run-1"), { recursive: true });
    writeFileSync(
      join(corpusDir, "run-1", "run-manifest.json"),
      JSON.stringify({ runId: "run-1", files: [], planModelVersion: smokeTestPlan.modelVersion }),
    );

    const outcome = reportSmoke(["run-1"], { corpusDir });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.out).toEqual([]);
    expect(outcome.err[0]).toBe(
      'no checks ran for "run-1" — the run manifest was unreadable or lacks a timestamp, or the plan declares no steps.',
    );
    expect(outcome.err.at(-1)).toBe(USAGE);
    expect(existsSync(join(corpusDir, "run-1", "report.html"))).toBe(false);
  });

  it("exits 1 without writing a report when the plan declares no steps (zero checks)", () => {
    // The manifest's planModelVersion must match THIS test's validating plan.
    writeRunManifest(corpusDir, "run-1", [], CAPTURED_AT, "test-hash");
    const emptyPlan: TestPlan = { planId: "smoke", modelVersion: "test-hash", scenarios: [] };

    const outcome = reportSmoke(["run-1"], { corpusDir, plan: emptyPlan });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.out).toEqual([]);
    expect(outcome.err[0]).toBe(
      'no checks ran for "run-1" — the run manifest was unreadable or lacks a timestamp, or the plan declares no steps.',
    );
    expect(existsSync(join(corpusDir, "run-1", "report.html"))).toBe(false);
  });

  it("exits 1 with usage guidance on a usage error (flags are not positional args)", () => {
    const outcome = reportSmoke(["--run", "xyz"], { corpusDir });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.out).toEqual([]);
    expect(outcome.err[0]).toBe(
      "Invalid argument(s): --run, xyz — only positional [<runId>] is accepted.",
    );
    expect(outcome.err.at(-1)).toBe(USAGE);
  });

  it("rejects extra positionals — only [<runId>] is accepted", () => {
    const outcome = reportSmoke(["run-1", "extra"], { corpusDir });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.out).toEqual([]);
    expect(outcome.err[0]).toBe(
      "Invalid argument(s): run-1, extra — only positional [<runId>] is accepted.",
    );
  });

  it("mutates the corpus only by writing report.html and report.json", () => {
    writeAllPassRun(corpusDir, "run-1");
    linkLastRun(corpusDir, "run-1");
    const before = listFiles(corpusDir);

    const outcome = reportSmoke([], { corpusDir });

    // A silently-failing write must not pass the "only the reports are written"
    // assertion vacuously: the run must have succeeded and both files must exist.
    expect(outcome.exitCode).toBe(0);
    expect(existsSync(join(corpusDir, "run-1", "report.html"))).toBe(true);
    expect(existsSync(join(corpusDir, "run-1", "report.json"))).toBe(true);
    expect(
      listFiles(corpusDir).filter(
        (entry) => !entry.includes("report.html") && !entry.includes("report.json"),
      ),
    ).toEqual(before);
  });
});

describe("plan-version guard (story 6 — report side)", () => {
  let corpusDir: string;

  beforeEach(() => {
    corpusDir = mkdtempSync(join(tmpdir(), "report-smoke-guard-"));
  });

  afterEach(() => {
    rmSync(corpusDir, { recursive: true, force: true });
  });

  it("MATCH — a manifest whose planModelVersion equals the plan's reports exactly as today", () => {
    writeAllPassRun(corpusDir, "run-1");

    const outcome = reportSmoke(["run-1"], { corpusDir });

    expect(outcome.exitCode).toBe(0);
    expect(outcome.err).toEqual([]);
    expect(outcome.out.at(-1)).toBe("14/14 scenarios passed (18 checks)");
  });

  it("MISMATCH — a different recorded version exits 1 with the re-record message and NOTHING is written", () => {
    writeAllPassRun(corpusDir, "run-1", CAPTURED_AT, "stale-model-hash");
    // Pre-existing reports from an earlier reporting pass: a refusal must
    // leave them byte-identical (nothing written/truncated).
    writeFileSync(join(corpusDir, "run-1", "report.html"), "<h1>PRE-EXISTING</h1>");
    writeFileSync(join(corpusDir, "run-1", "report.json"), '{"schema":"pre-existing"}');

    const outcome = reportSmoke(["run-1"], { corpusDir });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.out).toEqual([]);
    expect(outcome.err).toEqual([
      `model changed since recording (stale-model-hash ≠ ${smokeTestPlan.modelVersion}) — re-record the run (run:smoke)`,
    ]);
    expect(outcome.err.at(-1)).not.toContain("Usage:");
    // No report or validation on a guard failure — the pre-existing pair
    // stands untouched, byte for byte.
    expect(readFileSync(join(corpusDir, "run-1", "report.html"), "utf8")).toBe(
      "<h1>PRE-EXISTING</h1>",
    );
    expect(readFileSync(join(corpusDir, "run-1", "report.json"), "utf8")).toBe(
      '{"schema":"pre-existing"}',
    );
  });

  it("MISMATCH — the guard also refuses the implicitly resolved latest run", () => {
    writeAllPassRun(corpusDir, "run-1", CAPTURED_AT, "stale-model-hash");
    linkLastRun(corpusDir, "run-1");

    const outcome = reportSmoke([], { corpusDir });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.err[0]).toContain("model changed since recording (stale-model-hash ≠");
    expect(existsSync(join(corpusDir, "run-1", "report.html"))).toBe(false);
    expect(existsSync(join(corpusDir, "run-1", "report.json"))).toBe(false);
  });

  it("LEGACY — a manifest without planModelVersion exits 1 with the predates-guard message and writes nothing", () => {
    writeAllPassRun(corpusDir, "run-1", CAPTURED_AT, null);
    // Pre-existing reports: the refusal preserves them byte-identically.
    writeFileSync(join(corpusDir, "run-1", "report.html"), "<h1>PRE-EXISTING</h1>");
    writeFileSync(join(corpusDir, "run-1", "report.json"), '{"schema":"pre-existing"}');

    const outcome = reportSmoke(["run-1"], { corpusDir });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.out).toEqual([]);
    expect(outcome.err).toEqual([
      "run predates the plan-version guard (no planModelVersion in the manifest) — re-record the run (run:smoke)",
    ]);
    expect(outcome.err.at(-1)).not.toContain("no checks ran");
    expect(outcome.err.at(-1)).not.toContain("Usage:");
    expect(readFileSync(join(corpusDir, "run-1", "report.html"), "utf8")).toBe(
      "<h1>PRE-EXISTING</h1>",
    );
    expect(readFileSync(join(corpusDir, "run-1", "report.json"), "utf8")).toBe(
      '{"schema":"pre-existing"}',
    );
  });

  it("LEGACY — an empty-string planModelVersion gets the predates-guard message, not a mismatch", () => {
    writeAllPassRun(corpusDir, "run-1", CAPTURED_AT, "");

    const outcome = reportSmoke(["run-1"], { corpusDir });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.out).toEqual([]);
    expect(outcome.err).toEqual([
      "run predates the plan-version guard (no planModelVersion in the manifest) — re-record the run (run:smoke)",
    ]);
    expect(existsSync(join(corpusDir, "run-1", "report.html"))).toBe(false);
    expect(existsSync(join(corpusDir, "run-1", "report.json"))).toBe(false);
  });

  it("TIMESTAMPLESS — a parseable-but-timestampless manifest with a MISSING version is LEGACY, never zero-checks", () => {
    mkdirSync(join(corpusDir, "run-1"), { recursive: true });
    writeFileSync(
      join(corpusDir, "run-1", "run-manifest.json"),
      JSON.stringify({ runId: "run-1", files: [] }),
    );

    const outcome = reportSmoke(["run-1"], { corpusDir });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.out).toEqual([]);
    expect(outcome.err).toEqual([
      "run predates the plan-version guard (no planModelVersion in the manifest) — re-record the run (run:smoke)",
    ]);
    expect(existsSync(join(corpusDir, "run-1", "report.html"))).toBe(false);
    expect(existsSync(join(corpusDir, "run-1", "report.json"))).toBe(false);
  });

  it("TIMESTAMPLESS — a parseable-but-timestampless manifest with a MISMATCHED version is refused, never zero-checks", () => {
    mkdirSync(join(corpusDir, "run-1"), { recursive: true });
    writeFileSync(
      join(corpusDir, "run-1", "run-manifest.json"),
      JSON.stringify({ runId: "run-1", files: [], planModelVersion: "stale-model-hash" }),
    );

    const outcome = reportSmoke(["run-1"], { corpusDir });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.out).toEqual([]);
    expect(outcome.err).toEqual([
      `model changed since recording (stale-model-hash ≠ ${smokeTestPlan.modelVersion}) — re-record the run (run:smoke)`,
    ]);
    expect(existsSync(join(corpusDir, "run-1", "report.html"))).toBe(false);
    expect(existsSync(join(corpusDir, "run-1", "report.json"))).toBe(false);
  });

  it("UNREADABLE — an unparseable or non-object manifest keeps the existing zero-checks outcome (guard skips)", () => {
    mkdirSync(join(corpusDir, "run-1"), { recursive: true });
    writeFileSync(join(corpusDir, "run-1", "run-manifest.json"), "{not json");

    const outcome = reportSmoke(["run-1"], { corpusDir });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.err[0]).toBe(
      'no checks ran for "run-1" — the run manifest was unreadable or lacks a timestamp, or the plan declares no steps.',
    );
    expect(existsSync(join(corpusDir, "run-1", "report.html"))).toBe(false);

    // Non-object JSON (a bare number): same zero-checks family, never LEGACY.
    writeFileSync(join(corpusDir, "run-1", "run-manifest.json"), "123");
    const nonObject = reportSmoke(["run-1"], { corpusDir });

    expect(nonObject.exitCode).toBe(1);
    expect(nonObject.err[0]).toBe(
      'no checks ran for "run-1" — the run manifest was unreadable or lacks a timestamp, or the plan declares no steps.',
    );
  });
});

// ---- buildStepEvidence (the CLI-side existence filter; I/O matrix) ----

describe("buildStepEvidence", () => {
  let corpusDir: string;

  beforeEach(() => {
    corpusDir = mkdtempSync(join(tmpdir(), "report-smoke-ev-"));
  });

  afterEach(() => {
    rmSync(corpusDir, { recursive: true, force: true });
  });

  /** A two-step plan so the global step index (0, 1) is observable. */
  const evidencePlan: TestPlan = {
    planId: "smoke",
    modelVersion: "test-hash",
    scenarios: [
      {
        id: "a",
        steps: [
          { stateId: "s1", contractId: "c1" },
          { stateId: "s2", contractId: "c2" },
        ],
      },
    ],
  };

  function writeCorpusJson(relPath: string, content: unknown): void {
    const abs = join(corpusDir, relPath);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, typeof content === "string" ? content : JSON.stringify(content));
  }

  it("FULL_EVIDENCE — every present kind becomes a ref, timing from the snapshots' capturedAt", () => {
    writeCorpusJson(`snapshots/run-1/0.pre.json`, { capturedAt: "2026-09-11T09:00:00.000Z" });
    writeCorpusJson(`snapshots/run-1/0.json`, { capturedAt: "2026-09-11T09:00:00.412Z" });
    writeCorpusJson(`probes/run-1/0.json`, [
      { name: "selected-view", value: "Main", capturedAt: "2026-09-11T09:00:00.412Z" },
    ]);
    writeCorpusJson(`network/run-1/0.json`, [
      { url: "https://x", method: "GET", status: 200, capturedAt: "2026-09-11T09:00:00.412Z" },
    ]);
    writeCorpusJson(`screenshots/run-1/0.json`, {
      filePath: "screenshots/run-1/0.png",
      capturedAt: "2026-09-11T09:00:00.412Z",
    });
    // The ref's target PNG must exist (regular file) for the ref to be cited.
    writeCorpusJson(`screenshots/run-1/0.png`, "png-bytes");

    const evidence = buildStepEvidence(evidencePlan, corpusDir, "run-1");

    expect(evidence.a).toEqual([
      {
        timingMs: 412,
        snapshotPre: "snapshots/run-1/0.pre.json",
        snapshotPost: "snapshots/run-1/0.json",
        probes: "probes/run-1/0.json",
        network: "network/run-1/0.json",
        screenshot: { filePath: "screenshots/run-1/0.png", capturedAt: "2026-09-11T09:00:00.412Z" },
      } satisfies StepEvidence,
      { timingMs: 0 },
    ]);
  });

  it("MISSING_KIND — absent kinds are omitted; remaining refs are unaffected", () => {
    writeCorpusJson(`snapshots/run-1/0.pre.json`, { capturedAt: "2026-09-11T09:00:00.000Z" });
    writeCorpusJson(`snapshots/run-1/0.json`, { capturedAt: "2026-09-11T09:00:00.100Z" });

    const evidence = buildStepEvidence(evidencePlan, corpusDir, "run-1");

    expect(evidence.a?.[0]).toEqual({
      timingMs: 100,
      snapshotPre: "snapshots/run-1/0.pre.json",
      snapshotPost: "snapshots/run-1/0.json",
    });
  });

  it("NEGATIVE_TIMING — a post snapshot captured before the pre snapshot clamps to 0", () => {
    writeCorpusJson(`snapshots/run-1/0.pre.json`, { capturedAt: "2026-09-11T09:00:05.000Z" });
    writeCorpusJson(`snapshots/run-1/0.json`, { capturedAt: "2026-09-11T09:00:00.000Z" });

    const evidence = buildStepEvidence(evidencePlan, corpusDir, "run-1");

    // Nonsense delta clamps to 0; the refs themselves stay.
    expect(evidence.a?.[0]).toEqual({
      timingMs: 0,
      snapshotPre: "snapshots/run-1/0.pre.json",
      snapshotPost: "snapshots/run-1/0.json",
    });
  });

  it("DANGLING_SCREENSHOT — a sidecar whose target PNG is missing cites no screenshot ref", () => {
    writeCorpusJson(`snapshots/run-1/0.pre.json`, { capturedAt: "2026-09-11T09:00:00.000Z" });
    writeCorpusJson(`snapshots/run-1/0.json`, { capturedAt: "2026-09-11T09:00:00.100Z" });
    writeCorpusJson(`screenshots/run-1/0.json`, {
      filePath: "screenshots/run-1/0.png",
      capturedAt: "2026-09-11T09:00:00.100Z",
    });

    const evidence = buildStepEvidence(evidencePlan, corpusDir, "run-1");

    expect(evidence.a?.[0]).toEqual({
      timingMs: 100,
      snapshotPre: "snapshots/run-1/0.pre.json",
      snapshotPost: "snapshots/run-1/0.json",
    });
  });

  it("NON_REGULAR_REF — a directory sitting at a ref path is never cited", () => {
    writeCorpusJson(`snapshots/run-1/0.pre.json`, { capturedAt: "2026-09-11T09:00:00.000Z" });
    writeCorpusJson(`snapshots/run-1/0.json`, { capturedAt: "2026-09-11T09:00:00.100Z" });
    mkdirSync(join(corpusDir, "network/run-1/0.json"), { recursive: true });

    const evidence = buildStepEvidence(evidencePlan, corpusDir, "run-1");

    expect(evidence.a?.[0]).toEqual({
      timingMs: 100,
      snapshotPre: "snapshots/run-1/0.pre.json",
      snapshotPost: "snapshots/run-1/0.json",
    });
  });

  it("TIMING_FALLBACK — missing or unparseable snapshots yield timingMs 0 while refs stay", () => {
    // Step 0: pre exists but is unparseable; post is absent entirely.
    writeCorpusJson(`snapshots/run-1/0.pre.json`, "{not json");
    // Step 1: both parse but carry no usable capturedAt.
    writeCorpusJson(`snapshots/run-1/1.pre.json`, { stateId: "s1" });
    writeCorpusJson(`snapshots/run-1/1.json`, { capturedAt: "not-a-date" });

    const evidence = buildStepEvidence(evidencePlan, corpusDir, "run-1");

    // Existing (unparseable / untimed) snapshot files still cite as refs —
    // only timing degrades to 0.
    expect(evidence.a?.[0]).toEqual({ timingMs: 0, snapshotPre: "snapshots/run-1/0.pre.json" });
    expect(evidence.a?.[1]).toEqual({
      timingMs: 0,
      snapshotPre: "snapshots/run-1/1.pre.json",
      snapshotPost: "snapshots/run-1/1.json",
    });
  });

  it("aligns refs by the plan's global step index across scenarios", () => {
    const twoScenarioPlan: TestPlan = {
      planId: "smoke",
      modelVersion: "test-hash",
      scenarios: [
        { id: "a", steps: [{ stateId: "s1", contractId: "c1" }] },
        { id: "b", steps: [{ stateId: "s1", contractId: "c1" }] },
      ],
    };
    writeCorpusJson(`network/run-1/1.json`, []);

    const evidence = buildStepEvidence(twoScenarioPlan, corpusDir, "run-1");

    // Scenario b's step is global step 1, not 0 — no per-scenario restart.
    expect(evidence.a).toEqual([{ timingMs: 0 }]);
    expect(evidence.b).toEqual([{ timingMs: 0, network: "network/run-1/1.json" }]);
  });
});

// ---- npm report:smoke (process-level operator surface, one spawn per
// I/O-matrix scenario) ----

describe("npm report:smoke (process-level operator surface)", () => {
  const repoRoot = resolve(import.meta.dirname, "..");
  // Windows spawns npm via the .cmd shim.
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  let corpusDir: string;

  function spawnReportSmoke(
    args: readonly string[],
    corpusDirOverride?: string,
  ): { status: number; out: string; err: string } {
    try {
      const out = execFileSync(
        npm,
        ["run", "--silent", "report:smoke", ...(args.length > 0 ? ["--", ...args] : [])],
        {
          cwd: repoRoot,
          env:
            corpusDirOverride === undefined
              ? process.env
              : { ...process.env, CORPUS_DIR: corpusDirOverride },
          encoding: "utf8",
          timeout: 60_000,
        },
      );
      return { status: 0, out, err: "" };
    } catch (error) {
      const failure = error as { status?: number; stdout?: string; stderr?: string };
      return { status: failure.status ?? 1, out: failure.stdout ?? "", err: failure.stderr ?? "" };
    }
  }

  beforeEach(() => {
    corpusDir = mkdtempSync(join(tmpdir(), "report-smoke-spawn-"));
  });

  afterEach(() => {
    rmSync(corpusDir, { recursive: true, force: true });
  });

  it("writes the report for an explicit known run and exits 0", () => {
    writeAllPassRun(corpusDir, "spawn-run");

    const { status, out } = spawnReportSmoke(["spawn-run"], corpusDir);

    expect(status).toBe(0);
    expect(out).toContain(`Report written: ${join(corpusDir, "spawn-run", "report.html")}`);
    expect(out).toContain("14/14 scenarios passed (18 checks)");
    const report = readFileSync(join(corpusDir, "spawn-run", "report.html"), "utf8");
    expect(report).toContain("<h1>PASS</h1>");
  });

  it("writes the report for the latest run with no arguments and exits 0", () => {
    writeAllPassRun(corpusDir, "spawn-latest", "2026-09-09T00:00:00.000Z");
    writeAllPassRun(corpusDir, "spawn-older", "2026-09-08T00:00:00.000Z");
    linkLastRun(corpusDir, "spawn-latest");

    const { status, out } = spawnReportSmoke([], corpusDir);

    expect(status).toBe(0);
    expect(out).toContain(`Report written: ${join(corpusDir, "spawn-latest", "report.html")}`);
    expect(out).toContain("14/14 scenarios passed (18 checks)");
  });

  it("still writes the report and exits 1 when a validator fails", () => {
    writeAllPassRun(corpusDir, "spawn-run");
    corruptPostUrl(corpusDir, "spawn-run", 1, "https://pro.kraken.com/app/wrong");

    const { status, out } = spawnReportSmoke(["spawn-run"], corpusDir);

    expect(status).toBe(1);
    expect(out).toContain("13/14 scenarios passed (18 checks)");
    const report = readFileSync(join(corpusDir, "spawn-run", "report.html"), "utf8");
    expect(report).toContain("<h1>FAIL</h1>");
    expect(report).toContain("13 passed, 1 failed, 14 total");
  });

  it("exits 1 with the unknown-run error and writes nothing", () => {
    const { status, out, err } = spawnReportSmoke(["unknown-run"], corpusDir);

    expect(status).toBe(1);
    expect(out).toBe("");
    expect(err).toContain(
      `Unknown run "unknown-run" — no run-manifest.json in ${corpusDir}/unknown-run/.`,
    );
    expect(err).toContain("Usage: npm run report:smoke");
    expect(existsSync(join(corpusDir, "unknown-run"))).toBe(false);
  });

  it("exits 1 with the no-recorded-run error on an empty corpus", () => {
    const { status, out, err } = spawnReportSmoke([], corpusDir);

    expect(status).toBe(1);
    expect(out).toBe("");
    expect(err).toContain(
      `No recorded run found in ${corpusDir}/ — record one first with \`npm run run:smoke\`.`,
    );
  });

  it("exits 1 with the zero-checks error on an unreadable manifest, writing no report", () => {
    mkdirSync(join(corpusDir, "spawn-run"), { recursive: true });
    writeFileSync(join(corpusDir, "spawn-run", "run-manifest.json"), "{not json");

    const { status, out, err } = spawnReportSmoke(["spawn-run"], corpusDir);

    expect(status).toBe(1);
    expect(out).toBe("");
    expect(err).toContain(
      'no checks ran for "spawn-run" — the run manifest was unreadable or lacks a timestamp, or the plan declares no steps.',
    );
    expect(existsSync(join(corpusDir, "spawn-run", "report.html"))).toBe(false);
  });

  it("exits 1 with the invalid-argument error on a flag", () => {
    const { status, out, err } = spawnReportSmoke(["--run", "xyz"], corpusDir);

    expect(status).toBe(1);
    expect(out).toBe("");
    expect(err).toContain(
      "Invalid argument(s): --run, xyz — only positional [<runId>] is accepted.",
    );
    expect(err).toContain("Usage: npm run report:smoke");
  });

  it("exits 0 with --corpus-dir targeting the corpus (before the runId)", () => {
    writeAllPassRun(corpusDir, "spawn-run");

    const { status, out } = spawnReportSmoke(["--corpus-dir", corpusDir, "spawn-run"]);

    expect(status).toBe(0);
    expect(out).toContain(`Report written: ${join(corpusDir, "spawn-run", "report.html")}`);
    expect(out).toContain("14/14 scenarios passed (18 checks)");
  });

  it("FLAG_PRECEDENCE — the --corpus-dir flag wins over the CORPUS_DIR env", () => {
    writeAllPassRun(corpusDir, "spawn-run");
    // An empty decoy corpus: the env would fail with "no recorded run".
    const decoy = mkdtempSync(join(tmpdir(), "report-smoke-decoy-"));

    const { status, out } = spawnReportSmoke(["spawn-run", "--corpus-dir", corpusDir], decoy);

    expect(status).toBe(0);
    expect(out).toContain(`Report written: ${join(corpusDir, "spawn-run", "report.html")}`);
    rmSync(decoy, { recursive: true, force: true });
  });

  it("exits 1 with the invalid-argument error on an unknown flag (--bogus)", () => {
    const { status, out, err } = spawnReportSmoke(["--bogus"], corpusDir);

    expect(status).toBe(1);
    expect(out).toBe("");
    expect(err).toContain("Invalid argument(s): --bogus — only positional [<runId>] is accepted.");
    expect(err).toContain("Usage: npm run report:smoke");
  });

  it("exits 1 with the invalid-argument error on extra positionals after the flag", () => {
    writeAllPassRun(corpusDir, "spawn-run");

    const { status, err } = spawnReportSmoke(["--corpus-dir", corpusDir, "spawn-run", "extra"]);

    expect(status).toBe(1);
    expect(err).toContain(
      "Invalid argument(s): spawn-run, extra — only positional [<runId>] is accepted.",
    );
  });

  it("pins report:smoke against the latest recorded corpus run (expiry-pinned, guard-aware)", () => {
    const latestRunId = resolveLatestRun(join(repoRoot, "corpus"));
    // Corpus runs live only where a smoke ran (corpus/ is not versioned), so
    // the pin degrades to a skip on machines without one — but wherever a run
    // exists, its outcome is pinned: 14/14 when the run was recorded under the
    // current model, or the story-6 re-record refusal when the run predates
    // the plan-version guard (a legacy local run is never silently accepted).
    if (latestRunId === null) {
      return;
    }
    const manifest = JSON.parse(
      readFileSync(join(repoRoot, "corpus", latestRunId, "run-manifest.json"), "utf8"),
    ) as { planModelVersion?: unknown };

    if (typeof manifest.planModelVersion !== "string") {
      // A previous report:smoke run may have left a report pair in this local
      // run dir — clear it so "nothing is written" is provable.
      rmSync(join(repoRoot, "corpus", latestRunId, "report.html"), { force: true });
      rmSync(join(repoRoot, "corpus", latestRunId, "report.json"), { force: true });
    }

    const { status, out, err } = spawnReportSmoke([], join(repoRoot, "corpus"));

    if (typeof manifest.planModelVersion !== "string") {
      expect(status).toBe(1);
      expect(out).toBe("");
      expect(err).toContain(
        "run predates the plan-version guard (no planModelVersion in the manifest) — re-record the run (run:smoke)",
      );
      expect(existsSync(join(repoRoot, "corpus", latestRunId, "report.html"))).toBe(false);
      return;
    }

    // Expiry pin: the smoke plan declares exactly 14 scenarios / 18 checks
    // today. A plan or validator change that grows/breaks the counts fails
    // here until the expectation is explicitly updated (and a fresh corpus
    // recorded).
    expect(status).toBe(0);
    expect(out).toContain("14/14 scenarios passed (18 checks)");
    const report = readFileSync(join(repoRoot, "corpus", latestRunId, "report.html"), "utf8");
    expect(report).toContain("<h1>PASS</h1>");
  });
});

// ---- reportSmoke against the committed sample fixture (unconditional — the
// fixture is git-tracked, so these run everywhere) ----

describe("reportSmoke against the committed sample fixture (unconditional)", () => {
  const repoRoot = resolve(import.meta.dirname, "..");
  const corpusDir = join(repoRoot, "corpus");

  it("writes both reports for the committed example fixture, 14/14, exit 0", () => {
    const outcome = reportSmoke(["example"], { corpusDir });

    expect(outcome.exitCode).toBe(0);
    expect(outcome.err).toEqual([]);
    expect(outcome.out).toContain(
      `Report written: ${join(corpusDir, "example", "report.html")}, ${join(corpusDir, "example", "report.json")}`,
    );
    expect(outcome.out).toContain("14/14 scenarios passed (18 checks)");
    expect(readFileSync(join(corpusDir, "example", "report.html"), "utf8")).toContain(
      "<h1>PASS</h1>",
    );
    expect(
      JSON.parse(readFileSync(join(corpusDir, "example", "report.json"), "utf8")) as unknown,
    ).toMatchObject({ schema: "report.v1", runId: "example" });
  });
});
