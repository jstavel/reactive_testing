import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type {
  BootstrapRecord,
  CollectorError,
  CollectorName,
  CorpusRun,
  RunManifest,
  StepFailure,
} from "../model/schemas.js";
import { RUN_ID_PATTERN, writeHandoff } from "./handlinks.js";

export function assertSafeRunId(runId: string): void {
  if (typeof runId !== "string" || !RUN_ID_PATTERN.test(runId)) {
    throw new Error(
      `Invalid runId ${JSON.stringify(runId)}: runIds must match ${RUN_ID_PATTERN} ` +
        `(a runId with path separators or ".." could escape the corpus)`,
    );
  }
}

export function assertSafeSegment(label: string, value: string): void {
  const normalized = value.replace(/[. ]+$/, "");
  if (
    value.length === 0 ||
    normalized.length === 0 ||
    normalized === "." ||
    normalized === ".." ||
    value.includes("/") ||
    value.includes("\\") ||
    value.includes("\0") ||
    [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  ) {
    throw new Error(`Invalid ${label} "${value}": must be a single non-empty path segment.`);
  }
}

/**
 * Start a new corpus run with a provided run-id or a newly generated UUID.
 */
export function startCorpusRun(runId?: string): CorpusRun {
  return { runId: runId ?? randomUUID(), files: [] };
}

/**
 * Persist a plain-data corpus file under `{corpusDir}/{kind}/{runId}/{stem}.{ext}`
 * and record the corpus-relative path. The caller decides the kind and data shape;
 * this module owns the file path and is the only writer (AD-15, Story 2.3). Accepts
 * either serialized text or raw bytes (e.g. PNG buffers). `stem` overrides the
 * default `String(stepIndex)` filename so a caller can phase-tag evidence
 * (e.g. `0.pre.json`, `0.failure.json` for Story 2.7 pre-step/failure captures).
 */
export function writeCorpusFile(
  corpusDir: string,
  run: CorpusRun,
  kind: string,
  stepIndex: number,
  ext: string,
  data: string | Buffer,
  stem?: string,
): string {
  const name = stem ?? String(stepIndex);
  assertSafeRunId(run.runId);
  assertSafeSegment("kind", kind);
  assertSafeSegment("stem", name);
  assertSafeSegment("ext", ext);
  const relPath = `${kind}/${run.runId}/${name}.${ext}`;
  const absPath = join(corpusDir, relPath);
  mkdirSync(join(corpusDir, kind, run.runId), { recursive: true });
  writeFileSync(absPath, data);
  run.files.push(relPath);
  return relPath;
}

/**
 * Write the run-manifest.json at `{corpusDir}/{runId}/run-manifest.json`.
 * `planModelVersion` is the executed plan's modelVersion — the run's recorded
 * provenance (story 6 of spec-report-gherkin-corpus-links): the offline CLIs
 * refuse a run recorded under a different model (or predating the field), so
 * every recorded run must carry the version it was made under.
 * `errors` is always present (AD-16): the collector gaps recorded across the
 * run, so a future reporter can flag collection gaps from the manifest.
 * `failures` is always present (Story 2.7): the step failures recorded across
 * the run — a distinct axis from collector gaps. `collectors` is always present
 * (Story 3.2): the post-step collectors the plan declared, so a skipped
 * collector is distinguishable from a failed one.
 *
 * When `handoff` is provided (the orchestrator always passes it), the run also
 * writes its handoff links on completion: `@last-run` always re-points at this
 * run, and `@last-fail` re-points when the run failed / is removed when it
 * passed. Callers that omit `handoff` (offline harnesses) touch no links.
 * The input object requires the manifest fields and defaults `bootstrap` to `[]`.
 */
export interface FinishRunInput {
  corpusDir: string;
  run: CorpusRun;
  timestamp: string;
  planModelVersion: string;
  errors: CollectorError[];
  failures: StepFailure[];
  collectors: CollectorName[];
  bootstrap?: BootstrapRecord[] | null;
  handoff?: { failed: boolean };
}

export function finishRun({
  corpusDir,
  run,
  timestamp,
  planModelVersion,
  errors,
  failures,
  collectors,
  bootstrap,
  handoff,
}: FinishRunInput): void {
  const bootstrapRecords = bootstrap ?? [];
  const manifest: RunManifest = {
    runId: run.runId,
    timestamp,
    planModelVersion,
    files: [...run.files],
    errors: [...errors],
    failures: [...failures],
    collectors: [...collectors],
    bootstrap: [...bootstrapRecords],
  };
  assertSafeRunId(run.runId);
  const manifestDir = join(corpusDir, run.runId);
  mkdirSync(manifestDir, { recursive: true });
  writeFileSync(join(manifestDir, "run-manifest.json"), JSON.stringify(manifest, null, 2));
  if (!handoff) {
    return;
  }
  // The handoff is convenience-only: a symlink failure (read-only corpus,
  // Windows privileges, invalid runId) must not turn a completed run into an
  // error — the manifest is already written.
  try {
    writeHandoff(corpusDir, run.runId, handoff.failed);
  } catch (err) {
    console.warn(`[handoff] skipped: ${err instanceof Error ? err.message : String(err)}`);
  }
}
