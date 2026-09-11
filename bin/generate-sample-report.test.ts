import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { smokeTestPlan } from "../model/smoke.test-plan.js";
import type { RunManifest, TestPlan } from "../model/schemas.js";
import { resolveLatestRun } from "./validate-smoke.js";
import { GENERATE_USAGE, generateSampleReport } from "./generate-sample-report.js";

// Emit-failure injection: the json emitter is wrapped so a test can reproduce
// the two write-failure shapes at the exact point they occur (the generator
// wipes its own subtrees before writing, so neither can be pre-seeded):
// plantReportJsonDir — a directory sits at report.json when the json half is
// written (EISDIR after the html half succeeded); corruptReportJson — the
// emitted report.json does not parse (the self-verify must reject it).
const reportEmitState = vi.hoisted(() => ({
  plantReportJsonDir: false,
  corruptReportJson: false,
}));

vi.mock("../reporter/json-report.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../reporter/json-report.js")>();
  return {
    ...actual,
    emitJsonReport: (input: Parameters<typeof actual.emitJsonReport>[0]) => {
      if (reportEmitState.plantReportJsonDir) {
        mkdirSync(join(input.corpusDir, input.run.runId, "report.json"));
      }
      const relPath = actual.emitJsonReport(input);
      if (reportEmitState.corruptReportJson) {
        writeFileSync(join(input.corpusDir, relPath), "{not json");
      }
      return relPath;
    },
  };
});

/** Recursive file listing with a content hash — the determinism comparison is
 * over names AND bytes (mirrors the other bin tests' listing helper). */
function listWithHashes(dir: string, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = `${prefix}${entry.name}`;
    if (entry.isDirectory()) {
      return listWithHashes(join(dir, entry.name), `${rel}/`);
    }
    if (!entry.isFile()) {
      return [];
    }
    const digest = createHash("sha256")
      .update(readFileSync(join(dir, entry.name)))
      .digest("hex")
      .slice(0, 16);
    return [`${rel} ${digest}`];
  });
}

/** A one-step plan whose contract's mock evidence cannot satisfy it — the
 * SELF_CHECK_FAIL regression shape (the written fixture is bound to the smoke
 * plan, so step 0 carries homePage pre-evidence, which violates this plan's
 * filterHistoryByAsset precondition state-is "historyMain"). */
const brokenPlan: TestPlan = {
  planId: "smoke",
  modelVersion: "test-hash",
  scenarios: [
    { id: "broken", steps: [{ stateId: "homePage", contractId: "filterHistoryByAsset" }] },
  ],
};

describe("generateSampleReport", () => {
  let corpusRoot: string;

  beforeEach(() => {
    corpusRoot = mkdtempSync(join(tmpdir(), "generate-sample-"));
  });

  afterEach(() => {
    rmSync(corpusRoot, { recursive: true, force: true });
  });

  it("HAPPY_PATH — writes the fixture + both reports, self-checks 18/18, exits 0", () => {
    const outcome = generateSampleReport(corpusRoot);

    expect(outcome.exitCode).toBe(0);
    expect(outcome.err).toEqual([]);
    expect(outcome.out).toContain("18/18 checks passed in example");
    expect(outcome.out).toContain("14/14 scenarios passed (18 checks)");
    expect(existsSync(join(corpusRoot, "example", "run-manifest.json"))).toBe(true);
    expect(existsSync(join(corpusRoot, "example", "report.html"))).toBe(true);
    expect(existsSync(join(corpusRoot, "example", "report.json"))).toBe(true);
    // Evidence: 18 pre/post snapshots + 18 probe batches, named by the plan's
    // global step index.
    expect(existsSync(join(corpusRoot, "snapshots", "example", "0.pre.json"))).toBe(true);
    expect(existsSync(join(corpusRoot, "snapshots", "example", "17.json"))).toBe(true);
    expect(existsSync(join(corpusRoot, "probes", "example", "17.json"))).toBe(true);
  });

  it("REGEN_OVER_EXISTING — regeneration removes stale files from an older recipe and stays byte-identical", () => {
    const first = generateSampleReport(corpusRoot);
    expect(first.exitCode).toBe(0);
    const before = listWithHashes(corpusRoot);

    // Stale leftovers an older recipe could leave behind: retired evidence,
    // a stray file in the run dir, and a stale report pair.
    writeFileSync(join(corpusRoot, "snapshots", "example", "99.pre.json"), '{"stateId":"ghostState"}');
    writeFileSync(join(corpusRoot, "probes", "example", "99.json"), "[]");
    writeFileSync(join(corpusRoot, "example", "stale-extra.txt"), "older recipe leftover");
    writeFileSync(join(corpusRoot, "example", "report.html"), "<h1>STALE</h1>");
    writeFileSync(join(corpusRoot, "example", "report.json"), '{"schema":"stale"}');

    const second = generateSampleReport(corpusRoot);

    expect(second.exitCode).toBe(0);
    // The stale files are gone — regeneration can never leave them behind…
    expect(existsSync(join(corpusRoot, "snapshots", "example", "99.pre.json"))).toBe(false);
    expect(existsSync(join(corpusRoot, "probes", "example", "99.json"))).toBe(false);
    expect(existsSync(join(corpusRoot, "example", "stale-extra.txt"))).toBe(false);
    // …the stale report was replaced by the fresh pair…
    const html = readFileSync(join(corpusRoot, "example", "report.html"), "utf8");
    expect(html).not.toContain("STALE");
    expect(html).toContain("<h1>PASS</h1>");
    // …and the fresh fixture is byte-identical to the first run's.
    expect(listWithHashes(corpusRoot)).toEqual(before);
  });

  it("writes a manifest listing all 54 evidence paths — and only those", () => {
    generateSampleReport(corpusRoot);

    const manifest = JSON.parse(
      readFileSync(join(corpusRoot, "example", "run-manifest.json"), "utf8"),
    ) as RunManifest;
    expect(manifest.runId).toBe("example");
    expect(manifest.timestamp).toBe("2026-09-11T00:00:00.000Z");
    // The fixture encodes the model it was made under (story 6) — the offline
    // CLIs' guard accepts it exactly like a freshly recorded run.
    expect(manifest.planModelVersion).toBe(smokeTestPlan.modelVersion);
    expect(manifest.errors).toEqual([]);
    expect(manifest.failures).toEqual([]);
    expect(manifest.files).toHaveLength(54);
    for (let i = 0; i < 18; i++) {
      expect(manifest.files).toContain(`snapshots/example/${i}.pre.json`);
      expect(manifest.files).toContain(`snapshots/example/${i}.json`);
      expect(manifest.files).toContain(`probes/example/${i}.json`);
    }
    // Screenshots and network are omitted in v1 (Never: no screenshots/network
    // in the fixture) — no other kinds, no handoff fans.
    expect(manifest.files.every((f) => /^(snapshots|probes)\//.test(f))).toBe(true);
    expect(existsSync(join(corpusRoot, "@last-run"))).toBe(false);
    expect(existsSync(join(corpusRoot, "@last-fail"))).toBe(false);
  });

  it("resolves as the newest run (fixed manifest timestamp, byte-stable)", () => {
    generateSampleReport(corpusRoot);

    expect(resolveLatestRun(corpusRoot)).toBe("example");
  });

  it("report.json carries schema report.v1 with the all-pass scenario summary", () => {
    generateSampleReport(corpusRoot);

    const report = JSON.parse(
      readFileSync(join(corpusRoot, "example", "report.json"), "utf8"),
    ) as {
      schema: string;
      runId: string;
      summary: { total: number; passed: number; failed: number };
      scenarios: Array<{ id: string; passed: boolean; steps: Array<Record<string, unknown>> }>;
    };
    expect(report.schema).toBe("report.v1");
    expect(report.runId).toBe("example");
    expect(report.summary).toEqual({ total: 14, passed: 14, failed: 0 });
    expect(report.scenarios.every((s) => s.passed)).toBe(true);
    // Per-step evidence paths are cited, not inlined.
    expect(report.scenarios[0]?.steps[0]).toMatchObject({
      snapshotPre: "snapshots/example/0.pre.json",
      snapshotPost: "snapshots/example/0.json",
      probes: "probes/example/0.json",
    });
  });

  it("report.html renders the green bar with evidence links only (no screenshots/network)", () => {
    generateSampleReport(corpusRoot);

    const html = readFileSync(join(corpusRoot, "example", "report.html"), "utf8");
    expect(html).toContain("<h1>PASS</h1>");
    expect(html).toContain("14 passed, 0 failed, 14 total");
    expect(html).toContain('class="step-link"');
    expect(html).toContain("../snapshots/example/0.pre.json");
    expect(html).not.toContain("<img");
  });

  it("SELF_CHECK_FAIL — a plan the mock data violates exits 1 with the failing detail and no reports", () => {
    const outcome = generateSampleReport(corpusRoot, { plan: brokenPlan });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.out).toEqual([]);
    expect(outcome.err[0]).toBe(
      '[FAIL] filterHistoryByAsset — [precondition] state-is "historyMain" but snapshot stateId is "homePage"',
    );
    expect(outcome.err.at(-1)).toBe("0/1 checks passed in example");
    // No partial reports claimed as pass — and the partial fixture is rolled
    // back too: no manifest, no evidence, nothing half-written survives.
    expect(existsSync(join(corpusRoot, "example"))).toBe(false);
    expect(existsSync(join(corpusRoot, "snapshots", "example"))).toBe(false);
    expect(existsSync(join(corpusRoot, "probes", "example"))).toBe(false);
  });

  it("SELF_CHECK_FAIL — a zero-result plan (no steps) is never a silent pass", () => {
    const emptyPlan: TestPlan = { planId: "smoke", modelVersion: "test-hash", scenarios: [] };

    const outcome = generateSampleReport(corpusRoot, { plan: emptyPlan });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.out).toEqual([]);
    expect(outcome.err[0]).toContain("self-check ran 0 checks");
    // The zero-check outcome rolls the partial fixture back too.
    expect(existsSync(join(corpusRoot, "example"))).toBe(false);
  });

  it("PLAN_BINDING — evidence follows the plan option's steps, not the smoke plan's", () => {
    // A one-step custom plan whose step 0 differs from the smoke plan's step
    // 0 (historyMain vs homePage): the recipe tables are keyed by the global
    // step index over the plan the fixture is generated for, so evidence and
    // the self-check's validating plan can never disagree.
    const customPlan: TestPlan = {
      planId: "smoke",
      modelVersion: "test-hash",
      scenarios: [
        { id: "custom", steps: [{ stateId: "historyMain", contractId: "filterHistoryByAsset" }] },
      ],
    };

    const outcome = generateSampleReport(corpusRoot, { plan: customPlan });

    expect(outcome.exitCode).toBe(0);
    const pre = JSON.parse(
      readFileSync(join(corpusRoot, "snapshots", "example", "0.pre.json"), "utf8"),
    ) as { stateId: string };
    expect(pre.stateId).toBe("historyMain");
    const manifest = JSON.parse(
      readFileSync(join(corpusRoot, "example", "run-manifest.json"), "utf8"),
    ) as RunManifest;
    expect(manifest.files).toEqual([
      "snapshots/example/0.pre.json",
      "snapshots/example/0.json",
      "probes/example/0.json",
    ]);
  });

  it("REPORT_ROLLBACK — a directory at report.json (EISDIR) leaves no report.html behind", () => {
    reportEmitState.plantReportJsonDir = true;
    try {
      const outcome = generateSampleReport(corpusRoot);

      expect(outcome.exitCode).toBe(1);
      expect(outcome.out).toEqual([]);
      expect(outcome.err[0]).toMatch(/^sample fixture could not be generated: EISDIR/);
      // The just-written report.html is rolled back — a failed run never
      // leaves a report pair that does not match the new fixture.
      expect(existsSync(join(corpusRoot, "example", "report.html"))).toBe(false);
      expect(existsSync(join(corpusRoot, "example", "report.json"))).toBe(false);
    } finally {
      reportEmitState.plantReportJsonDir = false;
    }
  });

  it("REPORT_SELF_VERIFY — an emitted report.json that does not parse exits 1 with the detail and nothing remains", () => {
    reportEmitState.corruptReportJson = true;
    try {
      const outcome = generateSampleReport(corpusRoot);

      expect(outcome.exitCode).toBe(1);
      expect(outcome.out).toEqual([]);
      expect(outcome.err[0]).toContain("report self-verify failed: report.json is not valid JSON");
      // The non-zero outcome rolls the whole fixture back.
      expect(existsSync(join(corpusRoot, "example"))).toBe(false);
      expect(existsSync(join(corpusRoot, "snapshots", "example"))).toBe(false);
    } finally {
      reportEmitState.corruptReportJson = false;
    }
  });

  it("NON_INTERFERENCE — pre-existing unrelated corpus content is untouched; only the example subtrees are written", () => {
    // An unrelated recorded run (run dir + its snapshot), a network file, a
    // screenshots file, and the @last-run fan — none of it belongs to the
    // fixture.
    mkdirSync(join(corpusRoot, "real-run"), { recursive: true });
    writeFileSync(
      join(corpusRoot, "real-run", "run-manifest.json"),
      JSON.stringify({ runId: "real-run", timestamp: "2026-09-08T00:00:00.000Z", files: [] }),
    );
    writeFileSync(join(corpusRoot, "real-run", "0.json"), "unrelated snapshot");
    mkdirSync(join(corpusRoot, "network", "real-run"), { recursive: true });
    writeFileSync(join(corpusRoot, "network", "real-run", "0.json"), "unrelated network");
    mkdirSync(join(corpusRoot, "screenshots", "real-run"), { recursive: true });
    writeFileSync(join(corpusRoot, "screenshots", "real-run", "0.json"), "unrelated screenshot");
    mkdirSync(join(corpusRoot, "@last-run"), { recursive: true });
    symlinkSync(join("..", "real-run"), join(corpusRoot, "@last-run", "manifest"));
    const before = listWithHashes(corpusRoot);

    const outcome = generateSampleReport(corpusRoot);

    expect(outcome.exitCode).toBe(0);
    const after = listWithHashes(corpusRoot);
    // Every pre-existing entry is byte-unchanged…
    expect(after.filter((line) => before.includes(line))).toEqual(before);
    // …and the additions are exactly the fixture's example subtrees.
    const added = after.filter((line) => !before.includes(line));
    expect(added.length).toBeGreaterThan(0);
    expect(
      added.every((line) => /^(example\/|snapshots\/example\/|probes\/example\/)/.test(line)),
    ).toBe(true);
    // The fan still points at the real run, and the fixture's omitted kinds
    // were never created for it.
    expect(readlinkSync(join(corpusRoot, "@last-run", "manifest"))).toBe(join("..", "real-run"));
    expect(existsSync(join(corpusRoot, "network", "example"))).toBe(false);
    expect(existsSync(join(corpusRoot, "screenshots", "example"))).toBe(false);
  });

  it("EMPTY_CORPUS_DIR — an empty positional is rejected with the usage-family error and writes nothing", () => {
    const outcome = generateSampleReport("");

    expect(outcome.exitCode).toBe(1);
    expect(outcome.out).toEqual([]);
    expect(outcome.err[0]).toContain("Invalid argument(s)");
    expect(outcome.err.at(-1)).toBe(GENERATE_USAGE);
    // The guard precedes any fs access — nothing was written beside the CWD.
    expect(existsSync("example")).toBe(false);
  });

  it("writes only the fixture subtrees — never touches other corpus content", () => {
    const otherDir = join(corpusRoot, "snapshots", "real-run");
    mkdirSync(otherDir, { recursive: true });
    writeFileSync(join(otherDir, "0.json"), "real evidence");

    const outcome = generateSampleReport(corpusRoot);

    expect(outcome.exitCode).toBe(0);
    // The pre-existing sibling run is untouched, and the generator created
    // nothing outside the fixture subtrees (example/ + the kind dirs).
    expect(readFileSync(join(otherDir, "0.json"), "utf8")).toBe("real evidence");
    expect(readdirSync(corpusRoot).sort()).toEqual(["example", "probes", "snapshots"]);
  });
});

// ---- --fail: the failure demo (story 3 — throwaway red report, zero
// committed footprint) ----

/** A plan whose steps never touch clickPortfolioMenuMain: in fail mode the
 * mint's single defect has no step to land on, so every check passes — the
 * wrong-signature shape "zero failures". */
const defectlessPlan: TestPlan = {
  planId: "smoke",
  modelVersion: "test-hash",
  scenarios: [{ id: "plain", steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }] }],
};

/** A plan where the defect contract's step carries an orderBook pre state:
 * exactly one failing check with the defect's contractId, but the details
 * also carry a precondition failure — the wrong-detail signature shape. */
const wrongDetailPlan: TestPlan = {
  planId: "smoke",
  modelVersion: "test-hash",
  scenarios: [{ id: "defect", steps: [{ stateId: "orderBook", contractId: "clickPortfolioMenuMain" }] }],
};

/** A plan producing two failing checks (a broken extra step + the defect):
 * the wrong-count signature shape. */
const extraFailuresPlan: TestPlan = {
  planId: "smoke",
  modelVersion: "test-hash",
  scenarios: [
    { id: "broken", steps: [{ stateId: "homePage", contractId: "filterHistoryByAsset" }] },
    { id: "defect", steps: [{ stateId: "homePage", contractId: "clickPortfolioMenuMain" }] },
  ],
};

/** No fail-demo state may survive a non-zero outcome — the rollback removes
 * the run dir and both evidence kind subtrees. */
function expectNoFailDemoState(corpusRoot: string): void {
  expect(existsSync(join(corpusRoot, "fail-demo"))).toBe(false);
  expect(existsSync(join(corpusRoot, "snapshots", "fail-demo"))).toBe(false);
  expect(existsSync(join(corpusRoot, "probes", "fail-demo"))).toBe(false);
}

describe("generateSampleReport --fail (failure demo)", () => {
  let corpusRoot: string;

  beforeEach(() => {
    corpusRoot = mkdtempSync(join(tmpdir(), "generate-sample-fail-"));
  });

  afterEach(() => {
    rmSync(corpusRoot, { recursive: true, force: true });
  });

  it("HAPPY_DEMO — mints the one-defect fixture under fail-demo, emits the red pair, exits 0", () => {
    const outcome = generateSampleReport(corpusRoot, { fail: true });

    expect(outcome.exitCode).toBe(0);
    expect(outcome.err).toEqual([]);
    expect(outcome.out).toContain("17/18 checks passed in fail-demo");
    expect(outcome.out).toContain("13/14 scenarios passed (18 checks)");
    // The expected failure detail is printed…
    expect(outcome.out).toContain(
      'Expected failure: [FAIL] clickPortfolioMenuMain — [postcondition] url-is "/app/portfolio/main" but url pathname is "/app/portfolio/futures"',
    );
    // …and the report paths carry the explicit throwaway note.
    expect(outcome.out.at(-1)).toMatch(
      /^Fail-demo report written: .*, .* — throwaway demo output; committed only when copied manually\.$/,
    );
    // The fail-demo subtrees hold the fixture + the red report pair.
    expect(existsSync(join(corpusRoot, "fail-demo", "run-manifest.json"))).toBe(true);
    expect(existsSync(join(corpusRoot, "fail-demo", "report.html"))).toBe(true);
    expect(existsSync(join(corpusRoot, "fail-demo", "report.json"))).toBe(true);
    expect(existsSync(join(corpusRoot, "snapshots", "fail-demo", "3.json"))).toBe(true);
    expect(existsSync(join(corpusRoot, "probes", "fail-demo", "3.json"))).toBe(true);
    // No handoff fans, no network/screenshots dirs for the throwaway.
    expect(existsSync(join(corpusRoot, "@last-run"))).toBe(false);
    expect(existsSync(join(corpusRoot, "network", "fail-demo"))).toBe(false);
    expect(existsSync(join(corpusRoot, "screenshots", "fail-demo"))).toBe(false);
  });

  it("HAPPY_DEMO — exactly one check fails with the pinned signature; the defect is step 3's post url", () => {
    const outcome = generateSampleReport(corpusRoot, { fail: true });

    expect(outcome.exitCode).toBe(0);
    const post = JSON.parse(
      readFileSync(join(corpusRoot, "snapshots", "fail-demo", "3.json"), "utf8"),
    ) as { stateId: string; url: string };
    // The single hand-placed defect: clickPortfolioMenuMain's post url
    // pathname corrupted to /app/portfolio/futures (state untouched).
    expect(post.stateId).toBe("portfolioMain");
    expect(post.url).toBe("https://pro.kraken.com/app/portfolio/futures");
    // Every other minted snapshot is the pass-mode recipe — e.g. step 2.
    const other = JSON.parse(
      readFileSync(join(corpusRoot, "snapshots", "fail-demo", "2.json"), "utf8"),
    ) as { url: string };
    expect(other.url).toBe("https://pro.kraken.com/app/portfolio/overview");
  });

  it("HAPPY_DEMO — report.json is the same report.v1 contract with the one failing scenario", () => {
    const outcome = generateSampleReport(corpusRoot, { fail: true });
    expect(outcome.exitCode).toBe(0);

    const report = JSON.parse(
      readFileSync(join(corpusRoot, "fail-demo", "report.json"), "utf8"),
    ) as {
      schema: string;
      runId: string;
      summary: { total: number; passed: number; failed: number };
      scenarios: Array<{ id: string; passed: boolean; error?: string }>;
    };
    expect(report.schema).toBe("report.v1");
    expect(report.runId).toBe("fail-demo");
    expect(report.summary).toEqual({ total: 14, passed: 13, failed: 1 });
    const failed = report.scenarios.filter((s) => !s.passed);
    expect(failed).toHaveLength(1);
    expect(failed[0]?.id).toBe("clicking-main-opens-the-portfolio-page-with-the-main-view");
    expect(failed[0]?.error).toBe(
      '[postcondition] url-is "/app/portfolio/main" but url pathname is "/app/portfolio/futures"',
    );
  });

  it("HAPPY_DEMO — report.html renders the red bar with one failing scenario", () => {
    const outcome = generateSampleReport(corpusRoot, { fail: true });
    expect(outcome.exitCode).toBe(0);

    const html = readFileSync(join(corpusRoot, "fail-demo", "report.html"), "utf8");
    expect(html).toContain("<h1>FAIL</h1>");
    expect(html).toContain("13 passed, 1 failed, 14 total");
    expect(html).toContain("../snapshots/fail-demo/3.json");
  });

  it("REGEN — a second --fail over the same root is byte-identical and clears stale leftovers", () => {
    const first = generateSampleReport(corpusRoot, { fail: true });
    expect(first.exitCode).toBe(0);
    const before = listWithHashes(corpusRoot);

    // Stale leftovers an older recipe could leave behind.
    writeFileSync(join(corpusRoot, "snapshots", "fail-demo", "99.pre.json"), '{"stateId":"ghostState"}');
    writeFileSync(join(corpusRoot, "probes", "fail-demo", "99.json"), "[]");
    writeFileSync(join(corpusRoot, "fail-demo", "stale-extra.txt"), "older demo leftover");

    const second = generateSampleReport(corpusRoot, { fail: true });

    expect(second.exitCode).toBe(0);
    expect(existsSync(join(corpusRoot, "snapshots", "fail-demo", "99.pre.json"))).toBe(false);
    expect(existsSync(join(corpusRoot, "fail-demo", "stale-extra.txt"))).toBe(false);
    expect(listWithHashes(corpusRoot)).toEqual(before);
  });

  it("writes a fail-demo manifest listing all 54 evidence paths — runId, fixed timestamp, only snapshots/probes", () => {
    generateSampleReport(corpusRoot, { fail: true });

    const manifest = JSON.parse(
      readFileSync(join(corpusRoot, "fail-demo", "run-manifest.json"), "utf8"),
    ) as RunManifest;
    expect(manifest.runId).toBe("fail-demo");
    expect(manifest.timestamp).toBe("2026-09-11T00:00:00.000Z");
    // The fail-demo manifest carries the provenance field too (story 6).
    expect(manifest.planModelVersion).toBe(smokeTestPlan.modelVersion);
    expect(manifest.errors).toEqual([]);
    expect(manifest.failures).toEqual([]);
    expect(manifest.files).toHaveLength(54);
    for (let i = 0; i < 18; i++) {
      expect(manifest.files).toContain(`snapshots/fail-demo/${i}.pre.json`);
      expect(manifest.files).toContain(`snapshots/fail-demo/${i}.json`);
      expect(manifest.files).toContain(`probes/fail-demo/${i}.json`);
    }
    // Screenshots and network are omitted in v1 — the fail-demo manifest
    // names no other kinds and no handoff fans exist.
    expect(manifest.files.every((f) => /^(snapshots|probes)\/fail-demo\//.test(f))).toBe(true);
    expect(existsSync(join(corpusRoot, "@last-run"))).toBe(false);
    expect(existsSync(join(corpusRoot, "@last-fail"))).toBe(false);
  });

  it("ONE_DEFECT — the fail-demo evidence tree differs from the example fixture in exactly one file", () => {
    const passRoot = mkdtempSync(join(tmpdir(), "generate-sample-delta-pass-"));
    const failRoot = mkdtempSync(join(tmpdir(), "generate-sample-delta-fail-"));
    try {
      expect(generateSampleReport(passRoot).exitCode).toBe(0);
      expect(generateSampleReport(failRoot, { fail: true }).exitCode).toBe(0);

      // The evidence trees (snapshots + probes), keyed with the kind dir +
      // runId segment normalized so the two runs' trees are comparable.
      const passHashes = new Map(
        [
          ...listWithHashes(join(passRoot, "snapshots")).map((line) => `snapshots/${line}`),
          ...listWithHashes(join(passRoot, "probes")).map((line) => `probes/${line}`),
        ].map((line) => {
          const [relPath, digest] = line.split(" ");
          return [relPath!.replace("example", "RUN"), digest] as const;
        }),
      );
      const differing: string[] = [];
      for (const line of [
        ...listWithHashes(join(failRoot, "snapshots")).map((l) => `snapshots/${l}`),
        ...listWithHashes(join(failRoot, "probes")).map((l) => `probes/${l}`),
      ]) {
        const [relPath, digest] = line.split(" ");
        if (passHashes.get(relPath!.replace("fail-demo", "RUN")) !== digest) {
          differing.push(relPath!.replace("fail-demo", "RUN"));
        }
      }
      // Exactly one hand-placed defect: step 3's post snapshot.
      expect(differing).toEqual(["snapshots/RUN/3.json"]);
      const passPost = JSON.parse(
        readFileSync(join(passRoot, "snapshots", "example", "3.json"), "utf8"),
      ) as { url: string };
      const failPost = JSON.parse(
        readFileSync(join(failRoot, "snapshots", "fail-demo", "3.json"), "utf8"),
      ) as { url: string };
      expect(passPost.url).toBe("https://pro.kraken.com/app/portfolio/main");
      expect(failPost.url).toBe("https://pro.kraken.com/app/portfolio/futures");
    } finally {
      rmSync(passRoot, { recursive: true, force: true });
      rmSync(failRoot, { recursive: true, force: true });
    }
  });

  it("ISOLATION — a failed fail-demo run over a seeded corpus rolls back only fail-demo; the example fixture stays byte-identical", () => {
    const pass = generateSampleReport(corpusRoot);
    expect(pass.exitCode).toBe(0);
    const exampleBefore = listWithHashes(corpusRoot);

    const outcome = generateSampleReport(corpusRoot, { fail: true, plan: defectlessPlan });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.err[0]).toContain("fail-demo self-check signature mismatch");
    expectNoFailDemoState(corpusRoot);
    // The example subtrees are byte-identical to what pass-mode wrote — the
    // failed fail run removed nothing but its own (rolled-back) subtrees.
    expect(listWithHashes(corpusRoot)).toEqual(exampleBefore);
  });

  it("VALIDATION_SIGNATURE — zero failures (the defect found no step) exits 1 and rolls back", () => {
    const outcome = generateSampleReport(corpusRoot, { fail: true, plan: defectlessPlan });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.out).toEqual([]);
    expect(outcome.err[0]).toContain("fail-demo self-check signature mismatch");
    expect(outcome.err[0]).toContain("no failing checks (every check passed)");
    expectNoFailDemoState(corpusRoot);
  });

  it("VALIDATION_SIGNATURE — wrong contract + wrong detail (a broken recipe) exits 1 and rolls back", () => {
    const outcome = generateSampleReport(corpusRoot, { fail: true, plan: brokenPlan });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.out).toEqual([]);
    expect(outcome.err[0]).toContain("fail-demo self-check signature mismatch");
    expect(outcome.err[0]).toContain("filterHistoryByAsset");
    expectNoFailDemoState(corpusRoot);
  });

  it("VALIDATION_SIGNATURE — right contract but wrong detail exits 1 and rolls back", () => {
    const outcome = generateSampleReport(corpusRoot, { fail: true, plan: wrongDetailPlan });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.out).toEqual([]);
    expect(outcome.err[0]).toContain("fail-demo self-check signature mismatch");
    expect(outcome.err[0]).toContain("state-is");
    expectNoFailDemoState(corpusRoot);
  });

  it("VALIDATION_SIGNATURE — extra failures (wrong count) exits 1 and rolls back", () => {
    const outcome = generateSampleReport(corpusRoot, { fail: true, plan: extraFailuresPlan });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.out).toEqual([]);
    expect(outcome.err[0]).toContain("fail-demo self-check signature mismatch");
    expectNoFailDemoState(corpusRoot);
  });

  it("VALIDATION_SIGNATURE — zero checks (stepless plan) exits 1 and rolls back", () => {
    const outcome = generateSampleReport(corpusRoot, {
      fail: true,
      plan: { planId: "smoke", modelVersion: "test-hash", scenarios: [] },
    });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.out).toEqual([]);
    expect(outcome.err[0]).toContain("self-check ran 0 checks");
    expectNoFailDemoState(corpusRoot);
  });

  it("WRITE_ERROR — a directory at report.json rolls the fail-demo subtrees back", () => {
    reportEmitState.plantReportJsonDir = true;
    try {
      const outcome = generateSampleReport(corpusRoot, { fail: true });

      expect(outcome.exitCode).toBe(1);
      expect(outcome.out).toEqual([]);
      expect(outcome.err[0]).toMatch(/^fail demo could not be generated: EISDIR/);
      expectNoFailDemoState(corpusRoot);
    } finally {
      reportEmitState.plantReportJsonDir = false;
    }
  });

  it("ISOLATION — the example fixture and unrelated corpus content are untouched; only the fail-demo subtrees are written", () => {
    const pass = generateSampleReport(corpusRoot);
    expect(pass.exitCode).toBe(0);
    mkdirSync(join(corpusRoot, "real-run"), { recursive: true });
    writeFileSync(
      join(corpusRoot, "real-run", "run-manifest.json"),
      JSON.stringify({ runId: "real-run", timestamp: "2026-09-08T00:00:00.000Z", files: [] }),
    );
    writeFileSync(join(corpusRoot, "real-run", "0.json"), "unrelated snapshot");
    const before = listWithHashes(corpusRoot);

    const outcome = generateSampleReport(corpusRoot, { fail: true });

    expect(outcome.exitCode).toBe(0);
    const after = listWithHashes(corpusRoot);
    // Every pre-existing entry is byte-unchanged…
    expect(after.filter((line) => before.includes(line))).toEqual(before);
    // …and the additions are exactly the fail-demo subtrees.
    const added = after.filter((line) => !before.includes(line));
    expect(added.length).toBeGreaterThan(0);
    expect(
      added.every((line) => /^(fail-demo\/|snapshots\/fail-demo\/|probes\/fail-demo\/)/.test(line)),
    ).toBe(true);
    // The example fixture still carries the all-pass report.
    expect(readFileSync(join(corpusRoot, "example", "report.html"), "utf8")).toContain("<h1>PASS</h1>");
  });

  it("MUTUAL_ISOLATION — a pass-mode regeneration never touches the fail-demo subtrees", () => {
    const failRun = generateSampleReport(corpusRoot, { fail: true });
    expect(failRun.exitCode).toBe(0);
    const before = listWithHashes(corpusRoot);

    const passRun = generateSampleReport(corpusRoot);

    expect(passRun.exitCode).toBe(0);
    const after = listWithHashes(corpusRoot);
    expect(after.filter((line) => line.includes("fail-demo"))).toEqual(
      before.filter((line) => line.includes("fail-demo")),
    );
    expect(readFileSync(join(corpusRoot, "fail-demo", "report.html"), "utf8")).toContain("<h1>FAIL</h1>");
  });
});

// ---- npm generate:sample (process-level operator surface) ----

describe("npm generate:sample (process-level operator surface)", () => {
  const repoRoot = resolve(import.meta.dirname, "..");
  // Windows spawns npm via the .cmd shim.
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  let corpusDir: string;

  function spawnGenerateSample(args: readonly string[]): { status: number; out: string; err: string } {
    try {
      const out = execFileSync(
        npm,
        ["run", "--silent", "generate:sample", ...(args.length > 0 ? ["--", ...args] : [])],
        { cwd: repoRoot, encoding: "utf8", timeout: 120_000 },
      );
      return { status: 0, out, err: "" };
    } catch (error) {
      const failure = error as { status?: number; stdout?: string; stderr?: string };
      return { status: failure.status ?? 1, out: failure.stdout ?? "", err: failure.stderr ?? "" };
    }
  }

  beforeEach(() => {
    corpusDir = mkdtempSync(join(tmpdir(), "generate-sample-spawn-"));
  });

  afterEach(() => {
    rmSync(corpusDir, { recursive: true, force: true });
  });

  it("writes the fixture + reports into the optional positional corpus root and exits 0", () => {
    const { status, out } = spawnGenerateSample([corpusDir]);

    expect(status).toBe(0);
    expect(out).toContain("18/18 checks passed in example");
    expect(out).toContain("14/14 scenarios passed (18 checks)");
    // The positional root owns the output: fixture + evidence + reports land
    // there (and nowhere in the repo's own corpus).
    expect(existsSync(join(corpusDir, "example", "run-manifest.json"))).toBe(true);
    expect(existsSync(join(corpusDir, "example", "report.html"))).toBe(true);
    expect(existsSync(join(corpusDir, "example", "report.json"))).toBe(true);
    expect(existsSync(join(corpusDir, "snapshots", "example", "0.pre.json"))).toBe(true);
    expect(existsSync(join(corpusDir, "probes", "example", "17.json"))).toBe(true);
  });

  it("HAPPY_DEMO — --fail writes the red pair into the positional corpus root and exits 0 with the throwaway note", () => {
    const { status, out } = spawnGenerateSample(["--fail", corpusDir]);

    expect(status).toBe(0);
    expect(out).toContain("17/18 checks passed in fail-demo");
    expect(out).toContain("13/14 scenarios passed (18 checks)");
    expect(out).toContain("committed only when copied manually");
    expect(existsSync(join(corpusDir, "fail-demo", "report.html"))).toBe(true);
    expect(existsSync(join(corpusDir, "fail-demo", "report.json"))).toBe(true);
    expect(readFileSync(join(corpusDir, "fail-demo", "report.html"), "utf8")).toContain("<h1>FAIL</h1>");
  });

  it("UNKNOWN_FLAG — --bogus still exits 1 with the invalid-argument error (--fail is the only new flag)", () => {
    const { status, out, err } = spawnGenerateSample(["--bogus"]);

    expect(status).toBe(1);
    expect(out).toBe("");
    expect(err).toContain("Invalid argument(s): --bogus");
    expect(err).toContain("Usage: npm run generate:sample");
  });

  it("UNKNOWN_FLAG — --fail combined with an unknown flag errors listing only the unknown argument", () => {
    const { status, out, err } = spawnGenerateSample(["--fail", "--bogus"]);

    expect(status).toBe(1);
    expect(out).toBe("");
    // The accepted --fail is not accused; only the bogus flag is listed.
    expect(err).toContain("Invalid argument(s): --bogus");
    expect(err).not.toContain("--fail, --bogus");
    expect(err).toContain("Usage: npm run generate:sample");
  });

  it("UNKNOWN_FLAG — a repeated --fail is still rejected with the usage error", () => {
    const { status, out, err } = spawnGenerateSample(["--fail", "--fail"]);

    expect(status).toBe(1);
    expect(out).toBe("");
    expect(err).toContain("Invalid argument(s): --fail");
    expect(err).toContain("Usage: npm run generate:sample");
  });
});

// ---- The committed fixture's shape + prohibited content (walks the repo's
// actual corpus/example — unconditional, the fixture is git-tracked) ----

describe("committed fixture shape + prohibited content", () => {
  const repoRoot = resolve(import.meta.dirname, "..");
  const corpusRoot = join(repoRoot, "corpus");
  const stepCount = smokeTestPlan.scenarios.reduce((n, scenario) => n + scenario.steps.length, 0);

  it("carries the exact file set — no network/screenshots fixture dirs, no @ handles", () => {
    // Run dir: the manifest + the two reports, nothing else.
    expect(readdirSync(join(corpusRoot, "example")).sort()).toEqual([
      "report.html",
      "report.json",
      "run-manifest.json",
    ]);
    // Evidence: stepCount pre + post snapshots and stepCount probe batches,
    // named by the plan's global step index — and nothing else.
    const snapshotFiles = readdirSync(join(corpusRoot, "snapshots", "example")).sort();
    const probeFiles = readdirSync(join(corpusRoot, "probes", "example")).sort();
    expect(snapshotFiles).toHaveLength(stepCount * 2);
    expect(probeFiles).toHaveLength(stepCount);
    for (let i = 0; i < stepCount; i++) {
      expect(snapshotFiles).toContain(`${i}.pre.json`);
      expect(snapshotFiles).toContain(`${i}.json`);
      expect(probeFiles).toContain(`${i}.json`);
    }
    // v1 omits network/screenshots — no fixture dirs under those kinds.
    expect(existsSync(join(corpusRoot, "network", "example"))).toBe(false);
    expect(existsSync(join(corpusRoot, "screenshots", "example"))).toBe(false);
    // No @ handles anywhere in the fixture subtrees.
    for (const dir of [
      join(corpusRoot, "example"),
      join(corpusRoot, "snapshots", "example"),
      join(corpusRoot, "probes", "example"),
    ]) {
      expect(readdirSync(dir).some((name) => name.startsWith("@"))).toBe(false);
    }
  });

  it("manifest files lists exactly the evidence files on disk — both directions", () => {
    const manifest = JSON.parse(
      readFileSync(join(corpusRoot, "example", "run-manifest.json"), "utf8"),
    ) as RunManifest;

    const onDisk = [
      ...readdirSync(join(corpusRoot, "snapshots", "example")).map(
        (name) => `snapshots/example/${name}`,
      ),
      ...readdirSync(join(corpusRoot, "probes", "example")).map(
        (name) => `probes/example/${name}`,
      ),
    ].sort();
    // Every evidence file is listed, and the list names nothing else.
    expect([...manifest.files].sort()).toEqual(onDisk);
    expect(manifest.files).toHaveLength(stepCount * 3);
  });

  it("snapshot + probe bodies carry no balances or currency (mock data only)", () => {
    for (const name of readdirSync(join(corpusRoot, "snapshots", "example"))) {
      const record = JSON.parse(
        readFileSync(join(corpusRoot, "snapshots", "example", name), "utf8"),
      ) as { snapshot: string };
      expect(record.snapshot).not.toMatch(/balance/i);
      expect(record.snapshot).not.toContain("$");
    }
    for (const name of readdirSync(join(corpusRoot, "probes", "example"))) {
      const raw = readFileSync(join(corpusRoot, "probes", "example", name), "utf8");
      expect(raw).not.toMatch(/balance/i);
      expect(raw).not.toContain("$");
    }
  });
});

// ---- Committed-fixture byte-equality (story 6 review): the accepted-churn
// invariant "commit the regenerated corpus/example" pinned WITHOUT git — a
// fresh generation must be byte-identical to every committed file. ----

describe("committed fixture byte-equality (fresh generation vs corpus/example)", () => {
  const repoRoot = resolve(import.meta.dirname, "..");
  const committedRoot = join(repoRoot, "corpus");

  it("a fresh generation is byte-identical to the committed fixture across all 57 files", () => {
    const freshRoot = mkdtempSync(join(tmpdir(), "generate-sample-committed-"));
    try {
      expect(generateSampleReport(freshRoot).exitCode).toBe(0);

      // The three fixture subtrees, compared name-and-byte (content hashes)
      // pairwise between the committed corpus and the fresh output.
      for (const rel of ["example", join("snapshots", "example"), join("probes", "example")]) {
        const committed = listWithHashes(join(committedRoot, rel));
        const fresh = listWithHashes(join(freshRoot, rel));
        expect(
          `${rel}: ${fresh.length} files`,
          `subtree ${rel} must exist on both sides`,
        ).toBe(`${rel}: ${committed.length} files`);
        expect(fresh).toEqual(committed);
      }
      // 57 = 3 (manifest + both reports) + 36 snapshots + 18 probe batches.
      const total =
        listWithHashes(join(committedRoot, "example")).length +
        listWithHashes(join(committedRoot, "snapshots", "example")).length +
        listWithHashes(join(committedRoot, "probes", "example")).length;
      expect(total).toBe(57);
    } finally {
      rmSync(freshRoot, { recursive: true, force: true });
    }
  });
});
