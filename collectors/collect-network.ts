import type { Page, Request, Response } from "playwright";

import type { NetworkEvent } from "../model/schemas.js";
import type { CollectorFn } from "./collect.js";

const NETWORK_CAPTURE_TIMEOUT_MS = 5_000;

/**
 * Observe network activity on the live page and return it as NetworkEvent records.
 * Attaches a `response` listener (exchanges that produced a response → `status`)
 * and a `requestfailed` listener (failed/aborted requests → `error`, never
 * `status`), captures until the page settles to "networkidle" (bounded by the
 * timeout — the same await handles a load state that never settles AND a page
 * that closes: both return whatever was observed so far without throwing), then
 * DETACHES both listeners so repeated calls never accumulate or double-count.
 * A single `seen` set (first-wins) spans both listeners so an exchange that
 * fires BOTH `response` and `requestfailed` yields exactly one event, never two
 * contradictory records. Listener bodies are quarantined — one throwing
 * response/failure must not lose the events captured before or after it; this
 * is distinct from the orchestrator's collector-level isolation boundary.
 */
export const collectNetwork: CollectorFn<NetworkEvent[], []> = async (page) => {
  const events: NetworkEvent[] = [];
  const seen = new Set<Request>();

  const onResponse = (response: Response): void => {
    try {
      const request = response.request();
      if (seen.has(request)) {
        return;
      }
      events.push({
        url: response.url(),
        method: request.method(),
        status: response.status(),
        capturedAt: new Date().toISOString(),
      });
      seen.add(request);
    } catch {
      // Quarantined: one throwing response must not lose the captured events.
    }
  };

  const onRequestFailed = (request: Request): void => {
    try {
      if (seen.has(request)) {
        return;
      }
      events.push({
        url: request.url(),
        method: request.method(),
        error: request.failure()?.errorText || "Request failed",
        capturedAt: new Date().toISOString(),
      });
      seen.add(request);
    } catch {
      // Quarantined: one throwing failure must not lose the captured events.
    }
  };

  page.on("response", onResponse);
  page.on("requestfailed", onRequestFailed);

  try {
    await page.waitForLoadState("networkidle", {
      timeout: NETWORK_CAPTURE_TIMEOUT_MS,
    });
  } catch {
    // The load state never settled, or the page closed: return what we have.
  } finally {
    page.off("response", onResponse);
    page.off("requestfailed", onRequestFailed);
  }

  return events.slice();
};