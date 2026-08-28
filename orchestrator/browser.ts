import type { Browser, BrowserContext, Page } from "playwright";
import { chromium } from "playwright";

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  /** True when the session was attached over CDP (the human's browser), not launched. */
  viaCdp: boolean;
}

let activeSession: BrowserSession | null = null;

/** Default CDP endpoint for attaching to an already-authenticated browser. */
export const DEFAULT_CDP_URL = "http://127.0.0.1:9222";

/** How long to wait for a CDP attach before failing fast on a stalled endpoint. */
const CDP_CONNECT_TIMEOUT = 10_000;

/**
 * Launch (or CDP-attach to) a browser and navigate to `baseUrl`.
 *
 * - When `cdpUrl` is provided, connects over CDP to an already-authenticated
 *   Chromium, requires exactly one authenticated context, opens a NEW tab in it,
 *   and navigates to `baseUrl` so 2FA session state is preserved (AD-4 "via
 *   Playwright/CDP"). The human's browser is never closed.
 * - When `cdpUrl` is absent, launches a fresh anonymous Chromium
 *   (`chromium.launch`) — kept for local/CI tests only; never viable against
 *   Kraken Pro's 2FA.
 */
export async function launchBrowser(config: {
  baseUrl: string;
  headless?: boolean;
  readySelector: string;
  cdpUrl?: string;
  stepTimeout?: number;
}): Promise<BrowserSession> {
  if (activeSession !== null) {
    throw new Error("A browser session is already active; close it first.");
  }

  const cdpUrl = config.cdpUrl ?? DEFAULT_CDP_URL;

  let browser: Browser;
  let context: BrowserContext;

  if (config.cdpUrl) {
    browser = await connectOverCDPWithTimeout(cdpUrl);

    // The authenticated context must be deterministic: the attached browser must
    // expose a single context containing the human's Kraken pages. Anything else
    // would silently attach an anonymous session (no cookies) or drive the wrong
    // profile, so fail fast and guide the operator.
    const contexts = browser.contexts();
    if (contexts.length === 0) {
      await releaseHandle(browser, true);
      throw new Error(
        `CDP endpoint ${cdpUrl} exposes no contexts — an authenticated context is required. ` +
          `Open a Kraken Pro tab in the attached browser and re-run.`,
      );
    }
    if (contexts.length > 1) {
      await releaseHandle(browser, true);
      throw new Error(
        `CDP endpoint ${cdpUrl} exposes ${contexts.length} contexts — expected exactly one authenticated context. ` +
          `Close extra profiles/windows so a single authenticated context remains, then re-run.`,
      );
    }
    context = contexts[0]!;
  } else {
    browser = await chromium.launch({ headless: config.headless ?? true });
    context = await browser.newContext();
  }

  try {
    const page = await context.newPage();
    await page.goto(config.baseUrl);
    await page.waitForSelector(config.readySelector, {
      timeout: config.stepTimeout ?? 30_000,
    });

    activeSession = { browser, context, page, viaCdp: Boolean(config.cdpUrl) };
    return activeSession;
  } catch (err) {
    // Never leak the acquired handle on a failed bootstrap. For a CDP-attached
    // handle, close() is a disconnect (does not terminate the human's browser);
    // for an anonymous launch it closes the fresh browser.
    await releaseHandle(browser, Boolean(config.cdpUrl));
    throw err;
  }
}

/**
 * Close (or detach from) the active browser session.
 *
 * On a CDP-attached session, the run's own tab is closed first (so repeat runs
 * don't accumulate stray tabs in the human's context), then `browser.close()`
 * is a **disconnect** — it releases the CDP WebSocket and leaves the human's
 * Chromium running (you cannot close a browser you only connected to). This is
 * the only way to detach cleanly (CDP handles have no `disconnect()` primitive).
 * The user's browser is never terminated. `activeSession` is reset regardless so
 * a later run in the same process can re-attach. For a launched (anonymous)
 * session, `browser.close()` closes it normally.
 */
export async function closeBrowser(): Promise<void> {
  const session = activeSession;
  if (session === null) {
    return;
  }
  activeSession = null;

  if (session.viaCdp) {
    try {
      await session.page.close();
    } catch (err) {
      console.warn(
        `Failed to close the run's tab in the authenticated context: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  try {
    await session.browser.close();
  } catch (err) {
    console.warn(
      `Failed to ${session.viaCdp ? "disconnect from" : "close"} browser: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

export function getActivePage(): Page {
  if (activeSession === null) {
    throw new Error("No active browser session. Call launchBrowser first.");
  }
  return activeSession.page;
}

/**
 * Close (or disconnect) a browser handle acquired during setup, swallowing errors
 * so the original failure is what propagates. On a CDP handle, close() is a
 * disconnect — it never terminates a browser we only connected to.
 */
async function releaseHandle(browser: Browser, viaCdp: boolean): Promise<void> {
  try {
    await browser.close();
  } catch (err) {
    console.warn(
      `Failed to ${viaCdp ? "disconnect from" : "close"} browser during teardown: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

/**
 * Connect over CDP, wrapped in a timeout so a stalled endpoint fails fast. If the
 * timeout fires first and the connect resolves later, the late-arriving handle is
 * released immediately so no connection is leaked.
 */
async function connectOverCDPWithTimeout(cdpUrl: string): Promise<Browser> {
  return new Promise<Browser>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(
        new Error(
          `Timed out connecting to CDP endpoint ${cdpUrl} after ${CDP_CONNECT_TIMEOUT}ms. ` +
            `Ensure Chromium is running with --remote-debugging-port and the endpoint is reachable.`,
        ),
      );
    }, CDP_CONNECT_TIMEOUT);
    chromium
      .connectOverCDP(cdpUrl)
      .then(
        (browser) => {
          if (settled) {
            // The timeout already won — release this late handle and discard it.
            browser.close().catch(() => {});
            return;
          }
          clearTimeout(timer);
          resolve(browser);
        },
        (err) => {
          if (settled) {
            return;
          }
          clearTimeout(timer);
          reject(
            new Error(
              `Failed to connect over CDP to ${cdpUrl}: ${
                err instanceof Error ? err.message : String(err)
              }`,
            ),
          );
        },
      );
  });
}
