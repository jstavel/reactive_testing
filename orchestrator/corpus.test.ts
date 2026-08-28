import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import {
  networkEventSchema,
  probeResultSchema,
  runManifestSchema,
  screenshotRefSchema,
  snapshotRecordSchema,
} from "../model/schemas.js";
import type { CorpusRun } from "../model/schemas.js";
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
});

describe("finishRun", () => {
  it("writes a conforming run-manifest.json listing run-id, timestamp, and all files", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();
    const timestamp = "2026-08-28T00:00:00.000Z";

    writeCorpusFile(corpusDir, run, "snapshots", 0, "json", "{}");
    writeCorpusFile(corpusDir, run, "network", 0, "json", "[]");

    finishRun(corpusDir, run, timestamp);

    const manifestPath = join(corpusDir, run.runId, "run-manifest.json");
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(runManifestSchema.safeParse(manifest).success).toBe(true);
    expect(manifest.runId).toBe(run.runId);
    expect(manifest.timestamp).toBe(timestamp);
    expect(manifest.files).toEqual([
      `snapshots/${run.runId}/0.json`,
      `network/${run.runId}/0.json`,
    ]);
  });

  it("namespaces manifests per run so two runs never overwrite", () => {
    const corpusDir = makeCorpusDir();
    const first = startCorpusRun();
    const second = startCorpusRun();

    finishRun(corpusDir, first, "t1");
    finishRun(corpusDir, second, "t2");

    const firstManifest = join(corpusDir, first.runId, "run-manifest.json");
    const secondManifest = join(corpusDir, second.runId, "run-manifest.json");
    expect(existsSync(firstManifest)).toBe(true);
    expect(existsSync(secondManifest)).toBe(true);
    expect(JSON.parse(readFileSync(firstManifest, "utf8")).runId).toBe(first.runId);
    expect(JSON.parse(readFileSync(secondManifest, "utf8")).runId).toBe(second.runId);
  });
});

describe("persisted values validate against their schemas", () => {
  it("a snapshots/network/probes/screenshots corpus validates end-to-end", () => {
    const corpusDir = makeCorpusDir();
    const run: CorpusRun = { runId: "seed", files: [] };

    const snapshot = { stateId: "homePage", snapshot: "<div/>", capturedAt: "t" };
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
