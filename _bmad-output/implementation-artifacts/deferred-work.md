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
- Failed/aborted requests (`requestfailed`) are not captured — re-flagged by this review; already tracked above for Story 2-4 error isolation.
- Probe fail-fast discards already-collected `ProbeResult`s when one selector is missing — re-flagged by this review; already tracked above for Story 2-4 partial-corpus/error-isolation policy.

## Deferred from: code review of story-2-3-scenario-run-produces-a-namespaced-corpus-with-no-embedded-assertions (2026-08-29)

- `run-manifest.json` has no completeness marker, so a run with timeout-skipped scenarios is indistinguishable at the manifest level; add a status/complete field in a later story when validators consume manifests.
- `writeCorpusFile` does not sanitize `kind`/`runId`/`stepIndex`, so a misbehaving caller could escape the corpus root (path traversal); defensive hardening deferred until external callers exist (current call sites are internal and hardcoded).
- Per-step execution is bounded per operation (worst case ~6× stepTimeout: action + settle + 4 collectors), not per whole step; still bounded, so tightening to a strict per-step budget is a deliberate behavior choice for a later story.

## Deferred from: code review of spec-2-4-collector-errors-are-isolated (2026-08-29)

- The network collector's `waitForLoadState("networkidle")` is a single one-shot observation window: requests that start after the idle settle (debounced/lazy SPA traffic) are never captured, and the window closes without an explicit quiet-period guarantee; a capture-hook/window design is a later story.
- Probe collection fail-fasts at the first missing selector, so probes ordered after the failure are never evaluated and their evidence is lost; probe-batch continuation (evaluate all, report the missing set) is a focused future design item.
- `capturedAt` is an unvalidated `z.string()` across ALL corpus schemas (pre-existing since offer/snapshot shapes), so non-ISO timestamps parse; schema-wide ISO validation belongs with the field-level contract tightening already tracked for Epic 2 collectors.
- `probeSchema.name` has no uniqueness enforcement among the probes of a plan, so two probes sharing a name silently both run; duplicate-name detection belongs at plan-config time in a later story.
