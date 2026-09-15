---
title: 'Cross-view live wiring — retroactive story record'
story_id: '4-3-cross-view-live-wiring'
type: 'feature'
created: '2026-09-15'
status: 'done'
canonical_spec: '_bmad-output/implementation-artifacts/spec-cross-view-live-wiring.md'
implementation_commits:
  - '6543dba'
---

## Intent

Formalize the completed deferred work that wires the portfolio cross-view invariant into live recording and offline smoke verification.

## Acceptance

- Offline validation appends the registered cross-view invariant for known runs.
- Live smoke and action verification configure the `portfolio-value` probe.
- Dependency planning and preflight derive the required probe from the invariant registry.
- The committed fixture validates 19/19 checks.

## Evidence

- Canonical specification: `spec-cross-view-live-wiring.md`
- Implementation: `6543dba`
- Verification: `npm test`, `npm run lint`, and `npm run typecheck` passed on 2026-09-15.

## Deferred follow-ups

Mixed contract/invariant filter coverage and neutral unknown-ID wording remain separate follow-up findings in `deferred-work.md`.
