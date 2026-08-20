# Review — Version Reality Check (Stack table)

Reviewer role: independent architecture reviewer
Subject: `ARCHITECTURE-SPINE.md` → `## Stack` table
Date: 2026-08-18 (sandbox date)
Method: live verification against the npm registry and nodejs.org release index (no training-data assertions).

## Verdict

All four pinned/stack entries are REAL and CURRENT. Every version the spine names exists as a released version and is a coherent fit for a TypeScript + Playwright spec-first testware project. One version is slightly stale (a few patch releases behind), and one carries a semantic caveat worth recording.

## Per-row findings

### TypeScript — `7.0.2` — VERIFIED (caveat)

- **Real?** Yes. `typescript@7.0.2` is the current `latest` tag on the npm registry (`https://registry.npmjs.org/typescript/latest` returns `"version": "7.0.2"`, tarball `typescript-7.0.2.tgz`).
- **Exists as released?** Yes.
- **Coherent fit?** Yes, but with a caveat. Version 7.x is the Go-native compiler port (`tsgo`), not the classic JavaScript `tsc`. Evidence: the published package is `"type": "module"`, ships `./unstable/` API subpaths, and pulls per-platform native binaries via `optionalDependencies` (`@typescript/typescript-linux-x64@7.0.2`, etc.). This is a major compiler rewrite, not an incremental 5.x/6.x bump. The spine relies on `tsc --noEmit` as its type-safety gate (Consistency Conventions → "Type-safety gate"), so the project should confirm the pinned TS 7 CLI still supports the exact `--noEmit` workflow and any config (`tsconfig.json`) semantics assumed in that gate. Not wrong — but worth a deliberate note so the team knows they are on the native compiler line.
- **Severity:** Low (advisory). Version is real and current; just flag the compiler-line change.

### Node.js — `24.13.1` — VERIFIED (slightly stale)

- **Real?** Yes. `v24.13.1` appears in the official nodejs.org release index (`https://nodejs.org/dist/index.json`): `{"version":"v24.13.1","date":"2026-02-09","lts":"Krypton", ...}`.
- **Exists as released?** Yes. Node 24 is the active LTS line, codename "Krypton".
- **Coherent fit?** Yes — Node 24 LTS is the correct conservative target for testware. Playwright 1.62.1 requires `node >=20` and TypeScript 7.0.2 requires `node >=16.20.0`, so 24.x satisfies both.
- **Staleness note:** As of 2026-08-18, the 24.x line has advanced to `v24.19.0` (2026-08-03); `24.13.1` is ~6 months and ~6 patch releases behind the current 24.x LTS patch. It is NOT the latest patch, but it is a genuine, still-supported LTS release. If the intent was "pin the current LTS patch", bump to `24.19.0`. (There is also a newer non-LTS line, Node 26 / `v26.7.0`; LTS 24 remains the right default for this project.)
- **Severity:** Low. Real and coherent; only marginally stale.

### Playwright — `1.62.1` — VERIFIED (current)

- **Real?** Yes. `playwright@1.62.1` is the current `latest` on the npm registry (`"version": "1.62.1"`, depends on `playwright-core@1.62.1`, `engines.node >=20`).
- **Exists as released?** Yes.
- **Coherent fit?** Yes. Playwright is exactly the right tool for the spine's browser-driving role (AD-4 Orchestrator, AD-5 Collectors, AD-7 Repro Generator). The `playwright` package (library API + `playwright/test`) matches the described usage: driving a page via Playwright/CDP and emitting standalone scripts. No supersession concern.
- **Severity:** None.

### Zod — `not pinned` — VERIFIED (reasonable)

- **Real?** Yes. Zod is real and current: `zod@4.4.3` is the `latest` on npm. Zod v4 is the active major (`./v3` and `./v4` subpaths confirm v4 is the default).
- **Exists as released?** N/A — deliberately unpinned.
- **Coherent fit?** Yes. Zod is the standard choice for schema-first data modeling and `z.infer` type inference, exactly matching the spine's "Schema library — Zod" convention (`schemas.ts` exports Zod schemas; TS types inferred via `z.infer<typeof schema>`).
- **Minor note (not a defect):** "not pinned" is acceptable at spine altitude, but the spine's AD-13/AD-14 depend on stable corpus shapes and `ValidationResult` in `schemas.ts`. Since Zod v4 is the current major (and its API differs from v3), recording a floor (`zod@^4`) rather than a bare "not pinned" would remove ambiguity for the build step. Optional.
- **Severity:** None (advisory at most).

## Cross-cutting observations

1. **Version line coherence is internally consistent.** TypeScript 7.0.2 (node >=16.20), Playwright 1.62.1 (node >=20), and Node 24.13.1 LTS form a mutually compatible set. No pair is in conflict.
2. **No superseded technology detected.** CDP (via Playwright), Zod, and Playwright MCP are all current and appropriate. Nothing in the stack is obsolete or replaced by a current alternative that the spine should switch to.
3. **Recommended follow-up (optional):** pin Node to `24.19.0` (current LTS patch) and consider recording a Zod floor (`^4`); explicitly acknowledge that TypeScript 7.x is the Go-native compiler so the `tsc --noEmit` gate is validated against the native CLI.

## Summary

| Row | Pinned value | Status | Severity |
|---|---|---|---|
| TypeScript | 7.0.2 | Real, current (native compiler line) | Low (advisory) |
| Node.js | 24.13.1 | Real, LTS "Krypton", slightly stale (latest 24.x = 24.19.0) | Low |
| Playwright | 1.62.1 | Real, current latest | None |
| Zod | not pinned | Real (latest 4.4.3); unpinned is acceptable | None (advisory) |
