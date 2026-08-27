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
