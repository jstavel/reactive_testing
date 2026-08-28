import type { Page } from "playwright";

import type { CollectorFn } from "./collect.js";

/** In-memory screenshot capture: PNG bytes plus capture timestamp (no disk write — AD-15 / Story 2.3). */
export interface ScreenshotCapture {
  /** Raw PNG bytes, returned in-memory so the corpus module owns writing and naming. */
  buffer: Buffer;
  /** ISO-8601 capture timestamp. */
  capturedAt: string;
}

/**
 * Capture a viewport screenshot as in-memory PNG bytes. The collector never
 * touches disk or picks a filename — run/step naming and persistence live in
 * the corpus module (AD-15, Story 2.3).
 */
export const collectScreenshot: CollectorFn<ScreenshotCapture, []> = async (
  page,
) => {
  const buffer = await page.screenshot();
  return { buffer, capturedAt: new Date().toISOString() };
};
