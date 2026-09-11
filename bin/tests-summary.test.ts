// tests-summary red paths, pinned as tests (story 8 review loop): the badge
// feed can never be produced from a missing, malformed, or self-inconsistent
// vitest summary — the pure core throws, and the CLI exits 1 with a
// `::error::` annotation having written nothing. Process-level cases spawn the
// real CLI (`node --import tsx`) exactly like generate-sample-report.test.ts
// spawns npm; pure-core cases import the module directly. Offline, no fixtures
// beyond tmp files, no browser.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { InvalidVitestSummaryError, testsSummaryFromJson } from "./tests-summary.js";

const vitestSummary = (overrides: Record<string, unknown>): string =>
  JSON.stringify({
    numTotalTests: 3,
    numPassedTests: 3,
    numFailedTests: 0,
    success: true,
    ...overrides,
  });

describe("testsSummaryFromJson (pure core)", () => {
  it("extracts passed/total from a valid vitest summary", () => {
    expect(testsSummaryFromJson(vitestSummary({}))).toEqual({ passed: 3, total: 3 });
  });

  it("passes zero counts through (an empty run is still a valid all-pass feed)", () => {
    expect(testsSummaryFromJson(vitestSummary({ numTotalTests: 0, numPassedTests: 0 }))).toEqual({
      passed: 0,
      total: 0,
    });
  });

  it("throws on missing counts, naming the absent field", () => {
    expect(() => testsSummaryFromJson('{"success":true,"testResults":[]}')).toThrow(
      new InvalidVitestSummaryError(
        "vitest JSON summary: numPassedTests must be a finite non-negative integer, " +
          "got undefined — refusing to write a bogus tests.json",
      ),
    );
    expect(() => testsSummaryFromJson(vitestSummary({ numTotalTests: undefined }))).toThrow(
      /numTotalTests must be a finite non-negative integer, got undefined/,
    );
  });

  it("throws on negative, fractional, and non-numeric counts", () => {
    for (const [passed, total] of [
      [-1, 3],
      [1.5, 3],
      [3, -2],
      [3, 2.5],
      ["3", 3],
      [null, 3],
      [true, 3],
      [Number.NaN, 3],
      [Number.POSITIVE_INFINITY, 3],
    ] as const) {
      expect(() =>
        testsSummaryFromJson(vitestSummary({ numPassedTests: passed, numTotalTests: total })),
      ).toThrow(/must be a finite non-negative integer/);
    }
  });

  it("throws when passed > total — an impossible all-pass feed", () => {
    expect(() => testsSummaryFromJson(vitestSummary({ numPassedTests: 4 }))).toThrow(
      new InvalidVitestSummaryError(
        "vitest JSON summary: numPassedTests (4) > numTotalTests (3) — refusing to write a bogus tests.json",
      ),
    );
  });

  it("throws on a non-object summary (array, string, null)", () => {
    expect(() => testsSummaryFromJson("[1,2,3]")).toThrow(
      /vitest JSON summary must be a JSON object, got an array/,
    );
    expect(() => testsSummaryFromJson('"531 passed"')).toThrow(/got a string/);
    expect(() => testsSummaryFromJson("null")).toThrow(/got null/);
  });

  it("throws on text that is not JSON at all", () => {
    expect(() => testsSummaryFromJson("not json at all")).toThrow(
      /vitest JSON summary is not valid JSON/,
    );
  });
});

// ---- npx tsx bin/tests-summary.ts (process-level operator surface) ----

describe("bin/tests-summary.ts (process-level operator surface)", () => {
  const repoRoot = resolve(import.meta.dirname, "..");
  const scriptPath = join(repoRoot, "bin", "tests-summary.ts");

  interface RunResult {
    readonly status: number;
    readonly out: string;
    readonly err: string;
  }

  const spawnTestsSummary = (args: readonly string[]): RunResult => {
    try {
      const out = execFileSync(process.execPath, ["--import", "tsx", scriptPath, ...args], {
        cwd: repoRoot,
        encoding: "utf8",
        timeout: 60_000,
      });
      return { status: 0, out, err: "" };
    } catch (error) {
      const failure = error as { status?: number; stdout?: string; stderr?: string };
      return { status: failure.status ?? 1, out: failure.stdout ?? "", err: failure.stderr ?? "" };
    }
  };

  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tests-summary-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('happy path — writes exactly {"passed":N,"total":M} and exits 0', () => {
    const summaryPath = join(dir, "vitest-summary.json");
    const outPath = join(dir, "tests.json");
    writeFileSync(summaryPath, vitestSummary({ numPassedTests: 531, numTotalTests: 531 }));

    const { status, out } = spawnTestsSummary([summaryPath, outPath]);

    expect(status).toBe(0);
    expect(out).toContain('tests.json: {"passed":531,"total":531}');
    expect(readFileSync(outPath, "utf8")).toBe('{"passed":531,"total":531}\n');
  });

  const refuses = (name: string, summaryText: string, expectedErr: RegExp): void => {
    it(`${name} — exits 1 with ::error:: and writes nothing`, () => {
      const summaryPath = join(dir, "vitest-summary.json");
      const outPath = join(dir, "tests.json");
      writeFileSync(summaryPath, summaryText);

      const { status, err } = spawnTestsSummary([summaryPath, outPath]);

      expect(status).toBe(1);
      expect(err).toMatch(/^::error::tests-summary: /m);
      expect(err).toMatch(expectedErr);
      expect(existsSync(outPath)).toBe(false);
    });
  };

  refuses(
    "missing counts",
    '{"success":true,"testResults":[]}',
    /numPassedTests must be a finite non-negative integer/,
  );
  refuses("negative counts", vitestSummary({ numPassedTests: -1 }), /got -1/);
  refuses("fractional counts", vitestSummary({ numTotalTests: 2.5 }), /got 2\.5/);
  refuses(
    "passed > total",
    vitestSummary({ numPassedTests: 4 }),
    /numPassedTests \(4\) > numTotalTests \(3\)/,
  );

  it("invalid summary path — exits 1 with the ENOENT and writes nothing", () => {
    const outPath = join(dir, "tests.json");

    const { status, err } = spawnTestsSummary([
      join(dir, "absent", "vitest-summary.json"),
      outPath,
    ]);

    expect(status).toBe(1);
    expect(err).toMatch(/::error::tests-summary: ENOENT/);
    expect(existsSync(outPath)).toBe(false);
  });

  it("missing arguments — exits 1 with the usage line and writes nothing", () => {
    const { status, err } = spawnTestsSummary([]);

    expect(status).toBe(1);
    expect(err).toContain(
      "Usage: npx tsx bin/tests-summary.ts <vitestSummaryJsonPath> <outJsonPath>",
    );
    expect(existsSync(join(dir, "tests.json"))).toBe(false);
  });
});
