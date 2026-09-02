# Epic 4 Context: Repro Generation & Cross-View Validation

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Automate two offline debugging checks that close the loop on reported and latent bugs. First, a reported bug path (a sequence of FSM states and contracts) is turned into a runnable standalone repro script generated from the Model, so a developer can reproduce the failure without hand-writing it or coupling it to the test framework. Second, a standing cross-view invariant declares one fact once — e.g. current balance or open-order state — and checks that every modeled surface showing that fact agrees over recorded corpora, catching stale-view divergence (the mBank-style desync) purely offline with no live session. Both run against or derive from the Model/corpus as SSOT, never hand-specified.

## Stories

- Story 4.1: Standalone repro script from the model — a reported bug path yields a runnable standalone Playwright script generated from the FSM/contracts.
- Story 4.2: Cross-view standing invariant validator — a fact declared once is checked across every modeled surface, failing with the offending view named.

## Requirements & Constraints

- **Standalone repro (FR-12):** A reported bug path yields a runnable standalone script that reproduces the failure. It must run without the framework's runtime (no Reactive Testing dependency — no Orchestrator or Validator), be generated from the FSM/contracts rather than hand-written, and an unmodeled path must be reported as a gap rather than silently approximated. The emitted script is minimal — restrict it to the traced path and no framework runtime import. It runs against the live app via Playwright over CDP. Supporting a repro does not patch the target app; testware only reports failures.
- **Cross-view invariant (FR-13):** A single rule declares that one fact agrees across every modeled surface that shows it. The invariant is declared once per fact, is checked over recorded corpora (not a live session), fails with the offending view named on divergence, and runs purely over the corpus with no browser access (no-browser requirement; browser may be closed after collection — NFR-1 determinism).
- **Determinism (NFR-1):** Runtime verification is pure TypeScript; verification is runnable with the browser closed. Cross-view validation extends this offline-corpus capability (extends FR-6 — new rules run against previously recorded corpora without re-running a scenario).
- **Agreement semantics (assumption):** A fact may legitimately differ across views in edge cases (e.g. pending vs settled). The cross-view invariant's "agreement" semantics are declared per fact so such a legitimate divergence is not a false positive.
- **Type-safety gate (NFR-2):** `tsc --noEmit` clean is a precondition for generated code; types are the contract. Validators return `ValidationResult` (`contractId`, `passed`, `details?`, `corpusRefs`).
- **Emitted artifacts are English-only; use "shared validator," never "aspect" (NFR-4).**

## Technical Decisions

- **Repro Generator reads the Model (AD-7):** Input is a bug path expressed as FSM states to visit (plus transitions/contracts); output is a simple, readable standalone Playwright script for manual developer validation — no validations, no framework dependency. Written into `scripts/repro-*.ts`.
- **Model is the SSOT (AD-1):** Repro generation reads only the Model (FSM states + transitions). Generated repros and the corpus evidence are derived artifacts, never a truth source.
- **Validators are pure per-contract functions (AD-3):** A cross-view invariant is corpus-in → pass/fail-out, returning a typed `ValidationResult` (AD-14). Cross-view divergence emerges as an implementation concern on top of the shared-validator machinery; it is a cross-state/cross-surface validation built from per-contract pure validators.
- **Validators declare corpus dependencies (AD-6):** A cross-view validator must declare which corpus data (surfaces) it needs so the orchestrator plans only the required collectors.
- **Corpus data shape defined by schemas.ts (AD-13):** Cross-view validators consume the canonical corpus types exported from `schemas.ts`.
- **Stack/conventions:** TypeScript only; Zod for schemas with inferred types (`z.infer`); Playwright for browser driving; validators named `validate-*.ts`; reproducible naming (FSM states camelCase matching screen/dialog names, contracts camelCase verb phrases, scenarios kebab-case slugs minted once).
