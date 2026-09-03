// Emitted-repro verification gate (epic-4 retro item-4). The standalone repro
// scripts emitted by repro-generator.ts are STRING templates: unit tests assert
// on substrings of the generated source, which cannot catch a malformed emitted
// script (unbalanced brace, broken loop, wrong identifier) or verify that the
// emitted runtime continuity guard actually works. This file closes both gaps:
//
//  1. COMPILE GATE — generates a repro into scripts/, runs the project
//     `tsc --noEmit` (the same check a reviewer used to run by hand), and
//     asserts the emitted artifact type-checks under the real project config.
//
//  2. EXECUTE GATE — imports the REAL emitted file in-process with the three
//     runtime deps (playwright, model, action-map) replaced by mocks, proving
//     the emitted JS actually runs. A generated-valid path runs to completion;
//     the same path made disjoint by a model edit (the exact scenario the
//     runtime continuity guard protects against) is caught at run time.
//
// The emitted file imports `../model/fsm.js` / `../orchestrator/action-map.js`
// / `playwright`; vi.mock intercepts those resolved modules for the emitted
// file just as for this test (vitest mocks are keyed by resolved URL).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { writeReproScript, type ReproPath } from "./repro-generator.js";

const execFileAsync = promisify(execFile);
const SCRIPTS_DIR = "scripts";
const TSC_BIN = join(process.cwd(), "node_modules", "typescript", "bin", "tsc");

/** The pages each emitted repro drives; records calls for assertion. */
interface FakePage {
  calls: string[];
}

/** Mutable mock model, set per-test so the emitted runtime guard sees it. */
const mock = vi.hoisted(() => {
  const model = {
    states: [] as string[],
    transitions: [] as Array<{ from: string; contractId: string; to: string }>,
    initialStateId: "homePage",
  };
  const pages: FakePage[] = [];
  return {
    model,
    pages,
  };
});

// The emitted repro imports { chromium } from "playwright". The fake browser
// opens one authenticated context + a fresh page whose goto waits on the ready
// selector and whose actions are all no-ops (recorded via the page's calls).
vi.mock("playwright", () => ({
  chromium: {
    connectOverCDP: async () => ({
      contexts: () => [
        {
          newPage: async () => {
            const page: FakePage & { goto: Function; waitForSelector: Function; close: Function } =
              {
                calls: [],
                goto: async () => ({ ok: () => true }),
                waitForSelector: async () => null,
                close: async () => {},
              };
            mock.pages.push(page);
            return page;
          },
        },
      ],
      close: async () => {},
    }),
  },
}));

// The emitted repro reads homePageModel.states / transitions / initialStateId at
// run time. Backed by the mutable `mock.model`, so a "spec edit" between
// generation and execution is observable to the emitted runtime guard.
vi.mock("../model/fsm.js", () => ({
  homePageModel: {
    get states() {
      return mock.model.states.map((stateId) => ({ stateId, label: stateId }));
    },
    get transitions() {
      return mock.model.transitions;
    },
    get initialStateId() {
      return mock.model.initialStateId;
    },
  },
}));

// The emitted repro resolves actionMap[step.contractId]. Any contract is an
// async no-op (the continuity guard is the behaviour under test; action
// presence is not the discriminator here). The `has` trap keeps
// validatePath's `contractId in actionMap` check passing at generation time.
vi.mock("../orchestrator/action-map.js", () => ({
  actionMap: new Proxy(
    {},
    {
      has: () => true,
      get: () => async () => {},
    },
  ),
}));

function validPath(overrides: Partial<ReproPath> = {}): ReproPath {
  return {
    slug: "verify-valid",
    baseUrl: "https://pro.kraken.com/app/home",
    readySelector: "[data-testid=ready]",
    settleSelector: "[aria-label=nav]",
    cdpUrl: "http://127.0.0.1:9222",
    steps: [
      { stateId: "homePage", contractId: "openPortfolioSummary" },
      { stateId: "portfolioSummaryDialog", contractId: "closePortfolioSummary" },
    ],
    ...overrides,
  };
}

/** A model where homePage --open--> dialog --close--> homePage (continuous). */
function setContinuousModel(): void {
  mock.model.states = ["homePage", "portfolioSummaryDialog"];
  mock.model.transitions = [
    { from: "homePage", contractId: "openPortfolioSummary", to: "portfolioSummaryDialog" },
    { from: "portfolioSummaryDialog", contractId: "closePortfolioSummary", to: "homePage" },
  ];
  mock.model.initialStateId = "homePage";
}

beforeEach(() => {
  // Both gates generate via validatePath, which reads homePageModel (mocked
  // here), so the model must be populated before generateReproScript runs.
  setContinuousModel();
});

afterEach(async () => {
  mock.pages.length = 0;
  await rm(join(SCRIPTS_DIR, "repro-verify-valid.ts"), { force: true });
  await rm(join(SCRIPTS_DIR, "repro-verify-runtime.ts"), { force: true });
});

describe("emitted-repro verification gate (item-4)", () => {
  describe("compile gate", () => {
    it("the emitted repro type-checks under the project tsconfig", async () => {
      await writeReproScript(validPath());
      // The emitted file lives in scripts/, inside tsconfig `include` — this is
      // the same `tsc --noEmit` a reviewer used by hand, now automated.
      await execFileAsync("node", [TSC_BIN, "--noEmit"]);
      // ExecFile resolves on exit 0; a type error rejects the promise.
    });
  });

  describe("execute gate (mocked deps)", () => {
    let exitCodeBefore: number | string | null | undefined;

    beforeEach(() => {
      exitCodeBefore = process.exitCode;
      setContinuousModel();
    });

    afterEach(() => {
      // Restore whatever the emitted repro's main().catch may have set.
      process.exitCode = exitCodeBefore;
    });

    it("a valid generated path runs to completion when imported", async () => {
      await writeReproScript(validPath({ slug: "verify-valid" }));
      mock.pages.length = 0;
      await import(`../scripts/repro-verify-${"valid"}.js`);

      // main() ran to completion: a page was opened and closed, and no
      // process.exitCode was set by a failure catch.
      expect(mock.pages.length).toBeGreaterThan(0);
      expect(process.exitCode).toBe(exitCodeBefore);
    });

    it("the runtime continuity guard catches a path a later model edit made disjoint", async () => {
      // Generate a path that is valid at GENERATION time...
      await writeReproScript(validPath({
        slug: "verify-runtime",
        steps: [
          { stateId: "homePage", contractId: "openPortfolioSummary" },
          { stateId: "portfolioSummaryDialog", contractId: "closePortfolioSummary" },
        ],
      }));

      // ...then "edit the spec": openPortfolioSummary now lands on historyMain,
      // so step 1's transition no longer matches step 2's start. The emitted
      // runtime guard must reject the disjoint path, not silently execute it.
      mock.model.transitions = [
        { from: "homePage", contractId: "openPortfolioSummary", to: "historyMain" },
        { from: "portfolioSummaryDialog", contractId: "closePortfolioSummary", to: "homePage" },
      ];
      mock.model.states = ["homePage", "portfolioSummaryDialog", "historyMain"];

      await import(`../scripts/repro-verify-${"runtime"}.js`);

      // The emitted main().catch set exitCode 1 to signal failure.
      expect(process.exitCode).toBe(1);
    });
  });
});
