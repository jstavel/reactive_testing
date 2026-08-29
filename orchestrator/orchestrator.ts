import type { Page } from "playwright";

import { ProbePartialError } from "../collectors/collect-probe.js";
import { collectors } from "../collectors/collect.js";
import { homePageModel } from "../model/fsm.js";
import { computeModelVersion } from "../model/model-version.js";
import type {
  CollectorError,
  CollectorName,
  CorpusRun,
  OrchestratorConfig,
  ProbeResult,
  RunResult,
  ScenarioResult,
  ScreenshotRef,
  TestPlan,
} from "../model/schemas.js";
import { testPlanSchema } from "../model/schemas.js";
import { actionMap } from "./action-map.js";
import { closeBrowser, launchBrowser } from "./browser.js";
import {
  startCorpusRun,
  writeCorpusFile,
  finishRun,
} from "./corpus.js";

const DEFAULT_STEP_TIMEOUT = 30_000;
const DEFAULT_RUN_TIMEOUT = 300_000;

/**
 * Run a test plan against a live app. No AI in the loop — fully deterministic.
 *
 * Pre-execution: Zod parse, modelVersion check, FSM state/contract existence, path validity.
 * Execution: initial-state bootstrap, then step-by-step with settling.
 * Failure: step timeout → abort scenario; run timeout → abort all.
 */
export async function runTestPlan(
  plan: TestPlan,
  config: OrchestratorConfig,
  onScenario?: (result: ScenarioResult) => void,
): Promise<RunResult> {
  const stepTimeout = config.stepTimeout ?? DEFAULT_STEP_TIMEOUT;
  const runTimeout = config.runTimeout ?? DEFAULT_RUN_TIMEOUT;

  // --- Pre-execution validation ---
  const parsed = testPlanSchema.parse(plan);

  if (parsed.modelVersion !== computeModelVersion()) {
    return {
      planId: parsed.planId,
      modelVersion: parsed.modelVersion,
      scenarios: [],
    };
  }

  validatePlan(parsed);

  // --- Launch browser ---
  let session;
  try {
    session = await launchBrowser({
      baseUrl: config.baseUrl,
      headless: config.headless,
      readySelector: config.readySelector,
      cdpUrl: config.cdpUrl,
      stepTimeout,
    });
  } catch (err) {
    return {
      planId: parsed.planId,
      modelVersion: parsed.modelVersion,
      scenarios: parsed.scenarios.map((s) => ({
        id: s.id,
        passed: false,
        error: `Browser launch failed: ${err instanceof Error ? err.message : String(err)}`,
      })),
    };
  }

  const { page } = session;
  const scenarioResults: ScenarioResult[] = [];
  const collectorErrors: CollectorError[] = [];
  const runStart = Date.now();
  const runTimestamp = new Date().toISOString();
  const corpus = startCorpusRun();

  try {
    let stepIndex = 0;

    for (const scenario of parsed.scenarios) {
      if (Date.now() - runStart >= runTimeout) {
        const timeoutResult: ScenarioResult = {
          id: scenario.id,
          passed: false,
          error: "Run timeout exceeded",
        };
        scenarioResults.push(timeoutResult);
        notify(onScenario, timeoutResult);
        continue;
      }

      const result = await executeScenario(
        scenario,
        page,
        stepTimeout,
        config.readySelector,
        config,
        corpus,
        stepIndex,
        collectorErrors,
      );
      stepIndex += scenario.steps.length;
      scenarioResults.push(result);
      notify(onScenario, result);
    }

    finishRun(config.corpusDir, corpus, runTimestamp, collectorErrors);
  } finally {
    await closeBrowser();
  }

  return {
    planId: parsed.planId,
    modelVersion: parsed.modelVersion,
    scenarios: scenarioResults,
  };
}

// ---- Internal helpers ----

/**
 * Invoke the optional progress callback, shielding the run from a throwing
 * caller. A misbehaving onScenario must never abort the run before the corpus
 * is finalized.
 */
function notify(
  onScenario: ((result: ScenarioResult) => void) | undefined,
  result: ScenarioResult,
): void {
  if (!onScenario) {
    return;
  }
  try {
    onScenario(result);
  } catch (err) {
    console.warn(
      `Progress callback threw for scenario "${result.id}": ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

function validatePlan(plan: TestPlan): void {
  const stateIds = new Set(homePageModel.states.map((s) => s.stateId));
  const contractIds = new Set(
    homePageModel.transitions.map((t) => t.contractId),
  );

  for (const scenario of plan.scenarios) {
    for (const step of scenario.steps) {
      if (!stateIds.has(step.stateId)) {
        throw new Error(
          `Scenario "${scenario.id}" step references unknown stateId "${step.stateId}".`,
        );
      }
      if (!contractIds.has(step.contractId)) {
        throw new Error(
          `Scenario "${scenario.id}" step references unknown contractId "${step.contractId}".`,
        );
      }
      if (!(step.contractId in actionMap)) {
        throw new Error(
          `Scenario "${scenario.id}" step contractId "${step.contractId}" has no action-map entry.`,
        );
      }
    }

    // Path validity: each step's stateId must match a transition's from,
    // and the next step's stateId must match the transition's to.
    for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i]!;
      const transition = homePageModel.transitions.find(
        (t) => t.from === step.stateId && t.contractId === step.contractId,
      );
      if (!transition) {
        throw new Error(
          `Scenario "${scenario.id}" step ${i}: no transition from "${step.stateId}" via "${step.contractId}".`,
        );
      }
      if (i < scenario.steps.length - 1) {
        const nextStep = scenario.steps[i + 1]!;
        if (transition.to !== nextStep.stateId) {
          throw new Error(
            `Scenario "${scenario.id}" step ${i} leads to "${transition.to}" but next step starts from "${nextStep.stateId}".`,
          );
        }
      }
    }
  }
}

async function executeScenario(
  scenario: { id: string; steps: Array<{ stateId: string; contractId: string }> },
  page: Page,
  stepTimeout: number,
  readySelector: string,
  config: OrchestratorConfig,
  corpus: CorpusRun,
  startStepIndex: number,
  errors: CollectorError[],
): Promise<ScenarioResult> {
  try {
    for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i]!;
      const stepIndex = startStepIndex + i;

      const action = actionMap[step.contractId];
      if (!action) {
        throw new Error(`No action for contractId "${step.contractId}".`);
      }
      await withTimeout(action({ page }), stepTimeout);
      await page.waitForSelector(readySelector, { timeout: stepTimeout });

      // Collect and persist after every step. Each collector runs under its own
      // isolation boundary (AD-16): a collector THROW becomes a recorded gap in
      // the manifest `errors` while the remaining collectors and later steps
      // still run; a collector exceeding stepTimeout rethrows and fails the
      // scenario exactly as it did before isolation.
      const snapshot = await isolateCollector(
        "snapshot",
        stepIndex,
        stepTimeout,
        errors,
        () => collectors.snapshot(page, { stateId: step.stateId }),
      );
      if (snapshot.status === "ok") {
        writeCorpusFile(
          config.corpusDir, corpus, "snapshots", stepIndex, "json",
          JSON.stringify(snapshot.value),
        );
      }

      const network = await isolateCollector(
        "network",
        stepIndex,
        stepTimeout,
        errors,
        () => collectors.network(page),
      );
      if (network.status === "ok") {
        writeCorpusFile(
          config.corpusDir, corpus, "network", stepIndex, "json",
          JSON.stringify(network.value),
        );
      }

      const capture = await isolateCollector(
        "screenshot",
        stepIndex,
        stepTimeout,
        errors,
        () => collectors.screenshot(page),
      );
      if (capture.status === "ok") {
        const pngPath = writeCorpusFile(
          config.corpusDir, corpus, "screenshots", stepIndex, "png",
          capture.value.buffer,
        );
        const screenshotRef: ScreenshotRef = {
          filePath: pngPath,
          capturedAt: capture.value.capturedAt,
        };
        writeCorpusFile(
          config.corpusDir, corpus, "screenshots", stepIndex, "json",
          JSON.stringify(screenshotRef),
        );
      }

      const probes = await isolateCollector(
        "probe",
        stepIndex,
        stepTimeout,
        errors,
        () => collectors.probe(page, config.probes),
      );
      if (probes.status === "ok") {
        writeCorpusFile(
          config.corpusDir, corpus, "probes", stepIndex, "json",
          JSON.stringify(probes.value),
        );
      } else if (probes.partialProbes !== undefined) {
        // A probe batch failed partway: persist the results already collected
        // as partial corpus instead of discarding them.
        writeCorpusFile(
          config.corpusDir, corpus, "probes", stepIndex, "json",
          JSON.stringify(probes.partialProbes),
        );
      }
    }
    return { id: scenario.id, passed: true };
  } catch (err) {
    return {
      id: scenario.id,
      passed: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Result of one isolated collector call: its value, or a recorded gap. */
type CollectorOutcome<T> =
  | { status: "ok"; value: T }
  | { status: "gap"; partialProbes?: ProbeResult[] };

/**
 * Run one collector call under the step timeout and isolate failures. A THROW
 * becomes a `CollectorError` gap appended to `errors` and the collector's
 * output is skipped; a TIMEOUT (StepTimeoutError) is rethrown so the scenario
 * still fails — the isolation boundary catches throws, never a stepTimeout.
 * Partial probe results carried by a `ProbePartialError` are returned so the
 * step loop persists them instead of discarding already-collected evidence.
 */
async function isolateCollector<T>(
  name: CollectorName,
  stepIndex: number,
  stepTimeout: number,
  errors: CollectorError[],
  call: () => Promise<T>,
): Promise<CollectorOutcome<T>> {
  try {
    const value = await withTimeout(call(), stepTimeout);
    return { status: "ok", value };
  } catch (err) {
    if (err instanceof StepTimeoutError) {
      // Name the collector that hung so the symptom is diagnosable.
      throw new StepTimeoutError(stepTimeout, name);
    }
    errors.push({
      collector: name,
      stepIndex,
      error: err instanceof Error ? err.message : String(err),
    });
    if (err instanceof ProbePartialError) {
      return { status: "gap", partialProbes: err.partialResults };
    }
    return { status: "gap" };
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new StepTimeoutError(ms));
    }, ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Raised when a step (action, settle, or collector call) exceeds stepTimeout.
 * Distinguishable from a collector THROW so per-collector isolation can rethrow
 * it: a collector timeout still fails the scenario; only a collector throw
 * becomes a gap (AD-16). The action/settle path keeps the generic message;
 * the isolation path rethrows with the hung collector's name attached.
 */
class StepTimeoutError extends Error {
  constructor(ms: number, collector?: CollectorName) {
    super(
      collector
        ? `Collector "${collector}" timed out after ${ms}ms`
        : `Step timed out after ${ms}ms`,
    );
    this.name = "StepTimeoutError";
  }
}
