---
title: 'Two-phase network capture handle (collector refactor)'
type: 'refactor' # feature | bugfix | refactor | chore
created: '2026-09-01'
status: 'done' # draft | ready-for-dev | in-progress | in-review | done
review_loop_iteration: 0 # incremented by step-04 before each review loopback
context: ['_bmad-output/implementation-artifacts/deferred-work.md']
baseline_commit: 'cecacea08a0322554caac54f0c31463089f0623d'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The network collector `collectNetwork` (`collectors/collect-network.ts:22-76`) bundles listener-attach, settle-wait, and detach into one post-hoc call, so a future caller that wants to observe the action's traffic (decision 1a) has no way to attach the listeners before traffic happens. The widened-capture-window decision needs a two-phase handle: attach now, read later.

**Approach:** Split `collectNetwork` into `startNetworkCapture(page)` — attaches the `response`/`requestfailed` listeners immediately and returns a handle with `finish(): Promise<NetworkEvent[]>` (bounded networkidle wait, then detach) and `close(): void` (immediate detach, no wait) — then reimplement `collectNetwork` as a thin start→finish wrapper so every existing single-shot caller and test is byte-for-byte unchanged. No orchestrator changes in this spec; the orchestrator wiring is deferred.

## Boundaries & Constraints

**Always:**
- The `seen` Set (first-wins) and the exactly-one status-vs-error invariant from `networkEventSchema` are preserved exactly.
- The bounded networkidle semantics are preserved: `finish()` waits `networkidle` bounded by `NETWORK_CAPTURE_TIMEOUT_MS`; an unsettled load state OR page close returns whatever was observed so far WITHOUT throwing.
- Listener bodies stay quarantined (one throwing response/failure must not lose sibling events).
- `finish()` detaches both listeners exactly once (idempotent); `close()` detaches immediately without waiting and is also idempotent.
- `collectNetwork` stays a `CollectorFn<NetworkEvent[], []>` exported wrapper (start → finish), so the `collectors` registry, the `CollectorFn` type, and every existing single-shot test keep passing unchanged.
- Both `finish()` and `close()` are safe to call after the page is closed.

**Ask First:** none — the two-phase shape is exactly decision 1a's mechanism, and this spec touches no other layer.

**Never:**
- Do not change the bounded-wait, quarantining, dedup, or schema semantics of the collector.
- Do not modify the orchestrator, `corpusDependenciesFor` / `planCollectors`, any contract, or the `collectors` registry wiring. Orchestrator wiring of the handle is split out into a deferred entry.
- Do not add a separate third method beyond `finish`/`close`, and do not surface the handle's internals (events array, `seen`, page) outside the module.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH | start capture, exchange finishes while handle is open | `finish()` returns the exchange (with `status`) | n/a |
| REQUEST_FAILED_IN_WINDOW | an exchange aborts/errors while the handle is open | event has `error`, never `status` | n/a |
| BOTH_FIRE_SAME_REQUEST | one request fires `response` then `requestfailed` | exactly one event (first-wins via `seen`) | n/a |
| PAGE_CLOSES_DURING_FINISH | page closes before `networkidle` | `finish()` returns events observed so far, no throw | catch inside `finish()` |
| CLOSE_THEN_FINISH | caller aborts via `close()`, then calls `finish()` | `close()` detaches immediately; `finish()` returns events captured so far and does not re-await/throw | idempotent detach |
| SINGLE_SHOT_WRAPPER | caller uses `collectNetwork` exactly as today | identical behavior; returned events and detach count unchanged | n/a |

</frozen-after-approval>

## Code Map

- `collectors/collect-network.ts` — the whole file is the change surface. Refactor `collectNetwork` (lines 22-76) into: `startNetworkCapture(page)` (attach only, returns handle) + `NetworkCaptureHandle.finish()` (move the existing bounded `waitForLoadState("networkidle")` + `finally`-detach here) + `NetworkCaptureHandle.close()` (immediate detach). Re-export `collectNetwork` building on the handle.
- `collectors/collect.ts:21` — registry line `network: collectNetwork` (read-only reference): must keep compiling against the retained `CollectorFn` wrapper.
- `model/schemas.ts` — `networkEventSchema` (read-only reference): the exactly-one status-vs-error contract the collector must keep satisfying.
- `collectors/collectors.test.ts` — existing `describe("collectNetwork", …)` (lines 158-414) must keep passing untouched. Add a concurrent `describe("startNetworkCapture", …)` using the existing `createPageMock`/`deferred()` harness, covering the handle surface and edge cases.
- `_bmad-output/implementation-artifacts/deferred-work.md` — decision record 1a and the new deferred orchestrator-wiring entry this spec splits from.

## Tasks & Acceptance

**Execution:**
- [x] `collectors/collect-network.ts` -- refactor into `startNetworkCapture` + `NetworkCaptureHandle` with `finish()`/`close()`, reimplement `collectNetwork` as the wrapper -- the widened window needs attach-before-traffic, which only a two-phase handle can express.
- [x] `collectors/collectors.test.ts` -- add `startNetworkCapture` tests (window, dedup, close-then-finish, page-close return, idempotent detach) -- proves the mechanism independently of any caller.

**Acceptance Criteria:**
- Given a capture handle, when an exchange finishes while it is open, then `finish()` includes that exchange with exactly one of `status`/`error`.
- Given a request that fires both `response` and `requestfailed`, when `finish()` runs, then the returned events contain that request exactly once.
- Given `close()` was called, then both listeners are detached (verified on the page mock) and a later `finish()` returns what was captured so far without throwing or re-awaiting.
- Given the page closes mid-wait, when `finish()` runs, then it returns the events observed so far and does not throw.
- Given an existing single-shot caller, when it calls `collectNetwork`, then behavior is byte-for-byte unchanged (all pre-existing `collectNetwork` tests pass untouched).

## Spec Change Log

## Design Notes

The point of a two-phase handle rather than a "wider timeout" is that the missing exchanges were never-attachable: a single post-hoc call's listeners attach after the traffic. `startNetworkCapture` is fire-immediately; `finish` keeps the existing bounded-wait tail and the detach; `close` exists so a future caller can abandon a capture without stranding listeners (the deferred orchestration work will use it on its action-failure path). Golden path:

```
const capture = await startNetworkCapture(page); // listeners attached NOW
// ... traffic happens while the handle is open ...
const events = await capture.finish();           // bounded networkidle + detach
```

Callers may call `close()` to detach immediately; after `close()`, `finish()` returns the events collected so far without re-awaiting.

## Verification

**Commands:**
- `npm run typecheck` -- expected: exit 0.
- `npm test` -- expected: all files pass (current 14 files / 170 tests + the new two-phase tests).

**Manual checks (if no CLI):** none.

## Suggested Review Order

**Two-phase network capture handle**

- Entry point — `startNetworkCapture` attaches listeners now, returns the `finish()`/`close()` handle.
  [`collect-network.ts:29`](../../collectors/collect-network.ts#L29)

- The short-circuit guard: `finish()` after `close()` returns immediately instead of blocking the networkidle await (AC "no re-await").
  [`collect-network.ts:81`](../../collectors/collect-network.ts#L81)

- Idempotent detach via the `detached` flag — reused by both `finish()` and `close()`, never double-registers.
  [`collect-network.ts:69`](../../collectors/collect-network.ts#L69)

- Thin wrapper preserves `collectNetwork` one-shot behavior and the `CollectorFn` contract; registry unchanged.
  [`collect-network.ts:113`](../../collectors/collect-network.ts#L113)

- New suite in parallel — window capture, first-wins dedup, close-then-finish, page-close resilience.
  [`collectors.test.ts:428`](../../collectors/collectors.test.ts#L428)

- Proves the post-`close()` short-circuit actually skips `waitForLoadState`.
  [`collectors.test.ts:540`](../../collectors/collectors.test.ts#L540)