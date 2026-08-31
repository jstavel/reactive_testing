// Per-contract validator interpreter (Story 3.1).
//
// Thin: it evaluates each contract's machine-compatible predicate declarations
// against recorded corpus evidence and returns a conforming ValidationResult.
// Lives OUTSIDE the model hash (symmetric to orchestrator/action-map.ts) —
// editing how a predicate is evaluated never bumps modelVersion (AD-17). A
// failing validator is a result, never an exception (FR-5 determinism).

import { allContracts } from "../model/contracts.js";
import type { DialogContract } from "../model/contracts.js";
import type {
  ContractEvidence,
  ContractPredicate,
  ProbeResult,
  SnapshotRecord,
  ValidationResult,
  Validator,
} from "../model/schemas.js";

/** Evaluate one predicate against the step's evidence. */
function evaluate(
  predicate: ContractPredicate,
  snapshot: SnapshotRecord | undefined,
  probes: ProbeResult[],
): { passed: boolean; detail: string } {
  switch (predicate.assert) {
    case "state-is": {
      if (!snapshot) {
        return { passed: false, detail: "missing snapshot evidence" };
      }
      if (snapshot.stateId !== predicate.stateId) {
        return {
          passed: false,
          detail: `state-is "${predicate.stateId}" but snapshot stateId is "${snapshot.stateId}"`,
        };
      }
      return { passed: true, detail: "" };
    }
    case "url-is": {
      if (!snapshot) {
        return { passed: false, detail: "missing snapshot evidence" };
      }
      const pathname = safePathname(snapshot.url);
      if (pathname !== predicate.url) {
        return {
          passed: false,
          detail: `url-is "${predicate.url}" but url pathname is "${pathname}"`,
        };
      }
      return { passed: true, detail: "" };
    }
    case "view-selected": {
      const probe = probes.find((p) => p.name === "selected-view");
      const value = (probe?.value ?? "").trim().toLowerCase();
      if (value !== predicate.view.toLowerCase()) {
        return {
          passed: false,
          detail: `view-selected "${predicate.view}" but selected view is "${value || "(none)"}"`,
        };
      }
      return { passed: true, detail: "" };
    }
    case "dialog-open":
    case "dialog-closed":
      return {
        passed: false,
        detail: `predicate "${predicate.assert}" not yet evaluatable (deferred to the dialog-surface story)`,
      };
  }
}

/** Parse a pathname defensively — a malformed URL degrades to the raw string
 * rather than throwing (the validator stays a pure result, never an exception). */
function safePathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/** Validate one contract: preconditions against the pre-step snapshot,
 * postconditions against the post-step snapshot (phase is the array, Story 3.1). */
function validateContract(contract: DialogContract, evidence: ContractEvidence): ValidationResult {
  const failures: string[] = [];
  const refs = new Set<string>();

  if (evidence.pre) refs.add("snapshot:pre");
  for (const predicate of contract.preconditions) {
    const r = evaluate(predicate, evidence.pre, evidence.probes ?? []);
    if (!r.passed) failures.push(`[precondition] ${r.detail}`);
  }

  if (evidence.post) refs.add("snapshot:post");
  for (const predicate of contract.postconditions) {
    const r = evaluate(predicate, evidence.post, evidence.probes ?? []);
    if (!r.passed) failures.push(`[postcondition] ${r.detail}`);
  }

  const usesProbe = [...contract.preconditions, ...contract.postconditions].some(
    (p) => p.assert === "view-selected",
  );
  if (usesProbe) refs.add("probe:selected-view");

  return {
    contractId: contract.contractId,
    passed: failures.length === 0,
    details: failures.length > 0 ? failures.join("; ") : undefined,
    corpusRefs: [...refs],
  };
}

/** The per-contract validator map: contractId → validators, each a pure
 * function over evidence (no `Page`). Built from the model's declarations. */
export const validatorMap: Record<string, Validator[]> = Object.fromEntries(
  allContracts.map((contract) => [
    contract.contractId,
    [(evidence: ContractEvidence) => validateContract(contract, evidence)],
  ]),
);

/** Validators for a contract, or `[]` (an unvalidated gap) when the id is unknown. */
export function validatorsFor(contractId: string): Validator[] {
  return validatorMap[contractId] ?? [];
}
