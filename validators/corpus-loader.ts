// Corpus loader (Story 3.3) — pure read-only reader that rebuilds each step's
// ContractEvidence from a recorded run's files.
//
// The loader is manifest-first: it trusts run-manifest.json's `files` list as the
// source of what exists (AD-15 self-describing corpus). A collector gap (AD-16)
// therefore yields absent evidence — never a read error — so a step can lack a
// post-snapshot or a probe batch and degrade to 3.1's missing-evidence result
// instead of throwing.
//
// stepIndex is total (0..N-1, reconstructed by walking plan.scenarios[].steps[]
// with the same global counter the orchestrator uses) while file presence is not:
// the loader seeks evidence by index but never asserts a file exists.
//
// Layer direction preserved: validators/ imports only model/ (never orchestrator/).

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  probeResultSchema,
  runManifestSchema,
  snapshotRecordSchema,
} from "../model/schemas.js";
import type {
  ContractEvidence,
  ProbeResult,
  SnapshotRecord,
  TestPlan,
} from "../model/schemas.js";

/** One step's rebuilt evidence, tagged with the contract it executed. Tagging by
 * stepIndex (not contractId) preserves a contract repeated across steps. */
export interface StepEvidence {
  /** Global step index (0..N-1 across the whole plan). */
  stepIndex: number;
  /** contractId the step executed (from the plan). */
  contractId: string;
  /** Rebuilt evidence for this step. */
  evidence: ContractEvidence;
}

/**
 * Rebuild each step's ContractEvidence from a recorded run, guided by its
 * run-manifest.json `files` list and the test plan's step ordering.
 *
 * Returns `[]` when the runId/dir is absent from corpusDir (UNKNOWN_RUN) —
 * an explicit empty set, never a crash. A step whose post-snapshot or probe
 * collector gaped (file absent from the manifest) yields undefined evidence,
 * mirroring 3.1's missing-evidence path.
 */
export function loadCorpusSteps(
  corpusDir: string,
  runId: string,
  plan: TestPlan,
): StepEvidence[] {
  // --- Read the manifest (source of what exists). Absent run → empty. ---
  const manifestPath = join(corpusDir, runId, "run-manifest.json");
  let manifest;
  try {
    const raw = readFileSync(manifestPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!runManifestSchema.safeParse(parsed).success) {
      return [];
    }
    manifest = parsed;
  } catch {
    return [];
  }

  const files = new Set<string>(manifest.files);

  // --- Reconstruct stepIndex → contractId by walking the plan (total 0..N-1). ---
  return planSteps(plan).map(({ stepIndex, contractId }) => ({
    stepIndex,
    contractId,
    evidence: loadStepEvidence(corpusDir, runId, stepIndex, files),
  }));
}

/** Reconstruct stepIndex → contractId by walking the plan with the same global
 * counter the orchestrator uses. Defensive against a malformed/absent plan so
 * the loader never throws: a missing or non-array `plan.scenarios`, a scenario
 * without an iterable `steps`, or a step without a string `contractId` is
 * skipped (an absent plan yields `[]`). A well-formed plan walks unchanged. */
function planSteps(
  plan: unknown,
): Array<{ stepIndex: number; contractId: string }> {
  const steps: Array<{ stepIndex: number; contractId: string }> = [];
  if (typeof plan !== "object" || plan === null) {
    return steps;
  }
  const scenarios = (plan as { scenarios?: unknown }).scenarios;
  if (!Array.isArray(scenarios)) {
    return steps;
  }

  let stepIndex = 0;
  for (const scenario of scenarios) {
    const scenarioSteps = (scenario as { steps?: unknown } | null)?.steps;
    if (!Array.isArray(scenarioSteps)) {
      continue;
    }
    for (const step of scenarioSteps) {
      const contractId = (step as { contractId?: unknown } | null)?.contractId;
      if (typeof contractId !== "string") {
        continue;
      }
      steps.push({ stepIndex, contractId });
      stepIndex += 1;
    }
  }
  return steps;
}

/** Read a step's post snapshot (`{stepIndex}.json`), pre snapshot
 * (`{stepIndex}.pre.json`), and probes (`{stepIndex}.json`) — but only when the
 * manifest `files` list names them (collector gap → undefined, never a throw). */
function loadStepEvidence(
  corpusDir: string,
  runId: string,
  stepIndex: number,
  files: Set<string>,
): ContractEvidence {
  const pre = readSnapshotIfListed(
    corpusDir,
    `snapshots/${runId}/${stepIndex}.pre.json`,
    files,
  );
  const post = readSnapshotIfListed(
    corpusDir,
    `snapshots/${runId}/${stepIndex}.json`,
    files,
  );
  const probes = readProbesIfListed(
    corpusDir,
    `probes/${runId}/${stepIndex}.json`,
    files,
  );

  return {
    ...(pre !== undefined ? { pre } : {}),
    ...(post !== undefined ? { post } : {}),
    ...(probes !== undefined ? { probes } : {}),
  };
}

/** Read and validate a snapshot file, but only if the manifest lists it. A
 * listed-but-unparseable file degrades to undefined (missing evidence) rather
 * than throwing — the loader stays a pure result, never an exception. */
function readSnapshotIfListed(
  corpusDir: string,
  relPath: string,
  files: Set<string>,
): SnapshotRecord | undefined {
  if (!files.has(relPath)) {
    return undefined;
  }
  const abs = join(corpusDir, relPath);
  try {
    const raw = JSON.parse(readFileSync(abs, "utf8"));
    const parsed = snapshotRecordSchema.safeParse(raw);
    if (!parsed.success) {
      return undefined;
    }
    return parsed.data;
  } catch {
    return undefined;
  }
}

/** Read and validate a probe batch, but only if the manifest lists it. */
function readProbesIfListed(
  corpusDir: string,
  relPath: string,
  files: Set<string>,
): ProbeResult[] | undefined {
  if (!files.has(relPath)) {
    return undefined;
  }
  const abs = join(corpusDir, relPath);
  try {
    const raw = JSON.parse(readFileSync(abs, "utf8"));
    const parsed = probeResultSchema.array().safeParse(raw);
    if (!parsed.success) {
      return undefined;
    }
    return parsed.data;
  } catch {
    return undefined;
  }
}
