---
title: 'Gherkin run-time snapshot (replace authored gherkin in relation map)'
type: 'refactor'
created: '2026-09-03'
status: 'done'
route: 'one-shot'
---

## Intent

**Problem:** Story 2 embedded each scenario's Gherkin by hand-copying it into the relation map (`model/relations.ts`). The `.feature` files are not part of the model, so this authored copy is redundant and can drift stale as features evolve (CAP-4 staleness).

**Approach:** Remove the authored `gherkin` field from `ScenarioRelation`. Capture the Gherkin at run time instead: `reporter/gherkin-snapshot.ts` provides `buildGherkinSnapshot(featureDir, relations)` that reads the feature files and returns `scenarioId → verbatim source text`, and `renderHtmlReport` accepts an optional `gherkinSource` map to embed in the report, falling back to title-only when absent. The reporter stays pure and deterministic (NFR-1); the snapshot is an input, not a live filesystem read.

## Suggested Review Order

- `model/relations.ts` — confirm `gherkin` field fully removed; ids/states/contracts unchanged and still valid.
- `reporter/gherkin-snapshot.ts` — the new run-time producer: verbatim block extraction, ENOENT vs real-error handling.
- `reporter/html-report.ts` — `gherkinSource` input wiring; title-only fallback; core render still deterministic.
- `reporter/html-report.test.ts` & `reporter/gherkin-snapshot.test.ts` — regression coverage for snapshot embed, fallback, and extraction edge cases.
