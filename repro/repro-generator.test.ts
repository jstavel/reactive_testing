import { afterEach, describe, expect, it } from "vitest";
import { rm, readFile, access } from "node:fs/promises";
import { join } from "node:path";

import { generateReproScript, writeReproScript, type ReproPath } from "./repro-generator.js";

const SCRIPTS_DIR = "scripts";

function validPath(overrides: Partial<ReproPath> = {}): ReproPath {
  return {
    slug: "portfolio-summary",
    baseUrl: "https://pro.kraken.com/app/home",
    readySelector: '[data-testid="overview-portfolio-hero-value-text"]',
    settleSelector: '[aria-label="Side navigation"]',
    cdpUrl: "http://127.0.0.1:9222",
    steps: [
      { stateId: "homePage", contractId: "openPortfolioSummary" },
      { stateId: "portfolioSummaryDialog", contractId: "closePortfolioSummary" },
    ],
    ...overrides,
  };
}

afterEach(async () => {
  // Remove the generated file after each test so runs stay hermetic and a stale
  // repro never lingers in the tree.
  await rm(join(SCRIPTS_DIR, "repro-portfolio-summary.ts"), { force: true });
});

describe("generateReproScript", () => {
  it("emits source that imports playwright + model + action-map and nothing else (VALID_PATH)", () => {
    const source = generateReproScript(validPath());

    // Imports: the three allowed testware deps.
    expect(source).toContain('import { chromium } from "playwright";');
    expect(source).toContain('import { actionMap } from "../orchestrator/action-map.js";');
    expect(source).toContain('import { homePageModel } from "../model/fsm.js";');

    // No Orchestrator, Validator, validators, or collectors at runtime.
    expect(source).not.toContain("orchestrator/orchestrator.js");
    expect(source).not.toContain("../orchestrator/orchestrator");
    expect(source).not.toContain("validators/");
    expect(source).not.toContain("collectors/");
    expect(source).not.toMatch(/\bValidator\b/);
  });

  it("drives each step via the live action-map, in path order (VALID_PATH)", () => {
    const source = generateReproScript(validPath());

    // The emitted script calls `actionMap[...]` per step, never inlines locators.
    expect(source).toMatch(/actionMap\[step\.contractId\]/);

    // Steps appear in order as literal data (the reported bug path).
    const openIdx = source.indexOf("openPortfolioSummary");
    const closeIdx = source.indexOf("closePortfolioSummary");
    expect(openIdx).toBeGreaterThan(-1);
    expect(closeIdx).toBeGreaterThan(openIdx);
  });

  it("reads the current model at run time (guard on states and transitions)", () => {
    const source = generateReproScript(validPath());
    expect(source).toContain("homePageModel.states");
    expect(source).toContain("homePageModel.transitions");
    expect(source).toContain('no longer exists in the current model');
    expect(source).toContain("is no longer in the current model");
  });

  it("wraps each step so a runtime failure names the failing step (state, contract)", () => {
    const source = generateReproScript(validPath());
    expect(source).toContain("step ${i + 1} (${step.stateId} -> ${step.contractId})");
  });

  it("closes the run's own tab on failure and exits non-zero on error", () => {
    const source = generateReproScript(validPath());
    // Page close lives in a finally, bracketing the whole step loop.
    expect(source).toMatch(/finally \{[\s\S]*await page\.close\(\)/);
    // An explicit rejection handler turns a thrown step into a clean non-zero exit.
    expect(source).toContain("main().catch(");
    expect(source).toContain("process.exitCode = 1;");
  });

  it("is deterministic for identical inputs (NFR-1)", () => {
    const a = generateReproScript(validPath());
    const b = generateReproScript(validPath());
    expect(a).toBe(b);
  });

  it("bakes run config that mirrors run-smoke.ts", () => {
    const source = generateReproScript(
      validPath({
        baseUrl: "https://pro.kraken.com/app/home",
        readySelector: '[data-testid="overview-portfolio-hero-value-text"]',
        settleSelector: '[aria-label="Side navigation"]',
        cdpUrl: "http://127.0.0.1:9222",
      }),
    );
    expect(source).toContain('const CDP_URL = "http://127.0.0.1:9222";');
    expect(source).toContain('const BASE_URL = "https://pro.kraken.com/app/home";');
    expect(source).toContain('const SETTLE_SELECTOR = "[aria-label=\\"Side navigation\\"]";');
  });
});

describe("generateReproScript gaps (FR-12c)", () => {
  it("throws a gap for an empty path (EMPTY_PATH)", () => {
    expect(() => generateReproScript(validPath({ steps: [] }))).toThrow(/gap.*empty/);
  });

  it("throws a gap naming the step for an unknown state (UNKNOWN_STATE)", () => {
    expect(() =>
      generateReproScript(validPath({ steps: [{ stateId: "nonexistentPage", contractId: "clickHistoryMenuMain" }] })),
    ).toThrow(/gap.*nonexistentPage/);
    expect(() =>
      generateReproScript(validPath({ steps: [{ stateId: "nonexistentPage", contractId: "clickHistoryMenuMain" }] })),
    ).toThrow(/step 1/);
  });

  it("throws a gap naming the step for an unknown contract (UNKNOWN_CONTRACT)", () => {
    expect(() =>
      generateReproScript(validPath({ steps: [{ stateId: "homePage", contractId: "nonexistentContract" }] })),
    ).toThrow(/gap.*nonexistentContract/);
  });

  it("throws a gap naming the step for an undeclared transition (UNKNOWN_TRANSITION)", () => {
    expect(() =>
      generateReproScript(validPath({ steps: [{ stateId: "earn", contractId: "clickHistoryMenuMain" }] })),
    ).toThrow(/gap.*no transition from state "earn"/);
  });

  it("throws a gap for a non-kebab-case slug", () => {
    expect(() => generateReproScript(validPath({ slug: "Bad Slug" }))).toThrow(/gap.*slug/);
  });

  it("throws a gap for an unsafe slug", () => {
    expect(() => generateReproScript(validPath({ slug: "../../etc/passwd" }))).toThrow(/safe kebab-case filename/);
  });

  it("throws a gap for a missing baseUrl or readySelector", () => {
    expect(() => generateReproScript(validPath({ baseUrl: "" }))).toThrow(/gap.*baseUrl/);
    expect(() => generateReproScript(validPath({ readySelector: "" }))).toThrow(/gap.*readySelector/);
  });
});

describe("writeReproScript", () => {
  it("writes scripts/repro-<slug>.ts and returns the path", async () => {
    const path = await writeReproScript(validPath());
    expect(path).toBe(join(SCRIPTS_DIR, "repro-portfolio-summary.ts"));
    const content = await readFile(path, "utf8");
    expect(content).toContain('from "../orchestrator/action-map.js"');
    expect(content).toContain("actionMap[step.contractId]");
  });

  it("writes nothing when the path is a gap", async () => {
    await expect(
      writeReproScript(validPath({ steps: [{ stateId: "nope", contractId: "clickHistoryMenuMain" }] })),
    ).rejects.toThrow(/gap/);

    await expect(access(join(SCRIPTS_DIR, "repro-portfolio-summary.ts"))).rejects.toThrow();
  });
});