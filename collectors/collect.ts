import type { Page } from "playwright";

import { collectNetwork } from "./collect-network.js";
import { collectProbe } from "./collect-probe.js";
import { collectScreenshot } from "./collect-screenshot.js";
import { collectSnapshot } from "./collect-snapshot.js";

/**
 * Collector signature: page-in → corpus-data-out (AD-5), mirroring ContractAction's
 * page-input shape. Each collector pins its exact options tuple and return type
 * through the type parameters rather than erasing them to unknown.
 */
export type CollectorFn<
  TResult = unknown,
  TArgs extends readonly unknown[] = [],
> = (page: Page, ...args: TArgs) => Promise<TResult>;

/** All collectors keyed by concern, for future orchestrator wiring (Story 2.3). */
export const collectors = {
  snapshot: collectSnapshot,
  network: collectNetwork,
  screenshot: collectScreenshot,
  probe: collectProbe,
};