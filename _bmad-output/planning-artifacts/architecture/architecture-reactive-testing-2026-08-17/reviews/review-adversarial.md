# Adversarial Architecture Review — Reactive Testing Spine

**Method:** construct two future implementers (epic/story authors) that each obey every
AD to the letter, yet build incompatibly. Every such pair is a hole to close.

**Reviewed file:** `ARCHITECTURE-SPINE.md` (status: final, updated 2026-08-18).

**Attack surface (as directed):** AD-19 (named test plans) × AD-4 (Orchestrator reads a
Test Plan) × AD-6 (validator corpus deps) × AD-17 (modelVersion pinning) × AD-13
(schemas.ts ownership), plus the scenario→plan assignment location and the
state-mutation paths that write a plan's `scenarioIds`.

---

## Verdict

**The spine's newest extension (AD-19) is under-specified in exactly three places —
the scenario id space, the plan-membership authority, and the TestPlan data shape —
and each of those is a place where two independent implementers will build
incompatible files. The spine is `final` on paper but not yet single-owner.**

---

## H1 — CRITICAL — Plan membership has two authorities and two writers

### The two places that permit it

- **AD-19:** "The AI routes the scenario into the QE-specified plan **when
  generating/updating the plan**" (offline authoring → the AI writes `scenarioIds`
  into the `.test-plan.ts` file), **and** "Plan membership is **regenerable from
  scenario assignments**" (the `@plan:<id>` tag is itself a source of membership).
- **AD-4:** "The Orchestrator reads a Test Plan (TypeScript file) and executes it" —
  the Orchestrator is the online consumer of membership.

### The two incompatible builds

- **Implementer A (tag is input-only, file is truth).** The AI Agent writes
  `scenarioIds: [...]` into `smoke.test-plan.ts` at authoring time. The Orchestrator
  reads that frozen array and never re-opens `.feature` files. The `@plan:<id>` tag is
  consumed only by the AI during authoring. A QE change to a `@plan` tag after
  generation has no effect until the AI regenerates the plan. *Complies with AD-19
  ("routes … when generating/updating the plan") and AD-4 (Orchestrator reads the plan
  file).*
- **Implementer B (tag is truth, file is derived).** "Regenerable from scenario
  assignments" means the Orchestrator (or a pre-flight step) scans `features/*.feature`
  for `@plan:<id>` and derives membership at run start; the `scenarioIds` array in the
  file is treated as a non-authoritative cache or is omitted entirely. A QE change to a
  `@plan` tag takes effect immediately without touching the plan file. *Complies with
  AD-19 ("regenerable from scenario assignments") and AD-4 (the plan file still exists
  and declares a `planId`).*

### The incompatibility

The same scenario sits in a different plan depending on which implementer built the
Orchestrator and when the AI last ran. A edits the plan file; B overwrites or ignores
those edits. After any post-authoring tag edit the two systems execute different
scenario sets against the same Model, produce different `corpusRefs`, and diverge on
which scenarios fund which validators (AD-18). This is a live, silent split-brain on
what "the smoke plan" contains.

### Smallest fix

Amend AD-19 to name **one** authority and **one** writer. Recommended (least churn,
because AD-4 already routes execution through the plan file):

> **Rule (amended):** `scenarioIds` in the `.test-plan.ts` file is the single
> authority for plan membership. It is written **only** by the AI Agent during
> authoring. The `@plan:<id>` tag is authoring-time input only and is never read at
> execution time. The Orchestrator must not derive or recompute membership from
> `.feature` files. Delete the sentence "Plan membership is regenerable from scenario
> assignments" (or re-scope it to "regenerable by re-running the AI Agent").

---

## H2 — HIGH — The scenario id space is undefined

### The two places that permit it

- **AD-19:** references "the scenario ids it covers" and "a scenario carries … a
  `@plan:<id>` tag" — but never defines what a scenario id **is**.
- **AD-9:** Gherkin is "a file convention, not a processing layer" — scenarios have
  *names* in Gherkin, not ids; no AD assigns them an id. So the id must be minted
  somewhere by someone, and the spine is silent on who and how.

### The two incompatible builds

- **Implementer A (slug, rename-stable).** scenario id = lowercase slug of
  `featureFileName + ":" + scenarioName` (spaces → dashes). Minted deterministically
  from Gherkin content, stable across reordering and line shifts.
- **Implementer B (line-number).** scenario id = `featureFileName:lineNumber` of the
  `Scenario:` keyword. Minted by scanning the file; cheap and unique but changes
  whenever a line is inserted above.

### The incompatibility

Both builds "cover scenarios" and both are "regenerable," but the same scenario yields
two different ids. Every downstream join breaks: cross-plan membership reconciliation,
AD-18's blocked-validator detection (keyed by "does a path reach the state a scenario
needs"), dedup of a scenario across plans, and any `corpusRefs`/report traceability
keyed by scenario. Two teams minting ids two ways means the Model's `scenarioIds`
arrays never match the Gherkin they came from.

### Smallest fix

Add one AD (e.g. **AD-20 — Scenario identity**):

> **Rule:** A scenario id is a deterministic slug derived from `<feature-file-path
> (relative to features/)>::<scenario-name>`, lowercased, non-alphanumerics collapsed to
> `-`. It is **not** derived from line numbers or insertion order. The id is derived
> from the `.feature` file itself (no separate minting step, no Model copy). Every
> `scenarioIds` array and every traceability record uses this exact scheme.

---

## H3 — HIGH — The TestPlan data shape is not exhaustively owned; AD-4 and AD-19 list disjoint fieldsets; AD-4 vs AD-6 disagree on who decides `collection`

### The two places that permit it

- **AD-4:** "The Test Plan declares: **path** (FSM states), **collection** (what data),
  **validators** (what to run)."
- **AD-19:** "Each plan declares `planId`, `modelVersion` (per AD-17), and the scenario
  ids it covers."
- **AD-6:** "The Orchestrator reads these [validator corpus] declarations to plan which
  Collectors to run" — i.e. the collector set is *derivable* from the validators, which
  contradicts AD-4's "collection (what data)" being *declared*.

Neither AD states that its field list is complete or that the two lists are one shape.
No AD names the fields exactly; no AD assigns ownership of the `TestPlan` type to a file.

### The two incompatible builds

- **Implementer A (collection is declared).** Builds `type TestPlan = { planId,
  modelVersion, scenarioIds, path, collection, validators }` with `collection` an
  explicit, authored list of collectors. The Orchestrator runs exactly the declared
  collectors. *Complies with AD-4 and AD-19 literally.*
- **Implementer B (collection is derived).** Builds `type TestPlan = { planId,
  modelVersion, scenarioIds, path, validators }` with **no** `collection` field — the
  Orchestrator derives collectors from each validator's AD-6 declaration. *Complies
  with AD-19 and AD-6 literally, and reads AD-4's "collection" as a derived
  consequence, not a field.*

### The incompatibility

A's Orchestrator fails `tsc` (missing `collection`) against B's plan file, or vice
versa. Even when both fields exist, the two disagree on the *authority*: A always
captures screenshots (declared) while B skips them when no validator needs them
(derived). A collects data B considers wasted; B omits data A's validators expect.
Field names also drift (`path` vs `steps` vs `fsmPath`, `collection` vs `collectors`)
because no AD pins them — so even two "declared-collection" implementers produce
incompatible `*.test-plan.ts` files that the shared Orchestrator cannot import.

### Smallest fix

Add one AD (e.g. **AD-21 — TestPlan shape**) that owns the type exhaustively:

> **Rule:** `schemas.ts` exports the canonical `TestPlan` type (Zod schema, types via
> `z.infer`). The complete field set is `{ planId: PlanId, modelVersion: string,
> scenarioIds: ScenarioId[], path: string[], collection?: string[], validators:
> string[] }` — exact names, no aliases. The Orchestrator imports this type and no
> other. Resolve the AD-4/AD-6 conflict by declaring `collection` **optional and
> derived**: when absent, the Orchestrator computes the collector set from the
> validators' AD-6 corpus dependencies. (Or delete `collection` from AD-4 and make
> derivation the only mechanism.)

---

## H4 — MEDIUM-HIGH — `PlanId` / `TestPlan` type ownership is split: AD-13 closes the corpus list while AD-19 opens schemas.ts to non-corpus types

### The two places that permit it

- **AD-13:** "schemas.ts defines the canonical **corpus** data types … No player may
  introduce a corpus data shape outside schemas.ts." The list
  (SnapshotRecord, NetworkEvent, ProbeResult, ScreenshotRef, ValidationResult) is
  closed and is *corpus-only*.
- **AD-19:** "`PlanId` in schemas.ts is the closed union `"smoke" | "regression" |
  "acceptance"` … typed as `PlanId` in schemas.ts." — directives that `PlanId` (and by
  implication the test-plan metadata types) live in schemas.ts.
- **Structural Seed:** labels `model/schemas.ts` as "TypeScript types and schemas **for
  the corpus**."

### The two incompatible builds

- **Implementer A (schemas.ts is corpus-only).** Reads the structural seed + AD-13 and
  keeps schemas.ts strictly corpus. Defines `PlanId` and `TestPlan` in a new
  `model/test-plan.ts` (or `test-plans/types.ts`). Two `PlanId` literals can then
  exist — one per file — and drift when a fourth plan is added.
- **Implementer B (schemas.ts is all shared types).** Reads AD-19 and puts `PlanId`,
  `ScenarioId`, and `TestPlan` in schemas.ts alongside the corpus types, treating AD-13
  as "corpus shapes are a subset of schemas.ts, not its ceiling."

### The incompatibility

Two owners of the same concept. A's `PlanId` (in `test-plan.ts`) and B's `PlanId` (in
`schemas.ts`) are structurally identical until they aren't — add a plan id or rename a
tag and only one is updated. Import graphs cross: the Orchestrator importing from
schemas.ts vs from `test-plan.ts` means a plan file valid under one team fails `tsc`
under the other. This is the same class of hole AD-13 was written to prevent (drift
between two owners), re-opened by AD-19 not updating AD-13.

### Smallest fix

Amend AD-13 (and the structural-seed comment for `schemas.ts`) to make schemas.ts own
**all** canonical shared types, not just corpus:

> **Rule (amended):** `schemas.ts` defines the canonical shared data types: the corpus
> types (SnapshotRecord, NetworkEvent, ProbeResult, ScreenshotRef, ValidationResult)
> **and** the test-plan metadata types (`PlanId`, `ScenarioId`, `TestPlan`). No player
> may introduce any of these shapes in another file. Update the structural-seed comment
> from "schemas for the corpus" to "canonical schemas and types (corpus + test-plan
> metadata)."

---

## H5 — MEDIUM — `modelVersion` scheme is ambiguous ("commit hash **or** file checksum") and its scope is undefined

### The two places that permit it

- **AD-17:** "must embed the Model version (**commit hash or file checksum**) it was
  derived from. The Orchestrator must verify this matches the current Model." The word
  "or" explicitly licenses two schemes; "the Model" is never scoped to specific files.
- **Consistency Conventions** ("Naming (files)"): plans "each declaring `planId` +
  `modelVersion`" — confirms the field exists but not its content.

### The two incompatible builds

- **Implementer A (repo commit).** `modelVersion = git rev-parse HEAD`. Orchestrator
  verifies `modelVersion === current HEAD`. A plan is "stale" when any file in the repo
  changed — including `.feature` files and unrelated code.
- **Implementer B (Model-file checksum).** `modelVersion = sha256(fsm.ts + contracts.ts
  + schemas.ts)`. Orchestrator verifies against the same checksum. A plan stays "fresh"
  even when a `.feature` or a validator changed.

### The incompatibility

A plan generated by A's agent carries a commit hash; B's Orchestrator computes a file
checksum and always sees a mismatch → aborts with "stale Model" on a plan that is
actually current (or worse, the reverse false-clean). A's "stale" triggers on Gherkin
edits that B's ignores. Two teams pinning the same "modelVersion" two ways means the
AD-17 safety gate fires (or silently fails to fire) depending on who built which half.

### Smallest fix

Amend AD-17 to one deterministic scheme and name the exact input set:

> **Rule (amended):** `modelVersion` is the SHA-256 checksum of the concatenation of
> the committed `model/fsm.ts`, `model/contracts.ts`, and `model/schemas.ts` (stable
> byte order), **not** the repo commit hash. The Orchestrator recomputes this exact
> checksum and aborts on mismatch. Delete "commit hash" from AD-17.

---

## Lower-priority notes (not full holes, but worth a one-liner)

- **`@plan:<id>` "typed as `PlanId` in schemas.ts"** — Gherkin has no types. Who
  validates the tag against the `PlanId` union (AI at authoring vs a loader at run)?
  Same "two authorities" smell as H1; fold its resolution into H1's fix.
- **"path" vs "validators" vs "scenarioIds" nesting** — is the plan a flat set of three
  parallel arrays or a list of per-scenario objects (`{ id, path, collection,
  validators }`)? H3's fixed shape must also state the nesting.
- **AD-18 keying** — "if a validator needs data from a state no existing path reaches"
  presumes a scenario→state→validator join; that join is only well-defined after H2
  (scenario id) and H3 (shape) are fixed. Track AD-18 as a downstream dependent of H2
  and H3.

---

## Fix priority

| # | Severity | Hole | Fix |
|---|----------|------|-----|
| H1 | Critical | Plan membership: two authorities + two writers | Amend AD-19: file is SSOT, AI-only writer, tag is input-only |
| H2 | High | Scenario id space undefined | New AD: deterministic slug scheme, no line numbers |
| H3 | High | TestPlan shape unowned; AD-4 vs AD-19 disjoint; AD-6 vs AD-4 | New AD: exhaustive `TestPlan` type in schemas.ts + resolve `collection` derived vs declared |
| H4 | Med-High | PlanId/TestPlan ownership split (AD-13 corpus-only vs AD-19) | Amend AD-13 + seed comment: schemas.ts owns all shared types |
| H5 | Medium | modelVersion scheme ambiguous | Amend AD-17: SHA-256 of the three Model files, delete "commit hash" |
