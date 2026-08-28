import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockConnectOverCDP = vi.fn();
const mockLaunch = vi.fn();

vi.mock("playwright", () => ({
  chromium: {
    connectOverCDP: (...args: unknown[]) => mockConnectOverCDP(...args),
    launch: (...args: unknown[]) => mockLaunch(...args),
  },
}));

import { closeBrowser, launchBrowser } from "./browser.js";

function makePage() {
  return {
    goto: vi.fn(async () => {}),
    waitForSelector: vi.fn(async () => {}),
  };
}

function makeCdpBrowser() {
  const page = makePage();
  const context = {
    newPage: vi.fn(async () => page),
  };
  return {
    contexts: vi.fn(() => [context]),
    disconnect: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    newContext: vi.fn(async () => context),
  };
}

function makeLaunchedBrowser() {
  const page = makePage();
  const context = {
    newPage: vi.fn(async () => page),
  };
  return {
    newContext: vi.fn(async () => context),
    close: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
  };
}

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    baseUrl: "http://localhost:3000",
    headless: true,
    readySelector: "#app",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  await closeBrowser();
});

describe("launchBrowser CDP-attach", () => {
  it("connects over CDP, opens a new tab in the authenticated context, and navigates", async () => {
    const browser = makeCdpBrowser();
    mockConnectOverCDP.mockResolvedValue(browser);

    const session = await launchBrowser(makeConfig({ cdpUrl: "http://127.0.0.1:9222" }));

    expect(mockLaunch).not.toHaveBeenCalled();
    expect(mockConnectOverCDP).toHaveBeenCalledWith("http://127.0.0.1:9222");
    expect(browser.contexts).toHaveBeenCalled();
    expect(session.page.goto).toHaveBeenCalledWith("http://localhost:3000");
    expect(session.page.waitForSelector).toHaveBeenCalledWith("#app", expect.any(Object));
    expect(session.viaCdp).toBe(true);
  });

  it("detaches a CDP-attached session via browser.close() (a disconnect) and resets it", async () => {
    const browser = makeCdpBrowser();
    mockConnectOverCDP.mockResolvedValue(browser);

    await launchBrowser(makeConfig({ cdpUrl: "http://127.0.0.1:9222" }));
    await closeBrowser();

    // On a connectOverCDP handle, close() is a disconnect: it releases the
    // CDP WebSocket without terminating the human's browser.
    expect(browser.close).toHaveBeenCalled();
  });

  it("resets activeSession on detach so a later run can re-attach", async () => {
    const browser = makeCdpBrowser();
    mockConnectOverCDP.mockResolvedValue(browser);

    await launchBrowser(makeConfig({ cdpUrl: "http://127.0.0.1:9222" }));
    await closeBrowser();
    // A subsequent launch must not throw "session already active".
    await expect(
      launchBrowser(makeConfig({ cdpUrl: "http://127.0.0.1:9222" })),
    ).resolves.toBeTruthy();
    expect(browser.close).toHaveBeenCalled();
  });

  it("fails fast when the CDP endpoint is unreachable", async () => {
    mockConnectOverCDP.mockRejectedValue(new Error("ECONNREFUSED 127.0.0.1:9222"));

    await expect(
      launchBrowser(makeConfig({ cdpUrl: "http://127.0.0.1:9222" })),
    ).rejects.toThrow(/connect over CDP/i);
    // No session should be left active after a failed attach.
    expect(closeBrowser()).resolves.toBeUndefined();
  });
});

describe("launchBrowser anonymous launch", () => {
  it("launches a fresh browser when no cdpUrl is provided", async () => {
    const browser = makeLaunchedBrowser();
    mockLaunch.mockResolvedValue(browser);

    const session = await launchBrowser(makeConfig());

    expect(mockConnectOverCDP).not.toHaveBeenCalled();
    expect(mockLaunch).toHaveBeenCalledWith({ headless: true });
    expect(session.viaCdp).toBe(false);
  });

  it("closes (not detaches) a launched session", async () => {
    const browser = makeLaunchedBrowser();
    mockLaunch.mockResolvedValue(browser);

    await launchBrowser(makeConfig());
    await closeBrowser();

    expect(browser.close).toHaveBeenCalled();
    expect(browser.disconnect).not.toHaveBeenCalled();
  });
});
