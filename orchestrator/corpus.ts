import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import type {
  CollectorError,
  CollectorName,
  CorpusRun,
  RunManifest,
  StepFailure,
} from "../model/schemas.js";

/**
 * Start a new corpus run — assigns a unique run-id and initializes the file list.
 */
export function startCorpusRun(): CorpusRun {
  return { runId: randomUUID(), files: [] };
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
  const relPath = `${kind}/${run.runId}/${name}.${ext}`;
  const absPath = join(corpusDir, relPath);
  mkdirSync(join(corpusDir, kind, run.runId), { recursive: true });
  writeFileSync(absPath, data);
  run.files.push(relPath);
  return relPath;
}

/**
 * Write the run-manifest.json at `{corpusDir}/{runId}/run-manifest.json`.
 * `errors` is always present (AD-16): the collector gaps recorded across the
 * run, so a future reporter can flag collection gaps from the manifest.
 * `failures` is always present (Story 2.7): the step failures recorded across
 * the run — a distinct axis from collector gaps. `collectors` is always present
 * (Story 3.2): the post-step collectors the plan declared, so a skipped
 * collector is distinguishable from a failed one.
 */
export function finishRun(
  corpusDir: string,
  run: CorpusRun,
  timestamp: string,
  errors: CollectorError[],
  failures: StepFailure[],
  collectors: CollectorName[],
): void {
  const manifest: RunManifest = {
    runId: run.runId,
    timestamp,
    files: [...run.files],
    errors: [...errors],
    failures: [...failures],
    collectors: [...collectors],
  };
  const manifestDir = join(corpusDir, run.runId);
  mkdirSync(manifestDir, { recursive: true });
  writeFileSync(
    join(manifestDir, "run-manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
}
