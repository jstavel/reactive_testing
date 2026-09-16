---
title: 'Harden offline validator lookup against inherited keys'
type: 'bugfix'
created: '2026-09-16'
status: 'done'
route: 'one-shot'
---

## Intent

**Problem:** `validatorsFor` can return inherited `Object.prototype` values for hand-built contract IDs such as `toString`, causing the offline runner to iterate a non-array and throw instead of reporting an unvalidated gap.

**Approach:** Restrict validator lookup to own properties of the validator map. `Object.hasOwn` is the smallest change because the map is already a plain object and the required behavior is an empty validator gap for unknown or inherited IDs.

## Suggested Review Order

1. [`validators/validator-map.ts`](../../validators/validator-map.ts) — verify own-property lookup returns an empty gap for inherited keys.
2. [`validators/validator-map.test.ts`](../../validators/validator-map.test.ts) — verify the regression case is pinned.
3. [`deferred-work.md`](deferred-work.md) — verify the deferred item is marked resolved with evidence.
