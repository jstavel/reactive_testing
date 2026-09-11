import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { smokeTestPlan } from "../model/smoke.test-plan.js";
import type { TestPlan } from "../model/schemas.js";
import { generateSampleReport } from "./generate-sample-report.js";
import {
  extractCorpusDir,
  parseArgs,
  planContractIds,
  formatSummary,
  resolveLatestRun,
  validateSmoke,
  USAGE,
} from "./validate-smoke.js";

// A minimal two-contract plan (both contracts have real validators in
// validator-map.ts) so the fabricated corpora drive the real offline runner.
const testPlan: TestPlan = {
  planId: "smoke",
  modelVersion: "test-hash",
  scenarios: [
    { id: "nav-history", steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }] },
    { id: "filter-assets", steps: [{ stateId: "historyMain", contractId: "filterHistoryByAsset" }] },
  ],
};

const filterOnlyPlan: TestPlan = {
  planId: "smoke",
  modelVersion: "test-hash",
  scenarios: [
    { id: "filter-assets", steps: [{ stateId: "historyMain", contractId: "filterHistoryByAsset" }] },
  ],
};

const emptyPlan: TestPlan = { planId: "smoke", modelVersion: "test-hash", scenarios: [] };

const CAPTURED_AT = "2026-09-09T00:00:00.000Z";

function snapshot(stateId: string, url: string): unknown {
  return { stateId, url, snapshot: "", capturedAt: CAPTURED_AT };
}

function writeSnapshot(corpusDir: string, runId: string, stepIndex: number, phase: "pre" | "post", record: unknown): void {
  const dir = join(corpusDir, "snapshots", runId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, phase === "pre" ? `${stepIndex}.pre.json` : `${stepIndex}.json`), JSON.stringify(record));
}

function writeProbe(corpusDir: string, runId: string, stepIndex: number, value: string): void {
  const dir = join(corpusDir, "probes", runId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${stepIndex}.json`),
    JSON.stringify([{ name: "selected-view", value, capturedAt: CAPTURED_AT }]),
  );
}

function writeRunManifest(corpusDir: string, runId: string, files: string[], timestamp: string = CAPTURED_AT): void {
  mkdirSync(join(corpusDir, runId), { recursive: true });
  writeFileSync(
    join(corpusDir, runId, "run-manifest.json"),
    JSON.stringify({ runId, timestamp, files }),
  );
}

/** A run whose two steps satisfy every declared precondition and postcondition. */
function writeAllPassRun(corpusDir: string, runId: string, timestamp: string = CAPTURED_AT): void {
  writeSnapshot(corpusDir, runId, 0, "pre", snapshot("homePage", "https://pro.kraken.com/app/home"));
  writeSnapshot(corpusDir, runId, 0, "post", snapshot("historyMain", "https://pro.kraken.com/app/history/main/ledger"));
  writeProbe(corpusDir, runId, 0, "Ledger");
  writeSnapshot(corpusDir, runId, 1, "pre", snapshot("historyMain", "https://pro.kraken.com/app/history/main/ledger"));
  writeSnapshot(corpusDir, runId, 1, "post", snapshot("historyMain", "https://pro.kraken.com/app/history/main/ledger"));
  writeRunManifest(corpusDir, runId, [
    `snapshots/${runId}/0.pre.json`,
    `snapshots/${runId}/0.json`,
    `probes/${runId}/0.json`,
    `snapshots/${runId}/1.pre.json`,
    `snapshots/${runId}/1.json`,
  ], timestamp);
}

function setMtime(corpusDir: string, runId: string, when: Date): void {
  utimesSync(join(corpusDir, runId, "run-manifest.json"), when, when);
}

function linkLastRun(corpusDir: string, runId: string): void {
  mkdirSync(join(corpusDir, "@last-run"), { recursive: true });
  symlinkSync(join("..", runId), join(corpusDir, "@last-run", "manifest"));
}

function linkDanglingLastRun(corpusDir: string, missingRunId: string): void {
  mkdirSync(join(corpusDir, "@last-run"), { recursive: true });
  symlinkSync(join("..", missingRunId), join(corpusDir, "@last-run", "manifest"));
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
    const digest = createHash("sha256").update(readFileSync(join(dir, entry.name))).digest("hex").slice(0, 16);
    return [`${prefix}${entry.name} ${digest}`];
  });
}

describe("parseArgs", () => {
  it("treats the first positional as the runId and the rest as contract filters", () => {
    expect(parseArgs(["run-1", "a", "b"])).toEqual({ runId: "run-1", contractIds: ["a", "b"] });
  });

  it("defaults to the latest run with no arguments", () => {
    expect(parseArgs([])).toEqual({ runId: undefined, contractIds: [] });
  });
});

describe("planContractIds / formatSummary", () => {
  it("lists the distinct contract ids in plan order", () => {
    expect(planContractIds(testPlan)).toEqual(["clickHistoryMenuMain", "filterHistoryByAsset"]);
  });

  it("formats the X/Y summary naming the run", () => {
    expect(formatSummary([{ contractId: "c", passed: true, corpusRefs: [] }], "run-1")).toBe(
      "1/1 checks passed in run-1",
    );
    expect(
      formatSummary(
        [
          { contractId: "c", passed: true, corpusRefs: [] },
          { contractId: "d", passed: false, details: "boom", corpusRefs: [] },
        ],
        "run-1",
      ),
    ).toBe("1/2 checks passed in run-1");
  });
});

describe("resolveLatestRun", () => {
  let corpusDir: string;

  beforeEach(() => {
    corpusDir = mkdtempSync(join(tmpdir(), "validate-smoke-"));
  });

  afterEach(() => {
    rmSync(corpusDir, { recursive: true, force: true });
  });

  it("prefers the @last-run fan over a newer manifest timestamp", () => {
    writeAllPassRun(corpusDir, "r-older", "2026-09-08T00:00:00.000Z");
    writeAllPassRun(corpusDir, "r-newest", "2026-09-09T00:00:00.000Z");
    linkLastRun(corpusDir, "r-older");

    expect(resolveLatestRun(corpusDir)).toBe("r-older");
  });

  it("falls back to the newest manifest by embedded timestamp, skipping fans and kind dirs", () => {
    writeAllPassRun(corpusDir, "r-older", "2026-09-08T00:00:00.000Z");
    writeAllPassRun(corpusDir, "r-newest", "2026-09-09T00:00:00.000Z");
    writeRunManifest(join(corpusDir, "@ghost", "x"), "decoy-fan", [], "2026-09-10T00:00:00.000Z");
    writeRunManifest(join(corpusDir, "snapshots", "decoy"), "decoy-kind", [], "2026-09-10T00:00:00.000Z");

    expect(resolveLatestRun(corpusDir)).toBe("r-newest");
  });

  it("breaks timestamp ties by entry name lexicographically", () => {
    writeAllPassRun(corpusDir, "r-aaa", "2026-09-09T00:00:00.000Z");
    writeAllPassRun(corpusDir, "r-zzz", "2026-09-09T00:00:00.000Z");

    expect(resolveLatestRun(corpusDir)).toBe("r-aaa");
  });

  it("falls back to mtime when a manifest is unparseable", () => {
    mkdirSync(join(corpusDir, "r-aaa"), { recursive: true });
    mkdirSync(join(corpusDir, "r-zzz"), { recursive: true });
    writeFileSync(join(corpusDir, "r-aaa", "run-manifest.json"), "{not json");
    writeFileSync(join(corpusDir, "r-zzz", "run-manifest.json"), "{not json");
    setMtime(corpusDir, "r-aaa", new Date(Date.parse("2026-09-08T00:00:00Z")));
    setMtime(corpusDir, "r-zzz", new Date(Date.parse("2026-09-09T00:00:00Z")));

    expect(resolveLatestRun(corpusDir)).toBe("r-zzz");
  });

  it("falls back to the newest manifest when the @last-run fan is dangling", () => {
    writeAllPassRun(corpusDir, "r-newest", "2026-09-09T00:00:00.000Z");
    linkDanglingLastRun(corpusDir, "vanished-run");

    expect(resolveLatestRun(corpusDir)).toBe("r-newest");
  });

  it("SAMPLE_RUN_DEFAULT — prefers a real recorded run over the mock fixture when no fan exists", () => {
    writeAllPassRun(corpusDir, "r-real", "2026-09-08T00:00:00.000Z");
    // The committed fixture's manifest carries a fixed future timestamp that
    // would otherwise always win the implicit default.
    writeRunManifest(corpusDir, "example", [], "2026-09-11T00:00:00.000Z");

    expect(resolveLatestRun(corpusDir)).toBe("r-real");
  });

  it("falls back to the mock fixture when it is the only run (fresh checkout)", () => {
    writeRunManifest(corpusDir, "example", [], "2026-09-11T00:00:00.000Z");

    expect(resolveLatestRun(corpusDir)).toBe("example");
  });

  it("NEWEST_SKIP — never resolves the fail-demo throwaway while a real run exists", () => {
    writeAllPassRun(corpusDir, "r-real", "2026-09-08T00:00:00.000Z");
    // The failure demo's manifest carries the same fixed future timestamp;
    // a leftover red demo must never hijack the implicit default.
    writeRunManifest(corpusDir, "fail-demo", [], "2026-09-11T00:00:00.000Z");

    expect(resolveLatestRun(corpusDir)).toBe("r-real");
  });

  it("NEWEST_SKIP — a lone fail-demo run never becomes the implicit default", () => {
    writeRunManifest(corpusDir, "fail-demo", [], "2026-09-11T00:00:00.000Z");

    expect(resolveLatestRun(corpusDir)).toBeNull();
  });

  it("NEWEST_SKIP — a @last-run fan pointing at the fail-demo throwaway falls through to the newest real run", () => {
    writeAllPassRun(corpusDir, "r-real", "2026-09-08T00:00:00.000Z");
    writeAllPassRun(corpusDir, "fail-demo", "2026-09-11T00:00:00.000Z");
    linkLastRun(corpusDir, "fail-demo");

    expect(resolveLatestRun(corpusDir)).toBe("r-real");
  });

  it("NEWEST_SKIP — a lone fail-demo fan with no other run resolves null, never the throwaway", () => {
    writeAllPassRun(corpusDir, "fail-demo", "2026-09-11T00:00:00.000Z");
    linkLastRun(corpusDir, "fail-demo");

    expect(resolveLatestRun(corpusDir)).toBeNull();
  });

  it("returns null when no run exists", () => {
    expect(resolveLatestRun(corpusDir)).toBeNull();
  });

  it("returns null when the corpus dir itself is absent", () => {
    expect(resolveLatestRun(join(corpusDir, "nope"))).toBeNull();
  });
});

describe("validateSmoke", () => {
  let corpusDir: string;

  beforeEach(() => {
    corpusDir = mkdtempSync(join(tmpdir(), "validate-smoke-"));
  });

  afterEach(() => {
    rmSync(corpusDir, { recursive: true, force: true });
  });

  it("validates the latest run by default and prints per-check lines plus the summary", () => {
    writeAllPassRun(corpusDir, "run-1");
    linkLastRun(corpusDir, "run-1");

    const outcome = validateSmoke([], { corpusDir, plan: testPlan });

    expect(outcome.exitCode).toBe(0);
    expect(outcome.err).toEqual([]);
    expect(outcome.out).toEqual([
      "[PASS] clickHistoryMenuMain",
      "[PASS] filterHistoryByAsset",
      "2/2 checks passed in run-1",
    ]);
  });

  it("validates exactly the given runId", () => {
    writeAllPassRun(corpusDir, "run-old", "2026-09-08T00:00:00.000Z");
    writeAllPassRun(corpusDir, "run-new", "2026-09-09T00:00:00.000Z");

    const outcome = validateSmoke(["run-old"], { corpusDir, plan: testPlan });

    expect(outcome.exitCode).toBe(0);
    expect(outcome.out.at(-1)).toBe("2/2 checks passed in run-old");
  });

  it("runs only the filtered contract's checks and accepts a valid filter", () => {
    writeAllPassRun(corpusDir, "run-1");

    const outcome = validateSmoke(["run-1", "filterHistoryByAsset"], { corpusDir, plan: testPlan });

    expect(outcome.exitCode).toBe(0);
    expect(outcome.out).toEqual(["[PASS] filterHistoryByAsset", "1/1 checks passed in run-1"]);
  });

  it("exits 1 naming the valid contract ids for an unknown filter", () => {
    writeAllPassRun(corpusDir, "run-1");

    const outcome = validateSmoke(["run-1", "notAContract"], { corpusDir, plan: testPlan });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.out).toEqual([]);
    expect(outcome.err.join(" ")).toMatch(
      /Unknown contract id\(s\): notAContract\. Valid contract ids: clickHistoryMenuMain, filterHistoryByAsset/,
    );
    expect(outcome.err.at(-1)).toBe(USAGE);
  });

  it("exits 1 with a clear message for an unknown runId and lists nothing", () => {
    const outcome = validateSmoke(["missing-run"], { corpusDir, plan: testPlan });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.out).toEqual([]);
    expect(outcome.err[0]).toBe(
      'Unknown run "missing-run" — no run-manifest.json in ' + join(corpusDir, "missing-run") + "/.",
    );
    expect(outcome.err.at(-1)).toBe(USAGE);
  });

  it("exits 1 with a hint when the first positional is a contract id given without a runId", () => {
    const outcome = validateSmoke(["filterHistoryByAsset"], { corpusDir, plan: testPlan });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.out).toEqual([]);
    expect(outcome.err[0]).toBe(
      'Unknown run "filterHistoryByAsset" — no run-manifest.json in ' + join(corpusDir, "filterHistoryByAsset") + "/.",
    );
    expect(outcome.err).toContainEqual(
      expect.stringContaining("the first argument is the runId; contract filters come after it"),
    );
  });

  it("exits 1 with the unknown-run error for a runId that could escape the corpus", () => {
    for (const traversal of ["../evil", "@x/y"]) {
      const outcome = validateSmoke([traversal], { corpusDir, plan: testPlan });

      expect(outcome.exitCode).toBe(1);
      expect(outcome.out).toEqual([]);
      expect(outcome.err[0]).toBe(
        `Unknown run "${traversal}" — no run-manifest.json in ${corpusDir}/${traversal}/.`,
      );
      expect(outcome.err.at(-1)).toBe(USAGE);
    }
  });

  it("exits 1 with guidance when no run is recorded", () => {
    const outcome = validateSmoke([], { corpusDir, plan: testPlan });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.out).toEqual([]);
    expect(outcome.err[0]).toBe(`No recorded run found in ${corpusDir}/ — record one first with \`npm run run:smoke\`.`);
  });

  it("exits 1 with usage guidance on a usage error (flags are not positional args)", () => {
    const outcome = validateSmoke(["--help"], { corpusDir, plan: testPlan });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.out).toEqual([]);
    expect(outcome.err[0]).toContain("Invalid argument(s): --help");
    expect(outcome.err.at(-1)).toContain("Usage: npm run validate:smoke");
  });

  it("exits 1 printing the failing check's details", () => {
    writeRunManifest(corpusDir, "run-1", [`snapshots/run-1/0.pre.json`, `snapshots/run-1/0.json`]);
    writeSnapshot(corpusDir, "run-1", 0, "pre", snapshot("homePage", "https://pro.kraken.com/app/home"));
    writeSnapshot(corpusDir, "run-1", 0, "post", snapshot("historyMain", "https://pro.kraken.com/app/history/main/ledger"));

    const outcome = validateSmoke(["run-1"], { corpusDir, plan: filterOnlyPlan });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.out).toEqual([
      expect.stringMatching(/^\[FAIL\] filterHistoryByAsset — \[precondition\] state-is "historyMain" but snapshot stateId is "homePage"$/),
      "0/1 checks passed in run-1",
    ]);
    expect(outcome.err).toEqual([]);
  });

  it("exits 1 when a known run yields no results to validate", () => {
    writeRunManifest(corpusDir, "run-1", []);

    const outcome = validateSmoke(["run-1"], { corpusDir, plan: emptyPlan });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.out).toEqual([]);
    expect(outcome.err[0]).toBe(
      'no checks ran for "run-1" — the run manifest was unreadable or the plan declares no steps.',
    );
    expect(outcome.err.at(-1)).toBe(USAGE);
  });

  it("reports missing snapshot evidence (exit 1) on a legacy corpus without pre snapshots", () => {
    writeRunManifest(corpusDir, "run-1", [`snapshots/run-1/0.json`]);
    writeSnapshot(corpusDir, "run-1", 0, "post", snapshot("historyMain", "https://pro.kraken.com/app/history/main/ledger"));

    const outcome = validateSmoke(["run-1"], { corpusDir, plan: filterOnlyPlan });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.out[0]).toBe("[FAIL] filterHistoryByAsset — [precondition] missing snapshot evidence");
    expect(outcome.out.at(-1)).toBe("0/1 checks passed in run-1");
  });

  it("never mutates the corpus (file names and contents)", () => {
    writeAllPassRun(corpusDir, "run-1");
    linkLastRun(corpusDir, "run-1");
    const before = listFiles(corpusDir);

    validateSmoke([], { corpusDir, plan: testPlan });

    expect(listFiles(corpusDir)).toEqual(before);
  });

  it("SAMPLE_RUN_DEFAULT — the implicit default validates the real run, the explicit example the fixture", () => {
    writeAllPassRun(corpusDir, "r-real", "2026-09-08T00:00:00.000Z");
    writeAllPassRun(corpusDir, "example", "2026-09-11T00:00:00.000Z");

    // Implicit (no runId): the newest real run wins — the fixture's fixed
    // future timestamp never silently defaults to the mock.
    const implicit = validateSmoke([], { corpusDir, plan: testPlan });
    expect(implicit.exitCode).toBe(0);
    expect(implicit.out.at(-1)).toBe("2/2 checks passed in r-real");

    // Explicit: `example` resolves the fixture directly.
    const explicit = validateSmoke(["example"], { corpusDir, plan: testPlan });
    expect(explicit.exitCode).toBe(0);
    expect(explicit.out.at(-1)).toBe("2/2 checks passed in example");
  });

  it("NEWEST_SKIP — an explicit fail-demo positional still resolves the throwaway run", () => {
    writeAllPassRun(corpusDir, "fail-demo", "2026-09-11T00:00:00.000Z");
    writeAllPassRun(corpusDir, "r-real", "2026-09-08T00:00:00.000Z");

    const outcome = validateSmoke(["fail-demo"], { corpusDir, plan: testPlan });

    expect(outcome.exitCode).toBe(0);
    expect(outcome.out.at(-1)).toBe("2/2 checks passed in fail-demo");
  });

  it("FAIL_DEMO_E2E — validates a real minted fail-demo fixture red: 17/18 checks, exit 1", () => {
    // A real fail-demo fixture (the --fail generator), not a synthetic run.
    expect(generateSampleReport(corpusDir, { fail: true }).exitCode).toBe(0);

    const outcome = validateSmoke(["fail-demo"], { corpusDir });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.err).toEqual([]);
    expect(outcome.out.filter((line) => line.startsWith("[PASS]"))).toHaveLength(17);
    expect(outcome.out).toContain(
      '[FAIL] clickPortfolioMenuMain — [postcondition] url-is "/app/portfolio/main" but url pathname is "/app/portfolio/futures"',
    );
    expect(outcome.out.at(-1)).toBe("17/18 checks passed in fail-demo");
  });

  it("EMPTY_VALUE — an empty --corpus-dir value is rejected with the Invalid-argument(s) + usage error", () => {
    const outcome = validateSmoke(["--corpus-dir", ""], { corpusDir, plan: testPlan });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.out).toEqual([]);
    expect(outcome.err[0]).toContain("Invalid argument(s)");
    expect(outcome.err.at(-1)).toBe(USAGE);
  });
});

describe("validateSmoke against the committed sample fixture (unconditional)", () => {
  const repoRoot = resolve(import.meta.dirname, "..");
  const corpusDir = join(repoRoot, "corpus");

  it("validates the committed example fixture 18/18, exit 0", () => {
    const outcome = validateSmoke(["example"], { corpusDir });

    expect(outcome.exitCode).toBe(0);
    expect(outcome.err).toEqual([]);
    expect(outcome.out.filter((line) => line.startsWith("[PASS]"))).toHaveLength(18);
    expect(outcome.out.at(-1)).toBe("18/18 checks passed in example");
  });
});

describe("extractCorpusDir", () => {
  it("extracts the two-token flag wherever it appears and returns the rest", () => {
    expect(extractCorpusDir(["--corpus-dir", "c", "run-1"])).toEqual({
      corpusDir: "c",
      rest: ["run-1"],
    });
    expect(extractCorpusDir(["run-1", "--corpus-dir", "c", "filter"])).toEqual({
      corpusDir: "c",
      rest: ["run-1", "filter"],
    });
    expect(extractCorpusDir([])).toEqual({ corpusDir: undefined, rest: [] });
    expect(extractCorpusDir(["run-1"])).toEqual({ corpusDir: undefined, rest: ["run-1"] });
  });

  it("keeps a dangling flag (missing or flag-like value) in rest for the guard to reject", () => {
    expect(extractCorpusDir(["--corpus-dir"])).toEqual({
      corpusDir: undefined,
      rest: ["--corpus-dir"],
    });
    expect(extractCorpusDir(["--corpus-dir", "--bogus"])).toEqual({
      corpusDir: undefined,
      rest: ["--corpus-dir", "--bogus"],
    });
  });

  it("keeps an empty --corpus-dir value in rest for the guard to reject (EMPTY_VALUE)", () => {
    expect(extractCorpusDir(["--corpus-dir", ""])).toEqual({
      corpusDir: undefined,
      rest: ["--corpus-dir", ""],
    });
  });

  it("extracts only the first occurrence — a repeat stays in rest and errors", () => {
    expect(extractCorpusDir(["--corpus-dir", "a", "--corpus-dir", "b"])).toEqual({
      corpusDir: "a",
      rest: ["--corpus-dir", "b"],
    });
  });
});

describe("validateSmoke --corpus-dir (CLI_CORPUS_DIR / FLAG_PRECEDENCE / UNKNOWN_FLAG)", () => {
  let corpusDir: string;
  const previousEnv = process.env.CORPUS_DIR;

  beforeEach(() => {
    corpusDir = mkdtempSync(join(tmpdir(), "validate-smoke-flag-"));
    delete process.env.CORPUS_DIR;
  });

  afterEach(() => {
    rmSync(corpusDir, { recursive: true, force: true });
    if (previousEnv === undefined) {
      delete process.env.CORPUS_DIR;
    } else {
      process.env.CORPUS_DIR = previousEnv;
    }
  });

  it("accepts --corpus-dir <path> and validates the run inside that corpus", () => {
    writeAllPassRun(corpusDir, "flagged-run");

    const outcome = validateSmoke(["--corpus-dir", corpusDir, "flagged-run"], { plan: testPlan });

    expect(outcome.exitCode).toBe(0);
    expect(outcome.out.at(-1)).toBe("2/2 checks passed in flagged-run");
  });

  it("resolves the latest run inside the flagged corpus with no positional", () => {
    writeAllPassRun(corpusDir, "flagged-run");

    const outcome = validateSmoke(["--corpus-dir", corpusDir], { plan: testPlan });

    expect(outcome.exitCode).toBe(0);
    expect(outcome.out.at(-1)).toBe("2/2 checks passed in flagged-run");
  });

  it("FLAG_PRECEDENCE — the flag wins over the CORPUS_DIR env and the options override", () => {
    const decoy = mkdtempSync(join(tmpdir(), "validate-smoke-decoy-"));
    try {
      // An empty decoy: env or options would both fail with "no recorded run".
      process.env.CORPUS_DIR = decoy;
      writeAllPassRun(corpusDir, "flagged-run");

      const outcome = validateSmoke(["--corpus-dir", corpusDir], {
        corpusDir: decoy,
        plan: testPlan,
      });

      expect(outcome.exitCode).toBe(0);
      expect(outcome.out.at(-1)).toBe("2/2 checks passed in flagged-run");
    } finally {
      rmSync(decoy, { recursive: true, force: true });
    }
  });

  it("UNKNOWN_FLAG — --bogus keeps the existing Invalid-argument(s) + usage error", () => {
    const outcome = validateSmoke(["--bogus"], { corpusDir, plan: testPlan });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.out).toEqual([]);
    expect(outcome.err[0]).toBe(
      "Invalid argument(s): --bogus — only positional [<runId>] [<contractId>…] are accepted.",
    );
    expect(outcome.err.at(-1)).toBe(USAGE);
  });

  it("rejects a dangling --corpus-dir without its <path> value", () => {
    const outcome = validateSmoke(["--corpus-dir"], { corpusDir, plan: testPlan });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.err[0]).toContain("Invalid argument(s): --corpus-dir");
    expect(outcome.err.at(-1)).toBe(USAGE);
  });
});

describe("npm validate:smoke (process-level operator surface)", () => {
  const repoRoot = resolve(import.meta.dirname, "..");
  // Windows spawns npm via the .cmd shim.
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";

  it("exits 0 with the filtered summary over a CORPUS_DIR override", () => {
    const corpusDir = mkdtempSync(join(tmpdir(), "validate-smoke-spawn-"));
    const runId = "spawn-run";
    // The real smoke plan's global step indexes carrying the filtered contract.
    const filterIndexes = smokeTestPlan.scenarios
      .flatMap((scenario) => scenario.steps)
      .flatMap((step, index) => (step.contractId === "filterHistoryByAsset" ? [index] : []));
    for (const index of filterIndexes) {
      writeSnapshot(corpusDir, runId, index, "pre", snapshot("historyMain", "https://pro.kraken.com/app/history/main/ledger"));
      writeSnapshot(corpusDir, runId, index, "post", snapshot("historyMain", "https://pro.kraken.com/app/history/main/ledger"));
    }
    writeRunManifest(corpusDir, runId, filterIndexes.flatMap((index) => [
      `snapshots/${runId}/${index}.pre.json`,
      `snapshots/${runId}/${index}.json`,
    ]));

    const out = execFileSync(
      npm,
      ["run", "--silent", "validate:smoke", "--", runId, "filterHistoryByAsset"],
      {
        cwd: repoRoot,
        env: { ...process.env, CORPUS_DIR: corpusDir },
        encoding: "utf8",
        timeout: 60_000,
      },
    );

    expect(out).toContain("[PASS] filterHistoryByAsset");
    expect(out).toContain(`2/2 checks passed in ${runId}`);

    rmSync(corpusDir, { recursive: true, force: true });
  });

  it("exits 0 with the filtered summary via the --corpus-dir flag through npm forwarding", () => {
    const corpusDir = mkdtempSync(join(tmpdir(), "validate-smoke-spawn-flag-"));
    const runId = "spawn-run";
    // The real smoke plan's global step indexes carrying the filtered contract.
    const filterIndexes = smokeTestPlan.scenarios
      .flatMap((scenario) => scenario.steps)
      .flatMap((step, index) => (step.contractId === "filterHistoryByAsset" ? [index] : []));
    for (const index of filterIndexes) {
      writeSnapshot(corpusDir, runId, index, "pre", snapshot("historyMain", "https://pro.kraken.com/app/history/main/ledger"));
      writeSnapshot(corpusDir, runId, index, "post", snapshot("historyMain", "https://pro.kraken.com/app/history/main/ledger"));
    }
    writeRunManifest(corpusDir, runId, filterIndexes.flatMap((index) => [
      `snapshots/${runId}/${index}.pre.json`,
      `snapshots/${runId}/${index}.json`,
    ]));

    const out = execFileSync(
      npm,
      [
        "run",
        "--silent",
        "validate:smoke",
        "--",
        "--corpus-dir",
        corpusDir,
        runId,
        "filterHistoryByAsset",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        timeout: 60_000,
      },
    );

    expect(out).toContain("[PASS] filterHistoryByAsset");
    expect(out).toContain(`2/2 checks passed in ${runId}`);

    rmSync(corpusDir, { recursive: true, force: true });
  });

  it("pins validate:smoke 18/18 against the latest recorded corpus run (expiry-pinned)", () => {
    const repoRoot = resolve(import.meta.dirname, "..");
    const latestRunId = resolveLatestRun(join(repoRoot, "corpus"));
    // Corpus runs live only where a smoke ran (corpus/ is not versioned), so
    // the pin degrades to a skip on machines without one — but wherever a run
    // exists it must validate 18/18 against the committed plan + validators.
    if (latestRunId === null) {
      return;
    }

    const out = execFileSync(
      npm,
      ["run", "--silent", "validate:smoke"],
      {
        cwd: repoRoot,
        encoding: "utf8",
        timeout: 60_000,
      },
    );

    // Expiry pin: the smoke plan declares exactly 18 contracts today. A plan
    // or validator-map change that grows/breaks the check count fails here
    // until the expectation is explicitly updated (and a fresh corpus recorded).
    expect(out.trim().split("\n").at(-1)).toBe(`18/18 checks passed in ${latestRunId}`);
  });
});