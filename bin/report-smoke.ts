// Report CLI (CAP-6, story 6) — the operator counterpart to validate:smoke for
// the test-run report. Offline over a recorded corpus run: it re-derives
// per-scenario results through the offline validator runner — never re-running
// scenarios, never launching a browser, no CDP, no AI (NFR-1) — and writes the
// self-contained HTML report to `{corpusDir}/{runId}/report.html` via
// `emitHtmlReport`. The report is written regardless of check outcomes (a
// failing report is the most valuable one) while the exit code carries
// pass/fail to CI: exit 1 when any check failed, 0 only when all passed. A
// known run that yields zero results is an error that writes nothing —
// validators ran over nothing, which is never a reportable pass.
//
// The argument/error surface mirrors bin/validate-smoke.ts: positional-only
// `[<runId>]` defaulting to the latest recorded run (`resolveLatestRun` — the
// `@last-run` fan, falling back to the newest run-manifest.json), the flag
// guard, the shared `RUN_ID_PATTERN` shape guard before any fs access, and the
// same error-message families (unknown run, no recorded run, zero checks).
// The report embeds the Gherkin snapshot built from features/ (CAP-4: the
// source that was run, not an authored copy) plus the scenario↔model
// relations; per-step evidence stays out of v1.
//
// Derivation (demo-verified on corpus efcb749d, 18/18 checks → 14/14
// scenarios): validation results arrive in plan-step order, so a contract's
// results are consumed whole by the first scenario — in plan order — that
// references the contract in a step; every result lands in exactly one
// scenario. A scenario passes iff no consumed check failed. An fs failure
// while writing the report (or building its Gherkin snapshot) is an error
// outcome with usage — never a raw stack trace.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { relations } from "../model/relations.js";
import { smokeTestPlan } from "../model/smoke.test-plan.js";
import type {
  RunMetadata,
  ScenarioResult,
  TestPlan,
  ValidationResult,
} from "../model/schemas.js";
import { emitHtmlReport } from "../reporter/html-report.js";
import { buildGherkinSnapshot } from "../reporter/gherkin-snapshot.js";
import { RUN_ID_PATTERN } from "../orchestrator/handlinks.js";
import { runValidatorsOffline } from "../validators/offline-runner.js";
import { isKnownRun, resolveLatestRun } from "./validate-smoke.js";

const CORPUS_DIR = "corpus";
export const USAGE = "Usage: npm run report:smoke -- [<runId>]";

/** Per-scenario results derived from offline validation results (SPEC CAP-6
 * assumption, demo-verified on corpus efcb749d: 18/18 checks → 14/14
 * scenarios): the runner emits results in plan-step order, so a contract's
 * results queue up and are consumed whole by the first scenario — in plan
 * order — that references the contract in a step. Every result lands in
 * exactly one scenario; a scenario passes iff no consumed check failed, and
 * steps whose contract produced no check don't veto. Ownership of a contract's
 * FAILURES by one scenario is therefore the entire derivation. */
export function deriveScenarioResults(
  plan: TestPlan,
  results: readonly ValidationResult[],
): ScenarioResult[] {
  const firstOwnerByContract = new Map<string, string>();
  for (const scenario of plan.scenarios) {
    for (const { contractId } of scenario.steps) {
      if (!firstOwnerByContract.has(contractId)) {
        firstOwnerByContract.set(contractId, scenario.id);
      }
    }
  }

  const failedResults = results.filter(({ passed }) => !passed);
  return plan.scenarios.map((scenario) => {
    const ownedFailures = failedResults.filter(
      (result) => firstOwnerByContract.get(result.contractId) === scenario.id,
    );
    const error = ownedFailures
      .flatMap(({ details }) => (details === undefined ? [] : [details]))
      .join("; ");
    return {
      id: scenario.id,
      passed: ownedFailures.length === 0,
      ...(error.length > 0 ? { error } : {}),
    };
  });
}

/** A CLI run's observable behavior: exit code plus stdout/stderr lines,
 * mirroring ValidateOutcome so both operator CLIs print/exit the same way. */
export interface ReportOutcome {
  readonly exitCode: 0 | 1;
  readonly out: readonly string[];
  readonly err: readonly string[];
}

export interface ReportOptions {
  /** Corpus dir override for tests; the operator default is `corpus` (or CORPUS_DIR). */
  readonly corpusDir?: string;
  /** Plan override for tests; the operator default is the smoke plan. */
  readonly plan?: TestPlan;
}

function errorOutcome(...errors: readonly string[]): ReportOutcome {
  return { exitCode: 1, out: [], err: errors };
}

/** The unknown-run outcome shared by the shape guard and the manifest gate. */
function unknownRunOutcome(runId: string, corpusDir: string): ReportOutcome {
  return errorOutcome(
    `Unknown run "${runId}" — no run-manifest.json in ${corpusDir}/${runId}/.`,
    USAGE,
  );
}

/** The run's metadata for the report header, parsed leniently from the run
 * manifest. `undefined` = manifest unreadable OR parsed without a timestamp —
 * both collapse into the zero-checks guard, which never writes a report. */
function readRunMetadata(corpusDir: string, runId: string): RunMetadata | undefined {
  try {
    const parsed: unknown = JSON.parse(
      readFileSync(join(corpusDir, runId, "run-manifest.json"), "utf8"),
    );
    const timestamp = (parsed as { timestamp?: unknown } | null)?.timestamp;
    return typeof timestamp === "string" ? { runId, timestamp } : undefined;
  } catch {
    return undefined;
  }
}

/** The whole CLI as a pure function over argv + corpus state: resolve the run,
 * re-derive per-scenario results offline, write the report, and decide the
 * exit code. The report is written for any run with checks (pass or fail);
 * exit `0` only when every check passed. Exit `1` on any failing check, zero
 * checks ran for a selected run, an unknown run, no recorded run, or a usage
 * error — in the error cases nothing is written. */
export function reportSmoke(
  argv: readonly string[],
  options: ReportOptions = {},
): ReportOutcome {
  const corpusDir = options.corpusDir ?? process.env.CORPUS_DIR ?? CORPUS_DIR;
  const plan = options.plan ?? smokeTestPlan;

  if (argv.length > 1 || argv.some((arg) => arg.startsWith("-"))) {
    return errorOutcome(
      `Invalid argument(s): ${argv.join(", ")} — only positional [<runId>] is accepted.`,
      USAGE,
    );
  }

  const requested = argv[0];
  let runId: string;
  if (requested === undefined) {
    const latest = resolveLatestRun(corpusDir);
    if (latest === null) {
      return errorOutcome(
        `No recorded run found in ${corpusDir}/ — record one first with \`npm run run:smoke\`.`,
        USAGE,
      );
    }
    runId = latest;
  } else {
    // The shape guard precedes any fs access: a runId with separators or ".."
    // must never reach a corpus path (mirrors handlinks' RUN_ID_PATTERN trust).
    if (!RUN_ID_PATTERN.test(requested) || !isKnownRun(corpusDir, requested)) {
      return unknownRunOutcome(requested, corpusDir);
    }
    runId = requested;
  }

  // Unfiltered: the report always covers the whole plan (mirrors validate:smoke
  // without contract filters).
  const run = readRunMetadata(corpusDir, runId);
  const results =
    run === undefined ? [] : runValidatorsOffline(corpusDir, runId, plan);

  // Zero results after a run was selected means validators ran over nothing —
  // an unreadable manifest or a stepless plan — never a reportable pass.
  if (run === undefined || results.length === 0) {
    return errorOutcome(
      `no checks ran for "${runId}" — the run manifest was unreadable or lacks a timestamp, or the plan declares no steps.`,
      USAGE,
    );
  }

  const scenarioResults = deriveScenarioResults(plan, results);

  let relPath: string;
  try {
    relPath = emitHtmlReport({
      corpusDir,
      run,
      plan,
      results: scenarioResults,
      relations,
      gherkinSource: buildGherkinSnapshot("features", relations),
    });
  } catch (error) {
    // A write failure is an error outcome with usage — never a raw stack trace.
    return errorOutcome(
      `report could not be written: ${error instanceof Error ? error.message : String(error)}`,
      USAGE,
    );
  }

  const passedScenarios = scenarioResults.filter(({ passed }) => passed).length;
  return {
    // Frozen conformance: the exit code reads ALL validation results, so a
    // failed check can never be dropped by the derivation.
    exitCode: results.some(({ passed }) => !passed) ? 1 : 0,
    out: [
      `Report written: ${join(corpusDir, relPath)}`,
      `${passedScenarios}/${scenarioResults.length} scenarios passed (${results.length} checks)`,
    ],
    err: [],
  };
}

function main(): void {
  const outcome = reportSmoke(process.argv.slice(2));
  for (const line of outcome.out) {
    console.log(line);
  }
  for (const line of outcome.err) {
    console.error(line);
  }
  // exitCode (not exit()) so piped stdout flushes before the process ends.
  process.exitCode = outcome.exitCode;
}

// Run only when executed directly (`tsx bin/report-smoke.ts`), never when the
// helpers are imported (the unit test suite).
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
