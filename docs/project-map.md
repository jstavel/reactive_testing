# Project map — every part of the tree

Verified against the working tree, 2026-09-02. This is the **shipped** layout;
where an earlier design doc named a different structure, this file names what
exists.

```
reactive-testing/
├── package.json              # the three scripts: typecheck · test · run:smoke
├── tsconfig.json             # ES2023 / NodeNext / strict; include "**/*.ts"
├── vitest.config.ts          # vitest over **/*.test.ts
├── AGENTS.md                 # agent operating rules (branch policy, style)
├── README.md                 # this repo's landing page
├── model/                    # THE source of truth (SSOT) — executable spec
│   ├── fsm.ts                #   9 states · 10 transitions · initialState homePage
│   ├── contracts.ts          #   10 contracts: pre/postconditions as typed predicates
│   ├── schemas.ts            #   every shared Zod schema (corpus + plan shapes)
│   ├── model-version.ts      #   SHA-256 of the three model files (AD-17)
│   ├── smoke.test-plan.ts    #   DERIVED — the named smoke plan (10 scenarios)
│   ├── ssot-guard.ts         #   proves a plan resolves against the model
│   └── *.test.ts
├── features/                 # authored Gherkin input (all @plan:smoke)
│   ├── home-page-history-menu.feature
│   ├── home-page-portfolio-menu.feature
│   ├── home-page-portfolio-summary-dialog.feature
│   ├── home-page-portfolio-value.feature
│   ├── home-page-invariants.feature
│   └── home-page-layout-menu.feature
├── orchestrator/             # the deterministic execution half
│   ├── orchestrator.ts       #   runTestPlan: pre-flight + per-step action/settle/collect
│   ├── action-map.ts         #   the canonical contract implementations (locators)
│   ├── browser.ts            #   CDP attach to your authenticated browser
│   ├── corpus.ts             #   run-id + namespaced corpus file writer + manifest
│   └── *.test.ts             #   incl. offline-roundtrip (orchestrator → loader)
├── collectors/               # page collectors (page in → plain data out)
│   ├── collect.ts            #   registry: snapshot · probe · network · screenshot
│   ├── collect-snapshot.ts   #   serialized DOM capture, tagged with the FSM state
│   ├── collect-probe.ts      #   targeted selector → text value(s)
│   ├── collect-network.ts    #   HTTP request/response events
│   └── collect-screenshot.ts #   PNG bytes (persisted by the corpus module)
│                            #   (+ collectors.test.ts)
├── validators/               # the pure offline verification half (imports model/ only)
│   ├── corpus-loader.ts      #   rebuild per-step evidence from a recorded run
│   ├── validator-map.ts      #   per-contract predicate interpreter
│   ├── offline-runner.ts     #   compose loader + validators → ValidationResult[]
│   ├── dependencies.ts       #   a contract's declared collector dependencies
│   ├── reachability.ts       #   blocked-contract detection (BFS from initial state)
│   ├── cross-view.ts         #   standing invariants across surfaces + registry
│   └── *.test.ts
├── reporter/                 # renderers of ValidationResults (imports model/ only)
│   ├── failure-gherkin.ts    #   failing checks → reviewable failure.feature
│   └── adjudication.ts       #   human decision (spec-drift | app-bug) → adjudication.json
│                            #   (+ failure-gherkin.test.ts, adjudication.test.ts)
├── repro/                    # utility: bug path → standalone script
│   └── repro-generator.ts    #   generateReproScript / writeReproScript (→ scripts/)
│                            #   (+ repro-generator.test.ts)
├── bin/                      # CLI entry points — exactly one today
│   └── run-smoke.ts          #   record a corpus from the live browser (CDP)
├── corpus/                   # recorded evidence (GITIGNORED — never committed)
│   ├── <run-id>/run-manifest.json   # files · errors (collector gaps) · failures
│   ├── snapshots/<run-id>/<i>.json   # + <i>.pre.json (per-step before-state)
│   ├── probes/<run-id>/<i>.json
│   ├── network/<run-id>/<i>.json
│   └── screenshots/<run-id>/<i>.png (+ .json ref)
└── scripts/                  # NOT present until a repro is generated
                              # (writeReproScript creates scripts/repro-<slug>.ts)
```

## Corpus layout & evidence shapes

Everything the orchestrator writes is plain data, one format per file (no nested
formats). Paths are `corpus/<kind>/<run-id>/<stem>.<ext>`; the run id is a UUID;
step indices are global across the whole plan.

| Kind | File | Shape |
|------|------|-------|
| snapshot | `{i}.json` / `{i}.pre.json` | `{ stateId, url, snapshot, capturedAt }` |
| probe | `{i}.json` | `ProbeResult[]` → `{ name, value, capturedAt }` |
| network | `{i}.json` | `NetworkEvent[]` → `{ url, method, status \| error, capturedAt }` |
| screenshot | `{i}.png` + `{i}.json` | PNG bytes + `{ filePath, capturedAt }` |
| manifest | `run-manifest.json` | run id + timestamp, files written, collector gaps, step failures, collectors used |

> **Not shown above:** tooling/internal entries at the repo root — `.agents/`,
> `_bmad/`, `_bmad-output/` (BMad planning + per-story specs), `.opencode/`,
> `.gitignore`, and `node_modules/`. `corpus/` exists on disk but is
> **gitignored** (never committed).

## Authored features vs. the smoke plan

All six `features/*.feature` files carry `@plan:smoke`, but only the
navigation + dialog scenarios are derived into `model/smoke.test-plan.ts`
(10 scenarios) today. Three feature files are authored and not yet exercised by
the plan: `home-page-portfolio-value.feature`,
`home-page-invariants.feature`, and `home-page-layout-menu.feature` — a tracked
authoring gap, not a broken generator.

## Naming conventions

| Thing | Convention | Example |
|-------|-----------|---------|
| FSM states | camelCase, matches the screen/dialog | `portfolioSummaryDialog` |
| Contracts | camelCase verb phrase | `clickHistoryMenuMain` |
| Scenarios | kebab-case slug, minted once | `clicking-main-opens-the-history-page…` |
| Test plans | named, from the fixed taxonomy | `smoke` (`smoke.test-plan.ts`) |
| Collectors | `collect-*.ts` | `collect-probe.ts` |
| Reporters/validators | descriptive lowercase | `offline-runner.ts`, `cross-view.ts` |
| Corpus files | `<kind>/<run-id>/<stepIndex>…` | `snapshots/<run>/0.pre.json` |

## Deliberately absent (and where the equivalent lives)

A reader coming from older design docs should not hunt for these — they do not
exist, on purpose or by staging:

| Old-seed name | Status / equivalent today |
|---------------|---------------------------|
| `test-plans/` directory | One generated file: `model/smoke.test-plan.ts` |
| `reports/` directory | Reporters write into `corpus/<run-id>/` (`failure.feature`, `adjudication.json`) |
| `validate-*.ts` validators | Validators use descriptive names in `validators/` |
| xunit / JSON CI reporter | Not built (reporter is library-only) |
| Headless smoke mode | Not built; recording attaches to your authenticated browser over CDP |
| `scripts/repro-*.ts` | Created on demand by `writeReproScript` |
| `docs/` history | The removed `project-context.md` / `constitution.md` hold frozen vision; planning lives under `_bmad-output/` (internal) |
