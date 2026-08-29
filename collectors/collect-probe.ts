import type { Page } from "playwright";

import type { Probe, ProbeResult } from "../model/schemas.js";
import { z } from "zod";
import { probeSchema } from "../model/schemas.js";
import type { CollectorFn } from "./collect.js";

const PROBE_TEXT_TIMEOUT_MS = 5_000;

/**
 * Typed carrier for a probe batch with one or more missing selectors. Carries
 * the results already collected before the failure so the orchestrator can
 * persist them as partial corpus instead of discarding them (deferred-probe
 * entry, Story 2.4). Normal output keeps conforming to `ProbeResult[]`
 * (AD-13); this is the one typed-failure deviation, unwrapped by the
 * orchestrator's isolation catch.
 */
export class ProbePartialError extends Error {
  readonly partialResults: ProbeResult[];
  readonly missingProbe: string;

  constructor(
    message: string,
    partialResults: ProbeResult[],
    missingProbe: string,
  ) {
    super(message);
    this.name = "ProbePartialError";
    this.partialResults = partialResults;
    this.missingProbe = missingProbe;
  }
}

/**
 * Extract a value for each probe definition via its DOM selector. Uses .first()
 * to avoid strict-mode multi-match failures; a selector that never matches
 * throws a `ProbePartialError` (results collected so far ride along, plus the
 * missing probe name) after a bounded wait. The probes array is validated
 * against probeSchema so a null/broken entry is rejected rather than crashing
 * the loop.
 */
export const collectProbe: CollectorFn<ProbeResult[], [Probe[]]> = async (
  page,
  probes,
) => {
  const parsed = z.array(probeSchema).parse(probes);
  const results: ProbeResult[] = [];

  for (const probe of parsed) {
    let value: string;
    try {
      value =
        (await page
          .locator(probe.selector)
          .first()
          .textContent({ timeout: PROBE_TEXT_TIMEOUT_MS })) ?? "";
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new ProbePartialError(
        `Probe "${probe.name}" selector "${probe.selector}" failed: ${detail}`,
        results,
        probe.name,
      );
    }
    results.push({
      name: probe.name,
      value,
      capturedAt: new Date().toISOString(),
    });
  }

  return results;
};