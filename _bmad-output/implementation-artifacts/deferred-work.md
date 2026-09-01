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
