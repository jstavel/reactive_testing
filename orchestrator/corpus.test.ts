import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import {
  collectorErrorSchema,
  networkEventSchema,
  probeResultSchema,
  runManifestSchema,
  screenshotRefSchema,
  snapshotRecordSchema,
  stepFailureSchema,
} from "../model/schemas.js";
import type { CollectorError, CorpusRun, StepFailure } from "../model/schemas.js";
import {
  startCorpusRun,
  writeCorpusFile,
  finishRun,
} from "./corpus.js";

let tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

function makeCorpusDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "corpus-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("startCorpusRun", () => {
  it("assigns a unique run-id per run", () => {
    const a = startCorpusRun();
    const b = startCorpusRun();

    expect(a.runId).toBeTruthy();
    expect(b.runId).toBeTruthy();
    expect(a.runId).not.toBe(b.runId);
  });

  it("starts with an empty file list", () => {
    const run = startCorpusRun();
    expect(run.files).toEqual([]);
  });
});

describe("writeCorpusFile", () => {
  it("writes plain data under kind/runId/stepIndex.ext and records the relative path", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();
    const data = JSON.stringify({ hello: "world" });

    const rel = writeCorpusFile(corpusDir, run, "snapshots", 0, "json", data);

    expect(rel).toBe(`snapshots/${run.runId}/0.json`);
    const abs = join(corpusDir, rel);
    expect(existsSync(abs)).toBe(true);
    expect(readFileSync(abs, "utf8")).toBe(data);
    expect(run.files).toEqual([rel]);
  });

  it("records each written file so none collide across stepIndexes", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();

    const paths = [0, 1, 2].map((idx) =>
      writeCorpusFile(corpusDir, run, "snapshots", idx, "json", JSON.stringify(idx)),
    );

    expect(new Set(paths).size).toBe(3);
    expect(run.files).toEqual(paths);
  });

  it("writes raw bytes (e.g. a PNG buffer) and records the relative path", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

    const rel = writeCorpusFile(corpusDir, run, "screenshots", 0, "png", png);

    expect(rel).toBe(`screenshots/${run.runId}/0.png`);
    const abs = join(corpusDir, rel);
    expect(existsSync(abs)).toBe(true);
    expect(readFileSync(abs).equals(png)).toBe(true);
    expect(run.files).toContain(rel);
  });

  it("phase-tags the filename stem when provided (pre/failure)", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();

    const pre = writeCorpusFile(corpusDir, run, "snapshots", 0, "json", "{}", "0.pre");
    const failure = writeCorpusFile(corpusDir, run, "snapshots", 0, "json", "{}", "0.failure");

    expect(pre).toBe(`snapshots/${run.runId}/0.pre.json`);
    expect(failure).toBe(`snapshots/${run.runId}/0.failure.json`);
    expect(run.files).toEqual([pre, failure]);
  });
});

describe("finishRun", () => {
  it("writes a conforming run-manifest.json listing run-id, timestamp, errors, and all files", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();
    const timestamp = "2026-08-28T00:00:00.000Z";

    writeCorpusFile(corpusDir, run, "snapshots", 0, "json", "{}");
    writeCorpusFile(corpusDir, run, "network", 0, "json", "[]");

    finishRun(corpusDir, run, timestamp, [], []);

    const manifestPath = join(corpusDir, run.runId, "run-manifest.json");
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(runManifestSchema.safeParse(manifest).success).toBe(true);
    expect(manifest.runId).toBe(run.runId);
    expect(manifest.timestamp).toBe(timestamp);
    expect(manifest.errors).toEqual([]);
    expect(manifest.failures).toEqual([]);
    expect(manifest.files).toEqual([
      `snapshots/${run.runId}/0.json`,
      `network/${run.runId}/0.json`,
    ]);
  });

  it("is namespaced per run and records a populated errors array per run", () => {
    const corpusDir = makeCorpusDir();
    const first = startCorpusRun();
    const second = startCorpusRun();

    const probeGap = {
      collector: "probe",
      stepIndex: 0,
      error: 'Probe "balance" selector "[data-balance]" failed: boom',
    } as const;
    finishRun(corpusDir, first, "t1", [probeGap], []);
    finishRun(corpusDir, second, "t2", [], []);

    const firstManifest = join(corpusDir, first.runId, "run-manifest.json");
    const secondManifest = join(corpusDir, second.runId, "run-manifest.json");
    expect(existsSync(firstManifest)).toBe(true);
    expect(existsSync(secondManifest)).toBe(true);
    expect(JSON.parse(readFileSync(firstManifest, "utf8")).runId).toBe(first.runId);
    expect(JSON.parse(readFileSync(secondManifest, "utf8")).runId).toBe(second.runId);
    expect(JSON.parse(readFileSync(firstManifest, "utf8")).errors).toEqual([probeGap]);
    expect(JSON.parse(readFileSync(secondManifest, "utf8")).errors).toEqual([]);
  });

  it("round-trips populated collector gaps through the manifest schema", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();

    const errors: CollectorError[] = [
      { collector: "snapshot", stepIndex: 2, error: "snapshot boom" },
      { collector: "network", stepIndex: 5, error: "network boom" },
    ];

    finishRun(corpusDir, run, "t", errors, []);

    const manifest = JSON.parse(
      readFileSync(join(corpusDir, run.runId, "run-manifest.json"), "utf8"),
    );
    expect(runManifestSchema.safeParse(manifest).success).toBe(true);
    expect(manifest.errors).toEqual(errors);
    for (const gap of manifest.errors) {
      expect(collectorErrorSchema.safeParse(gap).success).toBe(true);
    }
  });

  it("round-trips populated step failures through the manifest schema", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();

    const failures: StepFailure[] = [
      { stepIndex: 1, contractId: "clickHistoryMenuMain", stateId: "homePage", error: "locator.click: Timeout" },
    ];

    finishRun(corpusDir, run, "t", [], failures);

    const manifest = JSON.parse(
      readFileSync(join(corpusDir, run.runId, "run-manifest.json"), "utf8"),
    );
    expect(runManifestSchema.safeParse(manifest).success).toBe(true);
    expect(manifest.failures).toEqual(failures);
    for (const failure of manifest.failures) {
      expect(stepFailureSchema.safeParse(failure).success).toBe(true);
    }
  });

  it("rejects a malformed collector gap against collectorErrorSchema", () => {
    expect(
      collectorErrorSchema.safeParse({ collector: "nope", stepIndex: 0, error: "x" })
        .success,
    ).toBe(false);
    expect(
      collectorErrorSchema.safeParse({ collector: "probe", error: "x" })
        .success,
    ).toBe(false);
  });
});

describe("persisted values validate against their schemas", () => {
  it("a snapshots/network/probes/screenshots corpus validates end-to-end", () => {
    const corpusDir = makeCorpusDir();
    const run: CorpusRun = { runId: "seed", files: [] };

    const snapshot = { stateId: "homePage", url: "https://app.test/home", snapshot: "<div/>", capturedAt: "t" };
    const network = [{ url: "https://a", method: "GET", status: 200, capturedAt: "t" }];
    const probe = [{ name: "title", value: "x", capturedAt: "t" }];
    const screenshot = { filePath: "screenshots/seed/0.png", capturedAt: "t" };

    for (const [kind, data, schema] of [
      ["snapshots", snapshot, snapshotRecordSchema],
      ["network", network, z.array(networkEventSchema)],
      ["probes", probe, z.array(probeResultSchema)],
      ["screenshots", screenshot, screenshotRefSchema],
    ] as const) {
      writeCorpusFile(corpusDir, run, kind, 0, "json", JSON.stringify(data));
      const written = JSON.parse(
        readFileSync(join(corpusDir, kind, run.runId, "0.json"), "utf8"),
      );
      const parsed = schema.safeParse(written);
      expect(parsed.success).toBe(true);
    }
  });
});

describe("screenshotRefSchema", () => {
  it("rejects absolute paths — refs must be corpus-relative", () => {
    expect(
      screenshotRefSchema.safeParse({ filePath: "/tmp/run/0.png", capturedAt: "t" })
        .success,
    ).toBe(false);
    expect(
      screenshotRefSchema.safeParse({ filePath: "C:\\secrets\\0.png", capturedAt: "t" })
        .success,
    ).toBe(false);
  });
});
