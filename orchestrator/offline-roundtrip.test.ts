// Cross-layer regression: a corpus RECORDED BY THE REAL ORCHESTRATOR must be
// loadable by `loadCorpusSteps` / `runValidatorsOffline` (retro F1).
//
// The orchestrator's own unit suite mocks `./corpus.js` entirely and the
// corpus-loader tests hand-write the file layout themselves, so neither could
// see the seam: the orchestrator wrote the per-step pre snapshot to a shared
// `pre.json` while the loader reads `{stepIndex}.pre.json` — offline
// re-validation then reported "missing snapshot evidence" on every real corpus.
//
// This file deliberately does NOT mock `./corpus.js`. It drives `runTestPlan`
// over a temp corpus dir with mocked playwright/collectors, then re-reads the
// resulting corpus through the real loader and asserts the pre-step evidence
// survives the round trip.

import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runTestPlan } from "./orchestrator.js";
import type { OrchestratorConfig, TestPlan } from "../model/schemas.js";
import { loadCorpusSteps } from "../validators/corpus-loader.js";
import { runValidatorsOffline } from "../validators/offline-runner.js";

const MODEL_VERSION = "test-hash-abc123";

vi.mock("../model/model-version.js", () => ({
  computeModelVersion: vi.fn(() => MODEL_VERSION),
}));

const mockGetByRole = vi.fn(() => ({
  click: vi.fn(async () => {}),
  first: vi.fn(() => ({ click: vi.fn(async () => {}) })),
}));
const mockWaitForURL = vi.fn(async () => {});
const mockWaitForSelector = vi.fn(async () => {});

vi.mock("playwright", () => ({
  chromium: {
    connectOverCDP: vi.fn(() =>
      Promise.resolve({
        contexts: vi.fn(() => [
          {
            newPage: vi.fn(() =>
              Promise.resolve({
                goto: vi.fn(async () => {}),
                waitForSelector: mockWaitForSelector,
                waitForURL: mockWaitForURL,
                keyboard: { press: vi.fn(async () => {}) },
                getByRole: mockGetByRole,
                getByText: vi.fn(() => mockGetByRole()),
                close: vi.fn(async () => {}),
              }),
            ),
          },
        ]),
        close: vi.fn(async () => {}),
      }),
    ),
    launch: vi.fn(),
  },
}));

vi.mock("../collectors/collect.js", () => ({
  collectors: {
    snapshot: vi.fn(async (_page: unknown, options: { stateId: string }) => {
      const { stateId } = options;
      return {
        stateId,
        url: stateId === "homePage" ? "https://pro.kraken.com/app/home" : "https://pro.kraken.com/app/history/main/ledger",
        snapshot: "",
        capturedAt: "2026-09-01T00:00:00.000Z",
      };
    }),
    network: vi.fn(async () => []),
    screenshot: vi.fn(async () => ({ buffer: Buffer.from("png"), capturedAt: "" })),
    probe: vi.fn(async () => [{ name: "selected-view", value: "Ledger", capturedAt: "2026-09-01T00:00:00.000Z" }]),
  },
}));

const homePageNavigationPlan: TestPlan = {
  planId: "smoke",
  modelVersion: MODEL_VERSION,
  scenarios: [
    {
      id: "click-history-main",
      steps: [{ stateId: "homePage", contractId: "clickHistoryMenuMain" }],
    },
  ],
};

function makeConfig(corpusDir: string): OrchestratorConfig {
  return {
    baseUrl: "https://pro.kraken.com/app/home",
    cdpUrl: "http://127.0.0.1:9222",
    readySelector: "[data-testid='overview-portfolio-hero-value-text']",
    settleSelector: "[aria-label='Side navigation']",
    corpusDir,
    stepTimeout: 5_000,
    runTimeout: 30_000,
    headless: true,
    probes: [
      { name: "selected-view", selector: 'a[role="tab"][aria-current="page"]', optional: true },
    ],
  };
}

describe("orchestrator → corpus-loader round trip (retro F1)", () => {
  let corpusDir: string;

  beforeEach(() => {
    corpusDir = mkdtempSync(join(tmpdir(), "orchestrator-roundtrip-"));
  });

  afterEach(() => {
    vi.clearAllMocks();
    rmSync(corpusDir, { recursive: true, force: true });
  });

  it("records a run the real orchestrator writes and loadCorpusSteps can read the per-step pre snapshot", async () => {
    const result = await runTestPlan(homePageNavigationPlan, makeConfig(corpusDir));
    expect(result.scenarios[0]!.passed).toBe(true);

    // The real corpus write produced exactly one run dir.
    const runIds = readdirSync(corpusDir).filter(
      (entry) => entry !== "snapshots" && entry !== "network" && entry !== "screenshots" && entry !== "probes",
    );
    expect(runIds).toHaveLength(1);
    const runId = runIds[0]!;

    // The real loader must see the per-step pre snapshot (`0.pre.json`).
    const steps = loadCorpusSteps(corpusDir, runId, homePageNavigationPlan);
    expect(steps).toHaveLength(1);
    expect(steps[0]!.evidence.pre).toBeDefined();
    expect(steps[0]!.evidence.post).toBeDefined();

    // And the offline runner must produce a PASS for the nav contract —
    // "missing snapshot evidence" on the precondition is exactly the retro F1 break.
    const results = runValidatorsOffline(corpusDir, runId, homePageNavigationPlan);
    const navResult = results.find((r) => r.contractId === "clickHistoryMenuMain");
    expect(navResult?.passed).toBe(true);
    expect(navResult?.corpusRefs).toContain("snapshot:pre");
  });
});