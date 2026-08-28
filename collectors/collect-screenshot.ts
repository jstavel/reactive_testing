import type { Page } from "playwright";

import type { ScreenshotCapture } from "../model/schemas.js";
import type { CollectorFn } from "./collect.js";

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
