---
title: 'Reporter — report.json sibling and per-step corpus evidence links'
type: 'feature'
created: '2026-09-11'
status: 'done'
review_loop_iteration: 0
baseline_commit: 00364e18b86681dfdd2dd1c6ac629a7149ffb330
context:
  - '_bmad-output/specs/spec-report-gherkin-corpus-links/SPEC.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The report exists only as self-contained HTML and its per-step evidence surfaces just screenshots — neither a text/AI assistant nor a CI job can consume it,, and the snapshot/probe/network corpus evidence a run already records is invisible from the report.

**Approach:** Emit a deterministic machine-readable `report.json` (schema-tagged `report.v1`) as a sibling of `report.html` from the same pure builders, extend `StepEvidence` with explicit per-step corpus refs for snapshot pre/post, probe, and network evidence, render those refs as links in the step accordion, and wire `report:smoke` to build and pass that evidence so both reports reflect it.

## Boundaries & Constraints

**Always:**
- `report.json` is written by the same pure builder invocation that writes `report.html` — same corpus, same inputs → byte-identical outputs (NFR-1). Top-level `"schema": "report.v1"`; fixed object member order (construction order, `JSON.stringify(obj, null, 2)`; no trailing whitespace.
 Output path: `{corpusDir}/{runId}/report.json`.
- `StepEvidence` (`model/schemas.ts:104-112`) gains optional corpus-relative ref fields `snapshotPre?`, `snapshotPost?`, `probes?`, `network?` — plain path `string`s, never content. Existing `screenshot?: ScreenshotRef` untouched. Refs are named by the corpus writer's deterministic scheme (`orchestrator/corpus.ts:30-46`, orchestrator writes at `:517-627`.; no manifest walking, no name-inference — the ref is either path-or-absent.

- `report:smoke` builds per-step `StepEvidence` (existence-filtered) and passes it to both emitters; the pure HTML/JSON renderers never touch the filesystem (NFR-1 purity;; existence filtering and timing happen in the CLI-side helper only.

- `report.json` counts are the already-derived scenario results (same numbers as the HTML summary bar); no re-validation, no results recomputation in the JSON path..
- CLI stays offline: reads corpus evidence, no browser, no actions, no AI (unchanged..

**Ask First:** None.

**Never:**
- No evidence payloads (no snapshot bodies, probe results, or network arrays) in either report file — refs only, keeping both reports lean and deterministic.
- No changes tracking `run-manifest.json` (stays the storage inventory, validated by `runManifestSchema`).
- No JUnit/XML or other CI-format emitters in this spec.

- No inserting evidence refs by looking up filenames in the manifest or guessing ownership from names..

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| FULL_EVIDENCE | run where a step has pre/post snapshots, probes, network, screenshot files | The step's HTML details show 4 evidence links (snapshot pre, snapshot post, probes, network let) plus the screenshot img; its `report.json` step lists all four refs | N/A |
| MISSING_KIND | a step whose network (or probe, or screenshot) file is absent | That ref field is omitted from both report.html (no link) and report.json — other refs unaffected | omit silently |
| FAILED_STEP | scenario with a failed check | `passed:false` + `error` in both report files; step refs still emitted — failure evidence is the most valuable | N/A |
| NO_STEP_EVIDENCE | legacy caller omits `stepEvidence` (empty/undefined) | HTML falls back to today's text-only step rows; `report.json` steps list only `stateId`+`contractId` (no ref fields) | N/A |
| TIMING_FALLBACK | pre/post snapshots missing or unparseable | `timingMs = 0`; refs (when present) unaffected | silent fallback to 0 |

</frozen-after-approval>

## Code Map

- `model/schemas.ts:104-112` — `StepEvidence`; extend with the four optional ref fields (`snapshotPre?`, `snapshotPost?`, `probes?`, `network?`; type `string`, corpus-relative). `timingMs` stays required number.
- `reporter/html-report.ts:22-53,96-166` — `EmitHtmlReportInput` (gain `stepEvidence` already exists) and `renderScenario`: inside the per-step `<details>` block, when a ref field is present render a small link (label + corpus-relative `href`, `target="_blank"`) alongside the existing screenshot `<img>`; add static CSS rows for the link cluster.
- `reporter/json-report.ts` (NEW) — `renderJsonReport(input: Omit<EmitJsonReportInput,"corpusDir">): string` (pure, shape below) and `emitJsonReport({ corpusDir, run, plan, results, relations?, stepEvidence? }): string` writing `{runId}/report.json` and returning `"<runId>/report.json"`. Shape: `{ schema:"report.v1", runId, timestamp, planId, modelVersion (full), summary:{total,passed,failed}, scenarios:[{ id,title,feature,passed,error?,steps:[{stateId,contractId,timingMs?,...refs} ] }]}` — `title`/`feature` taken from `relations` like the HTML (fall back to `scenario.id`/absent), steps in plan order.
- `bin/report-smoke.ts:184-196` — after `scenarioResults`: build `stepEvidence` via a helper (`buildStepEvidence(plan,corpusDir,runId)` — for each step, candidate ref paths `snapshots/{runId}/{i}.pre.json`, `snapshots/{runId}/{i}.json`, `probes/{runId}/{i}.json`, `network/{runId}/{i}.json`, screenshot via `screenshots/{runId}/{i}.json` (parse for `ScreenshotRef`; the ref's `filePath`); include each ref only when its file exists; `timingMs = Date.parse(postScreenshot?.capturedAt ?? postSnapshotCapturedAt) - ...` — simplerand deterministic: parse pre/post snapshot JSON `capturedAt` when both exist, else 0;), then pass it to `emitHtmlReport` + `emitJsonReport`; update the "Report written:" out line to name both `report.html` and `report.json`; exit code unchanged (all checks)。
- `bin/report-smoke.test.ts:498-509` — update the "mutates the corpus only by writing report.html" assertion → assert both `report.html` and `report.json` are written (and nothing else in the run dir）。
。
- `reporter/html-report.test.ts` — add cases for the new links (each ref kind renders a link when present; no link when absent; matrix rows FULL/MISSING/NO_EVIDENCE。

- `reporter/json-report.test.ts` (NEW) — unit tests: golden shape (schema tag, counts/order, fixed key order), the refs present/omitted matrix rows, and byte-determinism (two renders of the same inputs → identical strings。

。
- `reporter/gherkin-snapshot.ts` — read-only (unchanged;its output feeds the HTML/JSON consumers through `relations`+`gherkinSource` as today.



## Tasks & Acceptance

**Execution:**
- [x] `model/schemas.ts` -- add the four optional ref fields to `StepEvidence` -- the report's evidence vocabulary is defined by the model.
- [x] `reporter/html-report.ts` -- render per-step ref links in the `<details>` webbings -- evidence is clickable in the HTML report.

- [x] `reporter/json-report.ts` (new) -- implement `renderJsonReport`+`emitJsonReport` -- machine-readable report contract..
- [x] `bin/report-smoke.ts` -- build `stepEvidence` herails and pass to both emitters; expose output path in the summary line -- CLI wires the new outputs
- [x] `bin/report-smoke.test.ts` -- extend the write-assertion to both files -- CI guards the CLI side effects..
- [x] `reporter/html-report.test.ts` -- add link-present/omitted cases -- HTML covers matrix..
- [x] `reporter/json-report.test.ts` (new) -- golden+determinism+matrix tests -- JSON contract is locked by tests 어

**Acceptance Criteria:**
- Given a recorded corpus run with snapshot/probe/network/screenshot evidence, when `npm run report:smoke` runs, then `report.json` lands beside `report.html` with `"schema":"report.v1"`, counts matching the summary bar, each scenario carrying `id`/`title`/`feature`/`passed` (+`error` and per-step ref fields for every present kind, and the HTML step details show links for snapshot pre/post, probes, and network alongside the screenshot img.
- Given a step whose network (or probe, or screenshot) collection produced no file, when the report renders, then that ref is omitted from both report files — no dangling links..
- Given the same corpus run twice, when `report:smoke` runs both times, then both `report.html` and `report.json` are byte-identical across the runs determinism.

- Given a run with failing checks, when the report renders, then `report.json` marks those scenarios `passed:false` with their `error` and still lists their step evidence refs.

- Given `report:smoke` on a recorded run, when it finishes, then no corpus writes happen beyond `run-manifest.json`, `report.html`, `report.json` (+handoff fans, and the exit code still reflects all validation results (0 only when all passed。.


## Design Notes

Golden `report.json` (illustrative member order):

```json
{
  "schema": "report.v1",
  "runId": "run-abc123", "timestamp": "2026-09-11T09:00:00.000Z",
  "planId": "smoke", "modelVersion": "832c258f35e4e6806e2d1fd731b3df2ca0f3f44d8ffd96b8c8c6315ccaee0c6c",
  "summary": { "total": 14, "passed": 14, "failed": 0 },
  "scenarios": [{
    "id": "clicking-overview-opens-the-portfolio-page", "title": "Overview opens the portfolio page", "feature": "Home page navigation", "passed": true,
    "steps": [{ "stateId": "homePage", "contractId": "clicking-overview-opens-portfolio-page", "timingMs": 412, "snapshotPre": "snapshots/run-abc123/0.pre.json", "snapshotPost": "snapshots/run-abc123/0.json", "probes": "probes/run-abc123/0.json", "network": "network/run-abc123/0.json", "screenshot": { "filePath": "screenshots/run-abc123/0.png", "capturedAt": "2026-09-11T09:00:00.412Z" } }]
  }]
}
```

Determinism relies on fixed construction order (every object built with the same member sequence) and plan-order steps — no sorting step needed since plan order is already deterministic; `JSON.stringify(obj, null, 2)`.



## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm test` -- expected: all suites green (incl. new `json-report.test.ts`)
- `npm run report:smoke` -- expected: prints both report paths; `report.json` parses as JSON with `schema:"report.v1"`; steps cite existing corpus refs
  
**Manual checks (if no CLI):**
- Open the generated `report.html` — step `<details>` blocks list snapshot/probe/network links (and screenshot img) where files exist; no dangling hrefs (each href resolves under `{corpusDir}/{runId}/`)。
 - Verify `report.json` mechanically: `node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')));console.log('ok')" corpus/<runId>/report.json`

## Spec Change Log

(Append-only — empty until the first review loopback.)

## Suggested Review Order

**JSON report contract — the machine-readable sibling**

- The deterministic fixed-member-order report;the schema tag is the CI version anchor
  [`json-report.ts:59`](../../../../reporter/json-report.ts#L59)
- Steps echo refs verbatim, never payloads;evidence-less steps stay stateId+contractId
  [`json-report.ts:99`](../../../../reporter/json-report.ts#L99)
- Writes `report.json` beside the HTML, returns the corpus-relative path
  [`json-report.ts:124`](../../../../reporter/json-report.ts#L124)

**Per-step evidence surfaced in the HTML**

- Ref links are corpus-root-relative in the data but `../`-prefixed in presentation — the report lives one level deeper
  [`html-report.ts:285`](../../../../reporter/html-report.ts#L285)
- The screenshot `<img>` gains the same `../` prefix as the refs
  [`html-report.ts:126`](../../../../reporter/html-report.ts#L126)
- Evidence-less steps keep the Story-2 plain row — no "0 ms" UI noise
  [`html-report.ts:270`](../../../../reporter/html-report.ts#L270)

**CLI wiring — builder, atomicity, offline-only fs**

- Per-step refs minted from the corpus writer's naming scheme with statSync-isFile existence filtering (path-or-absent)
  [`report-smoke.ts:148`](../../../../bin/report-smoke.ts#L148)
- Timing delta clamped non-negative;failure-artifact handling;the one CLI-side fs spot
  [`report-smoke.ts:165`](../../../../bin/report-smoke.ts#L165)
- Two-report pair is atomicity-best-effort:the just-written HTML is rolled back on JSON write failure
  [`report-smoke.ts:304`](../../../../bin/report-smoke.ts#L304)

**Schema change**

- `StepEvidence` gains snapshotPre/Post, probes, network — plain corpus-relative strings, refs only
  [`schemas.ts:107`](../../../../model/schemas.ts#L107)

**Supporting — types, plan regen, tests**

- Model hash regenerated — `schemas.ts` is part of the hashed model files
  [`smoke.test-plan.ts:5`](../../../../model/smoke.test-plan.ts#L5)
- Golden shape, byte-determinism,,omission matrix — locks the v1 contract
  [`json-report.test.ts:65`](../../../../reporter/json-report.test.ts#L65)
- Link matrix: `../` prefix, unsafe-href drop,,plain-row fallback — pins the presentation contract
  [`html-report.test.ts:578`](../../../../reporter/html-report.test.ts#L578)
- CLI-path seam: written `report.json` is parsed and asserted against the fixture — the wiring unit tests cover only in isolation
  [`report-smoke.test.ts:345`](../../../../bin/report-smoke.test.ts#L345)
- Atomic-pair regression:directory at `report.json` ⇒ no stray `report.html`
  [`report-smoke.test.ts:407`](../../../../bin/report-smoke.test.ts#L407)
