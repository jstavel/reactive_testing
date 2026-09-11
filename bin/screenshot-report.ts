// Dev-only screenshot tool (CAP-6, spec-report-gherkin-corpus-links story 5)
// — rasterizes an already-generated report.html to a PNG for human
// consumption. Strictly outside the report pipeline: it is never run by CI,
// never called by the generator/validators/reporters (those never launch a
// browser), and never touches the browser-based recording flow. It takes
// exactly two positional arguments — the report .html to render and the PNG
// path to write (its parent directory is created when missing) — launches
// headless chromium locally, opens the report over a local file:// URL only,
// waits for the load state, and writes a fullPage screenshot. The committed
// docs/report-failure.png is a one-off, human-reviewed artifact produced once
// with this tool from the throwaway fail-demo report; regeneration is
// documented but never automated, and the output is a rendered snapshot
// (font/rendering variance) — not byte-stable by design (NFR-1 covers the
// report emitters, not this aid).
//
// The argument/error surface mirrors the repo's other bins (e.g.
// bin/report-smoke.ts): positional-only, a `-`-flag guard, the fs pre-checks
// before any browser call, and the clean-error/main-guard pattern — a failed
// run prints a plain error plus usage and exits 1, never a raw stack trace.
// The argv/fs validation is an exported pure helper, so the unit suite pins
// the whole arg/error surface on that seam: the suite imports this module
// (and with it playwright, a devDependency) but never launches chromium — the
// only real full-page render is the manual one-off production of
// docs/report-failure.png.

import { mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { chromium } from "playwright";

export const USAGE = "Usage: npm run screenshot:report -- <reportHtmlPath> <pngPath>";

/** A validated screenshot request: absolute paths — the html proven to be a
 * regular file, the png's parent directory ensured. */
export interface ScreenshotRequest {
  readonly reportHtmlPath: string;
  readonly pngPath: string;
}

/** The argv/fs validation seam: the resolved request on success, or the clean
 * error lines (usage last, mirroring the other bins' error outcomes) the CLI
 * prints before exiting 1. No browser is ever involved here — the unit suite
 * pins the whole arg/error surface on this seam. */
export type ScreenshotArgsValidation =
  | { readonly ok: true; readonly request: ScreenshotRequest }
  | { readonly ok: false; readonly errors: readonly string[] };

function invalid(...errors: readonly string[]): ScreenshotArgsValidation {
  return { ok: false, errors: [...errors, USAGE] };
}

function notFound(reportHtmlPath: string): ScreenshotArgsValidation {
  return invalid(`Report HTML not found (or not a regular file): ${reportHtmlPath}.`);
}

/** Validate `[<reportHtmlPath> <pngPath>]` and prepare the fs side: reject any
 * count/flag misuse before touching the filesystem, then prove the html is a
 * regular file (the `test -f`-equivalent, `statSync` — a directory is never
 * accepted) and create the png's parent directory. The happy path stops here:
 * launching the browser is main()'s job, so the suite can assert the full
 * pre-launch contract without chromium. */
export function validateScreenshotArgs(argv: readonly string[]): ScreenshotArgsValidation {
  if (argv.some((arg) => arg.startsWith("-"))) {
    return invalid(
      `Invalid argument(s): ${argv.join(", ")} — flags are not accepted; only positional <reportHtmlPath> <pngPath>.`,
    );
  }
  if (argv.length < 2) {
    return invalid(
      `Invalid argument(s): expected 2 positional arguments (<reportHtmlPath> <pngPath>), got ${argv.length}.`,
    );
  }
  if (argv.length > 2) {
    return invalid(
      `Invalid argument(s): ${argv.slice(2).join(", ")} — unexpected extra argument(s); only positional <reportHtmlPath> <pngPath>.`,
    );
  }
  const [reportHtmlPath, pngPath] = argv.map((arg) => resolve(arg));
  try {
    if (!statSync(reportHtmlPath).isFile()) {
      return notFound(reportHtmlPath);
    }
  } catch {
    return notFound(reportHtmlPath);
  }
  try {
    mkdirSync(dirname(pngPath), { recursive: true });
  } catch (error) {
    return invalid(
      `PNG output directory could not be created: ${dirname(pngPath)} — ${error instanceof Error ? error.message : String(error)}.`,
    );
  }
  // A png path that already exists as a directory can never receive the
  // screenshot (the render would die on EISDIR after the browser launched) —
  // reject it at the seam, before any browser work. An existing regular file
  // is the normal overwrite case and stays accepted.
  try {
    if (statSync(pngPath).isDirectory()) {
      return invalid(`PNG output path is a directory: ${pngPath}.`);
    }
  } catch {
    // An absent png path is the normal case — nothing to reject.
  }
  return { ok: true, request: { reportHtmlPath, pngPath } };
}

/** The report's `file://` URL — built by `pathToFileURL`, never a manual
 * `file://` + string concat: spaces, `#`, `%` are percent-encoded and Windows
 * drive paths are normalized correctly. */
export function toFileUrl(path: string): string {
  return pathToFileURL(path).href;
}

async function main(): Promise<void> {
  const validated = validateScreenshotArgs(process.argv.slice(2));
  if (!validated.ok) {
    for (const line of validated.errors) {
      console.error(line);
    }
    process.exitCode = 1;
    return;
  }
  const { reportHtmlPath, pngPath } = validated.request;
  try {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(toFileUrl(reportHtmlPath));
      await page.waitForLoadState("load");
      await page.screenshot({ fullPage: true, path: pngPath });
    } finally {
      await browser.close();
    }
  } catch (error) {
    console.error(
      `screenshot could not be rendered: ${error instanceof Error ? error.message : String(error)}`,
    );
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }
  console.log(`Screenshot written: ${pngPath}`);
}

// Run only when executed directly (`tsx bin/screenshot-report.ts`), never when
// the helpers are imported (the unit test suite).
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(
      `screenshot could not be rendered: ${error instanceof Error ? error.message : String(error)}`,
    );
    console.error(USAGE);
    process.exitCode = 1;
  });
}
