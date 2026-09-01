// Offline runner (Story 3.3) — compose the corpus loader with the validator
// interpreter to re-validate a previously recorded run without re-launching the
// scenario or browser (FR-6, FR-5, NFR-1).
//
// The runner is pure over the corpus: no `Page`/browser, no navigation. It
// composes `loadCorpusSteps` with `validatorsFor(contractId)` from
// validator-map.ts, returning only conforming `ValidationResult`s (AD-14).
//
// Layer direction preserved: validators/ imports only model/.

import { loadCorpusSteps } from "./corpus-loader.js";
import { validatorsFor } from "./validator-map.js";
import type { TestPlan, ValidationResult } from "../model/schemas.js";

/**
 * Re-validate a previously recorded run offline, purely over its corpus.
 *
 * Composes the loader with the per-contract validator interpreter. When
 * `contractIds` is given, only steps whose contract is in the subset are
 * validated (PLAN_FILTER). An unknown run yields an empty result set (mirrors
 * UNKNOWN_RUN) and an unknown contractId yields no results (an unvalidated gap,
 * never silently passed). The runner never escapes with a throw: a validator
 * that throws is skipped for its step while the remaining validators still run.
 */
export function runValidatorsOffline(
  corpusDir: string,
  runId: string,
  plan: TestPlan,
  contractIds?: string[],
): ValidationResult[] {
  const steps = loadCorpusSteps(corpusDir, runId, plan);
  if (steps.length === 0) {
    return [];
  }

  const filter = contractIds ? new Set(contractIds) : undefined;
  const results: ValidationResult[] = [];

  for (const step of steps) {
    if (filter !== undefined && !filter.has(step.contractId)) {
      continue;
    }
    for (const validator of validatorsFor(step.contractId)) {
      try {
        results.push(validator(step.evidence));
      } catch {
        // A throwing validator must not break the offline run: skip it for this
        // step and keep validating the rest (failures are results, never throws —
        // AD-14, NFR-1).
      }
    }
  }

  return results;
}
