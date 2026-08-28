import { rmSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Page, Response } from "playwright";

import {
  networkEventSchema,
  probeResultSchema,
  snapshotRecordSchema,
} from "../model/schemas.js";
import type { Probe } from "../model/schemas.js";
import { collectors } from "./collect.js";
import { collectNetwork } from "./collect-network.js";
import { collectProbe } from "./collect-probe.js";
import { collectScreenshot } from "./collect-screenshot.js";
import { collectSnapshot } from "./collect-snapshot.js";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

let tempDirs: string[] = [];

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function makeResponse(url: string, method: string, status: number): Response {
  return {
    url: () => url,
    status: () => status,
    request: () => ({ method: () => method }),
  } as unknown as Response;
}

function createPageMock(): {
  page: Page & { emit: (event: string, ...args: unknown[]) => boolean };
  mocks: Record<
    "locator" | "innerHTML" | "first" | "textContent" | "screenshot" | "waitForLoadState" | "on" | "off",
    ReturnType<typeof vi.fn>
  >;
} {
  const handlers = new Map<string, Array<(...args: unknown[]) => void>>();

  const on = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    const list = handlers.get(event) ?? [];
    list.push(handler);
    handlers.set(event, list);
  });
  const off = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    const list = handlers.get(event) ?? [];
    const index = list.indexOf(handler);
    if (index >= 0) list.splice(index, 1);
  });
  const emit = (event: string, ...args: unknown[]): boolean => {
    for (const handler of handlers.get(event) ?? []) {
      handler(...args);
    }
    return true;
  };

  const innerHTML = vi.fn(async () => '<div class="app"><p>Loaded</p></div>');
  const textContent = vi.fn(async () => "extracted-value");
  const first = vi.fn(() => ({ textContent }));
  const locator = vi.fn(() => ({ innerHTML, first }));
  const screenshot = vi.fn(async () => undefined);
  const waitForLoadState = vi.fn(async () => undefined);

  // Playwright's Page inherits `emit` from EventEmitter at runtime but does not
  // declare it in its types; augment locally so tests can fire captured listeners.
  const page = {
    locator,
    on,
    off,
    emit,
    screenshot,
    waitForLoadState,
  } as unknown as Page & { emit: (event: string, ...args: unknown[]) => boolean };

  return {
    page,
    mocks: { locator, innerHTML, first, textContent, screenshot, waitForLoadState, on, off },
  };
}

beforeEach(() => {
  tempDirs = [];
});

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
  vi.resetAllMocks();
});

describe("collectSnapshot", () => {
  it("returns a SnapshotRecord with the serialized structure and a capturedAt", async () => {
    const { page, mocks } = createPageMock();

    const record = await collectSnapshot(page, { stateId: "homePage" });

    expect(mocks.locator).toHaveBeenCalledWith("body");
    expect(record.stateId).toBe("homePage");
    expect(record.snapshot).toBe('<div class="app"><p>Loaded</p></div>');
    expect(record.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(snapshotRecordSchema.safeParse(record).success).toBe(true);
  });

  it("passes the provided stateId through to the record", async () => {
    const { page } = createPageMock();

    const record = await collectSnapshot(page, { stateId: "portfolioSummaryDialog" });

    expect(record.stateId).toBe("portfolioSummaryDialog");
  });

  it("rejects an empty stateId instead of silently defaulting", async () => {
    const { page } = createPageMock();

    await expect(collectSnapshot(page, { stateId: "" })).rejects.toThrow();
  });

  it("rejects a whitespace-only stateId instead of accepting it", async () => {
    const { page } = createPageMock();

    await expect(collectSnapshot(page, { stateId: "   " })).rejects.toThrow();
  });
});

describe("collectNetwork", () => {
  it("captures observed responses as conforming NetworkEvents", async () => {
    const { page, mocks } = createPageMock();
    const window = deferred();
    mocks.waitForLoadState.mockReturnValueOnce(window.promise);

    const eventsPromise = collectNetwork(page);
    page.emit("response", makeResponse("https://app.test/api", "GET", 200));
    page.emit("response", makeResponse("https://app.test/submit", "POST", 201));
    window.resolve();

    const events = await eventsPromise;

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      url: "https://app.test/api",
      method: "GET",
      status: 200,
      capturedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    expect(events[1]).toEqual({
      url: "https://app.test/submit",
      method: "POST",
      status: 201,
      capturedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    expect(networkEventSchema.safeParse(events[0]!).success).toBe(true);
    expect(networkEventSchema.safeParse(events[1]!).success).toBe(true);
  });

  it("returns an empty array and still detaches when no responses are observed", async () => {
    const { page, mocks } = createPageMock();

    const events = await collectNetwork(page);

    expect(events).toEqual([]);
    expect(mocks.on).toHaveBeenCalledWith("response", expect.any(Function));
    const handler = mocks.on.mock.calls[0]![1];
    expect(mocks.off).toHaveBeenCalledWith("response", handler);
  });

  it("returns partial observations and still detaches when networkidle never settles", async () => {
    const { page, mocks } = createPageMock();
    mocks.waitForLoadState.mockRejectedValueOnce(
      new Error("Timeout 5000ms exceeded"),
    );

    const eventsPromise = collectNetwork(page);
    page.emit("response", makeResponse("https://app.test/api", "GET", 200));

    const events = await eventsPromise;

    expect(events).toHaveLength(1);
    expect(events[0]!.url).toBe("https://app.test/api");
    expect(networkEventSchema.safeParse(events[0]!).success).toBe(true);
    const handler = mocks.on.mock.calls[0]![1];
    expect(mocks.off).toHaveBeenCalledWith("response", handler);
  });

  it("detaches its listener so repeated calls never double-count events", async () => {
    const { page, mocks } = createPageMock();
    const firstWindow = deferred();
    const secondWindow = deferred();
    mocks.waitForLoadState
      .mockReturnValueOnce(firstWindow.promise)
      .mockReturnValueOnce(secondWindow.promise);

    expect(mocks.waitForLoadState).not.toHaveBeenCalled();

    const firstCollect = collectNetwork(page);
    page.emit("response", makeResponse("https://app.test/one", "GET", 200));
    firstWindow.resolve();
    expect(await firstCollect).toHaveLength(1);
    const firstHandler = mocks.on.mock.calls[0]![1];
    expect(mocks.off).toHaveBeenCalledWith("response", firstHandler);

    const secondCollect = collectNetwork(page);
    page.emit("response", makeResponse("https://app.test/two", "GET", 200));
    secondWindow.resolve();
    const secondEvents = await secondCollect;

    expect(secondEvents).toHaveLength(1);
    expect(secondEvents[0]!.url).toBe("https://app.test/two");
  });
});

describe("collectScreenshot", () => {
  it("returns in-memory PNG bytes and a timestamp without touching disk", async () => {
    const { page, mocks } = createPageMock();
    mocks.screenshot.mockResolvedValue(ONE_PIXEL_PNG);

    const capture = await collectScreenshot(page);

    expect(mocks.screenshot).toHaveBeenCalledWith();
    expect(Buffer.isBuffer(capture.buffer)).toBe(true);
    expect(capture.buffer.equals(ONE_PIXEL_PNG)).toBe(true);
    expect(capture.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("throws when the screenshot capture fails", async () => {
    const { page, mocks } = createPageMock();
    mocks.screenshot.mockRejectedValue(new Error("screenshot crashed"));

    await expect(collectScreenshot(page)).rejects.toThrow("screenshot crashed");
  });
});

describe("collectProbe", () => {
  const probes = [
    { name: "title", selector: "h1" },
    { name: "balance", selector: "[data-balance]" },
  ];

  it("returns one conforming ProbeResult per probe definition", async () => {
    const { page, mocks } = createPageMock();
    mocks.locator.mockImplementation((selector: string) => ({
      innerHTML: vi.fn(async () => ""),
      first: vi.fn(() => ({
        textContent: vi.fn(async () =>
          selector === "h1" ? "Portfolio" : "12,450.00",
        ),
      })),
    }));

    const results = await collectProbe(page, probes);

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ name: "title", value: "Portfolio" });
    expect(results[1]).toMatchObject({ name: "balance", value: "12,450.00" });
    expect(results[0]!.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(probeResultSchema.safeParse(results[0]!).success).toBe(true);
    expect(probeResultSchema.safeParse(results[1]!).success).toBe(true);
  });

  it("uses .first() so multi-match selectors avoid strict-mode failures", async () => {
    const { page, mocks } = createPageMock();
    const firstLocator = vi.fn(() => ({ textContent: vi.fn(async () => "first-match") }));
    mocks.locator.mockImplementation(() => ({
      innerHTML: vi.fn(async () => ""),
      first: firstLocator,
    }));

    const results = await collectProbe(page, [{ name: "row", selector: "tr" }]);

    expect(firstLocator).toHaveBeenCalledTimes(1);
    expect(results[0]!.value).toBe("first-match");
  });

  it("coerces a null textContent to an empty string value", async () => {
    const { page, mocks } = createPageMock();
    mocks.locator.mockImplementation(() => ({
      innerHTML: vi.fn(async () => ""),
      first: vi.fn(() => ({ textContent: vi.fn(async () => null) })),
    }));

    const results = await collectProbe(page, [{ name: "empty", selector: "svg" }]);

    expect(results[0]).toMatchObject({ name: "empty", value: "" });
    expect(probeResultSchema.safeParse(results[0]!).success).toBe(true);
  });

  it("throws with the probe name when a selector is missing", async () => {
    const { page, mocks } = createPageMock();
    mocks.locator.mockImplementation(() => ({
      innerHTML: vi.fn(async () => ""),
      first: vi.fn(() => ({
        textContent: vi.fn(async () => {
          throw new Error("selector did not match any element");
        }),
      })),
    }));

    await expect(
      collectProbe(page, [{ name: "ghost", selector: ".nope" }]),
    ).rejects.toThrow(/ghost/);
  });

  it("rejects a null/broken entry in the probes array", async () => {
    const { page } = createPageMock();

    await expect(
      collectProbe(page, [null as unknown as Probe]),
    ).rejects.toThrow();
  });
});

describe("collectors record", () => {
  it("keys the four concerns and forwards each to its collector", async () => {
    expect(Object.keys(collectors).sort()).toEqual([
      "network",
      "probe",
      "screenshot",
      "snapshot",
    ]);
    for (const collector of Object.values(collectors)) {
      expect(typeof collector).toBe("function");
    }
  });
});