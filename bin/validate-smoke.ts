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

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

import { smokeTestPlan } from "../model/smoke.test-plan.js";
import type { TestPlan, ValidationResult } from "../model/schemas.js";
import { LAST_RUN, RUN_ID_PATTERN, resolveFan } from "../orchestrator/handlinks.js";
import { runValidatorsOffline } from "../validators/offline-runner.js";
import { SAMPLE_RUN_ID } from "./sample-run-id.js";

const CORPUS_DIR = "corpus";
export const USAGE =
  "Usage: npm run validate:smoke -- [--corpus-dir <path>] [<runId>] [<contractId>…]";
const RUNID_FILTER_HINT =
  "the first argument is the runId; contract filters come after it " +
  "(e.g. npm run validate:smoke -- <runId> <contractId>)";

/** A runId is always a UUID/kebab token; anything else (path separators, `..`)
 * must never reach a corpus path. Shared with handlinks (handoff symlink
 * targets) — one source of truth for the runId shape guard. */
/** Kind dirs at the corpus root holding per-run evidence — never a run dir. */
const KIND_DIRS = new Set(["snapshots", "network", "probes", "screenshots"]);

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

/** Extracted `--corpus-dir <path>`: the flag's value plus the remaining
 * arguments (the two flag tokens removed, wherever they appeared). */
export interface CorpusDirArgs {
  readonly corpusDir: string | undefined;
  readonly rest: readonly string[];
}

/** Extract `--corpus-dir <path>` (two tokens, position-free) from argv BEFORE
 * the positional guard — the operator CLIs' shared flag surface (SPEC
 * Constraints: both CLIs gain `--corpus-dir`). Precedence is decided by the
 * caller: flag > options.corpusDir > CORPUS_DIR env > default. A dangling
 * flag (no `<path>` value, an empty value, or a value that is itself a flag)
 * and any repeated flag stay in `rest`, so the positional guard rejects them
 * with the usual Invalid-argument(s) + usage error — never a
 * silently-swallowed token and never an empty corpus dir. */
export function extractCorpusDir(argv: readonly string[]): CorpusDirArgs {
  const index = argv.indexOf("--corpus-dir");
  if (index === -1) {
    return { corpusDir: undefined, rest: [...argv] };
  }
  const value = argv[index + 1];
  if (value === undefined || value === "" || value.startsWith("-")) {
    return { corpusDir: undefined, rest: [...argv] };
  }
  return {
    corpusDir: value,
    rest: [...argv.slice(0, index), ...argv.slice(index + 2)],
  };
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

/** Whether a recorded run exists for runId (UNKNOWN_RUN gate: a run dir with a
 * run-manifest.json). */
export function isKnownRun(corpusDir: string, runId: string): boolean {
  return existsSync(join(corpusDir, runId, "run-manifest.json"));
}

/** The deterministic "newest" key for one candidate run dir: the manifest's
 * embedded `timestamp` when it parses to a date, else the manifest's mtime (a
 * corrupt manifest still sorts by mtime). `undefined` = skip the entry
 * (manifest unreadable). */
function newestKey(corpusDir: string, entry: string): number | undefined {
  const manifestPath = join(corpusDir, entry, "run-manifest.json");
  try {
    const parsed: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
    const timestamp = (parsed as { timestamp?: unknown } | null)?.timestamp;
    if (typeof timestamp === "string") {
      const ms = Date.parse(timestamp);
      if (Number.isFinite(ms)) {
        return ms;
      }
    }
  } catch {
    // Unparseable or absent manifest → fall back to mtime below.
  }
  try {
    return statSync(manifestPath).mtimeMs;
  } catch {
    return undefined;
  }
}

/** Newest run-manifest.json in corpusDir — by the manifest's embedded
 * `timestamp` (mtime fallback for unparseable manifests), ties broken by entry
 * name lexicographically. `@`-prefixed fans and the kind dirs never
 * participate. Absent corpus or no runs → `null`. Per-entry read/stat failures
 * skip that entry; they never collapse the whole scan.
 *
 * Implicit resolution prefers real recorded runs: the committed mock
 * fixture's runId (SAMPLE_RUN_ID) never wins the default while a real
 * recorded run exists — its fixed future timestamp would otherwise silently
 * shadow every real run. With no real run (fresh checkout) the fixture stays
 * the implicit default; an explicit `example` positional bypasses this
 * resolution entirely. */
function newestManifestRun(corpusDir: string): string | null {
  let entries: string[];
  try {
    entries = readdirSync(corpusDir);
  } catch {
    return null;
  }
  const byName = (a: string, b: string): number =>
    a < b ? -1 : a > b ? 1 : 0;
  const newest = (runs: readonly { entry: string; key: number }[]): string | null =>
    [...runs].sort((a, b) => b.key - a.key || byName(a.entry, b.entry)).at(0)?.entry ??
    null;
  const candidates = entries
    .filter((entry) => !entry.startsWith("@") && !KIND_DIRS.has(entry))
    .flatMap((entry) => {
      const key = newestKey(corpusDir, entry);
      return key === undefined ? [] : [{ entry, key }];
    });
  return (
    newest(candidates.filter(({ entry }) => entry !== SAMPLE_RUN_ID)) ??
    newest(candidates)
  );
}

/** The run to validate by default: the `@last-run` fan's canonical run dir
 * (exactly what run:smoke last wrote), falling back to the newest manifest so
 * the CLI stays usable before/independently of the handoff links. Null when
 * no run exists. */
export function resolveLatestRun(corpusDir: string): string | null {
  const viaFan = resolveFan(corpusDir, LAST_RUN);
  return viaFan !== null ? basename(viaFan) : newestManifestRun(corpusDir);
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
export interface ValidateOutcome {
  readonly exitCode: 0 | 1;
  readonly out: readonly string[];
  readonly err: readonly string[];
}

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

function errorOutcome(...errors: readonly string[]): ValidateOutcome {
  return { exitCode: 1, out: [], err: errors };
}

/** The unknown-run outcome, shared by the shape guard and the manifest gate.
 * When the first positional is actually a valid contract id, add the targeted
 * hint — the operator most likely inverted the argument order. */
function unknownRunOutcome(
  corpusDir: string,
  runId: string,
  plan: TestPlan,
): ValidateOutcome {
  const errors = [
    `Unknown run "${runId}" — no run-manifest.json in ${corpusDir}/${runId}/.`,
  ];
  if (planContractIds(plan).includes(runId)) {
    errors.push(RUNID_FILTER_HINT);
  }
  return errorOutcome(...errors, USAGE);
}

/** The whole CLI as a pure function over argv + corpus state: resolve the
 * corpus dir (`--corpus-dir` flag > options > CORPUS_DIR env > `corpus`),
 * resolve the run, validate offline, format the summary, and decide the exit
 * code. Exit `0` when every check passed; exit `1` on any failing check, zero
 * checks ran for a selected run, an unknown run, no recorded run, or a usage
 * error (any remaining flag — only `--corpus-dir <path>` is accepted). */
export function validateSmoke(
  argv: readonly string[],
  options: ValidateOptions = {},
): ValidateOutcome {
  const { corpusDir: flagCorpusDir, rest } = extractCorpusDir(argv);
  const corpusDir = flagCorpusDir ?? options.corpusDir ?? process.env.CORPUS_DIR ?? CORPUS_DIR;
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
      return errorOutcome(
        `No recorded run found in ${corpusDir}/ — record one first with \`npm run run:smoke\`.`,
        USAGE,
      );
    }
    return summarizedOutcome(runValidatorsOffline(corpusDir, latest, plan, filter), latest);
  }

  // The shape guard precedes any fs access: a runId with separators or ".."
  // must never reach a corpus path (mirrors handlinks' RUN_ID_PATTERN trust).
  if (!RUN_ID_PATTERN.test(runId) || !isKnownRun(corpusDir, runId)) {
    return unknownRunOutcome(corpusDir, runId, plan);
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