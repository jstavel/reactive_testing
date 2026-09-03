// Cross-view standing invariant validator (Story 4.2, FR-13) — a fact shown on
// multiple modeled surfaces is declared ONCE, naming every surface that shows
// it, and an offline runner checks that all surfaces agree over a recorded
// corpus. Stale-view divergence (the mBank-style desync) fails with the
// offending view named instead of going unnoticed until a human compares
// screens.
//
// Purely offline (FR-13, NFR-1): `runCrossViewInvariants` reads only
// `loadCorpusSteps` evidence — no `Page`, no browser, no network. The no-browser
// guarantee is the same type-level absence as existing validators. Each emitted
// result conforms to `ValidationResult` (AD-14) with `contractId =
// invariantId`, so the existing `failure-gherkin` reporter renders cross-view
// failures unchanged (FR-7).
//
// Value extraction is decoupled from collection: an invariant reads probe
// results by `probeName` from the corpus (`evidence.probes`); probe selectors
// live in the runner's probe config, never in the invariant. Agreement
// semantics (e.g. pending vs settled) are declared once per fact in the
// registry, so legitimate divergence is never a false positive.
//
// The invariant registry lives OUTSIDE the model hash (symmetric to action-map
// and validator-map, AD-17); `CrossViewInvariant` is a validator-layer TS
// interface consuming the canonical corpus types, not a new schemas.ts shape.
//
// Layer direction preserved: validators/ imports only model/.

import { homePageModel } from "../model/fsm.js";
import type { TestPlan, ValidationResult } from "../model/schemas.js";
import { loadCorpusSteps } from "./corpus-loader.js";
import type { StepEvidence } from "./corpus-loader.js";

/** A fact declared once, with every modeled surface that shows it and the
 * agreement semantics that reconcile legitimate divergence (formatting,
 * pending-vs-settled). `normalize` maps each recorded value to its
 * semantically-invariant form; surfaces agree when their normalized values
 * match. */
export interface CrossViewInvariant {
  /** Stable invariant id — reported as `contractId` of the emitted result. */
  invariantId: string;
  /** The fact this invariant checks (human-readable, for details messages). */
  fact: string;
  /** Probe name the invariant reads from the corpus (`evidence.probes`). */
  probeName: string;
  /** Every modeled surface (FSM `stateId`) that shows the fact. */
  surfaces: string[];
  /** Map a recorded value to its semantically-invariant form. */
  normalize: (value: string) => string;
}

/** The standing cross-view invariant registry: facts declared once, checked
 * across the surfaces that show them. Agreement semantics live here per fact —
 * never hand-specified per run, never in the invariant's consumer. */
export const crossViewInvariants: CrossViewInvariant[] = [
  {
    invariantId: "current-portfolio-value-agrees-across-surfaces",
    fact: "Current portfolio value",
    probeName: "portfolio-value",
    // Home Page hero (overview-portfolio-hero-value-text) and the Portfolio
    // Summary dialog show the same fact; both must agree in a recorded run.
    surfaces: ["homePage", "portfolioSummaryDialog"],
    // Formatting-only differences (extra whitespace) are not divergence.
    normalize: (value) => value.replace(/\s+/g, " ").trim(),
  },
];

/**
 * Check every declared cross-view invariant over a recorded run, purely over
 * its corpus (FR-13, NFR-1). One conforming `ValidationResult` per invariant
 * (AD-14). Surfaces are compared by their latest recorded observation; any
 * declared surface with no recorded evidence fails loudly, never silently
 * passes. Entry-time declaration gaps — an invariant with an empty `surfaces`
 * list, a duplicated surface within one invariant, a duplicated invariantId
 * across invariants, or a surface absent from `homePageModel.states` — throw
 * before anything is validated.
 */
export function runCrossViewInvariants(
  corpusDir: string,
  runId: string,
  plan: TestPlan,
): ValidationResult[] {
  assertRegistryEntryGaps();
  const steps = loadCorpusSteps(corpusDir, runId, plan);
  return crossViewInvariants.map((invariant) =>
    checkInvariant(invariant, steps),
  );
}

/** Entry-time declaration gaps (never silently skipped; mirrors validator-map's
 * model-anchored declarations). An empty `surfaces` list would otherwise pass
 * trivially, a duplicated surface collapses in the observation Map and masks an
 * intended cross-surface comparison, and a duplicated `invariantId` would emit
 * two results colliding as one `contractId` in reporters. */
function assertRegistryEntryGaps(): void {
  const modeled = new Set(homePageModel.states.map((state) => state.stateId));
  const seenInvariantIds = new Set<string>();
  for (const invariant of crossViewInvariants) {
    if (!invariant.invariantId || invariant.invariantId.trim() === "") {
      throw new Error(
        `cross-view invariant declares an empty invariantId — ids must be non-empty and unique`,
      );
    }
    if (!invariant.probeName || invariant.probeName.trim() === "") {
      throw new Error(
        `cross-view invariant "${invariant.invariantId}" declares an empty probeName — nothing to read from the corpus`,
      );
    }
    if (invariant.surfaces.length === 0) {
      throw new Error(
        `cross-view invariant "${invariant.invariantId}" declares no surfaces — nothing to compare`,
      );
    }
    if (seenInvariantIds.has(invariant.invariantId)) {
      throw new Error(
        `duplicate cross-view invariant id "${invariant.invariantId}" — ids must be unique`,
      );
    }
    seenInvariantIds.add(invariant.invariantId);

    const seenSurfaces = new Set<string>();
    for (const surface of invariant.surfaces) {
      if (seenSurfaces.has(surface)) {
        throw new Error(
          `cross-view invariant "${invariant.invariantId}" declares surface "${surface}" more than once`,
        );
      }
      seenSurfaces.add(surface);
      if (!modeled.has(surface)) {
        throw new Error(
          `cross-view invariant "${invariant.invariantId}" declares an unmodeled surface ` +
            `"${surface}" (not in homePageModel.states) — declaration gap, nothing validated`,
        );
      }
    }
  }
}

/** One observed fact value on one surface, from a recorded step. */
interface SurfaceObservation {
  /** The value as recorded by the probe (raw, pre-`normalize`). */
  value: string;
  /** Global step index the observation was read from (for corpusRefs). */
  stepIndex: number;
  /** The probe's capture timestamp (used for latest-per-surface ordering). */
  capturedAt: string;
}

function checkInvariant(
  invariant: CrossViewInvariant,
  steps: StepEvidence[],
): ValidationResult {
  const observed = new Map<string, SurfaceObservation>();
  const missing = new Map<string, string>();

  for (const surface of invariant.surfaces) {
    const observation = latestObservation(invariant.probeName, surface, steps);
    if (observation === undefined) {
      missing.set(surface, missingEvidenceReason(invariant.probeName, surface, steps));
    } else if (observation.value.trim() === "") {
      // An empty value on the LATEST observation is missing evidence — the
      // surface cannot be confirmed to agree, so it fails loudly (never
      // silently superseded by an older non-empty value, e.g. values hidden
      // via the eye icon).
      missing.set(
        surface,
        `"${invariant.probeName}" probe recorded an empty value on this surface`,
      );
    } else {
      observed.set(surface, observation);
    }
  }

  const corpusRefs = [...observed.entries()].map(
    ([, observation]) => `probe:${invariant.probeName}@${observation.stepIndex}`,
  );

  if (missing.size > 0) {
    // Missing evidence is an honest "cannot verify", never a silent pass
    // (mirrors validator-map's missing-snapshot path).
    return {
      contractId: invariant.invariantId,
      passed: false,
      details: [...missing.entries()]
        .map(([surface, reason]) => `surface "${surface}": ${reason}`)
        .join("; "),
      corpusRefs,
    };
  }

  // Every declared surface observed — normalize each value defensively. A
  // throwing normalizer must not abort the whole run: it fails loudly for that
  // invariant, naming the invariant and the offending surface (fix-now item-3
  // boundary). A raw value that normalizes to empty cannot confirm agreement
  // with any other surface, so it is missing evidence and fails loudly too.
  const bySurface = new Map<string, { raw: string; normalized: string }>();
  for (const [surface, observation] of observed.entries()) {
    let normalized: string;
    try {
      normalized = invariant.normalize(observation.value);
    } catch (err) {
      return {
        contractId: invariant.invariantId,
        passed: false,
        details:
          `cross-view normalize threw for invariant "${invariant.invariantId}" ` +
          `on surface "${surface}" (raw "${observation.value}"): ` +
          (err instanceof Error ? err.message : String(err)),
        corpusRefs,
      };
    }
    if (normalized.trim() === "") {
      return {
        contractId: invariant.invariantId,
        passed: false,
        details:
          `"${invariant.probeName}" probe on surface "${surface}" ` +
          `normalized to an empty value — missing evidence for invariant "${invariant.invariantId}"`,
        corpusRefs,
      };
    }
    bySurface.set(surface, { raw: observation.value, normalized });
  }
  const normalizedValues = [...bySurface.values()].map((entry) => entry.normalized);
  const allAgree = normalizedValues.every(
    (normalized) => normalized === normalizedValues[0],
  );
  if (!allAgree) {
    return {
      contractId: invariant.invariantId,
      passed: false,
      details:
        `cross-view divergence for fact "${invariant.fact}": ` +
        [...bySurface.entries()]
          .map(([surface, entry]) => `surface "${surface}" shows "${entry.raw}"`)
          .join("; "),
      corpusRefs,
    };
  }
  return { contractId: invariant.invariantId, passed: true, corpusRefs };
}

/** The latest recorded probe record of a fact on one surface: the step whose
 * post-snapshot stateId equals the surface and whose batch carries the probe of
 * the given name, ordered by `capturedAt`. Every such record — empty included —
 * advances "latest"; an empty value is resolved by the caller as missing
 * evidence, never silently skipped in favour of an older value. Deterministic
 * over the corpus: ties keep the first step encountered (plan order). */
function latestObservation(
  probeName: string,
  surface: string,
  steps: StepEvidence[],
): SurfaceObservation | undefined {
  let latest: SurfaceObservation | undefined;
  for (const step of steps) {
    const post = step.evidence.post;
    if (post === undefined || post.stateId !== surface) {
      continue;
    }
    const probe = (step.evidence.probes ?? []).find((p) => p.name === probeName);
    if (probe === undefined) {
      continue;
    }
    if (latest === undefined || probe.capturedAt > latest.capturedAt) {
      latest = { value: probe.value, stepIndex: step.stepIndex, capturedAt: probe.capturedAt };
    }
  }
  return latest;
}

/** Why a declared surface has no probe record at all — named so the failure
 * distinguishes "no step landed here" from "landed but the probe was never
 * recorded". (An empty-valued probe record is a third distinct missing-evidence
 * reason, reported by the caller from the latest observation.) */
function missingEvidenceReason(
  probeName: string,
  surface: string,
  steps: StepEvidence[],
): string {
  const landingSteps = steps.filter(
    (step) => step.evidence.post?.stateId === surface,
  );
  if (landingSteps.length === 0) {
    return "no recorded step lands on this surface (no post snapshot)";
  }
  return `no "${probeName}" probe recorded on this surface`;
}