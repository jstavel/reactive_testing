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
