// Print-only offline validation CLI — the operator counterpart to run:smoke
// (RFE 2026-09-08, spec-validate-smoke-cli). Loads the smoke plan, resolves the
// run to validate (default: the latest run — the `@last-run` fan, falling back
// to the newest run-manifest.json by its embedded `timestamp`, mtime as the
// unparseable-manifest fallback), runs `runValidatorsOffline` over the corpus,
// prints one line per check plus a summary, and exits non-zero when any check
// failed. A known run that yields zero results is also an error — validators
// ran over nothing, which is never a pass. Deterministic and offline (NFR-1):
// no browser, no CDP, no AI — reads only corpus/ and model/, never mutates the
// corpus.
//
// Mirrors the print-only conventions of bin/corpus-links.ts; the corpus dir is
// `corpus`, overridable via the `--corpus-dir <path>` flag (flag > CORPUS_DIR,
// spec-report-gherkin-corpus-links story 2) or the CORPUS_DIR env exactly like
// corpus-links. The flag is extracted before the positional guard, and unknown
// flags keep the existing Invalid-argument(s) + usage error. The
// unknown-ids error pattern follows bin/scenario-select.ts
// (UnknownScenarioIdError), applied to contract filters; the runId shape guard
// mirrors handlinks' RUN_ID_PATTERN.

import { pathToFileURL } from "node:url";

import { smokeTestPlan } from "../model/smoke.test-plan.js";
import type { TestPlan, ValidationResult } from "../model/schemas.js";
import { RUN_ID_PATTERN } from "../orchestrator/handlinks.js";
import { runValidatorsOffline } from "../validators/offline-runner.js";
import {
  type CliOutcome,
  DEFAULT_CORPUS_DIR,
  errorOutcome,
  extractCorpusDir,
  isKnownRun,
  noRecordedRunOutcome,
  planVersionRefusal,
  readRawRunManifest,
  resolveLatestRun,
  unknownRunOutcome,
} from "./cli-shared.js";

export {
  type CorpusDirArgs,
  extractCorpusDir,
  isKnownRun,
  readPlanModelVersion,
  readRawRunManifest,
  planVersionRefusal,
  resolveLatestRun,
} from "./cli-shared.js";

export const USAGE =
  "Usage: npm run validate:smoke -- [--corpus-dir <path>] [<runId>] [<contractId>…]";
const RUNID_FILTER_HINT =
  "the first argument is the runId; contract filters come after it " +
  "(e.g. npm run validate:smoke -- <runId> <contractId>)";

/** An unknown contract-id filter (it would silently validate nothing). */
export class UnknownContractIdError extends Error {
  readonly unknownIds: readonly string[];
  readonly validIds: readonly string[];

  constructor(unknownIds: readonly string[], validIds: readonly string[]) {
    super(
      `Unknown contract id(s): ${unknownIds.join(", ")}. ` +
        `Valid contract ids: ${validIds.join(", ")}`,
    );
    this.name = "UnknownContractIdError";
    this.unknownIds = unknownIds;
    this.validIds = validIds;
  }
}

/** Parsed CLI arguments: an optional leading runId, then optional contract filters. */
export interface ParsedArgs {
  readonly runId: string | undefined;
  readonly contractIds: readonly string[];
}

/** `[<runId>] [<contractId>…]` — the first positional (if any) is the runId;
 * every remaining positional filters which contracts' checks run. */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const [runId, ...contractIds] = argv;
  return { runId, contractIds };
}

/** The distinct contract ids the plan steps through, in plan order. */
export function planContractIds(plan: TestPlan): readonly string[] {
  return [
    ...new Set(
      plan.scenarios.flatMap((scenario) =>
        scenario.steps.map(({ contractId }) => contractId),
      ),
    ),
  ];
}

/** Resolve the optional contract filters against the plan, or `undefined` when
 * unfiltered (the runner's own default; the runner deduplicates repeated ids).
 * Unknown ids throw — mirroring selectScenarios' unknown-scenario-id error
 * pattern — so a typo can never silently validate nothing. */
export function resolveContractIds(
  plan: TestPlan,
  filters: readonly string[],
): string[] | undefined {
  if (filters.length === 0) {
    return undefined;
  }
  const validIds = planContractIds(plan);
  const validIdsSet = new Set(validIds);
  const unknownIds = [...new Set(filters.filter((id) => !validIdsSet.has(id)))];
  if (unknownIds.length > 0) {
    throw new UnknownContractIdError(unknownIds, validIds);
  }
  return [...filters];
}

/** One result line: `[PASS]/[FAIL] contractId — details?` — failures print
 * their details, whitespace-collapsed so one line per check holds. */
export function formatResult(result: ValidationResult): string {
  const details = result.details?.replace(/\s+/g, " ");
  return (
    `[${result.passed ? "PASS" : "FAIL"}] ${result.contractId}` +
    (details !== undefined ? ` — ${details}` : "")
  );
}

/** The summary line: `X/Y checks passed in <runId>`. */
export function formatSummary(
  results: readonly ValidationResult[],
  runId: string,
): string {
  const passed = results.filter(({ passed }) => passed).length;
  return `${passed}/${results.length} checks passed in ${runId}`;
}

/** A CLI run's observable behavior: exit code plus stdout/stderr lines.
 * Extracted so the exit/print contract is unit-testable without spawning the
 * process. */
export type ValidateOutcome = CliOutcome;

export interface ValidateOptions {
  /** Corpus dir override for tests; the operator default is `corpus` (or CORPUS_DIR). */
  readonly corpusDir?: string;
  /** Plan override for tests; the operator default is the smoke plan. */
  readonly plan?: TestPlan;
}

function summarizedOutcome(
  results: readonly ValidationResult[],
  runId: string,
): ValidateOutcome {
  // Zero results after a run was selected means validators ran over nothing —
  // an unreadable manifest or a stepless plan — never a pass.
  if (results.length === 0) {
    return errorOutcome(
      `no checks ran for "${runId}" — the run manifest was unreadable or the plan declares no steps.`,
      USAGE,
    );
  }
  return {
    exitCode: results.some(({ passed }) => !passed) ? 1 : 0,
    out: [...results.map(formatResult), formatSummary(results, runId)],
    err: [],
  };
}

/** The plan-version guard outcome (story 6): the refusal when the resolved
 * run may no longer be interpreted against the current plan, `undefined` when
 * it may (MATCH). Sits after run resolution and before `runValidatorsOffline`.
 * The refusal fires whenever the raw manifest parses to an object —
 * independent of whether `timestamp` is a usable string. A manifest that is
 * missing, unparseable, or not an object is NOT a guard refusal — the
 * existing no-checks-run outcome (validators ran over nothing) stays
 * authoritative, unchanged. One shared raw read — no double JSON parse. */
function planVersionGuardOutcome(
  corpusDir: string,
  runId: string,
  plan: TestPlan,
): ValidateOutcome | undefined {
  const raw = readRawRunManifest(corpusDir, runId);
  if (raw === undefined) {
    return undefined;
  }
  const refusal = planVersionRefusal(raw.planModelVersion, plan.modelVersion);
  return refusal === undefined ? undefined : errorOutcome(refusal);
}

/** The whole CLI as a pure function over argv + corpus state: resolve the
 * corpus dir (`--corpus-dir` flag > options > CORPUS_DIR env > `corpus`),
 * resolve the run, guard the recorded plan version, validate offline, format
 * the summary, and decide the exit code. Exit `0` when every check passed;
 * exit `1` on any failing check, zero checks ran for a selected run, an
 * unknown run, no recorded run, a plan-version guard refusal (state error —
 * no usage), or a usage error (any remaining flag — only `--corpus-dir <path>`
 * is accepted). */
export function validateSmoke(
  argv: readonly string[],
  options: ValidateOptions = {},
): ValidateOutcome {
  const { corpusDir: flagCorpusDir, rest } = extractCorpusDir(argv);
  const corpusDir = flagCorpusDir ?? options.corpusDir ?? process.env.CORPUS_DIR ?? DEFAULT_CORPUS_DIR;
  const plan = options.plan ?? smokeTestPlan;

  if (rest.some((arg) => arg.startsWith("-"))) {
    return errorOutcome(
      `Invalid argument(s): ${rest.join(", ")} — only positional [<runId>] [<contractId>…] are accepted.`,
      USAGE,
    );
  }

  const { runId, contractIds } = parseArgs(rest);

  let filter;
  try {
    filter = resolveContractIds(plan, contractIds);
  } catch (error) {
    return errorOutcome(error instanceof Error ? error.message : String(error), USAGE);
  }

  if (runId === undefined) {
    const latest = resolveLatestRun(corpusDir);
    if (latest === null) {
      return noRecordedRunOutcome(corpusDir, USAGE);
    }
    const guard = planVersionGuardOutcome(corpusDir, latest, plan);
    if (guard !== undefined) {
      return guard;
    }
    return summarizedOutcome(runValidatorsOffline(corpusDir, latest, plan, filter), latest);
  }

  // The shape guard precedes any fs access: a runId with separators or ".."
  // must never reach a corpus path (mirrors handlinks' RUN_ID_PATTERN trust).
  if (!RUN_ID_PATTERN.test(runId) || !isKnownRun(corpusDir, runId)) {
    // When the first positional is actually a valid contract id, add the
    // targeted hint — the operator most likely inverted the argument order.
    return unknownRunOutcome(
      corpusDir,
      runId,
      ...(planContractIds(plan).includes(runId) ? [RUNID_FILTER_HINT, USAGE] : [USAGE]),
    );
  }
  const guard = planVersionGuardOutcome(corpusDir, runId, plan);
  if (guard !== undefined) {
    return guard;
  }
  return summarizedOutcome(runValidatorsOffline(corpusDir, runId, plan, filter), runId);
}

function main(): void {
  const outcome = validateSmoke(process.argv.slice(2));
  for (const line of outcome.out) {
    console.log(line);
  }
  for (const line of outcome.err) {
    console.error(line);
  }
  // exitCode (not exit()) so piped stdout flushes before the process ends.
  process.exitCode = outcome.exitCode;
}

// Run only when executed directly (`tsx bin/validate-smoke.ts`), never when the
// helpers are imported (the unit test suite).
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}