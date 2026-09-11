// Single-home topology pin (spec-report-gherkin-corpus-links story 7): the
// shared operator-CLI surface lives in exactly one place — bin/cli-shared.ts —
// and neither sibling bin keeps a private copy. A plain line-regex source scan
// over the three modules: a drifted duplicate definition (or a report→validate
// sibling import sneaking back) fails this suite.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SHARED_NAMES = [
  "errorOutcome",
  "unknownRunOutcome",
  "noRecordedRunOutcome",
  "extractCorpusDir",
  "isKnownRun",
  "readRawRunManifest",
  "planVersionRefusal",
  "resolveLatestRun",
] as const;

const CLI_SHARED = "cli-shared.ts";
const VALIDATE_SMOKE = "validate-smoke.ts";
const REPORT_SMOKE = "report-smoke.ts";

const sources: readonly (readonly [file: string, source: string])[] = [
  CLI_SHARED,
  VALIDATE_SMOKE,
  REPORT_SMOKE,
].map((file) => [file, readFileSync(join(import.meta.dirname, file), "utf8")]);

/** A defining line for name: `export function NAME` / `export const NAME`. */
const definitionLine = (name: string): RegExp =>
  new RegExp(`^export (?:function|const) ${name}\\b`, "m");

/** A local (non-re-export) function definition: `function NAME`. */
const localFunctionLine = (name: string): RegExp => new RegExp(`^function ${name}\\b`, "m");

describe("cli-shared single-home topology", () => {
  it("defines each shared member exactly once — only in cli-shared.ts", () => {
    for (const name of SHARED_NAMES) {
      const homes = sources
        .filter(([, source]) => definitionLine(name).test(source))
        .map(([file]) => file);
      expect(homes, name).toEqual([CLI_SHARED]);
    }
  });

  it("report-smoke.ts imports nothing from its sibling validate-smoke", () => {
    const report = sources.find(([file]) => file === REPORT_SMOKE)?.[1] ?? "";
    expect(report).not.toMatch(/from "\.\/validate-smoke/);
  });

  it("validate-smoke.ts keeps no local copies of the shared members", () => {
    const validate = sources.find(([file]) => file === VALIDATE_SMOKE)?.[1] ?? "";
    for (const name of SHARED_NAMES) {
      expect(localFunctionLine(name).test(validate), name).toBe(false);
    }
  });
});
