- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-scaffold-the-executable-model-zod-type-safety-gate.md`
  summary: Tighten corpus Zod validation (datetime/method/status/url/min-length/modelVersion-SHA256) in Epic 2 when collectors own the final field-level contract.
  evidence: Review found corpus schemas are minimal (plain z.string()/z.number()) per the spec's design note; Epic 2 collectors must enforce the documented field semantics.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-scaffold-the-executable-model-zod-type-safety-gate.md`
  summary: Add FSM model referential integrity and shape refinements (URL discriminator, state/step linkage, contract-state scoping, typed conditions, action result type) in Story 1.2 seed + Epic 2/3.
  evidence: Review found fsm.ts/contracts.ts declare types only (as specced); the seed (Story 1.2) and collectors/validators must add integrity validation and the fields needed for navigation/correlation.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-scaffold-the-executable-model-zod-type-safety-gate.md`
  summary: Add the AD-15 run-manifest.json shape to schemas.ts in Epic 2.
  evidence: Review noted run-manifest (run-id, timestamp, file list) is absent from the schemas.ts "single home"; the orchestrator (Epic 2) needs it.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-scaffold-the-executable-model-zod-type-safety-gate.md`
  summary: Add runtime schema verification (a Node built-in `node --test` smoke exercising the pinned PlanId/ValidationResult shapes) when Story 1.2 first consumes the schemas.
  evidence: Verification-gap review: nothing imports the schemas yet, so `tsc --noEmit` cannot catch schema drift; a dependency-free smoke makes the "machine-verifiable" claim observable once a consumer exists.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-collectors-capture-page-data.md`
  summary: Network collector error-handling robustness (closed page before waitForLoadState, failed/aborted requests not captured, response-handler throw) belongs in Story 2-4 error isolation.
  evidence: Edge-case review of collect-network.ts: error paths are observably real but explicitly out of scope — the spec freezes "Never: error isolation (Story 2-4)".

- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-collectors-capture-page-data.md`
  summary: Screenshot collector fixed-basename overwrite (second capture into the same dir silently replaces the first) resolves in Story 2-3 run/step file naming.
  evidence: Edge-case review of collect-screenshot.ts: a fixed screenshot.png collides per run/step; the frozen spec defers all run/step filename policy to Story 2-3.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-collectors-capture-page-data.md`
  summary: Probe collector fail-fast (one missing selector aborts the batch and discards already-collected ProbeResults) becomes a partial-corpus/error-isolation policy in Story 2-4.
  evidence: Edge-case review of collect-probe.ts: matrix specifies "missing selector → throw with probe name"; partial-result error handling is Story 2-4's concern.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-5-connect-to-an-existing-authenticated-browser-via-cdp.md`
  summary: Specify the real per-contract actions against the live Kraken Pro home page (Epic 2 story 2.6). The action-map's role-based locators (getByRole link /history/i, /portfolio/i, button /eye/i, etc.) return 0 matches on the live DOM, so every smoke-plan scenario FAILs by timeout. This is the AI-assisted authoring step: discover the actual DOM target for each contract transition and write action-map entries that genuinely drive it, making "run a scenario against the live app" demonstrable end-to-end. Drafted as `_bmad-output/implementation-artifacts/spec-2-6-ai-assisted-action-specification.md` (status backlog; registered in epic-2-context.md and sprint-status.yaml under key `2-6-ai-assisted-action-specification`).
  evidence: Story 2.5 scope flag (spec line 88): action compatibility is explicitly out of 2.5 scope and a separate follow-up. Live diagnostic confirmed attach + new tab + confirmed readySelector all work, but the first action `locator.click` times out (0 match) — the connection layer is proven; only the action layer remains.

## Deferred from: code review of spec-2-2-collectors-capture-page-data (2026-08-29)

- `collectNetwork` captures only the networkidle settle-window, so responses that finished during the step action (before the listener attaches) are missed from the corpus; collection-hook placement in the step lifecycle is a design refinement for a later story.
  DECISION (2026-09-01): BUILD — attach the `response`/`requestfailed` listeners before the action and keep them across the settle, so exchanges that finish during the action are captured. See decision 1a.
  RESOLVED (2026-09-01): collector half shipped — `collectors/collect-network.ts` now exposes `startNetworkCapture(page)` returning a two-phase handle (`finish()` bounded networkidle + idempotent detach; `close()` immediate detach; `finish()` short-circuits after `close()`). `collectNetwork` stays a one-shot wrapper. PR #7 (merged, `9b4fcc9`). The orchestrator wiring that attaches the handle before the action is split out below.
- Failed/aborted requests (`requestfailed`) are not captured — re-flagged by this review; already tracked above for Story 2-4 error isolation.
- Probe fail-fast discards already-collected `ProbeResult`s when one selector is missing — re-flagged by this review; already tracked above for Story 2-4 partial-corpus/error-isolation policy.

## Deferred from: code review of story-2-3-scenario-run-produces-a-namespaced-corpus-with-no-embedded-assertions (2026-08-29)

- `run-manifest.json` has no completeness marker, so a run with timeout-skipped scenarios is indistinguishable at the manifest level; add a status/complete field in a later story when validators consume manifests.
- `writeCorpusFile` does not sanitize `kind`/`runId`/`stepIndex`, so a misbehaving caller could escape the corpus root (path traversal); defensive hardening deferred until external callers exist (current call sites are internal and hardcoded).
- Per-step execution is bounded per operation (worst case ~6× stepTimeout: action + settle + 4 collectors), not per whole step; still bounded, so tightening to a strict per-step budget is a deliberate behavior choice for a later story.

## Deferred from: code review of spec-2-4-collector-errors-are-isolated (2026-08-29)

- The network collector's `waitForLoadState("networkidle")` is a single one-shot observation window: requests that start after the idle settle (debounced/lazy SPA traffic) are never captured, and the window closes without an explicit quiet-period guarantee; a capture-hook/window design is a later story.
  DECISION (2026-09-01): BUILD — same as decision 1a; widen the window to span action + settle + idle. The one-shot networkidle window stays for the settle-bound tail but the listener span now covers the action too.
  RESOLVED (2026-09-01): collector half shipped — same as decision 1a via PR #7 (`9b4fcc9`); see the RESOLVED note on line 36.
- Probe collection fail-fasts at the first missing selector, so probes ordered after the failure are never evaluated and their evidence is lost; probe-batch continuation (evaluate all, report the missing set) is a focused future design item.
- `capturedAt` is an unvalidated `z.string()` across ALL corpus schemas (pre-existing since offer/snapshot shapes), so non-ISO timestamps parse; schema-wide ISO validation belongs with the field-level contract tightening already tracked for Epic 2 collectors.
- `probeSchema.name` has no uniqueness enforcement among the probes of a plan, so two probes sharing a name silently both run; duplicate-name detection belongs at plan-config time in a later story.

## Deferred from: plan split of spec-2-6-ai-assisted-action-specification (2026-08-29)

- source_spec: `_bmad-output/implementation-artifacts/spec-2-6-ai-assisted-action-specification.md`
  summary: Portfolio Summary dialog actions (`openPortfolioSummary`, `toggleEyeIcon`, `closePortfolioSummary`) as their own dialog-surface story (own spec, once the navigation story ships).
  evidence: Split during story 2.6 planning by the SCOPE STANDARD token gate ([S]). The nav and dialog surfaces are independently shippable and verifiable against the live app; the dialog contracts carry the later-acceptance risk the Ask-First rules flag (dialog must show value + six sections; the eye control may have no discoverable stable locator → defer with a note rather than guess). Smoke scenarios 8-10 (open-summary, escape-closes, eye-toggle) stay failing until that story.
  DECISION (2026-09-01): BUILD — decision 2a: write and ship the dialog-surface spec now; live-app verification available. Ask-First on the eye control locator stands.

## Deferred from: post-review architecture discussion of spec-3-3 (2026-09-01)

- source_spec: `_bmad-output/implementation-artifacts/spec-3-3-new-validation-rule-without-re-running-the-scenario.md`
  summary: RESOLVED (2026-09-01) — `corpus-loader.ts` + `offline-runner.ts` stay in `validators/`. They are the reusable, browser-free, validator-driving piece. The Orchestrator runs its own configurable runner — incrementally per step or once at the end, by configuration — so the timing/observation strategy is the Orchestrator's concern, never a validator's. Placing the reusable runner in `validators/` keeps it pure and separate from run-mode plumbing; the earlier relocation RFE and the step-complete-validation RFE are both absorbed by this decision.
  evidence: Post-review architecture discussion. AD-4 ("triggers Validators") and AD-8 (Reporter reads the Corpus) frame run-time triggering as the Orchestrator's runner, not as the loader/runner module's obligation. `orchestrator/orchestrator.ts:28` already imports `../validators/dependencies.js`, so the validators→orchestrator cycle that motivated the original placement is uncontested on the other side; nothing imports the loader/runner yet, so the placement is purely a free-standing reusable module.

## Deferred from: code review of spec-3-4-failure-surfaces-as-reviewable-gherkin (2026-09-01)

- source_spec: `_bmad-output/implementation-artifacts/spec-3-4-failure-surfaces-as-reviewable-gherkin.md`
  summary: Same input-trust hardening as tracked under story-2-3 (2026-08-29): `emitFailureGherkin` interpolates an untrusted `runId` into the output path. Defensive narrowing/validation (`runId` and `kind` are trusted only because every call site stems from `randomUUID()` in `startCorpusRun` or hardcoded literals) should land once external callers exist.
  evidence: Blind-hunter review of the 3.4 diff flagged `join(corpusDir, runId, "failure.feature")` with `../` risk. Pre-existing pattern: `orchestrator/corpus.ts:38-40` writes into `{corpusDir}/{kind}/{runId}/` with the same trust model, already deferred under the story-2-3 review.

## Deferred from: code review of spec-3-5-adjudicated-spec-change-only (2026-09-01)

- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-adjudicated-spec-change-only.md`
  summary: Same input-trust hardening as tracked under story-2-3 (2026-08-29) and spec-3-4 (2026-09-01): `emitAdjudicationRecord` interpolates an untrusted `runId` into the output path (`join(corpusDir, runId, "adjudication.json")`). Defensive narrowing should land once external callers exist.
  evidence: Blind-hunter review of the 3.5 diff flagged the same `../` risk the 3.4 review did; runId remains trusted because internal call sites use `randomUUID()` or hardcoded literals.

## Deferred from: plan split of spec-decision-1a-network-capture-window (2026-09-01)

- source_spec: `_bmad-output/implementation-artifacts/spec-decision-1a-network-capture-window.md`
  summary: Orchestrator wiring of the two-phase network capture — start `startNetworkCapture` before the action when `planned.has("network")`, call `capture.finish()` after the settle (isolated, then corpus write), `capture.close()` on the action-failure path — plus the orchestrator wiring tests (mock the imported `startNetworkCapture`; assert start-before-action, finish-after-settle, close-on-failure, no corpus write when start gaps).
  evidence: Split during planning of decision 1a by the SCOPE STANDARD token gate ([S]). The collector two-phase handle is independently shippable and testable at the unit level and is the narrower goal; the orchestrator wiring only becomes observable once a contract declares a network dependency, so it is deferred as its own focused change rather than inflating the current spec.

## Discussion (parked 2026-09-01): how to load app state before verifications use values

- summary: The app holds persistent, cross-page stateful values (portfolio value ~4–5k USD and drifting, eye mask Eye/EyeOff, ledger entries, balances, positions, rewards, …). Testware currently reads whatever a live page happens to show without first loading/establishing that state, so scenarios referencing a value implicitly assume an unguaranteed current value. Open design question: how to load app state before verifications/scenarios consume those values — e.g. state bootstrap/seed (A), or observe-and-anchor the value a scenario actually finds (B). To be discussed; not scoped.
  evidence: User-raised (2026-09-01) while reviewing decision 2a: "app remembers state — even testware should load app state and every scenario should refer to the values." Concrete already-authored-but-unenforced symptom: `features/home-page-portfolio-value.feature` is `@plan:smoke` with a relative scenario "the portfolio value shown in the header matches the portfolio value shown in the body" — no hard-coded figure, but it is absent from `model/smoke.test-plan.ts` because there is no probe that reads the header value and no validator to compare surfaces.

## Deferred from: decision 2a dialog-surface actions (2026-09-01)

- source_spec: `_bmad-output/implementation-artifacts/spec-decision-2a-dialog-surface-actions.md`
  summary: Value-reference and state-loading semantics are OUT of scope for the dialog-locator story — the three dialog actions must stay value-agnostic (no hard-coded USD figure; match the value's shape, not its magnitude or current level) and must not embed or assert a specific portfolio value. The "scenario should refer to the actual value it found" + "value remembered across pages" + "load app state" concerns live entirely in the parked state-loading RFE above.
  evidence: User confirmed (2026-09-01) that hard-coding ~4k USD text in code is wrong because values drift (~$4k now, >$5k yesterday); and that value-loading is a separate discussion. The relative-value pattern already exists verbatim in `features/home-page-portfolio-value.feature`.

## Deferred from: full smoke run during decision 2a (2026-09-01)

- source_spec: `_bmad-output/implementation-artifacts/spec-decision-2a-dialog-surface-actions.md`
  summary: Scenario 7 (`clicking-earn-navigates-to-the-standalone-earn-page`, contract `clickPortfolioMenuEarn`) intermittently times out at its earn-nav step during the full 10-scenario live smoke run. Because the orchestrator runs all scenarios on one shared page with no reset, that late failure leaves the page off-home and the home-only dialog scenarios 8-10 then time out as a cascade (their `openPortfolioSummary` cannot find the home header value button). The earn action is untouched by decision 2a (verified: scenarios 8-10 pass 3/3 in isolation). To be tracked separately from the dialog work.
  evidence: Multiple live smoke runs (2026-09-01) — full run consistently logged `[FAIL] clicking-earn-navigates-to-the-standalone-earn-page … Step timed out after 10000ms`, followed by `[FAIL]` on all dialog scenarios; the same three dialog scenarios passed 3/3 when run in isolation against the same CDP session. The earn action itself and scenario-7 stability were not changed by decision 2a.

## Deferred from: code review of spec-4-1-standalone-repro-script-from-the-model (2026-09-02)

- source_spec: `_bmad-output/implementation-artifacts/spec-4-1-standalone-repro-script-from-the-model.md`
  summary: Generator validates each step against the Model (state exists, contract declared + in the action-map, (state, contract) is a declared transition) but does not require path continuity — the next step's `stateId` is never checked against the previous step's transition target, so a disjoint sequence of individually valid steps still emits a repro that cannot execute as written. Treat as a gap if the spec's "reproduces the failure" is read to include runnability of the whole traced path.
  evidence: Blind-hunter and edge-case-hunter reviews of the 4.1 diff independently flagged the missing adjacency check; the frozen spec's validation rules enumerate per-step checks only, so this is a spec-level addition, not an implementation deviation.

- source_spec: `_bmad-output/implementation-artifacts/spec-4-1-standalone-repro-script-from-the-model.md`
  summary: The emitted script's run-time guard now re-checks states and transitions but not whether the contract is still in `allContracts` — a contract removed from the declaration list but left in the action-map would still run. A real runtime check needs the `allContracts` value, which the frozen spec scopes to "types only" imports, so the import boundary must be renegotiated in spec.
  evidence: Blind-hunter and verification-gap reviews noted the runtime guard covers `homePageModel.states`/`transitions` and `actionMap` presence but not `allContracts` membership; the "model/contracts.ts (types only)" constraint in the story's Boundaries is what blocks the obvious fix.

- source_spec: `_bmad-output/implementation-artifacts/spec-4-1-standalone-repro-script-from-the-model.md`
  summary: No unit test covers the implemented "contract present in allContracts but missing from actionMap" gap rule (repro-generator.ts) because it requires module-stubbing the imported actionMap to fabricate the mismatch; add a `vi.mock`-based negative test if the rule is worth pinning down.
  evidence: Blind-hunter review noted generator line for `(step.contractId in actionMap)` has no negative test; the rule is real but not exercisable with the live actionMap, which today keys every declared contract.

- source_spec: `_bmad-output/implementation-artifacts/spec-4-1-standalone-repro-script-from-the-model.md`
  summary: The acceptance criterion "the emitted script also typechecks" is verified manually at review time (regenerate `scripts/repro-<slug>.ts`, run `npm run typecheck`) but is not an automated test or CI gate; add a test that generates a script and shells out to `tsc --noEmit` on it if a permanent gate is wanted.
  evidence: Verification-gap reviewer found no automated coverage for emitted-script typechecking; `npm run typecheck --noEmit` was run with a regenerated repro present and exited 0 at review time, but nothing enforces it later.

## Deferred from: code review of spec-4-2-cross-view-standing-invariant-validator (2026-09-02)

- source_spec: `_bmad-output/implementation-artifacts/spec-4-2-cross-view-standing-invariant-validator.md`
  summary: Wire the cross-view invariant runner into a verification entry point and add the seed `portfolio-value` probe to the runner's probe config so FR-13 actually executes against real live corpora. Today `runCrossViewInvariants` is never called by `runValidatorsOffline`/`bin/run-smoke.ts` and the seed invariant reads a probe no runner records, so the mechanism is library-only until then.
  evidence: Blind-hunter review of the 4.2 diff noted the validator is not wired into any validation entry point and the seed probe is not collected; the spec froze both as out-of-scope (no caller requested; probe wiring was Ask First, needing a human live run).

- source_spec: `_bmad-output/implementation-artifacts/spec-4-2-cross-view-standing-invariant-validator.md`
  summary: Add an automated integration test proving a cross-view failure renders through `emitFailureGherkin` (the reporter consumes the AD-14 `ValidationResult` unchanged, but nothing pins that a failing invariant lands in `failure.feature`).
  evidence: Blind-hunter review noted tests never exercise the claimed failure-gherkin compatibility; conformance to `validationResultSchema` is asserted but not the reporter round-trip.

## Deferred from: code review of spec-user-documentation-set (2026-09-02)

- source_spec: `_bmad-output/implementation-artifacts/spec-user-documentation-set.md`
  summary: There is no executable way to regenerate the smoke test plan — model/smoke.test-plan.ts's header says "regenerate when model files change" and the docs now tell readers the model is grown via authoring, but no script or npm command re-derives the plan from the @plan:smoke tags (only model/model-version.test.ts detects staleness).
  evidence: Docs review of the new usage set: the plan file header (model/smoke.test-plan.ts:3-4) instructs regeneration that no repo tool performs; grep of package.json and bin/ shows only run-smoke.ts. Pre-existing (plan is AI-authored per AD-4/AD-19); the docs made the gap visible.

## Deferred from: blind-hunter review of one-shot follow-up (Gherkin snapshot) (2026-09-03)

- source_spec: `_bmad-output/implementation-artifacts/spec-followup-gherkin-run-time-snapshot.md`
  summary: extractScenario only matches the "Scenario:" prefix, so "Scenario Outline:"/tagged outline scenarios are silently skipped from the snapshot even though the end-boundary regex already recognises them.
  evidence: Blind-hunter review of reporter/gherkin-snapshot.ts: the block-start scan matches only "Scenario:", while the block-end regex lists Scenario Outline; nothing in the current relations/features uses outlines, so it is a latent gap, not a reached defect.

- source_spec: `_bmad-output/implementation-artifacts/spec-followup-gherkin-run-time-snapshot.md`
  summary: extractScenario drops any "@" tags on the line(s) preceding a scenario, so the snapshot is not fully verbatim for tagged scenarios.
  evidence: Blind-hunter review of reporter/gherkin-snapshot.ts: the scan starts at the Scenario: line and returns only from there; no current feature carries a per-scenario tag, so the fidelity gap is latent.

- source_spec: `_bmad-output/implementation-artifacts/spec-followup-gherkin-run-time-snapshot.md`
  summary: No test covers Scenario Outline/Examples or "@"-tagged scenarios in buildGherkinSnapshot, so the two latent gaps above would go undetected.
  evidence: Blind-hunter review noted the snapshot test suite exercises only plain Scenario: blocks.

- source_spec: `_bmad-output/implementation-artifacts/spec-followup-gherkin-run-time-snapshot.md`
  summary: relation scenarioIds are manually duplicated kebab-case forms of their scenarioTitles with no derivation helper, so editing a title without its id would silently break snapshot lookup (keyed by scenarioId).
  evidence: Blind-hunter review of model/relations.ts: each scenarioId is the kebab-case of scenarioTitle by hand.

- source_spec: `_bmad-output/implementation-artifacts/spec-followup-gherkin-run-time-snapshot.md`
  summary: relationsByScenarioId (and buildGherkinSnapshot's grouping) silently overwrite when a duplicate scenarioId appears in the relation array; no dedup/validation warns.
  evidence: Blind-hunter review of relationsByScenarioId: it builds a Map from an array, so a later duplicate wins with no signal.
