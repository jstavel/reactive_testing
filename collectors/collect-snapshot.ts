import type { Page } from "playwright";

import { snapshotCollectorOptionsSchema } from "../model/schemas.js";
import type {
  SnapshotCollectorOptions,
  SnapshotRecord,
} from "../model/schemas.js";
import type { CollectorFn } from "./collect.js";

/**
 * Capture the page's serialized structure into a SnapshotRecord.
 * stateId is required and non-empty — a snapshot without an FSM state is corrupt
 * corpus data, so there is no silent "" default.
 */
export const collectSnapshot: CollectorFn<
  SnapshotRecord,
  [SnapshotCollectorOptions]
> = async (page, options) => {
  const { stateId } = snapshotCollectorOptionsSchema.parse(options);
  const snapshot = await page.locator("body").innerHTML();
  return { stateId, snapshot, capturedAt: new Date().toISOString() };
};