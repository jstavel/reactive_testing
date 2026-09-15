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
import type {
  ContractEvidence,
  ProbeResult,
  RunManifest,
  SnapshotRecord,
  TestPlan,
} from "../model/schemas.js";
import { probeResultSchema, runManifestSchema, snapshotRecordSchema } from "../model/schemas.js";

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

export interface CorpusGap {
  kind: "manifest-invalid" | "unknown-run" | "plan-malformed" | "file-corrupt";
  stepIndex?: number;
  contractId?: string;
  relPath?: string;
  scenarioIndex?: number;
  detail?: string;
}

interface PlanStep {
  stepIndex: number;
  contractId: string;
}

interface PlanShape {
  steps: PlanStep[];
  gaps: CorpusGap[];
}

export interface CorpusRunLoad {
  steps: StepEvidence[];
  gaps: CorpusGap[];
}

/** Rebuild a recorded run and retain every gap that could make validation vacuous. */
export function loadCorpusRun(corpusDir: string, runId: string, plan: TestPlan): CorpusRunLoad {
  const planShape = planSteps(plan);
  const manifestPath = join(corpusDir, runId, "run-manifest.json");
  let manifest: RunManifest;
  try {
    const raw = readFileSync(manifestPath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    const result = runManifestSchema.safeParse(parsed);
    if (!result.success) {
      return {
        steps: planShape.steps.map(({ stepIndex, contractId }) => ({
          stepIndex,
          contractId,
          evidence: {},
        })),
        gaps: [
          ...planShape.gaps,
          { kind: "manifest-invalid", detail: "run manifest failed schema validation" },
        ],
      };
    }
    manifest = result.data;
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return { steps: [], gaps: [...planShape.gaps, { kind: "unknown-run" }] };
    }
    return {
      steps: planShape.steps.map(({ stepIndex, contractId }) => ({
        stepIndex,
        contractId,
        evidence: {},
      })),
      gaps: [
        ...planShape.gaps,
        { kind: "manifest-invalid", detail: "run manifest could not be read" },
      ],
    };
  }

  const files = new Set<string>(manifest.files);
  const loadedSteps = planShape.steps.map(({ stepIndex, contractId }) => {
    const loaded = loadStepEvidence(corpusDir, runId, stepIndex, files);
    return {
      step: { stepIndex, contractId, evidence: loaded.evidence },
      gaps: loaded.gaps.map((gap) => ({ ...gap, stepIndex, contractId })),
    };
  });
  return {
    steps: loadedSteps.map(({ step }) => step),
    gaps: [...planShape.gaps, ...loadedSteps.flatMap(({ gaps }) => gaps)],
  };
}

/** Compatibility wrapper for consumers that intentionally need only evidence. */
export function loadCorpusSteps(corpusDir: string, runId: string, plan: TestPlan): StepEvidence[] {
  const loaded = loadCorpusRun(corpusDir, runId, plan);
  return loaded.gaps.some(({ kind }) => kind === "manifest-invalid" || kind === "unknown-run")
    ? []
    : loaded.steps;
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

/** Reconstruct plan indexes exactly as the orchestrator does, including malformed iterations. */
function planSteps(plan: unknown): PlanShape {
  const steps: PlanStep[] = [];
  const gaps: CorpusGap[] = [];
  if (typeof plan !== "object" || plan === null) {
    return { steps, gaps: [{ kind: "plan-malformed", detail: "plan is not an object" }] };
  }
  const scenarios = (plan as { scenarios?: unknown }).scenarios;
  if (!Array.isArray(scenarios)) {
    return { steps, gaps: [{ kind: "plan-malformed", detail: "plan.scenarios is not an array" }] };
  }

  let stepIndex = 0;
  for (let scenarioIndex = 0; scenarioIndex < scenarios.length; scenarioIndex += 1) {
    const scenario = scenarios[scenarioIndex];
    const scenarioSteps = (scenario as { steps?: unknown } | null)?.steps;
    if (!Array.isArray(scenarioSteps)) {
      gaps.push({
        kind: "plan-malformed",
        scenarioIndex,
        detail: "scenario.steps is not an array",
      });
      continue;
    }
    for (let stepPosition = 0; stepPosition < scenarioSteps.length; stepPosition += 1) {
      const step = scenarioSteps[stepPosition];
      const contractId = (step as { contractId?: unknown } | null)?.contractId;
      if (typeof contractId !== "string") {
        gaps.push({
          kind: "plan-malformed",
          scenarioIndex,
          stepIndex,
          detail: "step.contractId is not a string",
        });
      } else {
        steps.push({ stepIndex, contractId });
      }
      stepIndex += 1;
    }
  }
  return { steps, gaps };
}

interface EvidenceRead<T> {
  value: T | undefined;
  corrupt: boolean;
}

function loadStepEvidence(
  corpusDir: string,
  runId: string,
  stepIndex: number,
  files: Set<string>,
): { evidence: ContractEvidence; gaps: CorpusGap[] } {
  const pre = readSnapshotIfListed(corpusDir, `snapshots/${runId}/${stepIndex}.pre.json`, files);
  const post = readSnapshotIfListed(corpusDir, `snapshots/${runId}/${stepIndex}.json`, files);
  const probes = readProbesIfListed(corpusDir, `probes/${runId}/${stepIndex}.json`, files);
  const reads: Array<EvidenceRead<SnapshotRecord> | EvidenceRead<ProbeResult[]>> = [
    pre,
    post,
    probes,
  ];
  const relPaths = [
    `snapshots/${runId}/${stepIndex}.pre.json`,
    `snapshots/${runId}/${stepIndex}.json`,
    `probes/${runId}/${stepIndex}.json`,
  ];
  return {
    evidence: {
      ...(pre.value !== undefined ? { pre: pre.value } : {}),
      ...(post.value !== undefined ? { post: post.value } : {}),
      ...(probes.value !== undefined ? { probes: probes.value } : {}),
    },
    gaps: reads.flatMap((read, index) =>
      read.corrupt ? [{ kind: "file-corrupt" as const, relPath: relPaths[index] }] : [],
    ),
  };
}

function readSnapshotIfListed(
  corpusDir: string,
  relPath: string,
  files: Set<string>,
): EvidenceRead<SnapshotRecord> {
  if (!files.has(relPath)) {
    return { value: undefined, corrupt: false };
  }
  try {
    const raw = JSON.parse(readFileSync(join(corpusDir, relPath), "utf8"));
    const parsed = snapshotRecordSchema.safeParse(raw);
    return parsed.success
      ? { value: parsed.data, corrupt: false }
      : { value: undefined, corrupt: true };
  } catch (error) {
    return {
      value: undefined,
      corrupt: !(isErrnoException(error) && error.code === "ENOENT"),
    };
  }
}

function readProbesIfListed(
  corpusDir: string,
  relPath: string,
  files: Set<string>,
): EvidenceRead<ProbeResult[]> {
  if (!files.has(relPath)) {
    return { value: undefined, corrupt: false };
  }
  try {
    const raw = JSON.parse(readFileSync(join(corpusDir, relPath), "utf8"));
    const parsed = probeResultSchema.array().safeParse(raw);
    return parsed.success
      ? { value: parsed.data, corrupt: false }
      : { value: undefined, corrupt: true };
  } catch (error) {
    return {
      value: undefined,
      corrupt: !(isErrnoException(error) && error.code === "ENOENT"),
    };
  }
}
