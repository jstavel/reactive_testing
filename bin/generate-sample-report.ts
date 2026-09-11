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
// Fail-demo mode (CAP-6, story 3, `--fail`): the same deterministic recipe
// minted under the reserved gitignored runId `fail-demo` (FAIL_DEMO_RUN_ID)
// with exactly one hand-placed defect — the clickPortfolioMenuMain step's
// post-snapshot url pathname is corrupted to /app/portfolio/futures, so
// exactly its url-is postcondition fails and the owning scenario fails red.
// The red `report.html`/`report.json` come from the same pure emitters; the
// throwaway output lives only under the gitignored fail-demo subtrees, so no
// failing evidence is ever committed. The self-check flips in fail mode: it
// asserts the expected failure signature (exactly one failing check, that
// contractId, that url-is detail) — any other outcome (recipe regression,
// zero checks, wrong count/contract/detail) exits 1 and rolls the fail-demo
// subtrees back. Exit 0 only when the demo generated as expected.
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
// Partial-write hygiene: the run's subtrees (the `example` fixture or the
// `fail-demo` throwaway) are the generator's exclusive property — they are
// removed before writing (stale files from an older recipe never survive a
// regeneration) and rolled back on ANY non-zero outcome (a self-check failure
// or a write error leaves no manifest, no evidence, and no half-written
// report pair that could mislead a later run). The emitted `report.json` is
// verified to parse and carry the report.v1 schema before success is claimed.
// Only the run's own subtrees are ever removed; other corpus content — the
// `example` fixture in fail mode, everything else in both modes — is
// untouched.

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
import { FAIL_DEMO_RUN_ID, SAMPLE_RUN_ID } from "./sample-run-id.js";

export { FAIL_DEMO_RUN_ID, SAMPLE_RUN_ID };

export const GENERATE_USAGE = "Usage: npm run generate:sample -- [--fail] [<corpusDir>]";

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

// --- The failure demo's single deliberate defect (story 3): the same
// deterministic `example` recipe, with exactly one hand-placed corruption.
// The clickPortfolioMenuMain step's post-snapshot url pathname is pointed at
// the futures page, so exactly its url-is postcondition fails and its owning
// scenario ("clicking-main-opens-the-portfolio-page-with-the-main-view")
// fails red. Every other check passes: 17/18 checks, 13/14 scenarios. ---
const FAIL_DEMO_CONTRACT_ID = "clickPortfolioMenuMain";
const FAIL_DEMO_BROKEN_URL = `${BASE_URL}/app/portfolio/futures`;
/** The exact failure signature the `--fail` self-check demands (the
 * validator-map url-is detail wording for the defect above): any other
 * outcome — zero checks, zero failures, extra failures, a different contract
 * or detail — is a recipe regression and exits 1. */
const FAIL_DEMO_EXPECTED_DETAIL =
  '[postcondition] url-is "/app/portfolio/main" but url pathname is "/app/portfolio/futures"';

/** A plan for the self-check override (test seam): the fixture recipe stays
 * bound to the smoke plan, only the validating plan is swapped. */
export interface GenerateSampleOptions {
  readonly plan?: TestPlan;
  /** Fail-demo mode (story 3): mint the fixture with the single defect above
   * under FAIL_DEMO_RUN_ID and emit the red report pair — a throwaway demo,
   * written only under the gitignored fail-demo subtrees. */
  readonly fail?: boolean;
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
 * self-check's validating plan can never disagree. In fail mode exactly one
 * post snapshot is corrupted (the single-mutation defect: the
 * clickPortfolioMenuMain step's url); every other file is the pass-mode
 * recipe byte-for-byte. */
function fixtureEvidenceFiles(plan: TestPlan, runId: string, fail: boolean): FixtureFile[] {
  let stepIndex = 0;
  return plan.scenarios
    .flatMap((scenario) =>
      scenario.steps.flatMap((step) => {
        const i = stepIndex++;
        const post = postSnapshot(step.contractId);
        return [
          {
            relPath: `snapshots/${runId}/${i}.pre.json`,
            data: preSnapshot(step.stateId),
          },
          {
            relPath: `snapshots/${runId}/${i}.json`,
            data:
              fail && step.contractId === FAIL_DEMO_CONTRACT_ID
                ? { ...post, url: FAIL_DEMO_BROKEN_URL }
                : post,
          },
          {
            relPath: `probes/${runId}/${i}.json`,
            data: probeBatch(step.contractId),
          },
        ];
      }),
    )
    .flat();
}

/** The run manifest — the storage inventory naming every evidence file (the
 * reports are written later by the emitters and are not inventory).
 * `planModelVersion` is the generating plan's model version (story 6): the
 * fixture encodes the model it was made under, so the offline CLIs' guard
 * accepts it exactly like a freshly recorded run. */
function fixtureManifest(
  files: readonly string[],
  runId: string,
  planModelVersion: string,
): RunManifest {
  return {
    runId,
    timestamp: RUN_TIMESTAMP,
    planModelVersion,
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

/** The corpus subtrees a run exclusively owns — the ONLY paths the generator
 * ever removes or writes (the runId is reserved: `example` for the committed
 * fixture, `fail-demo` for the throwaway red demo; other corpus content is
 * never touched). */
function fixtureSubtreePaths(corpusRoot: string, runId: string): readonly string[] {
  return [
    join(corpusRoot, runId),
    join(corpusRoot, "snapshots", runId),
    join(corpusRoot, "probes", runId),
  ];
}

/** Remove the run's subtrees — regeneration hygiene (no stale file from an
 * older recipe survives a regeneration) and failure atomics (nothing
 * half-written survives a non-zero outcome). Parameterized by runId so the
 * fail-demo cleanup can never touch the `example` fixture and vice versa. */
function removeFixtureSubtrees(corpusRoot: string, runId: string): void {
  for (const dir of fixtureSubtreePaths(corpusRoot, runId)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A non-zero outcome after rolling the run's subtrees back — a self-check
 * failure must leave no manifest, no evidence, and no report behind
 * (partial-write hygiene), exactly like a thrown write error does. */
function rolledBackFailure(
  corpusRoot: string,
  runId: string,
  err: readonly string[],
): GenerateSampleOutcome {
  removeFixtureSubtrees(corpusRoot, runId);
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

/** Generate the run's fixture + reports into `corpusRoot`: remove any
 * previous subtrees for the runId (regeneration can never leave stale files
 * from an older recipe), write the manifest and evidence, self-check the
 * fixture through the real offline pipeline, then emit both reports from
 * the same inputs `report:smoke` uses and self-verify `report.json`.
 *
 * Pass mode (default) targets the committed `example` fixture and exits 0
 * only when the self-check is all-green (for the given plan). Fail mode
 * (`--fail`) targets the throwaway `fail-demo` run and exits 0 only when the
 * demo generated as expected — the self-check must see the expected failure
 * signature (exactly one failing check with the pinned contractId and url-is
 * detail); a failing report is the successful demo output.
 *
 * ANY non-zero outcome — self-check/signature failure or write error — rolls
 * the run's partial subtrees back (manifest, evidence, and any just-written
 * report, mirroring report:smoke's half-written-pair rollback), so nothing
 * half-written survives. Pure over its inputs apart from the writes/removals
 * under `corpusRoot` (only the run's own subtrees; never other corpus
 * content — the `example` fixture is untouched in fail mode and vice
 * versa). */
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
  const fail = options.fail === true;
  const runId = fail ? FAIL_DEMO_RUN_ID : SAMPLE_RUN_ID;
  const plan = options.plan ?? smokeTestPlan;
  // --- 0. Regeneration hygiene: the previous copy of this run's subtrees
  // goes first, so a stale file from an older recipe can never survive the
  // fresh write. ---
  removeFixtureSubtrees(corpusRoot, runId);
  try {
    // --- 1. The fixture: manifest + evidence, in place under corpusRoot. ---
    const evidence = fixtureEvidenceFiles(plan, runId, fail);
    for (const file of evidence) {
      writeCorpusJson(corpusRoot, file.relPath, file.data);
    }
    const manifest = fixtureManifest(
      evidence.map(({ relPath }) => relPath),
      runId,
      plan.modelVersion,
    );
    mkdirSync(join(corpusRoot, runId), { recursive: true });
    writeFileSync(
      join(corpusRoot, runId, "run-manifest.json"),
      JSON.stringify(manifest, null, 2),
    );

    // --- 2. Self-check through the real offline pipeline (never a silent
    // pass: zero results and any failing check both exit 1). In fail mode
    // the check flips to the expected failure signature: exactly one failing
    // check, the defect's contractId, the pinned url-is detail — any other
    // outcome is a recipe regression. ---
    const results = runValidatorsOffline(corpusRoot, runId, plan);
    if (results.length === 0) {
      return rolledBackFailure(corpusRoot, runId, [
        `self-check ran 0 checks for "${runId}" — the plan declares no steps; never a silent pass.`,
      ]);
    }
    const failures = results.filter(({ passed }) => !passed);
    if (fail) {
      const [failure] = failures;
      if (
        failures.length !== 1 ||
        failure?.contractId !== FAIL_DEMO_CONTRACT_ID ||
        failure.details !== FAIL_DEMO_EXPECTED_DETAIL
      ) {
        const actual =
          failures.length === 0
            ? "no failing checks (every check passed)"
            : failures.map(formatResult).join("; ");
        return rolledBackFailure(corpusRoot, runId, [
          `fail-demo self-check signature mismatch: expected exactly 1 failing check — ` +
            `[FAIL] ${FAIL_DEMO_CONTRACT_ID} — ${FAIL_DEMO_EXPECTED_DETAIL} — but got ${actual}`,
        ]);
      }
    } else if (failures.length > 0) {
      return rolledBackFailure(corpusRoot, runId, [
        ...failures.map(formatResult),
        formatSummary(results, runId),
      ]);
    }

    // --- 3. Both reports, from the same inputs report:smoke emits them. ---
    const run: RunMetadata = { runId, timestamp: RUN_TIMESTAMP };
    const scenarioResults = deriveScenarioResults(plan, results);
    const stepEvidence = buildStepEvidence(plan, corpusRoot, runId);
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
    if (fail) {
      return {
        exitCode: 0,
        out: [
          `Fail-demo fixture written: ${join(corpusRoot, runId)} (${evidence.length} evidence files)`,
          `Expected failure: ${formatResult(failures[0]!)}`,
          formatSummary(results, runId),
          `${passed}/${scenarioResults.length} scenarios passed (${results.length} checks)`,
          `Fail-demo report written: ${join(corpusRoot, htmlRelPath)}, ${join(corpusRoot, jsonRelPath)} — throwaway demo output; committed only when copied manually.`,
        ],
        err: [],
      };
    }
    return {
      exitCode: 0,
      out: [
        `Sample fixture written: ${join(corpusRoot, runId)} (${evidence.length} evidence files)`,
        formatSummary(results, runId),
        `${passed}/${scenarioResults.length} scenarios passed (${results.length} checks)`,
        `Report written: ${join(corpusRoot, htmlRelPath)}, ${join(corpusRoot, jsonRelPath)}`,
      ],
      err: [],
    };
  } catch (error) {
    // A fixture gap or write failure is an error outcome — never a raw stack
    // trace. The rollback removes the partial subtrees the run wrote — the
    // just-written report.html included when emitJsonReport threw after
    // emitHtmlReport succeeded — so no half-written report pair survives.
    removeFixtureSubtrees(corpusRoot, runId);
    return {
      exitCode: 1,
      out: [],
      err: [
        `${fail ? "fail demo" : "sample fixture"} could not be generated: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
}

function main(): void {
  const argv = process.argv.slice(2);
  // `--fail` is the only newly accepted flag: extracted (first occurrence)
  // before the positional guard so it combines with the optional corpus
  // root. Any other flag — a repeated `--fail` included — stays in the rest
  // and keeps the existing Invalid-argument(s) + usage error; the error
  // lists only the rejected arguments, never the accepted --fail.
  const failIndex = argv.indexOf("--fail");
  const fail = failIndex !== -1;
  const rest = fail ? [...argv.slice(0, failIndex), ...argv.slice(failIndex + 1)] : [...argv];
  if (rest.length > 1 || rest.some((arg) => arg.startsWith("-"))) {
    console.error(
      `Invalid argument(s): ${rest.join(", ")} — only [--fail] and positional [<corpusDir>] are accepted.`,
    );
    console.error(GENERATE_USAGE);
    process.exitCode = 1;
    return;
  }
  const outcome = generateSampleReport(rest[0] ?? DEFAULT_CORPUS_DIR, { fail });
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
