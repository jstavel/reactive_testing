import type { Page, Response } from "playwright";

import type { NetworkEvent } from "../model/schemas.js";
import type { CollectorFn } from "./collect.js";

const NETWORK_CAPTURE_TIMEOUT_MS = 5_000;

/**
 * Observe network activity on the live page and return it as NetworkEvent records.
 * Attaches a response listener that buffers observed events, captures until the
 * page settles to "networkidle" (bounded by the timeout), then DETACHES the listener
 * so repeated calls never accumulate listeners or double-count events.
 */
export const collectNetwork: CollectorFn<NetworkEvent[], []> = async (page) => {
  const events: NetworkEvent[] = [];

  const onResponse = (response: Response): void => {
    events.push({
      url: response.url(),
      method: response.request().method(),
      status: response.status(),
      capturedAt: new Date().toISOString(),
    });
  };

  page.on("response", onResponse);

  try {
    await page.waitForLoadState("networkidle", {
      timeout: NETWORK_CAPTURE_TIMEOUT_MS,
    });
  } catch {
    // The load state never settled: return whatever was observed so far.
  } finally {
    page.off("response", onResponse);
  }

  return events.slice();
};