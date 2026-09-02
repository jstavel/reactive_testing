---
title: 'Split the pipeline diagram into per-phase diagrams'
type: 'chore'
created: '2026-09-02'
status: 'done'
route: 'one-shot'
---

# Split the pipeline diagram into per-phase diagrams

## Intent

**Problem:** The single `## The pipeline` Mermaid flowchart in `docs/architecture.md` was too large to display comfortably on GitHub.

**Approach:** Replace it with four smaller diagrams — one per stage (authoring, execution, verification) plus the repro utility — each restating its handoff node, keeping the section's prose intact.

## Suggested Review Order

**The split section**

- The stage sub-headings and the intro line that replaced the single oversized flowchart — check the section reads naturally top-down and no stage was dropped.
  [`architecture.md:101`](../../docs/architecture.md#L101)

- Phase 2 — the corrected edges: the model feeds the orchestrator only through the modelVersion gate, the action-map and collectors are both invoked by the orchestrator (no `action-map → collectors` edge), and evidence lands at `corpus/{kind}/{runId}/`.
  [`architecture.md:115`](../../docs/architecture.md#L115)

- Phases 1, 3 and the utility diagram — each renders standalone and names only real components (model → plan; corpus → validators → reporter → human; model → repro-generator).
  [`architecture.md:107`](../../docs/architecture.md#L107)

- The "One recorded run funds N validations" note still closes the section unchanged.
  [`architecture.md:145`](../../docs/architecture.md#L145)
