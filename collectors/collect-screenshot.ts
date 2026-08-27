import { join } from "node:path";

import type { Page } from "playwright";

import type { ScreenshotRef } from "../model/schemas.js";
import type { CollectorFn } from "./collect.js";

const SCREENSHOT_BASENAME = "screenshot.png";

/**
 * Capture a viewport screenshot of the live page into the given directory and
 * return a ScreenshotRef (file reference, never the image bytes). The fixed
 * basename is intentional — run/step file naming policy is Story 2.3.
 */
export const collectScreenshot: CollectorFn<ScreenshotRef, [string]> = async (
  page,
  dir,
) => {
  if (!dir) {
    throw new Error("screenshot dir is required");
  }
  const filePath = join(dir, SCREENSHOT_BASENAME);
  const capturedAt = new Date().toISOString();
  await page.screenshot({ path: filePath });
  return { filePath, capturedAt };
};