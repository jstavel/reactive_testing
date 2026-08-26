import type { Browser, BrowserContext, Page } from "playwright";
import { chromium } from "playwright";

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

let activeSession: BrowserSession | null = null;

export async function launchBrowser(config: {
  baseUrl: string;
  headless: boolean;
  readySelector: string;
}): Promise<BrowserSession> {
  if (activeSession !== null) {
    throw new Error("A browser session is already active; close it first.");
  }

  const browser = await chromium.launch({ headless: config.headless });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(config.baseUrl);
  await page.waitForSelector(config.readySelector, { timeout: 30_000 });

  activeSession = { browser, context, page };
  return activeSession;
}

export async function closeBrowser(): Promise<void> {
  if (activeSession === null) {
    return;
  }
  const { browser } = activeSession;
  activeSession = null;
  await browser.close();
}

export function getActivePage(): Page {
  if (activeSession === null) {
    throw new Error("No active browser session. Call launchBrowser first.");
  }
  return activeSession.page;
}
