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
 *   Chromium, opens a NEW tab in the deterministic authenticated context
 *   (`contexts[0]`), and navigates it to `baseUrl` so 2FA session state is
 *   preserved (AD-4 "via Playwright/CDP"). The human's browser is never closed.
 * - When `cdpUrl` is absent, launches a fresh anonymous Chromium
 *   (`chromium.launch`) — kept for local/CI tests only; never viable against
 *   Kraken Pro's 2FA.
 */
export async function launchBrowser(config: {
  baseUrl: string;
  headless?: boolean;
  readySelector: string;
  cdpUrl?: string;
}): Promise<BrowserSession> {
  if (activeSession !== null) {
    throw new Error("A browser session is already active; close it first.");
  }

  const cdpUrl = config.cdpUrl ?? DEFAULT_CDP_URL;

  let browser: Browser;
  let context: BrowserContext;

  if (config.cdpUrl) {
    browser = await connectOverCDPWithTimeout(cdpUrl);
    // The authenticated context is deterministic: the attached browser exposes
    // a single context containing the human's Kraken pages.
    context = browser.contexts()[0] ?? (await browser.newContext());
  } else {
    browser = await chromium.launch({ headless: config.headless ?? true });
    context = await browser.newContext();
  }

  const page = await context.newPage();

  await page.goto(config.baseUrl);
  await page.waitForSelector(config.readySelector, { timeout: 30_000 });

  activeSession = { browser, context, page, viaCdp: Boolean(config.cdpUrl) };
  return activeSession;
}

/**
 * Close (or detach from) the active browser session.
 *
 * On a CDP-attached session, `browser.close()` is a **disconnect** — it releases
 * the CDP WebSocket and leaves the human's Chromium running (you cannot close a
 * browser you only connected to). This is the only way to detach cleanly (CDP
 * handles have no `disconnect()` primitive), and it is the highest-blast-radius
 * rule in Story 2.5: the user's browser is never terminated. `activeSession` is
 * reset regardless so a later run in the same process can re-attach. For a
 * launched (anonymous) session, `browser.close()` closes it normally.
 */
export async function closeBrowser(): Promise<void> {
  const session = activeSession;
  if (session === null) {
    return;
  }
  activeSession = null;
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

/** Connect over CDP, wrapped in a timeout so a stalled endpoint fails fast. */
async function connectOverCDPWithTimeout(cdpUrl: string): Promise<Browser> {
  return new Promise<Browser>((resolve, reject) => {
    const timer = setTimeout(() => {
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
          clearTimeout(timer);
          resolve(browser);
        },
        (err) => {
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
