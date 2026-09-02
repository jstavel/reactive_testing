# Usage — the daily workflow

This is how you actually use the testware, in the order you'll do it.

## 0. Prerequisites

- Node ≥ 24 and npm (`npm ci` in the repo root).
- For **live recording only**: an authenticated Chromium started with a remote
  debugging port. Your browser is **never closed** by the tooling — it only
  connects, drives a tab, and disconnects.

  ```bash
  chromium --remote-debugging-port=9222 --user-data-dir=/tmp/kraken-profile
  ```

  Open **exactly one** window/context, log in to https://pro.kraken.com, and
  leave it open. The orchestrator requires exactly one authenticated context on
  the CDP endpoint.

## 1. Record a corpus (live)

```bash
npm run run:smoke
```

What happens: the orchestrator attaches over CDP
(`http://127.0.0.1:9222`), opens a fresh tab, navigates to
`https://pro.kraken.com/app/home`, waits for the hero value, then walks the
**smoke plan** (`model/smoke.test-plan.ts` — 10 scenarios) driving each step via
the action map and collecting evidence after every step.

You see, per scenario:

```
[PASS] clicking-main-opens-the-history-page-for-the-main-account (…s)
[FAIL] <scenario-id> (…s) — <error, if any>
```

- Exit code `0` — at least one scenario passed. Final line: `Run complete:
  <passed>/<total> scenarios passed in …s`.
- Exit code `1` — **all** scenarios failed (inspect the per-scenario errors and
  the corpus), or **zero** scenarios ran — usually a model-version mismatch: the
  plan's embedded hash no longer matches `model/` (see §7). Note that a run
  where **some** scenarios fail still exits `0` — watch the per-scenario
  `[FAIL]` lines, not just the exit code.

The evidence lands under `corpus/<run-id>/` — a fresh run-id per recording.

## 2. Inspect a recorded run

Corpus layout (see [project-map.md](project-map.md) for the full file map):

```
corpus/                                  # kind dirs are siblings at corpus/ root
  <run-id>/run-manifest.json             # what the run wrote: files[], errors[], failures[], collectors[]
  snapshots/<run-id>/0.json, 0.pre.json, …
  probes/<run-id>/0.json, …
  network/<run-id>/0.json, …
  screenshots/<run-id>/0.png, …
```

A snapshot record is `{ stateId, url, snapshot, capturedAt }`; a probe result is
`{ name, value, capturedAt }` (e.g. `selected-view: "Ledger"`). The manifest
names every file the run wrote, plus any **collector gaps** (`errors`) and
**step failures** (`failures`) — a gap means a collector threw for one step and
its evidence is absent, never a crashed run.

> **Legacy corpora caveat:** the runs currently present in a local `corpus/`
> predate the per-step pre-snapshot layout, so re-validating *them* reports
> `missing snapshot evidence` for every precondition. A run recorded with the
> current orchestrator (§1) carries `{i}.pre.json` per step and re-validates
> cleanly — pinned by `orchestrator/offline-roundtrip.test.ts`.

## 3. Verify offline — no browser needed

Recording and verifying are separate. Once a run exists you can re-validate it
again and again, add new validators, and render reports — **with the browser
closed** (pure TypeScript over the corpus).

Drop this at the repo root as `verify-run.ts` and run `npx tsx verify-run.ts`
(it needs at least one recorded run — record one with §1 first):

```ts
import { mkdtempSync, readdirSync, cpSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { smokeTestPlan } from "./model/smoke.test-plan.js";
import { runValidatorsOffline } from "./validators/offline-runner.js";
import { emitFailureGherkin } from "./reporter/failure-gherkin.js";

// Pick the newest recorded run.
const runId = readdirSync("corpus")
  .filter((e) => !["snapshots", "network", "screenshots", "probes"].includes(e))
  .sort((a, b) =>
    statSync(join("corpus", b, "run-manifest.json")).mtimeMs -
    statSync(join("corpus", a, "run-manifest.json")).mtimeMs,
  )[0];

// Work on a throwaway copy so reports never pollute the recorded run.
const scratch = mkdtempSync(join(tmpdir(), "reactive-verify-"));
cpSync(join("corpus", runId), join(scratch, runId), { recursive: true });

const results = runValidatorsOffline(scratch, runId, smokeTestPlan);
const failed = results.filter((r) => !r.passed);
console.log(`run ${runId}: ${results.length - failed.length}/${results.length} checks passed`);

const written = emitFailureGherkin({ corpusDir: scratch, runId, plan: smokeTestPlan, results });
if (written.length) {
  console.log(`failures rendered → ${written[0]}:`);
  console.log(readFileSync(join(scratch, written[0]), "utf8").slice(0, 400));
}
```

`runValidatorsOffline` returns one `ValidationResult` per step+validator
(`{ contractId, passed, details?, corpusRefs }`). `emitFailureGherkin` writes a
human-reviewable `failure.feature` — a derived artifact, never the source of
truth — one `Scenario: contract "…" was violated` per failure.

> What to expect today: contracts whose predicates are machine-checkable
> (`state-is`, `url-is`, `view-selected`) pass on a freshly recorded run. The
> dialog predicates (`dialog-open` / `dialog-closed`) are declared but **not yet
> evaluatable**, so those contracts currently fail as "not yet evaluatable" —
> a tracked open item.

## 4. Adjudicate a failure (spec drift vs app bug)

A failing check is a fork: either the spec is wrong (**spec drift**) or the app
is wrong (**app bug**). The repo records the human's decision; it never edits
the model automatically. Extend `verify-run.ts`:

```ts
import { emitAdjudicationRecord } from "./reporter/adjudication.js";

emitAdjudicationRecord({
  corpusDir: scratch,
  runId,
  plan: smokeTestPlan,
  results,
  decision: { decision: "app-bug", bugReportRef: "https://github.com/jstavel/reactive-testing/issues/1" },
  approvedBy: "Jan Stavel",
  approvedAt: "2026-09-02T00:00:00.000Z", // your decision time, ISO-8601
});
```

writes `adjudication.json` into the run folder. A `spec-drift` decision instead
carries `proposal` (the human-approved model change, recorded verbatim).

## 5. Standing cross-view invariants

A fact shown on several surfaces is declared **once** in
`validators/cross-view.ts` (the registry) and checked across every surface that
shows it. The seeded invariant is
`current-portfolio-value-agrees-across-surfaces` — it reads a `portfolio-value`
probe on `homePage` and `portfolioSummaryDialog` and fails, naming the offending
view, when the surfaces disagree.

```ts
import { runCrossViewInvariants } from "./validators/cross-view.js";
import { smokeTestPlan } from "./model/smoke.test-plan.js";

const results = runCrossViewInvariants(scratch, runId, smokeTestPlan);
for (const r of results) {
  console.log(`[${r.passed ? "PASS" : "FAIL"}] ${r.contractId}`, r.details ?? "");
}
```

> No runner configures the `portfolio-value` probe yet, so on recorded corpora
> this reports the surfaces as missing evidence (honest: it cannot confirm
> agreement). Wiring the probe into the runner is a tracked open item.

## 6. Standalone repro from the model

A reported bug path (FSM states + contracts) becomes a standalone Playwright
script that drives the path against the live app — no framework runtime, no
validators. The generator validates every step against the model + action map
and **throws a gap** (writes nothing) on an unmodeled path.

```ts
import { writeReproScript } from "./repro/repro-generator.js";

await writeReproScript({
  slug: "portfolio-summary-stuck-open",        // kebab-case names the file
  baseUrl: "https://pro.kraken.com/app/home",
  readySelector: '[data-testid="overview-portfolio-hero-value-text"]',
  settleSelector: '[aria-label="Side navigation"]',
  cdpUrl: "http://127.0.0.1:9222",
  steps: [
    { stateId: "homePage", contractId: "openPortfolioSummary" },
    { stateId: "portfolioSummaryDialog", contractId: "toggleEyeIcon" },
    { stateId: "portfolioSummaryDialog", contractId: "closePortfolioSummary" },
  ],
});
```

Run it with your authenticated browser on `:9222`:

```bash
npx tsx scripts/repro-portfolio-summary-stuck-open.ts
```

The script re-validates each step against the **current** model at run time (a
retired state/transition fails loudly instead of running a stale path), closes
only its own tab, and exits non-zero on failure.

## 7. The quality gates

```bash
npm run typecheck   # tsc --noEmit — types are the contract; must be clean
npm test            # vitest run — all offline (Playwright is mocked), ~2 s
```

The suite includes two cross-layer guards worth knowing:

- `model/model-version.test.ts` — fails if `model/smoke.test-plan.ts` embeds a
  stale model hash (i.e. a model edit that forgot to regenerate the plan).
- `orchestrator/offline-roundtrip.test.ts` — records a corpus through the real
  orchestrator and re-reads it through the real offline loader, proving the
  write→read contract.

## Where the model meets new app areas

The model is deliberately small (one read-only critical path). Growing it is an
**authoring** activity — write/extend a Gherkin feature in `features/`, distill
the new states/contracts into `model/fsm.ts` and `model/contracts.ts`, add any
new shared shapes to `model/schemas.ts`. The derived smoke plan
(`model/smoke.test-plan.ts`) is **not hand-edited**: its header says
"regenerate when model files change", and in this repo that regeneration is an
AI-assisted authoring step (an agent re-derives the plan from the `@plan:smoke`
tags) — there is deliberately no hand-written test script and no plan-editing
CLI. The model-version guard test (§7) is what tells you a plan has gone stale
after a model edit.
