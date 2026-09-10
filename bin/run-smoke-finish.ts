// The operator-facing completion of a `npm run run:smoke` process: which code
// the three exit paths return (zero-scenario/modelVersion guard, all-failed
// guard, success) and the invariant that the handoff line is printed LAST on
// every completion path. Extracted from bin/run-smoke.ts as a pure function —
// no process.exit, no I/O — so the process surface is unit-pinnable
// (bin/run-smoke.test.ts) without a live CDP browser.

import { handoffLine } from "../orchestrator/handlinks.js";

export interface RunSmokeScenario {
  id: string;
  passed: boolean;
  error?: string;
}

export interface RunSmokeResult {
  planId: string;
  modelVersion: string;
  scenarios: RunSmokeScenario[];
  setup?: RunSmokeScenario[];
  runId?: string;
}

export interface RunFinish {
  out: string[];
  err: string[];
  exitCode: number;
}

/**
 * Decide the completion of a run-smoke process. `out` and `err` are ordered
 * exactly as the CLI prints them (err first, then out), so the handoff line —
 * when there is one — is always the final line a terminal shows. Pure:
 * returns `{ out, err, exitCode }`; the CLI owns printing and `process.exit`.
 */
export function finishRun(
  result: RunSmokeResult,
  corpusDir: string,
  elapsedSeconds: number,
): RunFinish {
  const out: string[] = [];
  const err: string[] = [];

  for (const setup of result.setup ?? []) {
    if (!setup.passed) {
      err.push(`[SETUP FAIL] ${setup.id} — ${setup.error ?? "bootstrap failed"}`);
    }
  }

  const printHandoff = (): void => {
    const line = handoffLine(
      result,
      corpusDir,
      result.scenarios.some((scenario) => !scenario.passed),
    );
    if (line !== null) {
      out.push(line);
    }
  };

  if (result.scenarios.length === 0) {
    err.push(
      `Run produced zero scenarios (plan "${result.planId}", modelVersion "${result.modelVersion}"). ` +
        `This is usually a modelVersion mismatch: the smoke plan's embedded modelVersion does not ` +
        `match the current model. Regenerate the test plan or check for stale model files.`,
    );
    printHandoff();
    return { out, err, exitCode: 1 };
  }

  const passed = result.scenarios.filter((scenario) => scenario.passed).length;

  if (passed === 0) {
    err.push(
      `Run failed: 0/${result.scenarios.length} scenarios passed in ${elapsedSeconds.toFixed(1)}s. ` +
        `All scenarios failed — inspect the per-scenario errors above and the corpus in ` +
        `${corpusDir}/ to diagnose. Exiting non-zero.`,
    );
    printHandoff();
    return { out, err, exitCode: 1 };
  }

  const setup = result.setup ?? [];
  const setupPassed = setup.filter((s) => s.passed).length;
  const setupFailed = setup.length - setupPassed;
  out.push(
    `Run complete: ${passed}/${result.scenarios.length} scenarios passed in ${elapsedSeconds.toFixed(1)}s` +
      ` (${setupPassed} bootstrapped` +
      (setupFailed > 0 ? `, ${setupFailed} setup failures` : "") +
      `). ` +
      `CDP connection closed on completion; the human's browser stays open (detached, never closed). ` +
      `Corpus written to ${corpusDir}/.`,
  );
  printHandoff();
  return { out, err, exitCode: 0 };
}