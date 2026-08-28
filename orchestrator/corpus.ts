import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import type { RunManifest } from "../model/schemas.js";

export interface CorpusRun {
  readonly runId: string;
  readonly files: string[];
}

/**
 * Start a new corpus run — assigns a unique run-id and initializes the file list.
 */
export function startCorpusRun(): CorpusRun {
  return { runId: randomUUID(), files: [] };
}

/**
 * Persist a plain-data corpus file under `{corpusDir}/{kind}/{runId}/{stepIndex}.{ext}`
 * and record the corpus-relative path. The caller decides the kind and data shape;
 * this module owns the file path and is the only writer (AD-15, Story 2.3). Accepts
 * either serialized text or raw bytes (e.g. PNG buffers).
 */
export function writeCorpusFile(
  corpusDir: string,
  run: CorpusRun,
  kind: string,
  stepIndex: number,
  ext: string,
  data: string | Buffer,
): string {
  const relPath = `${kind}/${run.runId}/${stepIndex}.${ext}`;
  const absPath = join(corpusDir, relPath);
  mkdirSync(join(corpusDir, kind, run.runId), { recursive: true });
  writeFileSync(absPath, data);
  run.files.push(relPath);
  return relPath;
}

/**
 * Write the run-manifest.json at `{corpusDir}/{runId}/run-manifest.json`.
 */
export function finishRun(
  corpusDir: string,
  run: CorpusRun,
  timestamp: string,
): void {
  const manifest: RunManifest = {
    runId: run.runId,
    timestamp,
    files: [...run.files],
  };
  const manifestDir = join(corpusDir, run.runId);
  mkdirSync(manifestDir, { recursive: true });
  writeFileSync(
    join(manifestDir, "run-manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
}
