import type { Page } from "playwright";

import type { Probe, ProbeResult } from "../model/schemas.js";
import { z } from "zod";
import { probeSchema } from "../model/schemas.js";
import type { CollectorFn } from "./collect.js";

/**
 * Extract a value for each probe definition via its DOM selector. Uses .first()
 * to avoid strict-mode multi-match failures; a selector that never matches
 * throws with the probe name attached. The probes array is validated against
 * probeSchema so a null/broken entry is rejected rather than crashing the loop.
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
      value = (await page.locator(probe.selector).first().textContent()) ?? "";
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Probe "${probe.name}" selector "${probe.selector}" failed: ${detail}`,
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