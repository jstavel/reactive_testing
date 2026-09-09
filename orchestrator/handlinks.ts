// Handoff links — stable symlink "fans" over the kind-split corpus lake. A
// completed run re-points `@last-run` at its own kind dirs and, when it
// failed, `@last-fail` too; a passing run removes `@last-fail`. The fans are
// operator convenience views only: offline consumers (validators, reporter)
// keep reading `corpus/<runId>/…` directly, never through the links.
//
// Targets are corpus-relative (`../<kind>/<runId>`), so a `cp -a`/`rsync`
// mirror of the corpus stays resolvable without rewriting links.

import {
  existsSync,
  mkdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { basename, join } from "node:path";

/** A runId is always a UUID/kebab token; anything else (path separators, `..`)
 * must never reach a symlink target or it could escape the corpus dir. */
const RUN_ID_PATTERN = /^[A-Za-z0-9-]+$/;

/**
 * The per-run dirs one fan wires up: the manifest dir is `corpus/<runId>`
 * itself, every collector kind lives at `corpus/<kind>/<runId>`. Fixed fan
 * shape (spec: manifest/snapshots/network/probes/screenshots).
 */
export const HANDOFF_KINDS = [
  "manifest",
  "snapshots",
  "network",
  "probes",
  "screenshots",
] as const;
export type HandoffKind = (typeof HANDOFF_KINDS)[number];

/** The latest completed run's fan — always present after a run completes. */
export const LAST_RUN = "@last-run";
/** The latest failing run's fan — absent while the latest run passed. */
export const LAST_FAIL = "@last-fail";

/** Corpus-relative target for one fan entry. */
function targetFor(kind: HandoffKind, runId: string): string {
  return kind === "manifest"
    ? join("..", runId)
    : join("..", kind, runId);
}

/** The kind dir a fan entry points at. */
function targetDir(corpusDir: string, kind: HandoffKind, runId: string): string {
  return kind === "manifest"
    ? join(corpusDir, runId)
    : join(corpusDir, kind, runId);
}

/**
 * Create or re-point a handoff fan at one run: `corpusDir/<linkName>/<kind>`
 * → the run's matching dir. The fan is rebuilt from scratch, so re-pointing
 * is deterministic regardless of the previous target. A kind dir the run
 * never wrote is pre-created empty, so the fan is never dangling. The runId
 * is validated first — a malicious id must never escape the corpus via a
 * symlink target.
 */
export function linkRun(
  corpusDir: string,
  runId: string,
  linkName: string = LAST_RUN,
  kinds: readonly HandoffKind[] = HANDOFF_KINDS,
): void {
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new Error(
      `Invalid runId "${runId}": handoff targets must match ${RUN_ID_PATTERN} ` +
        `(a runId with path separators or ".." could escape the corpus).`,
    );
  }
  const fanDir = join(corpusDir, linkName);
  rmSync(fanDir, { recursive: true, force: true });
  mkdirSync(fanDir, { recursive: true });
  for (const kind of kinds) {
    mkdirSync(targetDir(corpusDir, kind, runId), { recursive: true });
    symlinkSync(targetFor(kind, runId), join(fanDir, kind));
  }
}

/** Remove the `@last-fail` fan. Idempotent — absent is already the goal state. */
export function unlinkLastFail(corpusDir: string): void {
  rmSync(join(corpusDir, LAST_FAIL), { recursive: true, force: true });
}

/**
 * The handoff a completed run writes: `@last-run` always re-pointed at the
 * run; `@last-fail` re-pointed when the run failed, removed when it passed
 * (a passing run clears the debugger state).
 */
export function writeHandoff(
  corpusDir: string,
  runId: string,
  failed: boolean,
): void {
  linkRun(corpusDir, runId, LAST_RUN);
  if (failed) {
    linkRun(corpusDir, runId, LAST_FAIL);
  } else {
    unlinkLastFail(corpusDir);
  }
}

/**
 * Resolve a handoff fan to the CANONICAL run directory it points at: the
 * realpath of the fan's `manifest` link, whose target must contain
 * `run-manifest.json`. Returns `null` when the fan, the manifest link, or the
 * run's manifest is absent — and catches fs errors so a concurrent fan
 * re-point (ENOENT between check and realpath) resolves to `null` instead of
 * throwing. Never returns the fan dir itself; the run dir is the durable
 * corpus location the fan is a view over.
 */
export function resolveFan(
  corpusDir: string,
  linkName: string = LAST_RUN,
): string | null {
  try {
    const runDir = realpathSync(join(corpusDir, linkName, "manifest"));
    if (!existsSync(join(runDir, "run-manifest.json"))) {
      return null;
    }
    return runDir;
  } catch {
    return null;
  }
}

/** The runId a fan currently points at (parsed from its manifest link), or
 * `null` when the fan is absent or malformed. */
export function resolveFanRunId(
  corpusDir: string,
  linkName: string = LAST_RUN,
): string | null {
  try {
    const target = readlinkSync(join(corpusDir, linkName, "manifest"));
    return basename(target);
  } catch {
    return null;
  }
}

/**
 * The operator-facing handoff line for a completed run, e.g.
 * `Corpus: corpus/@last-run → /abs/corpus/<runId> (runId <runId>)` — with a
 * `· corpus/@last-fail → …` suffix when the run failed and its fan exists.
 * Pure: returns `null` when there is nothing honest to print (no runId, or
 * the `@last-run` fan is absent, points at another run, or no longer
 * resolves to a real run) so a stale fan is never surfaced.
 */
export function handoffLine(
  result: { runId?: string },
  corpusDir: string,
  failed = false,
): string | null {
  if (result.runId === undefined) {
    return null;
  }
  if (resolveFanRunId(corpusDir, LAST_RUN) !== result.runId) {
    return null;
  }
  const runDir = resolveFan(corpusDir, LAST_RUN);
  if (runDir === null) {
    return null;
  }
  let line = `Corpus: ${corpusDir}/${LAST_RUN} → ${runDir} (runId ${result.runId})`;
  if (failed) {
    const failDir = resolveFan(corpusDir, LAST_FAIL);
    if (failDir !== null) {
      line += ` · ${corpusDir}/${LAST_FAIL} → ${failDir}`;
    }
  }
  return line;
}