// Operator-surface pin for `npm run run:smoke`'s completion logic: exit codes
// for the zero-scenario/modelVersion guard, the all-failed guard, and success —
// plus the handoff-last ordering invariant on each path. The logic is pure
// (bin/run-smoke-finish.ts): the browser boundary itself stays live-only, but
// every decision a process makes after the run returns is pinned here.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { linkRun } from "../orchestrator/handlinks.js";
import { finishRun, type RunSmokeResult } from "./run-smoke-finish.js";

const PASSED = { id: "pass", passed: true };
const FAILED = { id: "fail", passed: false, error: "boom" };

function baseResult(overrides: Partial<RunSmokeResult> = {}): RunSmokeResult {
  return {
    planId: "smoke",
    modelVersion: "test-hash",
    scenarios: [],
    runId: "run-1",
    ...overrides,
  };
}

describe("finishRun (npm run run:smoke completion surface)", () => {
  let corpusDir: string;

  beforeEach(() => {
    corpusDir = mkdtempSync(join(tmpdir(), "run-smoke-"));
    linkRun(corpusDir, "run-1");
    writeFileSync(
      join(corpusDir, "run-1", "run-manifest.json"),
      JSON.stringify({ runId: "run-1", timestamp: "2026-09-10T00:00:00.000Z", files: [] }),
    );
  });

  afterEach(() => {
    rmSync(corpusDir, { recursive: true, force: true });
  });

  it("zero scenarios → exit 1 with the modelVersion-mismatch guard, handoff printed last", () => {
    const finish = finishRun(baseResult(), corpusDir, 12.5);

    expect(finish.exitCode).toBe(1);
    expect(finish.err).toEqual([
      expect.stringContaining('Run produced zero scenarios (plan "smoke", modelVersion "test-hash").'),
    ]);
    expect(finish.err[0]).toContain("modelVersion mismatch");
    expect(finish.out.at(-1)).toMatch(/^Corpus: .*@last-run → .*\(runId run-1\)$/);
    expect(finish.out).toHaveLength(1);
  });

  it("zero scenarios without a runId → exit 1 with nothing honest to hand off", () => {
    const finish = finishRun(baseResult({ runId: undefined }), corpusDir, 12.5);

    expect(finish.exitCode).toBe(1);
    expect(finish.err[0]).toContain("Run produced zero scenarios");
    expect(finish.out).toEqual([]);
  });

  it("all scenarios failed → exit 1, handoff printed last", () => {
    const finish = finishRun(
      baseResult({ scenarios: [FAILED] }),
      corpusDir,
      12.5,
    );

    expect(finish.exitCode).toBe(1);
    expect(finish.err[0]).toBe(
      "Run failed: 0/1 scenarios passed in 12.5s. " +
        "All scenarios failed — inspect the per-scenario errors above and the corpus in " +
        `${corpusDir}/ to diagnose. Exiting non-zero.`,
    );
    expect(finish.out.at(-1)).toMatch(/^Corpus: .*@last-run → .*\(runId run-1\)$/);
    expect(finish.out).toHaveLength(1);
  });

  it("scenarios pass → exit 0, handoff printed last", () => {
    const finish = finishRun(
      baseResult({ scenarios: [PASSED, FAILED] }),
      corpusDir,
      12.5,
    );

    expect(finish.exitCode).toBe(0);
    expect(finish.err).toEqual([]);
    expect(finish.out[0]).toBe(
      "Run complete: 1/2 scenarios passed in 12.5s (0 bootstrapped). " +
        "CDP connection closed on completion; the human's browser stays open (detached, never closed). " +
        `Corpus written to ${corpusDir}/.`,
    );
    expect(finish.out.at(-1)).toMatch(/^Corpus: .*@last-run → .*\(runId run-1\)$/);
  });

  it("reports setup failures on stderr but they do not fail a passing run", () => {
    const finish = finishRun(
      baseResult({
        scenarios: [PASSED],
        setup: [PASSED, { id: "nav-home", passed: false, error: "bootstrap failed" }],
      }),
      corpusDir,
      3.2,
    );

    expect(finish.exitCode).toBe(0);
    expect(finish.err).toEqual(["[SETUP FAIL] nav-home — bootstrap failed"]);
    expect(finish.out[0]).toContain("Run complete: 1/1 scenarios passed in 3.2s (1 bootstrapped, 1 setup failures)");
  });

  it("omits the handoff when the fan does not resolve (default handoffLine honesty)", () => {
    const finish = finishRun(baseResult({ scenarios: [PASSED] }), join(corpusDir, "nope"), 1);

    expect(finish.exitCode).toBe(0);
    expect(finish.out).toHaveLength(1);
    expect(finish.out[0]).toContain("Run complete:");
  });
});