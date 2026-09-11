// Report CLI (CAP-6, story 6) — the operator counterpart to validate:smoke for
// the test-run report. Offline over a recorded corpus run: it re-derives
// per-scenario results through the offline validator runner — never re-running
// scenarios, never launching a browser, no CDP, no AI (NFR-1) — and writes the
// self-contained HTML report to `{corpusDir}/{runId}/report.html` via
// `emitHtmlReport` plus its machine-readable sibling `report.json` via
// `emitJsonReport`, from the same inputs in the same invocation. Both reports
// carry per-step evidence built by `buildStepEvidence` — the one CLI-side spot
// that existence-filters corpus refs (the renderers stay pure); it cites
// corpus-relative ref paths only, never evidence payloads. The reports are
// written regardless of check outcomes (a failing report is the most valuable
// one) while the exit code carries pass/fail to CI: exit 1 when any check
// failed, 0 only when all passed. A known run that yields zero results is an
// error that writes nothing — validators ran over nothing, which is never a
// reportable pass.
//
// The argument/error surface mirrors bin/validate-smoke.ts: positional-only
// `[<runId>]` defaulting to the latest recorded run (`resolveLatestRun` — the
// `@last-run` fan, falling back to the newest run-manifest.json), the flag
// guard, the shared `RUN_ID_PATTERN` shape guard before any fs access, and the
// same error-message families (unknown run, no recorded run, zero checks).
// The report embeds the Gherkin snapshot built from features/ (CAP-4: the
// source that was run, not an authored copy) plus the scenario↔model
// relations.
//
// Derivation (demo-verified on corpus efcb749d, 18/18 checks → 14/14
// scenarios): validation results arrive in plan-step order, so a contract's
// results are consumed whole by the first scenario — in plan order — that
// references the contract in a step; every result lands in exactly one
// scenario. A scenario passes iff no consumed check failed. An fs failure
// while writing the reports (or building the Gherkin snapshot) is an error
// outcome with usage — never a raw stack trace.

import { readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { relations } from "../model/relations.js";
import { smokeTestPlan } from "../model/smoke.test-plan.js";
import { screenshotRefSchema } from "../model/schemas.js";
import type {
  RunMetadata,
  ScenarioResult,
  StepEvidence,
  TestPlan,
  ValidationResult,
} from "../model/schemas.js";
import { emitHtmlReport } from "../reporter/html-report.js";
import { emitJsonReport } from "../reporter/json-report.js";
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

/** Per-step evidence for the report emitters, existence-filtered from the
 * corpus run. This is the one CLI-side spot that touches the filesystem — the
 * HTML/JSON renderers stay pure (NFR-1). Candidate refs use the corpus
 * writer's deterministic naming (`orchestrator/corpus.ts` `writeCorpusFile`,
 * keyed by the plan's global step index): `snapshots/{runId}/{i}.pre.json`,
 * `snapshots/{runId}/{i}.json`, `probes/{runId}/{i}.json`,
 * `network/{runId}/{i}.json`, and the screenshot ref JSON
 * `screenshots/{runId}/{i}.json` (parsed for its `ScreenshotRef`). A ref is
 * included only when its file exists — path-or-absent: no manifest walking,
 * no name inference. `timingMs` is the post-minus-pre snapshot `capturedAt`
 * when both exist and parse, else 0. */
export function buildStepEvidence(
  plan: TestPlan,
  corpusDir: string,
  runId: string,
): Record<string, StepEvidence[]> {
  let stepIndex = 0;
  return Object.fromEntries(
    plan.scenarios.map((scenario) => [
      scenario.id,
      scenario.steps.map(() => stepEvidenceFor(corpusDir, runId, stepIndex++)),
    ]),
  );
}

/** One step's evidence: refs for the corpus files that exist, plus the timing
 * derived from the pre/post snapshots' `capturedAt` (0 when either is absent
 * or unparseable — a silent fallback, never a throw). */
function stepEvidenceFor(corpusDir: string, runId: string, stepIndex: number): StepEvidence {
  const snapshotPre = `snapshots/${runId}/${stepIndex}.pre.json`;
  const snapshotPost = `snapshots/${runId}/${stepIndex}.json`;
  const probes = `probes/${runId}/${stepIndex}.json`;
  const network = `network/${runId}/${stepIndex}.json`;

  const preMs = toEpochMs(readCapturedAt(corpusDir, snapshotPre));
  const postMs = toEpochMs(readCapturedAt(corpusDir, snapshotPost));
  const screenshot = readScreenshotRef(corpusDir, `screenshots/${runId}/${stepIndex}.json`);

  return {
    // A reversed delta (post before pre) is nonsense timing — clamp to 0.
    timingMs:
      preMs !== undefined && postMs !== undefined && postMs >= preMs
        ? postMs - preMs
        : 0,
    ...(corpusRef(corpusDir, snapshotPre) !== undefined ? { snapshotPre } : {}),
    ...(corpusRef(corpusDir, snapshotPost) !== undefined ? { snapshotPost } : {}),
    ...(corpusRef(corpusDir, probes) !== undefined ? { probes } : {}),
    ...(corpusRef(corpusDir, network) !== undefined ? { network } : {}),
    ...(screenshot !== undefined ? { screenshot } : {}),
  };
}

/** The corpus-relative ref when its target is a regular file — path-or-absent.
 * `statSync` (not `existsSync`) so directories, FIFOs, and other non-regular
 * entries are never cited as evidence. */
function corpusRef(corpusDir: string, relPath: string): string | undefined {
  try {
    return statSync(join(corpusDir, relPath)).isFile() ? relPath : undefined;
  } catch {
    return undefined;
  }
}

/** A snapshot file's `capturedAt`, or undefined when the file is absent,
 * unparseable, or carries no timestamp (the timing fallback, never a throw). */
function readCapturedAt(corpusDir: string, relPath: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(corpusDir, relPath), "utf8"));
    const capturedAt = (parsed as { capturedAt?: unknown } | null)?.capturedAt;
    return typeof capturedAt === "string" ? capturedAt : undefined;
  } catch {
    return undefined;
  }
}

/** The epoch ms of an ISO timestamp, or undefined when absent or unparseable. */
function toEpochMs(iso: string | undefined): number | undefined {
  if (iso === undefined) {
    return undefined;
  }
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : undefined;
}

/** The `ScreenshotRef` stored beside a step's PNG (`screenshots/{runId}/{i}.json`),
 * or undefined when absent, unparseable, or its target PNG is missing/not a
 * regular file — a dangling ref would render a broken link, so it is cited
 * only while the file it points at exists. */
function readScreenshotRef(corpusDir: string, relPath: string): StepEvidence["screenshot"] {
  try {
    const parsed = screenshotRefSchema.safeParse(
      JSON.parse(readFileSync(join(corpusDir, relPath), "utf8")),
    );
    if (!parsed.success) {
      return undefined;
    }
    try {
      return statSync(join(corpusDir, parsed.data.filePath)).isFile() ? parsed.data : undefined;
    } catch {
      return undefined;
    }
  } catch {
    return undefined;
  }
}

/** The whole CLI as a pure function over argv + corpus state: resolve the run,
 * re-derive per-scenario results offline, write both reports, and decide the
 * exit code. The reports are written for any run with checks (pass or fail);
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
  const stepEvidence = buildStepEvidence(plan, corpusDir, runId);

  // The html rel path doubles as the "html written" flag: it is set only after
  // emitHtmlReport returned (the file is on disk), so the catch can roll a
  // half-written pair back to the nothing-written contract.
  let htmlWritten: string | undefined;
  let jsonRelPath: string | undefined;
  try {
    htmlWritten = emitHtmlReport({
      corpusDir,
      run,
      plan,
      results: scenarioResults,
      relations,
      gherkinSource: buildGherkinSnapshot("features", relations),
      stepEvidence,
    });
    jsonRelPath = emitJsonReport({
      corpusDir,
      run,
      plan,
      results: scenarioResults,
      relations,
      stepEvidence,
    });
  } catch (error) {
    // A write failure is an error outcome with usage — never a raw stack
    // trace. When the html half of the pair was already written, remove it:
    // a failed report run must leave nothing behind.
    if (htmlWritten !== undefined) {
      try {
        rmSync(join(corpusDir, htmlWritten), { force: true });
      } catch {
        // Rollback is best-effort; the outcome below carries the real error.
      }
    }
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
      `Report written: ${join(corpusDir, htmlWritten)}, ${join(corpusDir, jsonRelPath)}`,
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
