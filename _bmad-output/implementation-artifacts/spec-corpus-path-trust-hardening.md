---
title: 'Harden corpus and report output paths against traversal and invalid runIds'
type: 'bugfix'
created: '2026-09-16'
status: 'done'
baseline_commit: '2415a24f4b7032e6436467fa765e5713ea829fb6'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Four output surfaces interpolate caller-supplied identifiers into filesystem paths with no shape guard — `writeCorpusFile` (kind/runId/stem/ext), `emitFailureGherkin` (runId), `emitAdjudicationRecord` (runId), and the HTML report's `<img src>` (screenshot filePath). A misbehaving caller could escape `corpusDir` (path traversal) or emit a non-relative image source. All current call sites are internal (`randomUUID()` runIds, hardcoded kinds, authored plan ids), so the guards are purely defensive.

**Approach:** Add a shared, exported runId/segment guard owned by `orchestrator/corpus.ts` that reuses the canonical `RUN_ID_PATTERN` (handlinks.ts), apply it at every path-building surface before any fs call, and gate the screenshot `<img src>` behind the same safe-rel-path rule the corpus-ref links already use. Pure additive validation — valid inputs behave byte-identically.

## Boundaries & Constraints

**Always:** Guards throw on violation *before* any `mkdir`/`write`. RunId validation uses `RUN_ID_PATTERN` exclusively (single source of truth, imported from `./handlinks.js` — never redefined). `writeCorpusFile` validates `kind`, `stem`, and `ext` as single path segments (no `/` or `\`, not empty, not `.`/`..`) and the runId against the pattern. The three reporters guard runId before building `relPath` or calling `mkdirSync`. The report `<img>` is emitted only when the screenshot `filePath` passes the same safe-rel-path rule corpus-ref links use (`SAFE_HREF_PATTERN` plus no `..` segment); on violation the image frame is omitted — matching the existing `UNSAFE_HREF` link behavior, never a wrong URL. Valid inputs remain byte-identical; no schema or fixture changes.

**Ask First:** Tightening `kind` to an allowlist of corpus kinds (rejected: new kinds would silently fail and force a constant edit); altering how a violation surfaces (throw vs omit is fixed per surface); changing `RUN_ID_PATTERN` itself.

**Never:** No changes to `model/schemas.ts` or the model hash; no silent path normalization (mapping bad input to a safe path instead of throwing); no changes to existing committed fixtures/golden output; no browser or network access; no new runtime dependencies.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| WRITE_HAPPY | kind `snapshots`, UUID runId, stem `0.pre`, ext `json` | Relative path written and recorded in `run.files`, unchanged | N/A |
| WRITE_EVIL_RUNID | runId `../evil` or `run/x` | throws `Invalid runId …` | throw before write |
| WRITE_EVIL_KIND | kind `../evil` or `snapshots/..` | throws invalid-segment | throw before write |
| WRITE_EVIL_STEM | stem `..` or `a/..` | throws invalid-segment | throw before write |
| WRITE_EVIL_EXT | ext `json/..` or `png\..` | throws invalid-segment | throw before write |
| GHERKIN_HAPPY | valid runId, ≥1 failure | `failure.feature` written under `<runId>/`, unchanged | N/A |
| GHERKIN_EVIL | runId `../evil` | throws before `mkdirSync` | throw, no dir outside corpus |
| ADJUDICATION_EVIL | runId `evil/run` | throws before path build | throw, no write |
| REPORT_EVIL_RUNID | runId `../evil` in report emit | throws before `mkdirSync` | throw, no write |
| IMG_SAFE | filePath `screenshots/<uuid>/0.png` | `<img src>` rendered, unchanged | N/A |
| IMG_UNSAFE_SCHEME | filePath `javascript:alert(1).png` | image frame omitted; step row + timing still render | omit, no error |
| IMG_UNSAFE_TRAVERSAL | filePath `../outside.png` or `a/../../b.png` | image frame omitted | omit, no error |

</frozen-after-approval>

## Code Map

- `orchestrator/corpus.ts:30-46` -- `writeCorpusFile`: builds `${kind}/${run.runId}/${name}.${ext}` with **no validation**; `name = stem ?? String(stepIndex)`. Home of the new shared guards.
- `orchestrator/corpus.ts:87-89` -- manifest write: `join(corpusDir, run.runId)` unguarded; guard here too.
- `orchestrator/corpus.ts:96-100` -- `finishRun` downgrades handoff-guard throws to a `console.warn`; the corpus-side guards stay hard throws.
- `orchestrator/handlinks.ts:16` -- `export const RUN_ID_PATTERN = /^[A-Za-z0-9-]+$/` (canonical; imported by bin CLIs already). Reuse, do not redefine.
- `orchestrator/handlinks.ts:55-61` -- `linkRun` guard + error message to mirror in wording.
- `orchestrator/orchestrator.ts:524-759` -- all 10 `writeCorpusFile` call sites: hardcoded literal kinds (`snapshots`/`network`/`screenshots`/`probes`), stems from `corpusStem` (`orchestrator.ts:671-684`), runId from `startCorpusRun()` (`corpus.ts:18-20`, `randomUUID`). None can trip the new guards.
- `reporter/failure-gherkin.ts:58-63` -- `${runId}/failure.feature` + `mkdirSync(join(corpusDir, runId))`; no runId validation.
- `reporter/adjudication.ts:168-173` -- `${input.runId}/adjudication.json` + write; `validateDecision` (63-107) validates decision fields only, not paths.
- `reporter/html-report.ts:70-73` -- report write `${run.runId}/report.html` unguarded.
- `reporter/html-report.ts:118-122` -- `<img src="../${escapeHtml(filePath)}">` — escapeHtml only, no path-shape check.
- `reporter/html-report.ts:268,276-291` -- `SAFE_HREF_PATTERN = /^[A-Za-z0-9_.\-/]+$/` gates corpus-ref `<a>` links (omit on violation). Reference the same rule for the img.
- Test homes: `orchestrator/corpus.test.ts:62` (`writeCorpusFile` describe) and `:355` (`screenshotRefSchema`); `reporter/failure-gherkin.test.ts:55`; `reporter/adjudication.test.ts:65`; `reporter/html-report.test.ts:399` (stepEvidence describe; `EMPTY_FILEPATH` at :462, `UNSAFE_HREF` at :625) — mirror these existing negative-test shapes.
- `orchestrator/handlinks.test.ts:135-142` -- existing evil-runId loop (`["../evil", "run/a", "", "..", "."]`) to mirror for the new guards.

## Tasks & Acceptance

**Execution:**
- [x] `orchestrator/corpus.ts` -- export `assertSafeRunId(runId)` (throw using `RUN_ID_PATTERN`, wording mirroring handlinks) and `assertSafeSegment(label, value)` (no separators, not empty/`.`/`..`); call both inside `writeCorpusFile` and guard the manifest-write runId.
- [x] `reporter/failure-gherkin.ts` -- `assertSafeRunId(runId)` before building `relPath`/`mkdirSync`.
- [x] `reporter/adjudication.ts` -- `assertSafeRunId(input.runId)` before path build.
- [x] `reporter/html-report.ts` -- `assertSafeRunId(run.runId)` on the emit path; gate the `<img>` on `SAFE_HREF_PATTERN.test(filePath) && !filePath.split("/").includes("..")`, omitting the frame on violation.
- [x] `reporter/json-report.ts` -- `assertSafeRunId(run.runId)` on the emit path (report.json sibling of html-report), with mirror negative tests. Discovered and added during review — the Code Map originally missed this surface.
- [x] `orchestrator/corpus.test.ts`, `reporter/failure-gherkin.test.ts`, `reporter/adjudication.test.ts`, `reporter/html-report.test.ts` -- negative tests per I/O matrix (throw, nothing written outside a temp corpusDir; img omitted for scheme/traversal filePaths).
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- add `RESOLVED (2026-09-16)` notes to the four tracked entries (L44/L72/L78/L168) and reconcile the sweep-triage bundle line.

**Acceptance Criteria:**
- Given `writeCorpusFile` with a traversing runId/kind/stem/ext, when it runs against any corpusDir, then it throws and writes nothing outside corpusDir.
- Given `emitFailureGherkin`, `emitAdjudicationRecord`, or the HTML-report emit with a traversing runId, when it runs, then it throws before any fs write.
- Given a screenshot `filePath` containing a scheme/space/quotes/backtick or a `..` segment, when the report renders, then the `<img src>` is omitted while the step row (label/timing) still renders.
- Given only existing valid inputs (UUID runIds, hardcoded kinds, authored stems), when the full suite runs, then every existing test passes unchanged — no fixture or golden-output edits.

## Spec Change Log

## Design Notes

Guard ownership is `orchestrator/corpus.ts` — "corpus path policy lives with the corpus writer" — and it imports the canonical `RUN_ID_PATTERN` from `./handlinks.js` instead of redefining it; the reporters import `assertSafeRunId` from `../orchestrator/corpus.js` (no cycle: corpus.ts imports nothing from reporter/). Throw-on-violation before any fs call mirrors `linkRun` and is safe because every current caller passes `randomUUID()` runIds and hardcoded segments. An allowlist for `kind` was rejected on purpose: a future collector kind would fail-trip the guard until edited, recreating the `HANDOFF_KINDS` drift the ledger already flags. For the img, omission (mirroring `UNSAFE_HREF`) is chosen over throwing — rendering a report must never fail because one evidence path is hostile, and a wrong `<img src>` is worse than a missing one.

The img rule deliberately AVOIDS adopting the absolute-path check from `screenshotRefSchema` (`model/schemas.ts:69-77`): the schema and the read path (`bin/report-smoke.ts readScreenshotRef`) already reject absolute paths for real recorded refs, and the img gate's job is only to keep a hostile ref from becoming a wrong URL — a leading `/` renders a same-corpus `..//abs/x.png`, not an escape. A `..` segment is rejected for the img but allowed by the pre-existing corpus-link rule (`SAFE_HREF_PATTERN` only); unifying link and img rules is tracked in deferred-work.md rather than expanded here. Unit-test runId constants that used `:` (e.g. `2026-09-01T10:00:00Z`) were normalized to pattern-conforming forms (`run-2026-09-01-10-00-00Z`); no committed corpus or golden fixtures were touched — such runIds were never producible by `startCorpusRun`.

## Verification

**Commands:**
- `npm run typecheck` -- expected: exit 0.
- `npm test` -- expected: all suites green (existing 575+ plus the new negative tests, now 620).
- `npm run lint` -- expected: exit 0.

## Suggested Review Order

**Shared path policy (entry point)**

- Entry: one guard owns runId shape and segment safety before any corpus write — read this first for design intent.
  [`corpus.ts:15`](../../orchestrator/corpus.ts#L15)

- `writeCorpusFile` applies runId + kind/stem/ext guards to every corpus artifact write.
  [`corpus.ts:65`](../../orchestrator/corpus.ts#L65)

- `finishRun` guards the manifest write its sibling paths do.
  [`corpus.ts:116`](../../orchestrator/corpus.ts#L116)

**Reporter boundaries**

- Rejects a hostile failure-artifact runId before `mkdirSync`/write.
  [`failure-gherkin.ts:54`](../../reporter/failure-gherkin.ts#L54)

- Rejects a hostile adjudication runId before its run-directory write.
  [`adjudication.ts:145`](../../reporter/adjudication.ts#L145)

- Rejects a hostile report runId before writing report.html.
  [`html-report.ts:70`](../../reporter/html-report.ts#L70)

- Rejects the same runId before writing report.json (found in review — same family).
  [`json-report.ts:127`](../../reporter/json-report.ts#L127)

**Screenshot src safety**

- Omits `<img>` frames whose filePath fails the safe-rel-path rule, keeping timing/step content.
  [`html-report.ts:121`](../../reporter/html-report.ts#L121)

- The gate: `SAFE_HREF_PATTERN` plus a `..`-segment check (links keep their pre-existing rule).
  [`html-report.ts:274`](../../reporter/html-report.ts#L274)

**Regression coverage**

- Direct guard tests (empty/dot/`..`/NUL/non-string) plus the unsafe-segment write loop.
  [`corpus.test.ts:52`](../../orchestrator/corpus.test.ts#L52)

- unsafe-runId loops on all four emitters and the img-omission matrix (scheme/traversal/space/quote/backtick).
  [`json-report.test.ts:283`](../../reporter/json-report.test.ts#L283)
  [`failure-gherkin.test.ts:146`](../../reporter/failure-gherkin.test.ts#L146)
  [`adjudication.test.ts:139`](../../reporter/adjudication.test.ts#L139)
  [`html-report.test.ts:445`](../../reporter/html-report.test.ts#L445)
