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

**Run-protocol precondition (Trade / Order Book):** before a smoke run that
includes the Order Book scenario, ensure the **Order Book** tab is present in
the Favorites bar on the Trade page. The "+"-add action is non-idempotent (it
creates the tab only when absent) and is excluded from plan steps. Add the tab
manually via the "+" button, then re-run. A scenario whose precondition is
violated fails fast with an actionable message — it never silently passes.

To re-run only selected scenarios, pass their exact ids after npm's `--` forwarding separator:

```bash
npm run run:smoke -- clicking-earn-navigates-to-the-standalone-earn-page pressing-escape-closes-the-portfolio-summary-dialog
```

The runner executes selected scenarios in plan order, deduplicates repeated ids, and
fails before connecting to CDP when an id is unknown (the error lists every valid id).
Without ids, the full plan runs as before. Exit-code semantics are unchanged.

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

> **The plan-version guard (authoritative):** the manifest also carries
> `planModelVersion` — the model hash the executed plan held when the run was
> recorded. The guard exists because the offline CLIs interpret a recording
> against the *current* plan: when the model grows (new scenarios, reordered
> steps), step-indexed evidence and per-contract validation silently misalign
> against stale recordings. `validate:smoke`/`report:smoke` therefore compare
> the recorded version against the current plan's after run resolution and
> before any validation or report write:
>
> - **MATCH** (equal) — validate/report behave exactly as always (outcome by
>   evidence);
> - **MISMATCH** (recorded ≠ current) — exit `1`: "model changed since
>   recording (… ≠ …) — re-record the run (run:smoke)";
> - **LEGACY** (manifest predates the field, or it is blank) — exit `1`:
>   "run predates the plan-version guard (no planModelVersion in the
>   manifest) — re-record the run (run:smoke)".
>
> The remedy for both refusals is the same: **re-record with §1** — there is
> no warn-and-continue, and a refused report writes nothing. Local runs
> recorded **before** this guard was introduced are all LEGACY and must be
> re-recorded once before the offline CLIs accept them.
>
> **Legacy corpora caveat:** the runs currently present in a local `corpus/`
> predate the per-step pre-snapshot layout, so re-validating *them* reports
> `missing snapshot evidence` for every precondition. A run recorded with the
> current orchestrator (§1) carries `{i}.pre.json` per step and re-validates
> cleanly — pinned by `orchestrator/offline-roundtrip.test.ts`.

## 3. Verify offline — no browser needed

Recording and verifying are separate. Once a run exists you can re-validate it
again and again, add new validators, and render reports — **with the browser
closed** (pure TypeScript over the corpus).

Validate the **latest recorded run** — resolved from the `@last-run` handoff
fan (exactly what §1 last wrote), falling back to the newest
`run-manifest.json` when the fan is absent:

```bash
npm run validate:smoke
```

Validate one **specific run** by passing its run id after npm's `--` forwarding
separator:

```bash
npm run validate:smoke -- 353dbf5a-ee9c-47a9-a982-3e373a6f9516
```

Validate only **selected contracts** by appending contract ids after the run id
(handy right after you added validators for one contract; repeated ids are
deduplicated):

```bash
npm run validate:smoke -- 353dbf5a-ee9c-47a9-a982-3e373a6f9516 filterHistoryByAsset
```

You see, per check (sample abridged):

```
[PASS] clickHistoryMenuMain
[FAIL] filterHistoryByAsset — [precondition] state-is "historyMain" but snapshot stateId is "homePage"
1/2 checks passed in 353dbf5a-ee9c-47a9-a982-3e373a6f9516
```

- Exit code `0` — every check passed.
- Exit code `1` — **any** check failed (each failure prints its details), a
  selected run yielded **no checks at all** (unreadable manifest or a plan with
  no steps — never a pass), the runId is unknown, no run is recorded yet, the
  **plan-version guard refused the run** (one-way pointer: see §2's
  authoritative plan-version-guard note), or the usage was wrong.
  An unknown contract id is also an error (it would
  silently validate nothing) — the message names every valid contract id.

The CLI is print-only: it reads `corpus/` and `model/`, never mutates the
corpus, and never touches a browser. Its scope is the smoke plan's **step
contracts** — one validator per recorded step. The standing cross-view
invariants are a separate runner (§5). `runValidatorsOffline` remains the
library API when you need the `ValidationResult`s programmatically — one per
step + validator: `{ contractId, passed, details?, corpusRefs }`.

> What to expect today: all declared predicates (`state-is`, `url-is`,
> `view-selected`, `dialog-open`, `dialog-closed`) are evaluatable, and the
> checks that assert them pass on a freshly recorded corpus (`toggleEyeIcon`
> asserts only its `dialog-open` precondition — its postconditions are
> intentionally empty). On a **legacy** corpus (see the §2 caveat) every
> precondition reports `missing snapshot evidence` — record a fresh run with
> §1 instead.

Derived reports (the `failure.feature` gherkin, adjudication records) are a
separate step over the same results — see §4.

### The committed sample fixture — validate and report with zero recording

`corpus/example/` is a committed, all-passing **mock** corpus (no real account
data, no screenshots/network in v1): a run manifest, 18 pre/post snapshots +
18 probe batches produced by the deterministic sample generator, plus its
`report.html`/`report.json`. It is the only git-tracked subtree under
`corpus/` — real recorded runs stay ignored.

Both offline CLIs accept `--corpus-dir <path>` (precedence: flag >
`CORPUS_DIR` env > the `corpus` default), so CI and readers target the
fixture explicitly without touching local recorded runs. The examples pass
the explicit runId (`example`) so a local `@last-run` fan can never redirect
them: without a runId, the newest recorded run is used — the committed
fixture only when no real run exists on the machine.

```bash
npm run validate:smoke -- example --corpus-dir corpus   # 18/18 checks passed in example
npm run report:smoke   -- example --corpus-dir corpus   # 14/14 scenarios + both reports in corpus/example/
```

Regenerate the fixture (and its reports) with the sample generator — two runs
are byte-identical, and the generator self-checks the freshly written fixture
through the real offline pipeline, exiting 1 with the failing check detail on
any violation (never a silent pass):

```bash
npm run generate:sample              # writes corpus/example + evidence + reports
npm run generate:sample -- /tmp/x    # optional corpus root (e.g. a CI temp dir)
```

### The fail-demo red report — a one-off PNG (dev-only)

`npm run generate:sample -- --fail` mints the throwaway red demo into the
gitignored `corpus/fail-demo` subtrees — the same deterministic recipe with
exactly one hand-placed defect (17/18 checks, 13/14 scenarios). The CI gate
(§7) asserts it stays untracked — never commit anything under
`corpus/fail-demo/`, including after a regeneration. The README's
[Error report showcase](../README.md#error-report-showcase) embeds a PNG of it,
produced once by hand with the dev-only screenshot tool. Both commands run from
the repository root (the paths are cwd-relative), and the first use of
`screenshot:report` needs the repo's Playwright chromium installed
(`npx playwright install chromium`):

```bash
npm run generate:sample -- --fail
npm run screenshot:report corpus/fail-demo/report.html docs/report-failure.png
```

`screenshot:report` takes exactly two positional arguments — the report `.html`
to render and the PNG path to write (its parent directory is created when
missing) — renders it in headless chromium over a local `file://` URL, and
writes a `fullPage` screenshot. Anything else exits `1` with a usage or error
message, and no PNG is produced on any error path: missing or extra arguments,
a `-`-prefixed flag, a nonexistent report path, or a PNG path that is an
existing directory. (Argument validation may create the output directory for
valid arguments whose render later fails — the PNG itself appears only on
success.) It is a manual aid, not a pipeline step — no CI job runs it, and the
validators and report CLIs never launch a browser (§3). The output is a
rendered snapshot, allowed to differ between runs and machines — if you
regenerate `docs/report-failure.png`, re-review it before committing.

## 4. Adjudicate a failure (spec drift vs app bug)

Every failing check is a fork — one of two things is true. Deciding which one
is the human's core responsibility.

```mermaid
flowchart LR
    F["failure.feature"] --> Q{"Is the spec<br/>(model) wrong?"}
    Q -->|Yes| S["SPEC DRIFT<br/>— model is stale"]
    Q -->|No| B["APP BUG<br/>— product is broken"]
    S --> A["1. Record spec-drift decision<br/>2. Human fixes model<br/>3. Re-validate against recorded corpus"]
    B --> C["1. Record app-bug decision<br/>2. File bug report<br/>3. Re-run after fix"]
```

### Render failure.feature

The failing checks render as a human-reviewable feature file — a derived
artifact, never the source of truth. Copy the run to a throwaway dir first, so
the report never pollutes the recorded corpus:

```ts
import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { emitFailureGherkin } from "./reporter/failure-gherkin.js";
import { smokeTestPlan } from "./model/smoke.test-plan.js";
import { runValidatorsOffline } from "./validators/offline-runner.js";

const runId = "<the run you validated in §3>";
const results = runValidatorsOffline("corpus", runId, smokeTestPlan);

// Work on a throwaway copy so reports never pollute the recorded run.
const scratch = mkdtempSync(join(tmpdir(), "reactive-verify-"));
cpSync(join("corpus", runId), join(scratch, runId), { recursive: true });

const written = emitFailureGherkin({ corpusDir: scratch, runId, plan: smokeTestPlan, results });
if (written.length) {
  console.log(`failures rendered → ${join(scratch, written[0])}`);
}
```

`emitFailureGherkin` writes one `Scenario: contract "…" was violated` per
failure — the input to the adjudication fork below.

### Spec drift — the model is stale

The application changed intentionally (new behaviour, renamed UI element, removed
feature), and the model has not caught up. The model — not the app — is wrong.

**What to do:**

1. Record a `spec-drift` decision with the `proposal` field (the model change
   the human approves).
2. Update the model — edit `model/fsm.ts`, `model/contracts.ts`, or
   `model/schemas.ts`.
3. Re-validate against the **same recorded corpus** (no fresh browser session
   needed — state reuse in action).
4. Regenerate the smoke plan.

### App bug — the product is broken

The model correctly describes what the app should do, but the app does not
match. The product — not the model — is wrong.

**What to do:**

1. Record an `app-bug` decision with a `bugReportRef` pointing to the issue.
2. File a bug report with the developer team.
3. The testware stays as-is — it correctly captures the expected behaviour.
   After the bug is fixed, re-run against a fresh corpus.

### Recording the decision

Build on the §3 results — copy the run to a throwaway dir first, so the derived
`adjudication.json` never pollutes the recorded corpus — and extend:

```ts
import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { emitAdjudicationRecord } from "./reporter/adjudication.js";
import { smokeTestPlan } from "./model/smoke.test-plan.js";
import { runValidatorsOffline } from "./validators/offline-runner.js";

const runId = "<the run you validated in §3>";
const results = runValidatorsOffline("corpus", runId, smokeTestPlan);

// Work on a throwaway copy so reports never pollute the recorded run.
const scratch = mkdtempSync(join(tmpdir(), "reactive-verify-"));
cpSync(join("corpus", runId), join(scratch, runId), { recursive: true });

// Spec drift — the model needs updating:
emitAdjudicationRecord({
  corpusDir: scratch,
  runId,
  plan: smokeTestPlan,
  results,
  decision: {
    decision: "spec-drift",
    proposal: "clickNotificationsMenu: postcondition stateId should be "notificationsPage" (was renamed from "notifications")",
  },
  approvedBy: "Jan Stavel",
  approvedAt: "2026-09-02T00:00:00.000Z",
});

// App bug — the application is wrong:
emitAdjudicationRecord({
  corpusDir: scratch,
  runId,
  plan: smokeTestPlan,
  results,
  decision: { decision: "app-bug", bugReportRef: "https://github.com/jstavel/reactive-testing/issues/1" },
  approvedBy: "Jan Stavel",
  approvedAt: "2026-09-02T00:00:00.000Z",
});
```

Either call writes `adjudication.json` into the run folder. The repo **never**
edits the model automatically — the decision is recorded as evidence, and the
human performs the model change separately.

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

const runId = "<the run you validated in §3>";
const results = runCrossViewInvariants("corpus", runId, smokeTestPlan); // read-only
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

### CI & GitHub Pages

The pipeline lives in
[.github/workflows/ci.yml](../.github/workflows/ci.yml) and runs entirely
offline — no browser, no CDP, no Playwright; `npm ci` is the only network
step. The `ci` job gates every push to `main` and every pull request:

1. **Quality gates** — `npm run typecheck` and `npm test` (the gates above).
2. **Fixture determinism (lockstep) gate** — `npm run generate:sample`
   regenerates the committed fixture in place, then the tree must be
   provably unchanged: `git diff --exit-code -- corpus/example corpus/snapshots/example corpus/probes/example`
   empty, the run's `run-manifest.json` and both reports present, and
   `git status --porcelain` over the same pathspecs empty (catches
   deleted-from-HEAD or newly-added outputs the diff cannot see) — re-asserted
   again after the reporter rewrites the reports (catches reporter drift). Any
   drift (a model or recipe change without regenerating and committing the
   fixture) fails the job red, and regenerating + committing the fixture is
   the only way through.
3. **Verify-on-fixture (green-only)** — over the committed fixture only:
   `npm run validate:smoke -- example --corpus-dir corpus` (18/18 checks,
   exit 0) and `npm run report:smoke -- example --corpus-dir corpus` (14/14
   scenarios plus both reports, exit 0).
4. **Fail-demo surface gate (green-only)** — `npm run generate:sample -- --fail`
   writes the throwaway red demo (the reserved runId `fail-demo` — the same
   deterministic recipe with exactly one hand-placed defect, 17/18 checks and
   13/14 scenarios red) into the gitignored `corpus/fail-demo` subtrees, then
   the job asserts all three fail-demo **subtree roots**
   (`corpus/fail-demo`, `corpus/snapshots/fail-demo`, `corpus/probes/fail-demo`)
   are gitignored (`git check-ignore`), that `git ls-files` over the roots is
   empty (no failing evidence can already be tracked), that an anchored
   `git status --porcelain` over the roots is empty, and that no `.gitignore`
   `!`-negation rule re-includes `fail-demo` — any violation fails the job
   red. The demo can never become committable or publishable, and since it is
   generated and thrown away inside the job itself, no CI step ever turns red
   because of it.

On green, a second `pages` job — only for pushes to `main` (or a manual
**Run workflow** dispatch on `main`, the way you redo the deploy right after
enabling Pages), never for pull requests, and only after `ci` succeeded —
stages the committed sample fixture into `_site/corpus/…` (exactly
`corpus/example/`, `corpus/snapshots/example/`, and `corpus/probes/example/`,
mirroring the repo layout 1:1; `fail-demo` is never staged), adds a minimal
root `index.html` redirecting to the sample report so the site root is not a
404, downloads the `ci` job's `tests-summary` artifact as `_site/tests.json`
(guarded to be present), and deploys through the official
`actions/upload-pages-artifact` + `actions/deploy-pages`. It then curls the
deployed `report.json` and asserts its `report.v1` schema itself, and curls the
deployed `tests.json` and asserts `{passed, total}` are numbers with
`passed == total` — "report.json and tests.json live at the Pages URL" is
verified by the job, not by hand. Consecutive deploys queue (never cancel an
in-flight deploy). The `tests-summary` artifact is retained for **one day** —
it is only needed by the same run's `pages` job — so re-running *only* the
`pages` job of a run older than that fails at the download step; a fresh main
push (or a manual **Run workflow** dispatch on `main`) regenerates the feed and
redeploys everything.

**One-time settings (both manual):** repo **Settings → Pages → Build and
deployment → Source: GitHub Actions** — the workflow cannot flip this itself;
without it the `pages` job fails at the deploy step (the repo is public, so
Pages is available as soon as the source is set). And the `ci` job only
actually *gates* pushes and pull requests once branch protection (repo
**Settings → Branches**) marks it a required status check.

**Deployed URL shape** — the Pages site mirrors the repo layout, so relative
evidence links stay valid and URLs stay stable for external consumers:

- Sample report — `https://jstavel.github.io/reactive_testing/corpus/example/report.html`
- Machine-readable index — `https://jstavel.github.io/reactive_testing/corpus/example/report.json`
  (asserted `report.v1` by the deploy's own curl+jq check)
- Badge feed — `https://jstavel.github.io/reactive_testing/tests.json`
  (`{"passed":N,"total":M}`). Generated on every main push by the `ci` job:
  `npx vitest run --reporter=json --outputFile=vitest-summary.json`, then
  `npx tsx bin/tests-summary.ts vitest-summary.json tests.json` — the script
  exits 1 without writing anything unless both counts are present, finite
  non-negative integers, and `passed <= total`, so the feed can never go stale
  or fabricated. The README carries **one** dynamic "tests passed" badge that
  reads `passed` from this URL (old behavior: two dynamic badges read
  `summary.passed` / `summary.total` from `report.json` — the vitest suite,
  not the fixture's 14-scenario count, is what a "tests passed" label owes the
  reader). Before the first successful main-push deploy the badge renders
  shields's red "resource not found" state — expected and documented.
  shields.io caches badge responses briefly, so right after a deploy the badge
  may still show the previous count for a few minutes; the deployed
  `tests.json` is the source of truth — open the URL to read the current
  numbers.
- Evidence siblings — `…/corpus/snapshots/example/…` and `…/corpus/probes/example/…`

The URLs and badge URLs above embed the repo name `jstavel/reactive_testing` —
renaming the repository breaks the badges and live links until they are updated
(the tests-badge URL in particular embeds `reactive_testing` twice: in the
shields `url=` parameter and in the badge's link target).

## 8. Authoring — growing the model

The model is deliberately small (one read-only critical path). Growing it is an
**authoring** activity driven by AI-assisted BMad agents, following the same
pipeline that built the existing four epics.

### The authoring loop

```
Gherkin feature (business intent)
  → FSM state + contract (model/)
    → Action locator (action-map.ts)
      → Validator (if new predicate needed)
        → Regenerated smoke plan
```

### Step by step

1. **Write a Gherkin feature** in `features/` — captures the business intent,
   not the implementation.
2. **Add the FSM state** in `model/fsm.ts` — one entry in `states[]`, one
   entry in `transitions[]`.
3. **Declare the contract** in `model/contracts.ts` — typed pre/postconditions
   using the closed predicate vocabulary.
4. **Implement the action** in `orchestrator/action-map.ts` — the real
   Playwright locator. This is the only place locators live; changing a locator
   never bumps the model version.
5. **Add validators** (optional) — if the existing predicate interpreters
   (`state-is`, `url-is`, `view-selected`) do not cover what you need, write a
   pure function in `validators/` and register it in `validator-map.ts`.
6. **Regenerate the smoke plan** — `model/smoke.test-plan.ts` is derived from
   the model. Never hand-edit it. Regeneration is an AI-assisted step.

### Concrete example

See [docs/authoring-example.md](authoring-example.md) for a complete walkthrough
that adds a hypothetical Notifications screen — real code, every step.

### Quality gates after authoring

```bash
npm run typecheck          # types are the contract — must pass
npm test                   # all offline tests pass, including model-version guard
npm run run:smoke          # record a fresh corpus
# then verify offline (see §3)
```

The model-version guard test (`model/model-version.test.ts`) fails CI if you
edit a model file and forget to regenerate the plan.

**Re-record after any model-file edit (coupling):** because the model hash
covers the full text of the hashed model files (a comment-only edit re-hashes
too), ANY model-file edit makes previously recorded local runs refused by the
plan-version guard (§2) — re-record them with `run:smoke` before
`validate:smoke`/`report:smoke` accept them again.
