# Expanded TestPlan Schema

The current `TestPlan` in `model/schemas.ts` carries `planId`, `modelVersion`, and `scenarioIds: string[]`. This story expands it with per-scenario execution paths.

## New Types

```typescript
/** One step in a scenario's path through the FSM. */
export interface ScenarioStep {
  /** FSM stateId this step starts from. */
  stateId: string;
  /** ContractId to execute in this state. */
  contractId: string;
}

/** A scenario with its execution path. */
export interface ScenarioPath {
  /** Stable scenario id (kebab-case slug). */
  id: string;
  /** Ordered steps through the FSM. */
  steps: ScenarioStep[];
}

/** Result of a single scenario execution. */
export interface ScenarioResult {
  id: string;
  passed: boolean;
  error?: string;
}

/** Result of a test plan run. */
export interface RunResult {
  planId: PlanId;
  modelVersion: string;
  scenarios: ScenarioResult[];
}
```

## Updated TestPlan

```typescript
export const testPlanSchema = z.object({
  planId: planIdSchema,
  modelVersion: z.string(),
  /** Per-scenario execution paths — replaces scenarioIds. */
  scenarios: z.array(z.object({
    id: z.string(),
    steps: z.array(z.object({
      stateId: z.string(),
      contractId: z.string(),
    })),
  })),
});
```

## OrchestratorConfig

```typescript
export interface OrchestratorConfig {
  /** Base URL of the app under test. */
  baseUrl: string;
  /** Run in headless mode. Default: true. */
  headless: boolean;
  /** CSS selector to wait for after initial navigation. */
  readySelector: string;
  /** Per-step timeout in ms. Default: 30000. */
  stepTimeout: number;
  /** Total run timeout in ms. Default: 300000. */
  runTimeout: number;
}
```
