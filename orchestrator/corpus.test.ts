import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
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

// Wrap (don't replace) the real handoff module so the try/catch failure path
// in finishRun can be driven deterministically.
vi.mock("./handlinks.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./handlinks.js")>();
  return { ...actual, writeHandoff: vi.fn(actual.writeHandoff) };
});
import { LAST_FAIL, LAST_RUN, linkRun, resolveFanRunId } from "./handlinks.js";

let tempDirs: string[] = [];

/** The executed plan's model version finishRun records as provenance (story 6). */
const PLAN_VERSION = "plan-hash-abc123";

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
    const bootstrapFailure = writeCorpusFile(
      corpusDir, run, "snapshots", 5, "json", "{}", "b.history-nav.5.failure",
    );

    expect(pre).toBe(`snapshots/${run.runId}/0.pre.json`);
    expect(failure).toBe(`snapshots/${run.runId}/0.failure.json`);
    expect(bootstrapFailure).toBe(`snapshots/${run.runId}/b.history-nav.5.failure.json`);
    expect(run.files).toEqual([pre, failure, bootstrapFailure]);
  });
});

describe("finishRun", () => {
  it("writes a conforming run-manifest.json listing run-id, timestamp, errors, and all files", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();
    const timestamp = "2026-08-28T00:00:00.000Z";

    writeCorpusFile(corpusDir, run, "snapshots", 0, "json", "{}");
    writeCorpusFile(corpusDir, run, "network", 0, "json", "[]");

    finishRun(corpusDir, run, timestamp, PLAN_VERSION, [], [], ["snapshot", "probe"]);

    const manifestPath = join(corpusDir, run.runId, "run-manifest.json");
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(runManifestSchema.safeParse(manifest).success).toBe(true);
    expect(manifest.runId).toBe(run.runId);
    expect(manifest.timestamp).toBe(timestamp);
    // The recorded provenance (story 6): the manifest carries exactly the
    // planModelVersion it was handed.
    expect(manifest.planModelVersion).toBe(PLAN_VERSION);
    expect(manifest.errors).toEqual([]);
    expect(manifest.failures).toEqual([]);
    expect(manifest.collectors).toEqual(["snapshot", "probe"]);
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
    finishRun(corpusDir, first, "t1", PLAN_VERSION, [probeGap], [], []);
    finishRun(corpusDir, second, "t2", PLAN_VERSION, [], [], []);

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

    finishRun(corpusDir, run, "t", PLAN_VERSION, errors, [], []);

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

    finishRun(corpusDir, run, "t", PLAN_VERSION, [], failures, []);

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

  it("records the executed plan's modelVersion in the manifest (record-path field, story 6)", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();

    finishRun(corpusDir, run, "t", PLAN_VERSION, [], [], []);

    const manifest = JSON.parse(
      readFileSync(join(corpusDir, run.runId, "run-manifest.json"), "utf8"),
    );
    // Required, never defaulted: a manifest without the field is a legacy
    // recording the offline guard refuses.
    expect(manifest.planModelVersion).toBe(PLAN_VERSION);
    expect(runManifestSchema.safeParse(manifest).success).toBe(true);
    expect(
      runManifestSchema.safeParse({ ...manifest, planModelVersion: undefined }).success,
    ).toBe(false);
  });

  it("cannot record an empty planModelVersion — the schema refuses a blank provenance (story 6 review)", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();

    // finishRun writes what it is handed, but the schema pins the recorded
    // provenance non-empty: an empty (or whitespace-collapsed-to-nothing via
    // min(1) — exactly-empty) version produces a manifest that fails
    // runManifestSchema, so no loader or CLI can silently accept it.
    finishRun(corpusDir, run, "t", "", [], [], []);

    const manifest = JSON.parse(
      readFileSync(join(corpusDir, run.runId, "run-manifest.json"), "utf8"),
    );
    expect(manifest.planModelVersion).toBe("");
    expect(runManifestSchema.safeParse(manifest).success).toBe(false);
  });
});

describe("finishRun handoff links", () => {
  it("re-points @last-run at the run and removes a stale @last-fail when the run passed", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();
    writeCorpusFile(corpusDir, run, "snapshots", 0, "json", "{}");
    linkRun(corpusDir, "older-failed-run", LAST_FAIL);

    finishRun(corpusDir, run, "t", PLAN_VERSION, [], [], [], [], { failed: false });

    expect(resolveFanRunId(corpusDir, LAST_RUN)).toBe(run.runId);
    expect(existsSync(join(corpusDir, LAST_FAIL))).toBe(false);
  });

  it("points both @last-run and @last-fail at the run when it failed", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();
    writeCorpusFile(corpusDir, run, "snapshots", 0, "json", "{}");

    finishRun(corpusDir, run, "t", PLAN_VERSION, [], [], [], [], { failed: true });

    expect(resolveFanRunId(corpusDir, LAST_RUN)).toBe(run.runId);
    expect(resolveFanRunId(corpusDir, LAST_FAIL)).toBe(run.runId);
  });

  it("without a handoff argument no links are created or removed (offline harness callers untouched)", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();
    writeCorpusFile(corpusDir, run, "snapshots", 0, "json", "{}");
    linkRun(corpusDir, "keep-me", LAST_FAIL);

    finishRun(corpusDir, run, "t", PLAN_VERSION, [], [], []);

    expect(existsSync(join(corpusDir, LAST_RUN))).toBe(false);
    expect(resolveFanRunId(corpusDir, LAST_FAIL)).toBe("keep-me");
  });

  it("warns instead of throwing when the handoff write fails — the completed run stands", async () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();
    writeCorpusFile(corpusDir, run, "snapshots", 0, "json", "{}");
    const { writeHandoff } = await import("./handlinks.js");
    (writeHandoff as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("symlink denied");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      expect(() =>
        finishRun(corpusDir, run, "t", PLAN_VERSION, [], [], [], [], { failed: true }),
      ).not.toThrow();
      // The manifest is already written — the run is complete regardless.
      expect(existsSync(join(corpusDir, run.runId, "run-manifest.json"))).toBe(true);
      expect(warn).toHaveBeenCalledWith("[handoff] skipped: symlink denied");
    } finally {
      warn.mockRestore();
    }
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
