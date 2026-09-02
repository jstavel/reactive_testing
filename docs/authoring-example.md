# Authoring Example: Adding a New Screen

This walkthrough shows how to extend the model with a new screen. It uses a
hypothetical **Notifications** page — a read-only screen reachable from the
home page menu. Every step is real code you would write; the principle applies
to any new state, contract, or invariant.

---

## What we are building

A new FSM state `notifications` reachable from `homePage` via a contract
`clickNotificationsMenu`, plus two validators checking the screen.

| Thing | Value |
|-------|-------|
| FSM state | `notifications` |
| Contract | `clickNotificationsMenu` |
| Gherkin feature | `features/home-page-notifications.feature` |
| Action locator | `page.getByRole("link", { name: /notifications/i })` |
| Validators | `state-is(notifications)`, no console errors |

---

## Step 1 — Write the Gherkin feature

Create `features/home-page-notifications.feature`:

```gherkin
@plan:smoke
Feature: Notifications page

  Background:
    Given uživatel je na Home Page
    And side navigation menu obsahuje "Notifications"

  Scenario: Uživatel klikne na Notifications v menu
    When uživatel klikne na "Notifications" v side navigaci
    Then stránka zobrazuje Notifications page
    And nejsou žádné console errors
```

This captures the **business intent**. The Gherkin is the input interface; the
model is the source of truth.

---

## Step 2 — Add the FSM state

Edit `model/fsm.ts` — add the new state and its transition:

```typescript
// In the states array:
{ stateId: "notifications", label: "Notifications" },

// In the transitions array (from homePage):
{ from: "homePage", to: "notifications", contractId: "clickNotificationsMenu" },
```

That is it — two lines. The model now knows about the new screen and how to
reach it.

---

## Step 3 — Add the contract declaration

Edit `model/contracts.ts` — add a typed predicate declaration:

```typescript
clickNotificationsMenu: {
  preconditions: [],
  postconditions: [{ assert: "state-is" as const, stateId: "notifications" }],
},
```

The `state-is` predicate is part of the closed vocabulary in
`model/schemas.ts` — you can only use predicates that exist. If you need a
new predicate type, add it to `contractPredicateSchema` first.

---

## Step 4 — Implement the action (locator)

Edit `orchestrator/action-map.ts` — add the Playwright locator that drives the
contract:

```typescript
clickNotificationsMenu: async ({ page }) => {
  await page.getByRole("link", { name: /notifications/i }).click();
},
```

The action map is the **only** place locators live. It is deliberately outside
the model hash — changing a locator never bumps the model version.

---

## Step 5 — Write offline validators

If the existing predicate interpreters (`state-is`, `url-is`, `view-selected`)
already cover the postconditions, no new validator code is needed — the
offline runner handles them automatically.

For new validators, add a pure function in `validators/`. For example, a
"no console errors" check that reads network events:

```typescript
// validators/notifications-validators.ts
import type { Validator } from "../model/schemas.js";

export const noConsoleErrors: Validator = (evidence) => {
  const errors = (evidence.post?.snapshot ?? "")
    .match(/error|uncaught/i);
  return {
    contractId: "clickNotificationsMenu",
    passed: !errors,
    details: errors ? "Console errors found in snapshot" : undefined,
    corpusRefs: evidence.post ? [evidence.post.url] : [],
  };
};
```

Register it in `validators/validator-map.ts`.

---

## Step 6 — Regenerate the smoke plan

After editing any of the three model files (`fsm.ts`, `contracts.ts`,
`schema.ts`), the smoke plan is stale — `model/model-version.test.ts` will
fail.

The smoke plan is **derived**, not hand-edited. Regeneration is an AI-assisted
authoring step: an agent reads the `@plan:smoke` features and the current
model, then re-derives `model/smoke.test-plan.ts`. The plan header says
"regenerate when model files change" — this is what that means.

After regeneration:

```bash
npm run typecheck                # types are the contract — must pass
npm test                          # all offline tests pass, including model-version test
```

---

## Step 7 — Verify end-to-end

Record a fresh corpus:

```bash
npm run run:smoke
```

Then verify offline (no browser needed):

```bash
npx tsx -e "
import { smokeTestPlan } from './model/smoke.test-plan.js';
import { runValidatorsOffline } from './validators/offline-runner.js';
const r = runValidatorsOffline('.', 'corpus/<run-id>', smokeTestPlan);
r.forEach(v => console.log(v.passed ? 'PASS' : 'FAIL', v.contractId, v.details ?? ''));
"
```

---

## What changed — file checklist

| File | Change |
|------|--------|
| `features/home-page-notifications.feature` | **New** — Gherkin input |
| `model/fsm.ts` | +1 state, +1 transition |
| `model/contracts.ts` | +1 contract declaration |
| `orchestrator/action-map.ts` | +1 locator implementation |
| `validators/notifications-validators.ts` | **New** (if needed) |
| `model/smoke.test-plan.ts` | **Regenerated** — now includes new scenarios |

---

## Principle recap

- **Gherkin is input, not truth.** The model (`fsm.ts` + `contracts.ts` +
  `schemas.ts`) is the single source of truth.
- **Locators live outside the model hash.** Editing a Playwright selector
  never bumps the model version.
- **Validators are pure functions.** No browser, no network — corpus in,
  result out.
- **The plan is derived.** Never hand-edit `smoke.test-plan.ts`.
- **The model-version guard catches staleness.** `model-version.test.ts`
  fails CI if a model edit forgets to regenerate the plan.
