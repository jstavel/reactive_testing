// Declared corpus dependencies (Story 3.2, AD-6).
//
// A contract's dependencies are derived from its machine-compatible predicate
// declarations — one source of truth, no per-validator `deps` field to drift.
// Dependencies are collector-granular: they name which collector to run, not
// which individual probe/field is read.

import { allContracts } from "../model/contracts.js";
import type { CollectorName } from "../model/schemas.js";

/** Which collectors a contract's validators read, derived from its predicates:
 * `state-is`/`url-is` → snapshot; `view-selected` → probe; `dialog-*` → none
 * (not yet evaluatable, Story 3.1). Returns `[]` for an unknown contractId. */
export function corpusDependenciesFor(contractId: string): CollectorName[] {
  const contract = allContracts.find((c) => c.contractId === contractId);
  if (!contract) return [];

  const deps = new Set<CollectorName>();
  for (const predicate of [
    ...contract.preconditions,
    ...contract.postconditions,
  ]) {
    switch (predicate.assert) {
      case "state-is":
      case "url-is":
        deps.add("snapshot");
        break;
      case "view-selected":
        deps.add("probe");
        break;
      case "dialog-open":
      case "dialog-closed":
        break; // not yet evaluatable — no dependency
    }
  }
  return [...deps];
}

/** The probe names a contract's predicates require by name (for the pre-flight
 * probe-config check). Currently only `view-selected` requires `selected-view`. */
export function requiredProbeNames(contractId: string): string[] {
  const contract = allContracts.find((c) => c.contractId === contractId);
  if (!contract) return [];

  const needsView = [...contract.preconditions, ...contract.postconditions].some(
    (p) => p.assert === "view-selected",
  );
  return needsView ? ["selected-view"] : [];
}
