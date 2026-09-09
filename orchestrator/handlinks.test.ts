import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  HANDOFF_KINDS,
  LAST_FAIL,
  LAST_RUN,
  handoffLine,
  linkRun,
  resolveFan,
  resolveFanRunId,
  unlinkLastFail,
  writeHandoff,
} from "./handlinks.js";
import { finishRun, startCorpusRun, writeCorpusFile } from "./corpus.js";

let tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

function makeCorpusDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "handlinks-test-"));
  tempDirs.push(dir);
  return dir;
}

/** Seed a run's evidence the way the orchestrator would: a manifest plus one
 * snapshot file. */
function seedRun(corpusDir: string, runId: string): void {
  mkdirSync(join(corpusDir, "snapshots", runId), { recursive: true });
  writeFileSync(join(corpusDir, "snapshots", runId, "0.json"), "{}");
  mkdirSync(join(corpusDir, runId), { recursive: true });
  writeFileSync(
    join(corpusDir, runId, "run-manifest.json"),
    JSON.stringify({ runId }),
  );
}

/** Recursive relative-path listing, for asserting "no filesystem change". */
function listTree(root: string, prefix = ""): string[] {
  return readdirSync(root, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const rel = join(prefix, entry.name);
      return entry.isDirectory() && !lstatSync(join(root, entry.name)).isSymbolicLink()
        ? listTree(join(root, entry.name), rel)
        : [rel];
    });
}

describe("linkRun", () => {
  it("creates a flat fan of five relative symlinks over the kind dirs plus the manifest dir", () => {
    const corpusDir = makeCorpusDir();
    seedRun(corpusDir, "run-a");
    writeCorpusFile(corpusDir, { runId: "run-a", files: [] }, "network", 0, "json", "[]");

    linkRun(corpusDir, "run-a");

    const fanDir = join(corpusDir, LAST_RUN);
    expect(lstatSync(fanDir).isDirectory()).toBe(true);
    expect(readdirSync(fanDir).sort()).toEqual([...HANDOFF_KINDS].sort());
    for (const kind of ["snapshots", "network", "probes", "screenshots"] as const) {
      const link = join(fanDir, kind);
      expect(lstatSync(link).isSymbolicLink()).toBe(true);
      expect(readlinkSync(link)).toBe(`../${kind}/run-a`);
      expect(realpathSync(link)).toBe(realpathSync(join(corpusDir, kind, "run-a")));
    }
    expect(lstatSync(join(fanDir, "manifest")).isSymbolicLink()).toBe(true);
    expect(readlinkSync(join(fanDir, "manifest"))).toBe(`../run-a`);
    expect(realpathSync(join(fanDir, "manifest"))).toBe(realpathSync(join(corpusDir, "run-a")));
    // The fan's manifest entry reaches the same-run manifest.
    expect(JSON.parse(readFileSync(join(fanDir, "manifest", "run-manifest.json"), "utf8")).runId).toBe("run-a");
  });

  it("missing kind: the fan still includes the link, pointing at a pre-created empty dir", () => {
    const corpusDir = makeCorpusDir();
    seedRun(corpusDir, "run-a"); // snapshots + manifest only; no network files

    linkRun(corpusDir, "run-a");

    const networkLink = join(corpusDir, LAST_RUN, "network");
    expect(existsSync(networkLink)).toBe(true);
    expect(readdirSync(networkLink)).toEqual([]);
  });

  it("re-pointing moves the whole fan to the newest run", () => {
    const corpusDir = makeCorpusDir();
    seedRun(corpusDir, "run-a");
    seedRun(corpusDir, "run-b");

    linkRun(corpusDir, "run-a");
    linkRun(corpusDir, "run-b");

    expect(resolveFanRunId(corpusDir, LAST_RUN)).toBe("run-b");
    expect(realpathSync(join(corpusDir, LAST_RUN, "snapshots"))).toBe(
      realpathSync(join(corpusDir, "snapshots", "run-b")),
    );
  });

  it("relative targets keep the fan portable across a corpus rename/mirror", () => {
    const corpusDir = makeCorpusDir();
    seedRun(corpusDir, "run-a");
    linkRun(corpusDir, "run-a");

    const moved = `${corpusDir}-moved`;
    renameSync(corpusDir, moved);
    tempDirs.push(moved);

    expect(existsSync(join(moved, LAST_RUN, "manifest", "run-manifest.json"))).toBe(true);
    expect(JSON.parse(readFileSync(join(moved, LAST_RUN, "manifest", "run-manifest.json"), "utf8")).runId).toBe("run-a");
  });

  it("rejects runIds that could escape the corpus via symlink targets", () => {
    const corpusDir = makeCorpusDir();
    for (const evil of ["../evil", "run/a", "", "..", "."]) {
      expect(() => linkRun(corpusDir, evil)).toThrow(/Invalid runId/);
    }
    // Nothing was written for a rejected runId.
    expect(existsSync(join(corpusDir, LAST_RUN))).toBe(false);
  });
});

describe("writeHandoff (@last-run / @last-fail lifecycle)", () => {
  it("failing run: both fans point at the run", () => {
    const corpusDir = makeCorpusDir();
    seedRun(corpusDir, "run-a");

    writeHandoff(corpusDir, "run-a", true);

    expect(resolveFanRunId(corpusDir, LAST_RUN)).toBe("run-a");
    expect(resolveFanRunId(corpusDir, LAST_FAIL)).toBe("run-a");
  });

  it("pass-after-fail: @last-fail is removed, @last-run re-pointed", () => {
    const corpusDir = makeCorpusDir();
    seedRun(corpusDir, "run-a");
    seedRun(corpusDir, "run-b");
    writeHandoff(corpusDir, "run-a", true);

    writeHandoff(corpusDir, "run-b", false);

    expect(resolveFanRunId(corpusDir, LAST_RUN)).toBe("run-b");
    expect(existsSync(join(corpusDir, LAST_FAIL))).toBe(false);
  });

  it("removing an absent @last-fail is a no-op", () => {
    const corpusDir = makeCorpusDir();
    expect(() => unlinkLastFail(corpusDir)).not.toThrow();
    expect(existsSync(join(corpusDir, LAST_FAIL))).toBe(false);
  });
});

describe("resolution", () => {
  it("resolveFan returns the canonical run dir (realpath of the manifest link), or null when absent", () => {
    const corpusDir = makeCorpusDir();
    seedRun(corpusDir, "run-a");
    expect(resolveFan(corpusDir, LAST_RUN)).toBeNull();

    linkRun(corpusDir, "run-a");
    // The RUN directory, never the fan dir itself.
    expect(resolveFan(corpusDir, LAST_RUN)).toBe(realpathSync(join(corpusDir, "run-a")));
    expect(resolveFan(corpusDir, LAST_RUN)).not.toBe(realpathSync(join(corpusDir, LAST_RUN)));
  });

  it("resolveFan returns null when the resolved run dir lacks run-manifest.json", () => {
    const corpusDir = makeCorpusDir();
    seedRun(corpusDir, "run-a");
    linkRun(corpusDir, "run-a");

    rmSync(join(corpusDir, "run-a", "run-manifest.json"));

    expect(resolveFan(corpusDir, LAST_RUN)).toBeNull();
  });

  it("resolveFan returns null (not a throw) on a dangling manifest link — a concurrent re-point must not break resolvers", () => {
    const corpusDir = makeCorpusDir();
    seedRun(corpusDir, "run-a");
    linkRun(corpusDir, "run-a");
    rmSync(join(corpusDir, "run-a"), { recursive: true, force: true });

    expect(() => resolveFan(corpusDir, LAST_RUN)).not.toThrow();
    expect(resolveFan(corpusDir, LAST_RUN)).toBeNull();
  });

  it("resolveFanRunId parses the runId from the manifest link, or null when malformed/absent", () => {
    const corpusDir = makeCorpusDir();
    seedRun(corpusDir, "run-a");
    linkRun(corpusDir, "run-a");

    expect(resolveFanRunId(corpusDir, LAST_RUN)).toBe("run-a");
    expect(resolveFanRunId(corpusDir, LAST_FAIL)).toBeNull();
    expect(resolveFanRunId(corpusDir, "@never-created")).toBeNull();
  });
});

describe("handoffLine (runner print helper)", () => {
  it("failing run: one line naming both fans, pointing at the canonical run dir", () => {
    const corpusDir = makeCorpusDir();
    seedRun(corpusDir, "run-a");
    writeHandoff(corpusDir, "run-a", true);
    const runDir = realpathSync(join(corpusDir, "run-a"));

    const line = handoffLine({ runId: "run-a" }, corpusDir, true);

    expect(line).toBe(
      `Corpus: ${corpusDir}/@last-run → ${runDir} (runId run-a)` +
        ` · ${corpusDir}/@last-fail → ${runDir}`,
    );
  });

  it("passing run: single line, no @last-fail mention", () => {
    const corpusDir = makeCorpusDir();
    seedRun(corpusDir, "run-a");
    writeHandoff(corpusDir, "run-a", false);

    const line = handoffLine({ runId: "run-a" }, corpusDir, false);

    expect(line).toBe(
      `Corpus: ${corpusDir}/@last-run → ${realpathSync(join(corpusDir, "run-a"))} (runId run-a)`,
    );
    expect(line).not.toContain("@last-fail");
  });

  it("failed=true with no @last-fail fan (passing run's state) falls back to the single line", () => {
    const corpusDir = makeCorpusDir();
    seedRun(corpusDir, "run-a");
    writeHandoff(corpusDir, "run-a", false);

    const line = handoffLine({ runId: "run-a" }, corpusDir, true);

    expect(line).not.toBeNull();
    expect(line).not.toContain("@last-fail");
  });

  it("returns null when runId is undefined (run never started)", () => {
    const corpusDir = makeCorpusDir();
    seedRun(corpusDir, "run-a");
    writeHandoff(corpusDir, "run-a", false);

    expect(handoffLine({}, corpusDir, false)).toBeNull();
  });

  it("returns null when the @last-run fan is absent or points at another run", () => {
    const corpusDir = makeCorpusDir();
    seedRun(corpusDir, "run-a");
    // Fan absent.
    expect(handoffLine({ runId: "run-a" }, corpusDir)).toBeNull();

    // Fan re-pointed at a different run.
    seedRun(corpusDir, "run-b");
    writeHandoff(corpusDir, "run-b", false);
    expect(handoffLine({ runId: "run-a" }, corpusDir)).toBeNull();
    expect(handoffLine({ runId: "run-b" }, corpusDir)).not.toBeNull();
  });

  it("returns null when the fan no longer resolves to a real run (dangling run dir)", () => {
    const corpusDir = makeCorpusDir();
    seedRun(corpusDir, "run-a");
    writeHandoff(corpusDir, "run-a", true);
    rmSync(join(corpusDir, "run-a"), { recursive: true, force: true });

    expect(handoffLine({ runId: "run-a" }, corpusDir, true)).toBeNull();
  });
});

describe("run completion wiring (via finishRun)", () => {
  it("failing run: finishRun points both fans at the run", () => {
    const corpusDir = makeCorpusDir();
    const run = startCorpusRun();
    writeCorpusFile(corpusDir, run, "snapshots", 0, "json", "{}");

    finishRun(corpusDir, run, "t", [], [{ stepIndex: 0, contractId: "c", stateId: "s", error: "boom" }], ["snapshot"], [], { failed: true });

    expect(resolveFanRunId(corpusDir, LAST_RUN)).toBe(run.runId);
    expect(resolveFanRunId(corpusDir, LAST_FAIL)).toBe(run.runId);
  });

  it("pass-after-fail: a passing run removes @last-fail and re-points @last-run", () => {
    const corpusDir = makeCorpusDir();
    const failed = startCorpusRun();
    const passed = startCorpusRun();
    finishRun(corpusDir, failed, "t1", [], [{ stepIndex: 0, contractId: "c", stateId: "s", error: "boom" }], [], [], { failed: true });

    finishRun(corpusDir, passed, "t2", [], [], [], [], { failed: false });

    expect(resolveFanRunId(corpusDir, LAST_RUN)).toBe(passed.runId);
    expect(existsSync(join(corpusDir, LAST_FAIL))).toBe(false);
  });
});

describe("npm corpus scripts (print-only operator surface)", () => {
  const repoRoot = resolve(import.meta.dirname, "..");
  // Windows spawns npm via the .cmd shim.
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";

  it("npm run corpus:list prints the resolved path and makes no other filesystem change", () => {
    const corpusDir = makeCorpusDir();
    seedRun(corpusDir, "run-a");
    writeHandoff(corpusDir, "run-a", true);
    const before = listTree(corpusDir);

    const out = execFileSync(npm, ["run", "--silent", "corpus:list"], {
      cwd: repoRoot,
      env: { ...process.env, CORPUS_DIR: corpusDir },
      encoding: "utf8",
      timeout: 60_000,
    });

    expect(out).toContain(`${LAST_RUN}: ${resolveFan(corpusDir, LAST_RUN)}`);
    expect(out).toContain(`${LAST_FAIL}: ${resolveFan(corpusDir, LAST_FAIL)}`);
    expect(listTree(corpusDir)).toEqual(before);
  });

  it("npm run corpus:last-run prints the resolved path (and last-fail fails closed when absent)", () => {
    const corpusDir = makeCorpusDir();
    seedRun(corpusDir, "run-a");
    writeHandoff(corpusDir, "run-a", false);

    const out = execFileSync(npm, ["run", "--silent", "corpus:last-run"], {
      cwd: repoRoot,
      env: { ...process.env, CORPUS_DIR: corpusDir },
      encoding: "utf8",
      timeout: 60_000,
    });
    expect(out.trim()).toBe(resolveFan(corpusDir, LAST_RUN));

    expect(() =>
      execFileSync(npm, ["run", "--silent", "corpus:last-fail"], {
        cwd: repoRoot,
        env: { ...process.env, CORPUS_DIR: corpusDir },
        encoding: "utf8",
        timeout: 60_000,
      }),
    ).toThrow();
  });
});