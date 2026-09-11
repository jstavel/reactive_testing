// Transform the vitest JSON reporter output into the deployed badge feed
// (spec-report-gherkin-corpus-links story 8, review loop). The ci job runs
// `npx vitest run --reporter=json --outputFile=vitest-summary.json` and then
// this CLI — `npx tsx bin/tests-summary.ts vitest-summary.json tests.json` —
// to write `{"passed":N,"total":M}` from the reporter's numPassedTests /
// numTotalTests. The pages job stages the result as `_site/tests.json` and the
// README's dynamic "tests passed" shield reads `passed` from the deployed URL.
//
// Validation is loud and total: a summary that is not a JSON object, that
// lacks numPassedTests/numTotalTests, that carries non-finite, fractional, or
// negative counts, or that claims passed > total exits 1 with a `::error::`
// annotation and writes nothing — a bogus badge feed can never be produced
// (the SUMMARY_MISSING red path, now a tested unit instead of an inline
// one-liner). The pure core (testsSummaryFromJson / extractTestsSummary) is
// importable for tests; the CLI runs only when executed directly, mirroring
// bin/generate-sample-report.ts's main guard.

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export interface TestsSummary {
  readonly passed: number;
  readonly total: number;
}

/** The vitest summary is missing, malformed, or self-inconsistent. */
export class InvalidVitestSummaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidVitestSummaryError";
  }
}

export const USAGE = "Usage: npx tsx bin/tests-summary.ts <vitestSummaryJsonPath> <outJsonPath>";

const REFUSAL = " — refusing to write a bogus tests.json";

const asCount = (value: unknown, field: string): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new InvalidVitestSummaryError(
      `vitest JSON summary: ${field} must be a finite non-negative integer, ` +
        `got ${JSON.stringify(value) ?? String(value)}${REFUSAL}`,
    );
  }
  return value;
};

/** Extract `{passed, total}` from a parsed vitest JSON reporter summary. */
export function extractTestsSummary(summary: unknown): TestsSummary {
  if (typeof summary !== "object" || summary === null || Array.isArray(summary)) {
    const got =
      summary === null ? "null" : Array.isArray(summary) ? "an array" : `a ${typeof summary}`;
    throw new InvalidVitestSummaryError(
      `vitest JSON summary must be a JSON object, got ${got}${REFUSAL}`,
    );
  }
  const record = summary as Record<string, unknown>;
  const passed = asCount(record.numPassedTests, "numPassedTests");
  const total = asCount(record.numTotalTests, "numTotalTests");
  if (passed > total) {
    throw new InvalidVitestSummaryError(
      `vitest JSON summary: numPassedTests (${passed}) > numTotalTests (${total})${REFUSAL}`,
    );
  }
  return { passed, total };
}

/** Parse the vitest summary text and extract `{passed, total}` from it. */
export function testsSummaryFromJson(text: string): TestsSummary {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    throw new InvalidVitestSummaryError(
      `vitest JSON summary is not valid JSON: ${error instanceof Error ? error.message : String(error)}${REFUSAL}`,
    );
  }
  return extractTestsSummary(parsed);
}

/** Read the vitest summary file, validate it, and write the badge feed. */
export function writeTestsSummary(summaryPath: string, outPath: string): TestsSummary {
  const summary = testsSummaryFromJson(readFileSync(summaryPath, "utf8"));
  writeFileSync(outPath, `${JSON.stringify(summary)}\n`);
  return summary;
}

function main(): void {
  const [summaryPath, outPath] = process.argv.slice(2);
  if (summaryPath === undefined || outPath === undefined) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }
  try {
    const summary = writeTestsSummary(summaryPath, outPath);
    console.log(`${outPath}: ${JSON.stringify(summary)}`);
  } catch (error) {
    // `::error::` surfaces as a GitHub Actions annotation — the SUMMARY_MISSING
    // red path must be loud in the run summary, not just in the log tail.
    console.error(
      `::error::tests-summary: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}

// Run only when executed directly (`npx tsx bin/tests-summary.ts …`), never
// when the pure core is imported (the unit test suite).
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
