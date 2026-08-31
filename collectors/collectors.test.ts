import { rmSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Page, Request, Response } from "playwright";

import {
  networkEventSchema,
  probeResultSchema,
  snapshotRecordSchema,
} from "../model/schemas.js";
import type { Probe } from "../model/schemas.js";
import { collectors } from "./collect.js";
import { collectNetwork } from "./collect-network.js";
import { ProbePartialError, collectProbe } from "./collect-probe.js";
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

/**
 * Build a Request-like handle as emitted by Playwright's `requestfailed`. A
 * `null` errorText stands in for `failure()` returning null (error absent).
 */
function makeRequest(
  url: string,
  method: string,
  errorText: string | null,
): Request {
  return {
    url: () => url,
    method: () => method,
    failure: () => (errorText === null ? null : { errorText }),
  } as unknown as Request;
}

function createPageMock(): {
  page: Page & { emit: (event: string, ...args: unknown[]) => boolean };
  mocks: Record<
    "locator" | "innerHTML" | "first" | "textContent" | "screenshot" | "waitForLoadState" | "on" | "off" | "url" | "count",
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
  const count = vi.fn(async () => 1);
  const locator = vi.fn(() => ({ innerHTML, first, count }));
  const screenshot = vi.fn(async () => undefined);
  const waitForLoadState = vi.fn(async () => undefined);
  const url = vi.fn(() => "https://app.test/current");

  // Playwright's Page inherits `emit` from EventEmitter at runtime but does not
  // declare it in its types; augment locally so tests can fire captured listeners.
  const page = {
    locator,
    on,
    off,
    emit,
    screenshot,
    waitForLoadState,
    url,
  } as unknown as Page & { emit: (event: string, ...args: unknown[]) => boolean };

  return {
    page,
    mocks: { locator, innerHTML, first, textContent, screenshot, waitForLoadState, on, off, url, count },
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
    expect(record.url).toBe("https://app.test/current");
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

  it("returns an empty array and still detaches both listeners when no responses are observed", async () => {
    const { page, mocks } = createPageMock();

    const events = await collectNetwork(page);

    expect(events).toEqual([]);
    expect(mocks.on).toHaveBeenCalledWith("response", expect.any(Function));
    expect(mocks.on).toHaveBeenCalledWith("requestfailed", expect.any(Function));
    // The response listener is attached first, then the requestfailed listener.
    const responseHandler = mocks.on.mock.calls[0]![1];
    const requestFailedHandler = mocks.on.mock.calls[1]![1];
    expect(mocks.off).toHaveBeenCalledWith("response", responseHandler);
    expect(mocks.off).toHaveBeenCalledWith("requestfailed", requestFailedHandler);
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

  it("captures a failed/aborted request as an error event without a status", async () => {
    const { page, mocks } = createPageMock();
    mocks.waitForLoadState.mockRejectedValueOnce(
      new Error("Timeout 5000ms exceeded"),
    );

    const eventsPromise = collectNetwork(page);
    page.emit(
      "requestfailed",
      makeRequest("https://app.test/broken", "GET", "net::ERR_ABORTED"),
    );

    const events = await eventsPromise;

    expect(events).toEqual([
      {
        url: "https://app.test/broken",
        method: "GET",
        error: "net::ERR_ABORTED",
        capturedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      },
    ]);
    expect(events[0]).not.toHaveProperty("status");
    expect(networkEventSchema.safeParse(events[0]!).success).toBe(true);
  });

  it("falls back to 'Request failed' when the failure errorText is empty or absent", async () => {
    const { page, mocks } = createPageMock();
    mocks.waitForLoadState.mockRejectedValueOnce(
      new Error("Timeout 5000ms exceeded"),
    );

    const eventsPromise = collectNetwork(page);
    page.emit("requestfailed", makeRequest("https://app.test/empty", "GET", ""));
    page.emit("requestfailed", makeRequest("https://app.test/absent", "POST", null));

    const events = await eventsPromise;

    expect(events).toHaveLength(2);
    expect(events[0]).toHaveProperty("error", "Request failed");
    expect(events[1]).toHaveProperty("error", "Request failed");
    expect(events[0]).not.toHaveProperty("status");
    expect(events[1]).not.toHaveProperty("status");
    for (const event of events) {
      expect(networkEventSchema.safeParse(event).success).toBe(true);
    }
  });

  it("returns captured events without throwing when the page closes", async () => {
    const { page, mocks } = createPageMock();
    mocks.waitForLoadState.mockRejectedValueOnce(
      new Error("Target page, context or browser has been closed"),
    );

    const eventsPromise = collectNetwork(page);
    page.emit("response", makeResponse("https://app.test/api", "GET", 200));

    const events = await eventsPromise;

    expect(events).toHaveLength(1);
    expect(events[0]!.url).toBe("https://app.test/api");
    expect(networkEventSchema.safeParse(events[0]!).success).toBe(true);
  });

  it("quarantines a throwing response listener and retains the other events", async () => {
    const { page, mocks } = createPageMock();
    mocks.waitForLoadState.mockRejectedValueOnce(
      new Error("Timeout 5000ms exceeded"),
    );

    const throwingResponse = {
      url: () => {
        throw new Error("Target closed");
      },
      request: () => ({ method: () => "GET" }),
      status: () => 500,
    } as unknown as Response;

    const eventsPromise = collectNetwork(page);
    page.emit("response", makeResponse("https://app.test/ok", "GET", 200));
    page.emit("response", throwingResponse);
    page.emit("response", makeResponse("https://app.test/after", "GET", 201));

    const events = await eventsPromise;

    expect(events).toHaveLength(2);
    expect(events[0]!.url).toBe("https://app.test/ok");
    expect(events[1]!.url).toBe("https://app.test/after");
    for (const event of events) {
      // Retained events are successful exchanges: status present, never error.
      expect(event).toHaveProperty("status");
      expect(event).not.toHaveProperty("error");
      expect(networkEventSchema.safeParse(event).success).toBe(true);
    }
  });

  it("quarantines a throwing requestfailed listener and retains the other failure events", async () => {
    const { page, mocks } = createPageMock();
    mocks.waitForLoadState.mockRejectedValueOnce(
      new Error("Timeout 5000ms exceeded"),
    );

    const throwingRequest = {
      url: () => {
        throw new Error("Target closed");
      },
      method: () => "GET",
      failure: () => ({ errorText: "net::ERR_FAILED" }),
    } as unknown as Request;

    const eventsPromise = collectNetwork(page);
    page.emit("requestfailed", throwingRequest);
    page.emit(
      "requestfailed",
      makeRequest("https://app.test/after-failure", "GET", "net::ERR_ABORTED"),
    );

    const events = await eventsPromise;

    expect(events).toHaveLength(1);
    expect(events[0]).toHaveProperty("error", "net::ERR_ABORTED");
    expect(events[0]).not.toHaveProperty("status");
    expect(networkEventSchema.safeParse(events[0]!).success).toBe(true);
  });

  it("records exactly one event when a request fires both response and requestfailed", async () => {
    const { page, mocks } = createPageMock();
    mocks.waitForLoadState.mockRejectedValueOnce(
      new Error("Timeout 5000ms exceeded"),
    );

    const sharedRequest = makeRequest("https://app.test/both", "GET", "net::ERR_ABORTED");
    const bothResponse = {
      url: () => "https://app.test/both",
      status: () => 500,
      request: () => sharedRequest,
    } as unknown as Response;

    const eventsPromise = collectNetwork(page);
    // First-wins: the response is recorded, the later requestfailed is skipped.
    page.emit("response", bothResponse);
    page.emit("requestfailed", sharedRequest);

    const events = await eventsPromise;

    expect(events).toHaveLength(1);
    expect(events[0]).toHaveProperty("status", 500);
    expect(events[0]).not.toHaveProperty("error");
    expect(networkEventSchema.safeParse(events[0]!).success).toBe(true);
  });

  it("detaches the requestfailed listener so repeated calls never double-count failures", async () => {
    const { page, mocks } = createPageMock();
    const firstWindow = deferred();
    const secondWindow = deferred();
    mocks.waitForLoadState
      .mockReturnValueOnce(firstWindow.promise)
      .mockReturnValueOnce(secondWindow.promise);

    const firstCollect = collectNetwork(page);
    page.emit(
      "requestfailed",
      makeRequest("https://app.test/fail-one", "GET", "net::ERR_FAILED"),
    );
    firstWindow.resolve();
    expect(await firstCollect).toHaveLength(1);

    const secondCollect = collectNetwork(page);
    page.emit(
      "requestfailed",
      makeRequest("https://app.test/fail-two", "GET", "net::ERR_FAILED"),
    );
    secondWindow.resolve();
    const secondEvents = await secondCollect;

    expect(mocks.off).toHaveBeenCalledWith("requestfailed", expect.any(Function));
    expect(secondEvents).toHaveLength(1);
    expect(secondEvents[0]!.url).toBe("https://app.test/fail-two");
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

  it("carries already-collected results in a ProbePartialError when a selector is missing", async () => {
    const { page, mocks } = createPageMock();
    // Purpose-built so the failure is independent of the shared fixture's order.
    const localProbes = [
      { name: "first-probe", selector: "[data-first]" },
      { name: "second-probe", selector: "[data-missing]" },
    ];
    let reads = 0;
    mocks.textContent.mockImplementation(async () => {
      reads += 1;
      if (reads === 1) return "first-value";
      throw new Error("selector did not match any element");
    });

    let err: ProbePartialError | null = null;
    try {
      await collectProbe(page, localProbes);
    } catch (e) {
      err = e instanceof ProbePartialError ? e : null;
    }

    expect(err).not.toBeNull();
    expect(err!.missingProbe).toBe("second-probe");
    expect(err!.partialResults).toHaveLength(1);
    expect(err!.partialResults[0]).toMatchObject({
      name: "first-probe",
      value: "first-value",
    });
    expect(probeResultSchema.safeParse(err!.partialResults[0]!).success).toBe(true);
    expect(err!.message).toMatch(/second-probe/);
  });

  it("rejects a null/broken entry in the probes array", async () => {
    const { page } = createPageMock();

    await expect(
      collectProbe(page, [null as unknown as Probe]),
    ).rejects.toThrow();
  });

  it("records an empty value for an optional probe whose selector is absent", async () => {
    const { page, mocks } = createPageMock();
    mocks.locator.mockImplementation(() => ({
      innerHTML: vi.fn(async () => ""),
      first: vi.fn(() => ({ textContent: vi.fn(async () => "unused") })),
      count: vi.fn(async () => 0),
    }));

    const results = await collectProbe(page, [
      { name: "selected-view", selector: 'a[role="tab"][aria-current="page"]', optional: true },
    ]);

    expect(results).toEqual([
      { name: "selected-view", value: "", capturedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) },
    ]);
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

describe("networkEventSchema", () => {
  it("requires exactly one of status or error — rejects blank, contradictory, wrong-typed, and blank-error events", () => {
    const base = { url: "https://a", method: "GET", capturedAt: "t" };
    // Blank: neither status nor error.
    expect(networkEventSchema.safeParse(base).success).toBe(false);
    // Contradictory: both present.
    expect(
      networkEventSchema.safeParse({ ...base, status: 200, error: "boom" }).success,
    ).toBe(false);
    // Wrong-typed fields can never form a valid event.
    expect(networkEventSchema.safeParse({ ...base, status: null }).success).toBe(false);
    expect(networkEventSchema.safeParse({ ...base, status: "200" }).success).toBe(false);
    expect(networkEventSchema.safeParse({ ...base, error: 42 }).success).toBe(false);
    // A blank error string is not a valid failed request.
    expect(networkEventSchema.safeParse({ ...base, error: "" }).success).toBe(false);
    // A successful exchange (status only) and a failed one (error only) parse.
    expect(networkEventSchema.safeParse({ ...base, status: 200 }).success).toBe(true);
    expect(networkEventSchema.safeParse({ ...base, error: "boom" }).success).toBe(true);
  });
});