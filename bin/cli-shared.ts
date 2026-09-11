// The operator CLIs' shared surface (spec-report-gherkin-corpus-links story 7):
// the neutral home both operator CLIs — validate:smoke and report:smoke — are
// peers of. Owns the outcome type and error helpers, the `--corpus-dir` flag
// extraction, the corpus-run resolution (the `@last-run` fan falling back to
// the newest run-manifest.json by its embedded `timestamp`, mtime as the
// unparseable-manifest fallback), the known-run gate (`isKnownRun`), the
// raw-manifest reader (`readRawRunManifest` + `readPlanModelVersion`) with the
// plan-version refusal, and the operator default corpus dir. Imports only node
// builtins, the orchestrator handoff links, and the reserved sample run ids
// (`./sample-run-id.js` — a leaf of pure constants, no cycle) — never a
// sibling CLI bin (no cycles).

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";

import { LAST_RUN, resolveFan } from "../orchestrator/handlinks.js";
import { FAIL_DEMO_RUN_ID, SAMPLE_RUN_ID } from "./sample-run-id.js";

/** A CLI run's observable behavior: exit code plus stdout/stderr lines.
 * Extracted so the exit/print contract is unit-testable without spawning the
 * process. */
export interface CliOutcome {
  readonly exitCode: 0 | 1;
  readonly out: readonly string[];
  readonly err: readonly string[];
}

/** The operator default corpus dir (`--corpus-dir` flag > options > CORPUS_DIR
 * env > this). */
export const DEFAULT_CORPUS_DIR = "corpus";

/** An error outcome: exit 1, nothing on stdout, the message(s) on stderr. */
export function errorOutcome(...errors: readonly string[]): CliOutcome {
  return { exitCode: 1, out: [], err: errors };
}

/** The unknown-run outcome shared by the shape guard and the manifest gate:
 * one message, with any caller-specific lines (a targeted hint, usage)
 * appended after it. */
export function unknownRunOutcome(
  corpusDir: string,
  runId: string,
  ...errors: readonly string[]
): CliOutcome {
  return errorOutcome(
    `Unknown run "${runId}" — no run-manifest.json in ${corpusDir}/${runId}/.`,
    ...errors,
  );
}

/** The no-recorded-run outcome (the "No recorded run found" family): one
 * message naming the corpus dir, with caller-specific lines (usage) after. */
export function noRecordedRunOutcome(
  corpusDir: string,
  ...errors: readonly string[]
): CliOutcome {
  return errorOutcome(
    `No recorded run found in ${corpusDir}/ — record one first with \`npm run run:smoke\`.`,
    ...errors,
  );
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

/** Whether a recorded run exists for runId (UNKNOWN_RUN gate: a run dir with a
 * run-manifest.json). */
export function isKnownRun(corpusDir: string, runId: string): boolean {
  return existsSync(join(corpusDir, runId, "run-manifest.json"));
}

/** The ONE shared raw-manifest reader for both operator CLIs (story 6 review):
 * the run manifest parsed leniently — `{ timestamp?, planModelVersion? }` with
 * only string-valued fields kept, when the file parses to a non-null object;
 * `undefined` when it is absent, unparseable, or not an object (both guards
 * step aside and the existing zero-checks error family applies, unchanged).
 * Read raw — not via `runManifestSchema` — precisely because the schema now
 * REQUIRES a non-empty `planModelVersion`: a legacy manifest must reach the
 * guard and be refused with its own re-record message, never fail a parse. */
export function readRawRunManifest(
  corpusDir: string,
  runId: string,
): { timestamp?: string; planModelVersion?: string } | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(join(corpusDir, runId, "run-manifest.json"), "utf8"));
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return undefined;
  }
  const fields = parsed as { timestamp?: unknown; planModelVersion?: unknown };
  return {
    ...(typeof fields.timestamp === "string" ? { timestamp: fields.timestamp } : {}),
    ...(typeof fields.planModelVersion === "string"
      ? { planModelVersion: fields.planModelVersion }
      : {}),
  };
}

/** The recorded `planModelVersion` from the run's raw manifest, or `undefined`
 * when the manifest predates the plan-version guard (field absent, blank, or
 * the manifest unreadable/non-object). Exported so the guard's refusal cases
 * are covered directly by tests. */
export function readPlanModelVersion(corpusDir: string, runId: string): string | undefined {
  return readRawRunManifest(corpusDir, runId)?.planModelVersion;
}

/** The plan-version guard's refusal message (story 6), or `undefined` when the
 * recorded version matches the current plan's (MATCH — validate/report behave
 * exactly as today). A blank recorded version (absent or whitespace-only) and
 * a mismatched one are different root causes — a manifest predating
 * provenance vs the model moving on — so each names its own fix. Both are
 * state errors: a single message, no usage/flag noise. */
export function planVersionRefusal(
  recorded: string | undefined,
  current: string,
): string | undefined {
  const trimmed = recorded?.trim() ?? "";
  if (trimmed.length > 0 && trimmed === current) {
    return undefined;
  }
  return trimmed.length === 0
    ? "run predates the plan-version guard (no planModelVersion in the manifest) — re-record the run (run:smoke)"
    : `model changed since recording (${recorded} ≠ ${current}) — re-record the run (run:smoke)`;
}

/** Kind dirs at the corpus root holding per-run evidence — never a run dir. */
const KIND_DIRS = new Set(["snapshots", "network", "probes", "screenshots"]);

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
 * Implicit resolution prefers real recorded runs: the reserved runIds never
 * hijack the default — the committed mock fixture (SAMPLE_RUN_ID) because its
 * fixed future timestamp would otherwise silently shadow every real run, and
 * the failure demo's throwaway (FAIL_DEMO_RUN_ID) because a leftover red demo
 * must never become the default validation target. The filter covers the
 * fallback too: fail-demo never resolves implicitly (a corpus holding only
 * the throwaway reports "no recorded run"). With no real run (fresh
 * checkout) the fixture stays the implicit default; an explicit positional
 * (`example` or `fail-demo`) bypasses this resolution entirely. */
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
    newest(
      candidates.filter(
        ({ entry }) => entry !== SAMPLE_RUN_ID && entry !== FAIL_DEMO_RUN_ID,
      ),
    ) ??
    newest(candidates.filter(({ entry }) => entry !== FAIL_DEMO_RUN_ID))
  );
}

/** The run the operator CLIs act on by default: the `@last-run` fan's canonical run dir
 * (exactly what run:smoke last wrote), falling back to the newest manifest so
 * the CLI stays usable before/independently of the handoff links. Null when
 * no run exists. A fan that resolves to the throwaway fail-demo run is
 * ignored — a stale handoff must never hand the implicit default to the red
 * demo — and manifest resolution decides instead. */
export function resolveLatestRun(corpusDir: string): string | null {
  const viaFan = resolveFan(corpusDir, LAST_RUN);
  const fanRun = viaFan !== null ? basename(viaFan) : null;
  if (fanRun !== null && fanRun !== FAIL_DEMO_RUN_ID) {
    return fanRun;
  }
  return newestManifestRun(corpusDir);
}
