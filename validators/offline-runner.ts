// Offline runner (Story 3.3) — compose the corpus loader with the validator
// interpreter to re-validate a previously recorded run without re-launching the
// scenario or browser (FR-6, FR-5, NFR-1).
//
// The runner is pure over the corpus: no `Page`/browser, no navigation. It
// composes `loadCorpusSteps` with `validatorsFor(contractId)` from
// validator-map.ts, returning only conforming `ValidationResult`s (AD-14).
//
// Layer direction preserved: validators/ imports only model/.

import type { TestPlan, ValidationResult } from "../model/schemas.js";
import { type CorpusGap, loadCorpusRun, type StepEvidence } from "./corpus-loader.js";
import { crossViewInvariants, runCrossViewInvariants } from "./cross-view.js";
import { validatorsFor } from "./validator-map.js";

export function runValidatorsOffline(
  corpusDir: string,
  runId: string,
  plan: TestPlan,
  contractIds?: string[],
): ValidationResult[] {
  const loaded = loadCorpusRun(corpusDir, runId, plan);
  if (loaded.gaps.some(({ kind }) => kind === "unknown-run")) {
    return [];
  }

  const filter = contractIds ? new Set(contractIds) : undefined;
  const steps = loaded.steps.filter(
    ({ contractId }) => filter === undefined || filter.has(contractId),
  );
  const manifestGap = loaded.gaps.some(({ kind }) => kind === "manifest-invalid");
  const results = manifestGap
    ? steps.map(({ contractId }) => failed(contractId, "cannot validate: run manifest invalid"))
    : steps.flatMap((step) => validateStep(step, loaded.gaps));
  const planMalformed = loaded.gaps.some(({ kind }) => kind === "plan-malformed");
  // Registry-derived invariant selection mirrors the contract filter (and
  // keeps unfiltered runs whole): the same filter drives preflight in the
  // orchestrator, so a configured name is never silently excluded here.
  const selectedInvariants = crossViewInvariants.filter(
    ({ invariantId }) => filter === undefined || filter.has(invariantId),
  );
  const invariantIds = selectedInvariants.map(({ invariantId }) => invariantId);

  if (planMalformed) {
    const malformed = loaded.gaps.filter(({ kind }) => kind === "plan-malformed");
    return [
      ...results.map((result) =>
        failed(
          "(corpus)",
          `cannot validate: plan malformed${result.details ? ` — ${result.details}` : ""}`,
        ),
      ),
      ...malformed.map((gap) =>
        failed(
          "(corpus)",
          `cannot validate: plan malformed${gap.detail ? ` — ${gap.detail}` : ""}`,
        ),
      ),
      // The invariant is every bit as unvalidatable as the contracts — name it
      // failed too, never vanish from the check count (no silent shrink).
      ...selectedInvariants.map(({ invariantId }) =>
        failed(invariantId, "cannot validate: plan malformed"),
      ),
    ];
  }
  if (manifestGap) {
    // Mirror the per-contract manifest-invalid failures: the invariant cannot
    // read any evidence either, so it fails naming the same cause.
    return [
      ...results,
      ...selectedInvariants.map(({ invariantId }) =>
        failed(invariantId, "cannot validate: run manifest invalid"),
      ),
    ];
  }
  // A stepless plan stays a zero-checks run (the CLIs' "no checks ran" guard
  // is authoritative); any plan with steps is validated — missing surfaces are
  // the invariant's verdict, never a skip.
  const crossViewResults = plan.scenarios.some(({ steps }) => steps.length > 0)
    ? runCrossViewInvariants(corpusDir, runId, plan, invariantIds)
    : [];
  return [...results, ...crossViewResults];
}

function validateStep(step: StepEvidence, gaps: CorpusGap[]): ValidationResult[] {
  const stepGaps = gaps.filter(
    (gap) => gap.stepIndex === step.stepIndex && gap.contractId === step.contractId,
  );
  const validators = validatorsFor(step.contractId);
  if (stepGaps.some(({ kind }) => kind === "file-corrupt")) {
    const detail = stepGaps
      .filter(({ kind }) => kind === "file-corrupt")
      .map((gap) => gap.relPath)
      .join(", ");
    return (validators.length > 0 ? validators : [undefined]).map(() =>
      failed(step.contractId, `cannot validate: corrupt file ${detail}`),
    );
  }
  if (validators.length === 0) {
    return [failed(step.contractId, `${step.contractId} — unvalidated gap`)];
  }
  return validators.map((validator) => {
    try {
      return validator(step.evidence);
    } catch (error) {
      return failed(
        step.contractId,
        `${step.contractId} — validator threw: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });
}

function failed(contractId: string, details: string): ValidationResult {
  return { contractId, passed: false, details, corpusRefs: [] };
}
