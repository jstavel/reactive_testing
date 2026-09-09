# Intent: Corpus identity after a failing test

Source: `.memlog.md` (brainstorm, 2026-09-09). Downstream: turn into a story via bmad-spec / bmad-build.

## Problem

After a smoke-test run fails, the operator must immediately work with the exact corpus that run produced. The runId is an opaque UUID, `run-smoke` prints no runId, and finding the corpus today means guessing by mtime. The corpus is also kind-split (`network/`, `probes/`, `snapshots/`, `screenshots/` as sibling dirs), so one run is a fan of paths, not a single directory.

## Approach

Optimize for direct handoff from `run-smoke` to the exact corpus — not retrospective fuzzy search. The run itself knows the authoritative runId, so it creates/removes stable named symlinks during the run. These symlinks reassemble one run across all kind dirs without collapsing the lake layout.

## Decisions & Constraints

- **MVP scope**: only creating/removing symlink views during a run. Anything else is out of scope.
- **Second-brain querying is deferred**: the broader query/index experience over the corpus is a separate future RFE. **No AI at query time.**
- **Keep UUID runIds**: opaque random ids impose lower cognitive load than human-readable datetimes, which invite parsing. No change to runId format.
- **Keep the kind-split "lake" layout**: kinds stay siblings for cross-run queryability; the per-run manifest is the run-level index. No layout migration.
- **Two stable names, symlink fan**: `@last-run` always points at the latest run's kind dirs; `@last-fail` points at the latest FAILING run and **disappears when a run passes** — it exists only while there is a latest failing run. Each name wires the corresponding per-kind dirs (one run = a fan of kind paths, not a single dir).
- **npm scripts are the operator-facing "UX API"**: run + corpus query scripts, not a bespoke CLI tool.
- **Print, don't cd**: the corpus script only prints/resolves the canonical corpus path for the operator to reuse (cd, editor, report). No side effects beyond printing.

## Intended operator flow

```
npm run smoke                 # run; on completion symlinks @last-run (+ @last-fail on failure) exist
npm run corpus                # prints resolved canonical corpus path(s); operator cds/edits themselves
cd $(npm run --silent corpus) # or open the printed path in an editor
```

## Open Questions (implementer must decide)

1. Exact npm script names for the run and corpus-query scripts.
2. Symlink placement and shape: where `@last-run`/`@last-fail` live (corpus root? repo root?) and whether the fan is one symlink per kind dir or one parent dir containing per-kind symlinks.
3. `@last-fail` mechanics on a passing run: delete the symlink entirely (memlog wording) vs. remove only after confirming no failures; what happens when there has never been a failing run.
4. Relative vs absolute symlink targets (repo portability).
5. Whether the per-run manifest already carries everything needed to resolve the kind paths, or the link creation needs manifest fields added.