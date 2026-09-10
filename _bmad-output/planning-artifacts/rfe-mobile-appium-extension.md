---
name: 'RFE — Mobile Appium Extension (Kraken Pro)'
type: rfe
status: draft
created: '2026-09-10'
requires: 'v1 desktop-web release (epics 1–5)'
tags: [mobile, appium, driver-abstraction, cross-platform]
---

# RFE — Mobile Appium Extension for Kraken Pro

## Motivation

Reactive Testing v1 covers the Kraken Pro **desktop web** read-only critical path
(epics 1–5). Kraken Pro also ships as a **mobile application** (iOS/Android) with
overlapping functional surface area — the same portfolio, history, order-book, and
earn screens, rendered through a native UI shell instead of a browser.

Extending the testware to mobile validates the architectural premise: the model
is the single source of truth, and only the driver/collector layer needs to
change.

## Design Summary

Five architectural decisions, settled in one document:

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| **D1** | Driver abstraction | **New `Driver` interface** — replace `Page` in `ContractAction` and collectors | Clean seam, no conditional code, enables third platforms (tablet, TV) later |
| **D2** | Model | **Single FSM** — shared `stateId`/`contractId`, `url-is` becomes optional | One SSOT is the project's principle. Mobile has the same screens, different locators |
| **D3** | Appium binding | **Hybrid** — MCP for live-discovery, JS client (`webdriverio`) for runtime action-map | MCP latency prohibitive for per-step calls; JS client gives type-safe direct Appium HTTP |
| **D4** | Network collector on mobile | **Deferred** — `noop` for MVP mobile | Appium cannot capture HTTP traffic natively; proxy-based capture is a separate RFE |
| **D5** | Session management | **Polymorphic** — `OrchestratorConfig.driverType: "playwright" | "appium"` decides at startup | Orchestrator owns the lifecycle; one switch, two implementations |

## Architectural Changes

### D1 — Driver interface

**New file:** `drivers/types.ts`

```typescript
/** Platform-agnostic element selector — role is web-only. */
export interface LocatorSpec {
  strategy: "accessibility-id" | "id" | "xpath" | "css" | "role";
  selector: string;
}

/** Abstract driver — the runtime boundary between the orchestrator and the
 * device under test. Each platform (Playwright, Appium, …) implements this
 * interface; the orchestrator never imports Playwright or Appium directly. */
export interface Driver {
  /** Human-readable platform identifier, for diagnostics and collector
   * decisions (e.g. network capture). */
  readonly platform: "web" | "mobile";

  /** Navigate to a URL (web) or verify the target screen is visible (mobile
   * ignores the URL argument and waits for the current activity/screen). */
  navigate(url: string): Promise<void>;

  /** Click an element identified by the locator. */
  click(locator: LocatorSpec): Promise<void>;

  /** Type text into an element. */
  type(locator: LocatorSpec, text: string): Promise<void>;

  /** Capture page source (innerHTML on web, XML page source on mobile). */
  captureSnapshot(): Promise<string>;

  /** Capture screenshot as raw PNG bytes. */
  captureScreenshot(): Promise<Buffer>;

  /** Current location: URL string on web, screen/activity identifier on mobile. */
  currentLocation(): Promise<string>;

  /** Wait for the UI to reach a settled / ready state. On web this waits for
   * a CSS selector; on mobile a similar ready heuristic. */
  waitForStable(selector?: string): Promise<void>;

  /** Read the text content of an element. */
  getText(locator: LocatorSpec): Promise<string>;

  /** Get element bounding box for gesture calculations. */
  getBoundingBox(locator: LocatorSpec): Promise<{ x: number; y: number; width: number; height: number } | null>;

  /** Perform a swipe gesture (mobile-only; web throws). */
  swipe?(direction: "up" | "down" | "left" | "right"): Promise<void>;

  /** Close the driver session (browser tab or Appium session). */
  close(): Promise<void>;
}
```

**Impacted signatures:**

| Current | New |
|---------|-----|
| `ContractAction = (context: { page: Page })` | `ContractAction = (context: { driver: Driver })` |
| `CollectorFn<T, A> = (page: Page, ...args: A)` | `CollectorFn<T, A> = (driver: Driver, ...args: A)` |
| `orchestrator/action-map.ts` — each entry | Each entry receives `driver` instead of `page` |
| `collectors/*.ts` — each collector | Each collector receives `driver` instead of `page` |

**New files under `drivers/`:**

| File | Contents |
|------|----------|
| `drivers/types.ts` | `Driver`, `LocatorSpec`, `SessionConfig` types |
| `drivers/playwright-driver.ts` | Implementation wrapping Playwright `Page` |
| `drivers/appium-driver.ts` | Implementation wrapping Appium WebDriver (via webdriverio) |
| `drivers/factory.ts` | `createDriver(config: SessionConfig): Promise<Driver>` |

### D2 — Single FSM with relaxed `url-is`

**No structural changes to `model/`.** The same `fsm.ts`, `contracts.ts`, `schemas.ts`
are shared. One change:

**`url-is` predicate becomes optional** in the validators: the `url-is` predicate's
interpreter (`validator-map.ts`) already reads `evidence.post.url` from the
corpus snapshot. On mobile the snapshot contains no URL — the field is absent.
The interpreter treats a missing URL as **unable to verify** (passes with a
`corpusRefs` annotation), not a failure. This preserves backward compatibility
with existing web corpora.

Similarly for `dialog-open`/`dialog-closed` — the dialog presence check works
identically on mobile because the post-step snapshot carries the FSM `stateId`,
not the URL.

### D3 — Appium binding strategy

**Two paths, one goal:**

| Phase | Tool | Purpose |
|-------|------|---------|
| **Live-discovery** (authoring) | Appium MCP extension (existing) | Find locators, verify selectors, explore the mobile UI |
| **Runtime** (execution) | `webdriverio` NPM package | Fast, type-safe Appium HTTP calls from action-map and collectors |

The live-discovery phase is identical to Story 5-2 (Trade order-book discovery):
a human operator connects the device, the agent drives it via Appium MCP tools,
discovers locators, and codifies them into the mobile action-map.

The runtime phase uses `webdriverio` because:
- Direct HTTP to Appium server (no MCP message overhead per click/capture)
- Full type safety — `Element` handles, `WebDriver` commands
- No long-running MCP session to maintain alongside the orchestrator

**Implementation sketch:**

```typescript
// drivers/appium-driver.ts
import { remote } from "webdriverio";

export async function createAppiumDriver(config: AppiumConfig): Promise<Driver> {
  const client = await remote({
    hostname: config.hostname ?? "localhost",
    port: config.port ?? 4723,
    capabilities: {
      platformName: config.platform, // "iOS" | "Android"
      "appium:deviceName": config.deviceName,
      "appium:app": config.appPath,
      // … further capabilities from Appium MCP session creation
    },
  });
  return new AppiumDriver(client, config);
}
```

### D4 — Network collector deferred on mobile

The `collectors/collect.ts` registry gains a runtime guard:

```typescript
// current
export const collectors = {
  snapshot: collectSnapshot,
  network: collectNetwork,
  screenshot: collectScreenshot,
  probe: collectProbe,
};

// new — platform-aware resolution
export function resolveCollectors(driver: Driver) {
  return {
    snapshot: collectSnapshot,
    network: driver.platform === "web" ? collectNetwork : noopCollector,
    screenshot: collectScreenshot,
    probe: collectProbe,
  };
}
```

The `noopCollector` returns `[]` immediately — it never throws, never blocks,
never records a gap. Validators that declare a network dependency produce
`passed: true` with `corpusRefs: []` when no network data exists.

**Future direction:** a proxy-based network capture (mitmproxy as sidecar,
mobile device routed through it) is tracked as a separate RFE — do not block
MVP mobile on it.

### D5 — Polymorphic session management

```typescript
// OrchestratorConfig (extended)
export interface OrchestratorConfig {
  // … existing fields …

  /** Driver platform to use. Defaults to "web" for backward compat. */
  driverType: "web" | "mobile";

  /** Appium-specific config — meaningful only when driverType === "mobile". */
  appium?: {
    platform: "iOS" | "Android";
    deviceName: string;
    appPath?: string;
    hostname?: string;  // default localhost
    port?: number;      // default 4723
    // additional capabilities passed through to Appium
    capabilities?: Record<string, unknown>;
  };
}
```

The orchestrator's `launchBrowser` is renamed to `launchSession` and dispatches:

```typescript
async function launchSession(config: OrchestratorConfig): Promise<{ driver: Driver }> {
  if (config.driverType === "mobile") {
    const driver = await createAppiumDriver(config.appium!);
    return { driver };
  }
  // existing Playwright/cdp logic, wrapped in PlaywrightDriver
  const { page } = await launchPlaywrightBrowser(config);
  return { driver: new PlaywrightDriver(page, config) };
}
```

## Mobile action-map

A second action-map file parallels the existing web one:

| File | Contents |
|------|----------|
| `orchestrator/action-map.ts` | Web (Playwright) — **unchanged** |
| `orchestrator/action-map-mobile.ts` | Mobile (Appium/Driver) — same contractIds, different locators |

The orchestrator loads the appropriate map at startup based on `config.driverType`.

**Example mobile entry (live-discovery pending):**

```typescript
// orchestrator/action-map-mobile.ts — DISCOVERED, not invented
export const mobileActionMap: Record<string, ContractAction> = {
  navigateHome: async ({ driver }) => {
    // Expected: tab bar "Home" icon, or bottom nav
    await driver.click({ strategy: "accessibility-id", selector: "Home" });
    // Mobile has no URL — wait for the screen to settle
    await driver.waitForStable();
  },

  clickHistoryMenuMain: async ({ driver }) => {
    // Expected: bottom tab "History" → top tab "Main"
    await driver.click({ strategy: "accessibility-id", selector: "History" });
    await driver.click({ strategy: "accessibility-id", selector: "Main" });
    await driver.waitForStable();
  },

  openPortfolioSummary: async ({ driver }) => {
    // Expected: tap on portfolio value in header
    await driver.click({ strategy: "accessibility-id", selector: "portfolio-value" });
    await driver.waitForStable();
  },
  // … remaining contracts live-discovered against the mobile app
};
```

> **Every locator in `action-map-mobile.ts` must be live-discovered** against the
> actual Kraken Pro mobile application. No locators are guessed in this document.

## Migration path for existing action-map

Existing web entries are migrated from `page`-based to `driver`-based syntax.
The change is a mechanical wrapping — each `page.getByRole(...).click()` becomes
`driver.click({ strategy: "role", selector: "..." })`:

| Web (current) | Driver (new) |
|---------------|--------------|
| `page.getByRole("button", { name: "Home" }).click()` | `driver.click({ strategy: "role", selector: 'button[name="Home"]' })` |
| `page.locator('button:has(svg[name="Eye"])').click()` | `driver.click({ strategy: "css", selector: 'button:has(svg[name="Eye"])' })` |
| `page.waitForURL("**/app/home")` | `driver.waitForStable()` + `driver.currentLocation()` in postcondition |

The `LocatorSpec` role strategy preserves the exact-match semantics of
Playwright's `getByRole`:

```
strategy: "role"
selector:  '<role>[name="<exact-name>"]'
```

This is a one-time migration of ~15 entries. No behavioural change.

## Collector migration

Each collector is migrated from `page: Page` to `driver: Driver`:

| Collector | Web implementation | Mobile implementation |
|-----------|-------------------|----------------------|
| `snapshot` | `page.locator("body").innerHTML()` | `driver.captureSnapshot()` → XML page source |
| `probe` | `page.locator(css).textContent()` | `driver.getText({ strategy: "css", selector })` |
| `screenshot` | `page.screenshot({ type: "png" })` | `driver.captureScreenshot()` |
| `network` | `page.on("request"/"response")` | `noop` (deferred) |

## Scope and boundaries

### In scope (MVP mobile)

- Kraken Pro **iOS** mobile application (Android deferred to follow-up)
- Same read-only critical path as v1: portfolio, history, order-book, earn
- All 15 existing contractIds mapped to mobile locators
- Smoke plan runs identically on web and mobile
- Same validators, same reporter — zero changes in `validators/` or `reporter/`

### Explicitly deferred

| Item | Reason |
|------|--------|
| Android | iOS first; Android addendum when iOS is stable |
| Network capture (proxy) | Proxy-based capture is a separate infrastructure concern |
| Mobile-specific gestures (swipe-to-delete, pull-to-refresh) | Not in v1 critical path; add as new contracts when needed |
| Push notifications / deep links | Out of scope for read-only model |
| Biometric auth (FaceID) | Kraken Pro handles auth before the model starts (same as web's 2FA/CDP pattern) |

## Work breakdown

| Story | Effort | Depends on |
|-------|--------|------------|
| **1. Driver interface** — define `Driver`, migrate `ContractAction` and collectors | 3–4 days | — |
| **2. PlaywrightDriver** — wrap existing `Page` calls into Driver | 1 day | Story 1 |
| **3. Mobile live-discovery** — connect device via Appium MCP, discover all 15 contract locators | 2–3 days | Story 1, device with Kraken Pro installed |
| **4. Mobile action-map** — implement 15 entries, test each against live app | 2 days | Story 3 |
| **5. AppiumDriver** — implement Driver interface via webdriverio | 2 days | Story 2, 3 |
| **6. Polymorphic session management** — orchestrator dispatches by driverType | 1 day | Story 2, 5 |
| **7. Collector migration** — migrate 4 collectors, add noop network | 1 day | Story 2 |
| **8. Mobile smoke run** — end-to-end: `npm run run:smoke -- --driver mobile` passes | 1 day | All above |
| **Total** | **13–16 days** | |

## Risks

1. **Kraken Pro mobile app testability** — unknown until live-discovery. The app may use non-standard views, WebView-only rendering, or missing accessibility labels. If locators are unreachable (only image-based elements), the approach still works via `xpath` or coordinate-based taps — but at reduced robustness. **Mitigation:** start with live-discovery (Story 3) before committing to the full build-out.

2. **URL-based postconditions** — `url-is` is baked into 10 of 15 contracts. Mobile has no URL. The proposed solution (optional predicate, passes when URL absent) is safe but reduces failure-detection coverage on mobile. **Mitigation:** the `state-is` predicate covers the same ground; an `activity-is` predicate can be added if the mobile app exposes distinct screen identifiers.

3. **Two action-maps drift** — web and mobile action-maps both implement the same 15 contractIds. A new contract added to the model must be implemented in both. **Mitigation:** enforced by CI — `action-map.test.ts` verifies parity between `allContracts` and `actionMap` keys; extend to check `mobileActionMap` keys too. A PR that adds a contractId to the model without adding it to both maps fails `tsc --noEmit`.

4. **Appium infrastructure** — needs Appium server (local or Docker) and a connected device/emulator. **Mitigation:** document setup in `docs/mobile-setup.md`; provide a `docker-compose.appium.yml` for CI-like runs.

## Appendix — current contractId to mobile hypothesis

Pre-live-discovery mapping. Updated after Story 3 (live-discovery) — this table
is a starting point for the discovery session, not a specification.

| contractId | Web locator pattern | Mobile hypothesis | Risk |
|-----------|---------------------|-------------------|------|
| `navigateHome` | Sidebar "Home" button | Tab bar "Home" icon | Low |
| `clickHistoryMenuMain` | Sidebar → History → Main | Tab bar "History" → tab "Main" | Low |
| `clickHistoryMenuFutures` | Sidebar → History → Futures | Tab bar "History" → tab "Futures" | Low |
| `clickPortfolioMenuOverview` | Sidebar → Portfolio → Overview | Tab bar "Portfolio" → section or tab | Medium |
| `clickPortfolioMenuMain` | Sidebar → Portfolio → Main | Tab bar "Portfolio" → section | Medium |
| `clickPortfolioMenuFutures` | Sidebar → Portfolio → Futures | Tab bar "Portfolio" → section | Medium |
| `clickPortfolioMenuLoans` | Sidebar → Portfolio → Loans | Tab bar "Portfolio" → section | Medium |
| `clickPortfolioMenuEarn` | Sidebar "Yield" button | Tab bar "Yield" or "Earn" icon | Low |
| `clickTradeMenu` | Sidebar "Trade" button | Tab bar "Trade" icon | Low |
| `selectOrderBookTab` | flexlayout tab → "Order book" | Screen with order-book visible | Medium |
| `openPortfolioSummary` | Nav button ending with "USD" | Tap portfolio header value | Medium |
| `closePortfolioSummary` | Dialog → Escape | Swipe down or tap overlay or back button | Medium |
| `toggleEyeIcon` | Dialog → Eye/EyeOff SVG button | Eye icon in dialog header | Medium |
| `filterHistoryByAsset` | Combobox → checkbox BTC | Filter icon → asset selector | Medium-High |
| `paginateHistoryNext` | ChevronRightSmall icon | Pagination or infinite scroll | Medium-High |
