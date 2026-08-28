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

const CDP_CONNECT_TIMEOUT_MS = 10_000;

function makePage() {
  return {
    goto: vi.fn(async () => {}),
    waitForSelector: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
}

function makeContext(page = makePage()) {
  return {
    newPage: vi.fn(async () => page),
  };
}

function makeCdpBrowser(contexts?: ReturnType<typeof makeContext>[]) {
  const page = makePage();
  const context = contexts ?? [makeContext(page)];
  return {
    contexts: vi.fn(() => context),
    disconnect: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    newContext: vi.fn(async () => makeContext(page)),
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

  it("uses the configured stepTimeout for the readiness wait when provided", async () => {
    const browser = makeCdpBrowser();
    mockConnectOverCDP.mockResolvedValue(browser);

    const session = await launchBrowser(
      makeConfig({ cdpUrl: "http://127.0.0.1:9222", stepTimeout: 1234 }),
    );

    expect(session.page.waitForSelector).toHaveBeenCalledWith(
      "#app",
      expect.objectContaining({ timeout: 1234 }),
    );
  });

  it("uses the default 30s readiness wait when stepTimeout is omitted", async () => {
    const browser = makeCdpBrowser();
    mockConnectOverCDP.mockResolvedValue(browser);

    const session = await launchBrowser(makeConfig({ cdpUrl: "http://127.0.0.1:9222" }));

    expect(session.page.waitForSelector).toHaveBeenCalledWith(
      "#app",
      expect.objectContaining({ timeout: 30_000 }),
    );
  });

  it("detaches a CDP-attached session via browser.close() (a disconnect), closes only the run's tab, and resets it", async () => {
    const browser = makeCdpBrowser();
    mockConnectOverCDP.mockResolvedValue(browser);

    const session = await launchBrowser(makeConfig({ cdpUrl: "http://127.0.0.1:9222" }));
    await closeBrowser();

    // The run's OWN tab is closed first (so repeat runs don't accumulate tabs),
    // then on a connectOverCDP handle close() is a disconnect: it releases the
    // CDP WebSocket without terminating the human's browser.
    expect(session.page.close).toHaveBeenCalled();
    expect(browser.close).toHaveBeenCalled();
  });

  it("resets activeSession on detach so a later run can re-attach", async () => {
    const browser1 = makeCdpBrowser();
    mockConnectOverCDP.mockResolvedValue(browser1);

    const session1 = await launchBrowser(makeConfig({ cdpUrl: "http://127.0.0.1:9222" }));
    await closeBrowser();
    expect(session1.page.close).toHaveBeenCalled();
    expect(browser1.close).toHaveBeenCalled();

    // A subsequent launch must not throw "session already active".
    const browser2 = makeCdpBrowser();
    mockConnectOverCDP.mockResolvedValue(browser2);
    const session2 = await launchBrowser(
      makeConfig({ cdpUrl: "http://127.0.0.1:9222" }),
    );
    expect(session2).toBeTruthy();
    expect(browser2.close).not.toHaveBeenCalled();
  });

  it("fails fast when the CDP endpoint is unreachable", async () => {
    mockConnectOverCDP.mockRejectedValue(new Error("ECONNREFUSED 127.0.0.1:9222"));

    await expect(
      launchBrowser(makeConfig({ cdpUrl: "http://127.0.0.1:9222" })),
    ).rejects.toThrow(/connect over CDP/i);
    // No session should be left active after a failed attach.
    await expect(closeBrowser()).resolves.toBeUndefined();
  });

  it("releases a late-arriving connect after the timeout fired (stalled endpoint)", async () => {
    vi.useFakeTimers();
    try {
      let resolveConnect: (b: unknown) => void = () => {};
      const connectPromise = new Promise((res) => {
        resolveConnect = res;
      });
      mockConnectOverCDP.mockReturnValue(connectPromise);

      const launchPromise = launchBrowser(
        makeConfig({ cdpUrl: "http://127.0.0.1:9222" }),
      );

      // Attach the rejection matcher BEFORE advancing time so the timeout
      // rejection is handled synchronously (avoiding an unhandled-rejection
      // warning from the fake-timer window).
      const rejection = expect(launchPromise).rejects.toThrow(
        /Timed out connecting to CDP/,
      );

      // The connect never settles before the timeout → fail fast with the timeout message.
      await vi.advanceTimersByTimeAsync(CDP_CONNECT_TIMEOUT_MS + 1);
      await rejection;

      // The connect later resolves: the late handle must be released (closed),
      // never leaked.
      const lateBrowser = makeCdpBrowser();
      resolveConnect(lateBrowser);
      await vi.advanceTimersByTimeAsync(0);
      expect(lateBrowser.close).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("disconnects the acquired handle when bootstrap (goto) fails on a CDP attach", async () => {
    const page = makePage();
    const browser = makeCdpBrowser([makeContext(page)]);
    page.goto.mockRejectedValue(new Error("net::ERR_NAME_NOT_RESOLVED"));
    mockConnectOverCDP.mockResolvedValue(browser);

    await expect(
      launchBrowser(makeConfig({ cdpUrl: "http://127.0.0.1:9222" })),
    ).rejects.toThrow(/ERR_NAME_NOT_RESOLVED/);

    // The acquired CDP handle must be released (disconnected) on bootstrap failure.
    expect(browser.close).toHaveBeenCalled();
    await expect(closeBrowser()).resolves.toBeUndefined();
  });

  it("fails fast with an explicit error when the attached browser exposes no contexts", async () => {
    const browser = makeCdpBrowser([]);
    mockConnectOverCDP.mockResolvedValue(browser);

    await expect(
      launchBrowser(makeConfig({ cdpUrl: "http://127.0.0.1:9222" })),
    ).rejects.toThrow(/exposes no contexts/);
    // The acquired handle must be released on this failure path too.
    expect(browser.close).toHaveBeenCalled();
  });

  it("fails fast with an explicit ambiguity error when the browser exposes multiple contexts", async () => {
    const c1 = makeContext();
    const c2 = makeContext();
    const browser = makeCdpBrowser([c1, c2]);
    mockConnectOverCDP.mockResolvedValue(browser);

    await expect(
      launchBrowser(makeConfig({ cdpUrl: "http://127.0.0.1:9222" })),
    ).rejects.toThrow(/exposes 2 contexts/);
    expect(browser.close).toHaveBeenCalled();
  });

  it("surfaces a clear timeout naming the selector when the readySelector never matches", async () => {
    // The live Kraken home page lacks the smoke plan's readySelector (it renders
    // #root → #app-shell, not #app) — waitForSelector must fail fast with a clear
    // message so the orchestrator can report it, not hang or guess.
    const page = makePage();
    const browser = makeCdpBrowser([makeContext(page)]);
    page.waitForSelector.mockRejectedValue(
      new Error(
        `waitForSelector: Timeout 30000ms exceeded while waiting for selector "#app"`,
      ),
    );
    mockConnectOverCDP.mockResolvedValue(browser);

    await expect(
      launchBrowser(
        makeConfig({ cdpUrl: "http://127.0.0.1:9222", readySelector: "#app" }),
      ),
    ).rejects.toThrow(/waiting for selector "#app"/);
    // No session should be left active after a failed bootstrap.
    await expect(closeBrowser()).resolves.toBeUndefined();
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

  it("closes (does not detach) a launched browser when bootstrap (goto) fails", async () => {
    const failingPage = makePage();
    failingPage.goto.mockRejectedValue(new Error("bootstrap exploded"));
    const context = { newPage: vi.fn(async () => failingPage) };
    const browser = makeLaunchedBrowser();
    (browser.newContext as ReturnType<typeof vi.fn>).mockResolvedValueOnce(context);
    mockLaunch.mockResolvedValue(browser);

    await expect(launchBrowser(makeConfig())).rejects.toThrow(/bootstrap exploded/);
    // For an anonymous launch, the fresh browser is fully closed on failure.
    expect(browser.close).toHaveBeenCalled();
  });
});
