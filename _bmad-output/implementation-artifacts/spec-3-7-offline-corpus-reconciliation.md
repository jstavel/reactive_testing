---
title: 'Offline corpus reconciliation — retroactive story record'
story_id: '3-7-offline-corpus-reconciliation'
type: 'bugfix'
created: '2026-09-15'
status: 'done'
canonical_spec: '_bmad-output/implementation-artifacts/spec-offline-corpus-reconciliation.md'
implementation_commits:
  - 'd27c3e6'
---

## Intent

Formalize the completed deferred work that prevents offline validation from silently passing fewer checks than the plan declares.

## Acceptance

- Corrupt manifests, malformed plans, corrupt listed evidence, unknown contracts, and throwing validators produce failed results instead of silent skips.
- Unknown runs retain the existing zero-result behavior.
- The committed smoke fixture remains fully validated.

## Evidence

- Canonical specification: `spec-offline-corpus-reconciliation.md`
- Implementation: `d27c3e6`
- Verification: `npm test`, `npm run lint`, and `npm run typecheck` passed on 2026-09-15.

## Deferred follow-ups

Validator-map prototype-property handling and manifest error/failure reporting remain separate follow-up findings in `deferred-work.md`.
