// Sample-report generator (CAP-3/CAP-4, spec-report-gherkin-corpus-links
// story 2) — writes the committed all-passing mock fixture at
// `{corpusRoot}/example/` (manifest + 18 pre/post snapshots + 18 probe
// batches) and its `report.html`/`report.json` via the same emitters
// `report:smoke` uses (`emitHtmlReport`/`emitJsonReport` fed by
// `buildStepEvidence` + `deriveScenarioResults`). The fixture is mock data
// only — minimal synthetic snapshot bodies and probe values that satisfy the
// offline predicates — never a real recording (live snapshots carry real
// Kraken balances). It omits screenshots and network in v1: network is never
// read offline and screenshots are existence-filtered, so the report renders
// evidence links only (MISSING_KIND exercised naturally). No
// `@last-run`/`@last-fail` handoff links: the fixture is plain directories a
// git reader can walk.
//
// Deterministic (NFR-1): fixed runId `example`, fixed ISO timestamps, fixed
// mock content — two runs are byte-identical. No `Date.now`, no `randomUUID`.
// The per-step recipe (stateId/url/dialog) is cloned from the verified
// all-passing run `efcb749d…`; the fixed pre `…00.000Z` / post `…00.400Z`
// capturedAt values make every `timingMs` a stable 400 and keep newest-run
// resolution byte-stable.
//
// The generator self-checks the freshly written fixture through the real
// offline pipeline (`runValidatorsOffline`) and exits 1 with the failing
// check detail on any violation — never a silent pass. The recipe is bound to
// the plan the fixture is generated for (the smoke plan by default): a
// plan/model change the recipe cannot serve throws a loud fixture gap instead
// of writing a silently-invalid corpus.
//
// Partial-write hygiene: the `example` subtrees are the generator's exclusive
// property — they are removed before writing (stale files from an older
// recipe never survive a regeneration) and rolled back on ANY non-zero
// outcome (a self-check failure or a write error leaves no manifest, no
// evidence, and no half-written report pair that could mislead a later run).
// The emitted `report.json` is verified to parse and carry the report.v1
// schema before success is claimed. Only the `example` subtrees are ever
// removed; other corpus content is untouched.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { relations } from "../model/relations.js";
import { smokeTestPlan } from "../model/smoke.test-plan.js";
import type {
  ProbeResult,
  RunManifest,
  RunMetadata,
  SnapshotRecord,
  TestPlan,
} from "../model/schemas.js";
import { buildGherkinSnapshot } from "../reporter/gherkin-snapshot.js";
import { emitHtmlReport } from "../reporter/html-report.js";
import { REPORT_SCHEMA, emitJsonReport } from "../reporter/json-report.js";
import { runValidatorsOffline } from "../validators/offline-runner.js";
import { buildStepEvidence, deriveScenarioResults } from "./report-smoke.js";
import { formatResult, formatSummary } from "./validate-smoke.js";
import { SAMPLE_RUN_ID } from "./sample-run-id.js";

export { SAMPLE_RUN_ID };

export const GENERATE_USAGE = "Usage: npm run generate:sample -- [<corpusDir>]";

/** The operator default corpus root (the smoke CLIs' default). */
const DEFAULT_CORPUS_DIR = "corpus";

// --- The fixed clock (NFR-1: no Date.now, no randomUUID anywhere). The 400ms
// pre→post delta makes every step's `timingMs` a stable 400. ---
const RUN_TIMESTAMP = "2026-09-11T00:00:00.000Z";
const POST_TIMESTAMP = "2026-09-11T00:00:00.400Z";

const BASE_URL = "https://pro.kraken.com";

// --- The per-step recipe, cloned from the verified all-passing run
// efcb749d… (story 2 Design Notes). The pre-step snapshot is a function of
// the plan step's stateId (the recipe's pre-url column: homePage → /app/home,
// historyMain → the ledger, orderBook → the BTC/USD board; the
// portfolioSummaryDialog state sits on /app/home), and the dialog marker
// rides in the body exactly where a dialog-open/closed predicate needs it
// (the portfolioSummaryDialog state). ---
const BODY_BY_STATE: Record<string, string> = {
  homePage: "<div>mock home</div>",
  historyMain: "<div>mock history ledger</div>",
  historyFutures: "<div>mock history derivatives ledger</div>",
  portfolioOverview: "<div>mock portfolio overview</div>",
  portfolioMain: "<div>mock portfolio main</div>",
  portfolioFutures: "<div>mock portfolio futures</div>",
  portfolioLoans: "<div>mock portfolio loans</div>",
  earn: "<div>mock earn</div>",
  orderBook: "<div>mock order book</div>",
  portfolioSummaryDialog: '<div role="dialog">mock portfolio summary</div>',
};

const PRE_URL_BY_STATE: Record<string, string> = {
  homePage: `${BASE_URL}/app/home`,
  historyMain: `${BASE_URL}/app/history/main/ledger`,
  orderBook: `${BASE_URL}/app/trade/btc-usd`,
  portfolioSummaryDialog: `${BASE_URL}/app/home`,
};

/** The post-step state each contract's postconditions demand (the recipe's
 * post-state column, keyed by contract). */
const POST_STATE_BY_CONTRACT: Record<string, string> = {
  clickHistoryMenuMain: "historyMain",
  clickHistoryMenuFutures: "historyFutures",
  clickPortfolioMenuOverview: "portfolioOverview",
  clickPortfolioMenuMain: "portfolioMain",
  clickPortfolioMenuFutures: "portfolioFutures",
  clickPortfolioMenuLoans: "portfolioLoans",
  clickPortfolioMenuEarn: "earn",
  openPortfolioSummary: "portfolioSummaryDialog",
  closePortfolioSummary: "homePage",
  toggleEyeIcon: "portfolioSummaryDialog",
  filterHistoryByAsset: "historyMain",
  paginateHistoryNext: "historyMain",
  selectOrderBookTab: "orderBook",
};

/** The post-step url each contract's url-is postcondition demands (the
 * recipe's post-url-path column). */
const POST_PATH_BY_CONTRACT: Record<string, string> = {
  clickHistoryMenuMain: "/app/history/main/ledger",
  clickHistoryMenuFutures: "/app/history/derivatives/ledger",
  clickPortfolioMenuOverview: "/app/portfolio/overview",
  clickPortfolioMenuMain: "/app/portfolio/main",
  clickPortfolioMenuFutures: "/app/portfolio/derivatives",
  clickPortfolioMenuLoans: "/app/portfolio/loans",
  clickPortfolioMenuEarn: "/app/earn",
  openPortfolioSummary: "/app/home",
  closePortfolioSummary: "/app/home",
  toggleEyeIcon: "/app/home",
  filterHistoryByAsset: "/app/history/main/ledger",
  paginateHistoryNext: "/app/history/main/ledger",
  selectOrderBookTab: "/app/trade/btc-usd",
};

/** The `selected-view` probe value satisfying each contract's view-selected
 * postcondition (the recipe's probe column); `""` where no predicate reads
 * the probe. */
const SELECTED_VIEW_BY_CONTRACT: Record<string, string> = {
  clickHistoryMenuMain: "Ledger",
  clickHistoryMenuFutures: "Ledger",
  clickPortfolioMenuOverview: "Overview",
  clickPortfolioMenuMain: "Main",
  clickPortfolioMenuFutures: "Futures",
  clickPortfolioMenuLoans: "Loans",
  filterHistoryByAsset: "Ledger",
  paginateHistoryNext: "Ledger",
};

/** A plan for the self-check override (test seam): the fixture recipe stays
 * bound to the smoke plan, only the validating plan is swapped. */
export interface GenerateSampleOptions {
  readonly plan?: TestPlan;
}

/** A generator run's observable behavior: exit code plus stdout/stderr lines,
 * mirroring ValidateOutcome/ReportOutcome so all three CLIs print/exit the
 * same way. */
export interface GenerateSampleOutcome {
  readonly exitCode: 0 | 1;
  readonly out: readonly string[];
  readonly err: readonly string[];
}

/** One fixture file to write, as pure data: corpus-relative path + payload. */
interface FixtureFile {
  readonly relPath: string;
  readonly data: unknown;
}

/** The pre-step snapshot for a plan step's start state (recipe pre column):
 * the state's mock body + url, dialog marker included exactly where a
 * dialog-open precondition evaluates it. */
function preSnapshot(stateId: string): SnapshotRecord {
  const url = PRE_URL_BY_STATE[stateId];
  const body = BODY_BY_STATE[stateId];
  if (url === undefined || body === undefined) {
    throw new Error(`fixture gap: no mock recipe for pre state "${stateId}"`);
  }
  return { stateId, url, snapshot: body, capturedAt: RUN_TIMESTAMP };
}

/** The post-step snapshot for a contract (recipe post columns). */
function postSnapshot(contractId: string): SnapshotRecord {
  const stateId = POST_STATE_BY_CONTRACT[contractId];
  const path = POST_PATH_BY_CONTRACT[contractId];
  const body = stateId === undefined ? undefined : BODY_BY_STATE[stateId];
  if (stateId === undefined || path === undefined || body === undefined) {
    throw new Error(`fixture gap: no mock recipe for contract "${contractId}"`);
  }
  return {
    stateId,
    url: `${BASE_URL}${path}`,
    snapshot: body,
    capturedAt: POST_TIMESTAMP,
  };
}

/** The probe batch for a contract — both names always present (mirroring the
 * recorded probe collector), values satisfying the view-selected predicates. */
function probeBatch(contractId: string): ProbeResult[] {
  return [
    {
      name: "selected-view",
      value: SELECTED_VIEW_BY_CONTRACT[contractId] ?? "",
      capturedAt: POST_TIMESTAMP,
    },
    {
      name: "selected-board-tab",
      value: contractId === "selectOrderBookTab" ? "Order book" : "",
      capturedAt: POST_TIMESTAMP,
    },
  ];
}

/** The run's evidence files in the corpus writer's order (pre, post, probes —
 * keyed by the plan's global step index), walked over the plan the fixture is
 * generated for (the generator's `plan` option, the smoke plan by default):
 * the recipe tables are keyed by global step index, so evidence and the
 * self-check's validating plan can never disagree. */
function fixtureEvidenceFiles(plan: TestPlan): FixtureFile[] {
  let stepIndex = 0;
  return plan.scenarios
    .flatMap((scenario) =>
      scenario.steps.flatMap((step) => {
        const i = stepIndex++;
        return [
          {
            relPath: `snapshots/${SAMPLE_RUN_ID}/${i}.pre.json`,
            data: preSnapshot(step.stateId),
          },
          {
            relPath: `snapshots/${SAMPLE_RUN_ID}/${i}.json`,
            data: postSnapshot(step.contractId),
          },
          {
            relPath: `probes/${SAMPLE_RUN_ID}/${i}.json`,
            data: probeBatch(step.contractId),
          },
        ];
      }),
    )
    .flat();
}

/** The run manifest — the storage inventory naming every evidence file (the
 * reports are written later by the emitters and are not inventory). */
function fixtureManifest(files: readonly string[]): RunManifest {
  return {
    runId: SAMPLE_RUN_ID,
    timestamp: RUN_TIMESTAMP,
    files: [...files],
    errors: [],
    failures: [],
    collectors: ["snapshot", "probe"],
    bootstrap: [],
  };
}

function writeCorpusJson(corpusRoot: string, relPath: string, data: unknown): void {
  const abs = join(corpusRoot, relPath);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, JSON.stringify(data));
}

/** The corpus subtrees the fixture exclusively owns — the ONLY paths the
 * generator ever removes or writes (SAMPLE_RUN_ID is reserved for the
 * fixture; other corpus content is never touched). */
function fixtureSubtreePaths(corpusRoot: string): readonly string[] {
  return [
    join(corpusRoot, SAMPLE_RUN_ID),
    join(corpusRoot, "snapshots", SAMPLE_RUN_ID),
    join(corpusRoot, "probes", SAMPLE_RUN_ID),
  ];
}

/** Remove the fixture subtrees the generator owns — regeneration hygiene
 * (no stale file from an older recipe survives a regeneration) and failure
 * atomics (nothing half-written survives a non-zero outcome). */
function removeFixtureSubtrees(corpusRoot: string): void {
  for (const dir of fixtureSubtreePaths(corpusRoot)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A non-zero outcome after rolling the fixture back — a self-check failure
 * must leave no manifest, no evidence, and no report behind (partial-write
 * hygiene), exactly like a thrown write error does. */
function rolledBackFailure(
  corpusRoot: string,
  err: readonly string[],
): GenerateSampleOutcome {
  removeFixtureSubtrees(corpusRoot);
  return { exitCode: 1, out: [], err: [...err] };
}

/** Self-verify an emitted report before success is claimed: it must parse and
 * carry the report.v1 schema tag — a crisp failure naming the parse/output
 * detail otherwise. */
function verifyReportJson(absPath: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(absPath, "utf8"));
  } catch (error) {
    throw new Error(
      `report self-verify failed: report.json is not valid JSON (${error instanceof Error ? error.message : String(error)})`,
    );
  }
  const schema = (parsed as { schema?: unknown } | null)?.schema;
  if (schema !== REPORT_SCHEMA) {
    throw new Error(
      `report self-verify failed: report.json schema is ${JSON.stringify(schema) ?? String(schema)} — expected "${REPORT_SCHEMA}"`,
    );
  }
}

/** Generate the committed mock fixture + its reports into `corpusRoot`:
 * remove any previous `example` subtrees (regeneration can never leave stale
 * files from an older recipe), write the manifest and evidence, self-check
 * the fixture through the real offline pipeline, then emit both reports from
 * the same inputs `report:smoke` uses and self-verify `report.json`. Exit `0`
 * only when the self-check passes (for the given plan); ANY non-zero outcome
 * — self-check failure or write error — rolls the partial fixture back
 * (manifest, evidence, and any just-written report, mirroring report:smoke's
 * half-written-pair rollback), so nothing half-written survives. Pure over
 * its inputs apart from the writes/removals under `corpusRoot` (only the
 * `example` subtrees; never other corpus content). */
export function generateSampleReport(
  corpusRoot: string = DEFAULT_CORPUS_DIR,
  options: GenerateSampleOptions = {},
): GenerateSampleOutcome {
  // The empty-dir guard precedes any fs access: an empty positional must
  // never collapse the fixture paths onto the process CWD.
  if (corpusRoot === "") {
    return {
      exitCode: 1,
      out: [],
      err: [
        "Invalid argument(s): <corpusDir> must be a non-empty path — only positional [<corpusDir>] is accepted.",
        GENERATE_USAGE,
      ],
    };
  }
  const plan = options.plan ?? smokeTestPlan;
  // --- 0. Regeneration hygiene: the previous fixture copy goes first, so a
  // stale file from an older recipe can never survive the fresh write. ---
  removeFixtureSubtrees(corpusRoot);
  try {
    // --- 1. The fixture: manifest + evidence, in place under corpusRoot. ---
    const evidence = fixtureEvidenceFiles(plan);
    for (const file of evidence) {
      writeCorpusJson(corpusRoot, file.relPath, file.data);
    }
    const manifest = fixtureManifest(evidence.map(({ relPath }) => relPath));
    mkdirSync(join(corpusRoot, SAMPLE_RUN_ID), { recursive: true });
    writeFileSync(
      join(corpusRoot, SAMPLE_RUN_ID, "run-manifest.json"),
      JSON.stringify(manifest, null, 2),
    );

    // --- 2. Self-check through the real offline pipeline (never a silent
    // pass: zero results and any failing check both exit 1). ---
    const results = runValidatorsOffline(corpusRoot, SAMPLE_RUN_ID, plan);
    if (results.length === 0) {
      return rolledBackFailure(corpusRoot, [
        `self-check ran 0 checks for "${SAMPLE_RUN_ID}" — the plan declares no steps; never a silent pass.`,
      ]);
    }
    const failures = results.filter(({ passed }) => !passed);
    if (failures.length > 0) {
      return rolledBackFailure(corpusRoot, [
        ...failures.map(formatResult),
        formatSummary(results, SAMPLE_RUN_ID),
      ]);
    }

    // --- 3. Both reports, from the same inputs report:smoke emits them. ---
    const run: RunMetadata = { runId: SAMPLE_RUN_ID, timestamp: RUN_TIMESTAMP };
    const scenarioResults = deriveScenarioResults(plan, results);
    const stepEvidence = buildStepEvidence(plan, corpusRoot, SAMPLE_RUN_ID);
    const htmlRelPath = emitHtmlReport({
      corpusDir: corpusRoot,
      run,
      plan,
      results: scenarioResults,
      relations,
      gherkinSource: buildGherkinSnapshot("features", relations),
      stepEvidence,
    });
    const jsonRelPath = emitJsonReport({
      corpusDir: corpusRoot,
      run,
      plan,
      results: scenarioResults,
      relations,
      stepEvidence,
    });

    // --- 4. Self-verify the emitted report (never a success claim over a
    // report that does not parse or does not carry the report.v1 schema). ---
    verifyReportJson(join(corpusRoot, jsonRelPath));

    const passed = scenarioResults.filter(({ passed }) => passed).length;
    return {
      exitCode: 0,
      out: [
        `Sample fixture written: ${join(corpusRoot, SAMPLE_RUN_ID)} (${evidence.length} evidence files)`,
        formatSummary(results, SAMPLE_RUN_ID),
        `${passed}/${scenarioResults.length} scenarios passed (${results.length} checks)`,
        `Report written: ${join(corpusRoot, htmlRelPath)}, ${join(corpusRoot, jsonRelPath)}`,
      ],
      err: [],
    };
  } catch (error) {
    // A fixture gap or write failure is an error outcome — never a raw stack
    // trace. The rollback removes the partial fixture the run wrote — the
    // just-written report.html included when emitJsonReport threw after
    // emitHtmlReport succeeded — so no half-written report pair survives.
    removeFixtureSubtrees(corpusRoot);
    return {
      exitCode: 1,
      out: [],
      err: [
        `sample fixture could not be generated: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.length > 1 || argv.some((arg) => arg.startsWith("-"))) {
    console.error(
      `Invalid argument(s): ${argv.join(", ")} — only positional [<corpusDir>] is accepted.`,
    );
    console.error(GENERATE_USAGE);
    process.exitCode = 1;
    return;
  }
  const outcome = generateSampleReport(argv[0] ?? DEFAULT_CORPUS_DIR);
  for (const line of outcome.out) {
    console.log(line);
  }
  for (const line of outcome.err) {
    console.error(line);
  }
  // exitCode (not exit()) so piped stdout flushes before the process ends.
  process.exitCode = outcome.exitCode;
}

// Run only when executed directly (`tsx bin/generate-sample-report.ts`), never
// when the helpers are imported (the unit test suite).
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
