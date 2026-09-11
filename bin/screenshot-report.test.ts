// Arg/error-surface suite only (spec-report-gherkin-corpus-links story 5):
// every I/O-matrix error row is pinned on the exported argv/fs validation
// seam, and the happy path is asserted up to the launch boundary (absolute
// paths resolved, the png's parent ensured). No chromium is ever launched in
// the unit suite: the module under test does import playwright (a
// devDependency), but the suite only exercises the arg/fs and file-URL seams,
// never the browser call site in main() — the one real full-page render is
// the manual one-off production of docs/report-failure.png, never part of
// this suite or CI. The process-level spawn tests below fail at the arg seam
// too, so they never reach chromium either.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  type ScreenshotArgsValidation,
  toFileUrl,
  USAGE,
  validateScreenshotArgs,
} from "./screenshot-report.js";

function failureOf(result: ScreenshotArgsValidation): readonly string[] {
  if (result.ok) {
    throw new Error("expected the validation to fail");
  }
  return result.errors;
}

function requestOf(result: ScreenshotArgsValidation): { reportHtmlPath: string; pngPath: string } {
  if (!result.ok) {
    throw new Error(`expected the validation to succeed: ${result.errors.join("; ")}`);
  }
  return result.request;
}

describe("validateScreenshotArgs (arg/fs seam — no browser)", () => {
  let scratch: string;

  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), "screenshot-report-"));
  });

  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it("MISSING_ARGS — 0 args: usage + error, nothing resolved", () => {
    const errors = failureOf(validateScreenshotArgs([]));

    expect(errors.at(-1)).toBe(USAGE);
    expect(errors[0]).toBe(
      "Invalid argument(s): expected 2 positional arguments (<reportHtmlPath> <pngPath>), got 0.",
    );
  });

  it("MISSING_ARGS — 1 arg: usage + error, nothing resolved", () => {
    const errors = failureOf(validateScreenshotArgs([join(scratch, "report.html")]));

    expect(errors.at(-1)).toBe(USAGE);
    expect(errors[0]).toBe(
      "Invalid argument(s): expected 2 positional arguments (<reportHtmlPath> <pngPath>), got 1.",
    );
  });

  it("EXTRA_ARGS — 3 args: usage + error naming the extras", () => {
    const errors = failureOf(validateScreenshotArgs(["report.html", "report.png", "extra.png"]));

    expect(errors.at(-1)).toBe(USAGE);
    expect(errors[0]).toBe(
      "Invalid argument(s): extra.png — unexpected extra argument(s); only positional <reportHtmlPath> <pngPath>.",
    );
  });

  it("rejects a `-`-prefixed flag with the usage error", () => {
    const errors = failureOf(validateScreenshotArgs(["--help", "report.png"]));

    expect(errors.at(-1)).toBe(USAGE);
    expect(errors[0]).toBe(
      "Invalid argument(s): --help, report.png — flags are not accepted; only positional <reportHtmlPath> <pngPath>.",
    );
  });

  it("MISSING_INPUT — a nonexistent html path errors cleanly and prepares nothing", () => {
    const htmlPath = join(scratch, "nope.html");
    const pngPath = join(scratch, "out", "report.png");

    const errors = failureOf(validateScreenshotArgs([htmlPath, pngPath]));

    expect(errors.at(-1)).toBe(USAGE);
    expect(errors[0]).toBe(`Report HTML not found (or not a regular file): ${resolve(htmlPath)}.`);
    // Validation fails before any write side effect: the png's parent dir is
    // never created for a missing input.
    expect(existsSync(join(scratch, "out"))).toBe(false);
  });

  it("MISSING_INPUT — a directory at the html path is rejected (test -f equivalent)", () => {
    mkdirSync(join(scratch, "report.html"));

    const errors = failureOf(
      validateScreenshotArgs([join(scratch, "report.html"), join(scratch, "report.png")]),
    );

    expect(errors.at(-1)).toBe(USAGE);
    expect(errors[0]).toBe(
      `Report HTML not found (or not a regular file): ${resolve(scratch, "report.html")}.`,
    );
  });

  it("DIR_PNG — a png path that already exists as a directory is rejected before any browser work", () => {
    writeFileSync(join(scratch, "report.html"), "<h1>FAIL</h1>");
    mkdirSync(join(scratch, "out.png"));

    const errors = failureOf(
      validateScreenshotArgs([join(scratch, "report.html"), join(scratch, "out.png")]),
    );

    expect(errors.at(-1)).toBe(USAGE);
    expect(errors[0]).toBe(`PNG output path is a directory: ${resolve(scratch, "out.png")}.`);
  });

  it("DIR_PNG — an existing regular file at the png path stays accepted (the overwrite case)", () => {
    writeFileSync(join(scratch, "report.html"), "<h1>FAIL</h1>");
    writeFileSync(join(scratch, "out.png"), "old-png-bytes");

    const request = requestOf(
      validateScreenshotArgs([join(scratch, "report.html"), join(scratch, "out.png")]),
    );

    expect(request.pngPath).toBe(resolve(scratch, "out.png"));
  });

  it("HAPPY at the seam — resolves absolute paths and ensures the png parent (launch boundary reached, never crossed)", () => {
    writeFileSync(join(scratch, "report.html"), "<h1>PASS</h1>");

    const request = requestOf(
      validateScreenshotArgs([
        join(scratch, "report.html"),
        join(scratch, "nested", "deep", "report.png"),
      ]),
    );

    expect(request).toEqual({
      reportHtmlPath: resolve(scratch, "report.html"),
      pngPath: resolve(scratch, "nested", "deep", "report.png"),
    });
    // The fs side of the happy path ran: the png's parent directory exists,
    // so main()'s browser launch is the only remaining step.
    expect(existsSync(join(scratch, "nested", "deep"))).toBe(true);
  });
});

describe("toFileUrl (the file:// URL seam — no launch)", () => {
  it("encodes spaces and a `#` fragment char via pathToFileURL", () => {
    expect(toFileUrl("/tmp/some dir/re#port.html")).toBe("file:///tmp/some%20dir/re%23port.html");
  });

  it("encodes a raw `%` like pathToFileURL does", () => {
    expect(toFileUrl("/tmp/100%/report.html")).toBe("file:///tmp/100%25/report.html");
  });

  it("resolves a relative path against the CWD exactly like pathToFileURL", () => {
    expect(toFileUrl("docs/report-failure.png")).toBe(
      pathToFileURL(resolve("docs", "report-failure.png")).href,
    );
  });
});

// ---- npm screenshot:report (process-level operator surface, one spawn per
// invalid-arg scenario) — each spawn fails at the arg seam, never chromium ----

describe("npm screenshot:report (process-level operator surface)", () => {
  const repoRoot = resolve(import.meta.dirname, "..");
  // Windows spawns npm via the .cmd shim.
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  let scratch: string;

  function spawnScreenshotReport(args: readonly string[]): {
    status: number;
    out: string;
    err: string;
  } {
    try {
      const out = execFileSync(
        npm,
        ["run", "--silent", "screenshot:report", ...(args.length > 0 ? ["--", ...args] : [])],
        { cwd: repoRoot, encoding: "utf8", timeout: 60_000 },
      );
      return { status: 0, out, err: "" };
    } catch (error) {
      const failure = error as { status?: number; stdout?: string; stderr?: string };
      return { status: failure.status ?? 1, out: failure.stdout ?? "", err: failure.stderr ?? "" };
    }
  }

  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), "screenshot-report-spawn-"));
  });

  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it("MISSING_ARGS — no args: exit 1, usage on stderr, no PNG created", () => {
    const { status, out, err } = spawnScreenshotReport([]);

    expect(status).toBe(1);
    expect(out).toBe("");
    expect(err).toContain(
      "Invalid argument(s): expected 2 positional arguments (<reportHtmlPath> <pngPath>), got 0.",
    );
    expect(err).toContain("Usage: npm run screenshot:report");
    // With no paths given nothing can be written anywhere: the scratch dir
    // stays empty (the guard fires before any fs work).
    expect(readdirSync(scratch)).toEqual([]);
  });

  it("EXTRA_ARGS — 3 args: exit 1, usage on stderr, no PNG created", () => {
    const { status, out, err } = spawnScreenshotReport([
      join(scratch, "report.html"),
      join(scratch, "out.png"),
      "extra.png",
    ]);

    expect(status).toBe(1);
    expect(out).toBe("");
    expect(err).toContain(
      "Invalid argument(s): extra.png — unexpected extra argument(s); only positional <reportHtmlPath> <pngPath>.",
    );
    expect(err).toContain("Usage: npm run screenshot:report");
    expect(existsSync(join(scratch, "out.png"))).toBe(false);
  });

  it("FLAG — a `-`-prefixed arg: exit 1, usage on stderr, no PNG created", () => {
    const { status, out, err } = spawnScreenshotReport(["--bogus", join(scratch, "out.png")]);

    expect(status).toBe(1);
    expect(out).toBe("");
    expect(err).toContain(
      "Invalid argument(s): --bogus, " +
        resolve(scratch, "out.png") +
        " — flags are not accepted; only positional <reportHtmlPath> <pngPath>.",
    );
    expect(err).toContain("Usage: npm run screenshot:report");
    expect(existsSync(join(scratch, "out.png"))).toBe(false);
  });
});
