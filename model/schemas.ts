import { z } from "zod";

// schemas.ts is the single home for every shared shape (AD-13): the canonical
// corpus data types and the plan/artifact types. TypeScript types are inferred
// from the Zod schemas below; corpus and plan/artifact shapes are declared only here (the FSM/contract model shapes live in fsm.ts / contracts.ts).

// ---- Corpus data (initial minimal shapes; Epic 2 collectors own the final contract) ----

/** Serialized DOM/aria capture from one scenario step (plain data). */
export const snapshotRecordSchema = z.object({
  /** Id of the FSM state the snapshot was captured in. */
  stateId: z.string(),
  /** Serialized snapshot content (plain text). */
  snapshot: z.string(),
  /** ISO-8601 capture timestamp. */
  capturedAt: z.string(),
});
export type SnapshotRecord = z.infer<typeof snapshotRecordSchema>;

/** A single captured HTTP request/response event (plain data). */
export const networkEventSchema = z.object({
  /** Request URL. */
  url: z.string(),
  /** HTTP method (e.g. GET, POST). */
  method: z.string(),
  /** HTTP response status code. */
  status: z.number(),
  /** ISO-8601 capture timestamp. */
  capturedAt: z.string(),
});
export type NetworkEvent = z.infer<typeof networkEventSchema>;

/** A targeted DOM probe result — one extracted value (plain data). */
export const probeResultSchema = z.object({
  /** Stable probe name. */
  name: z.string(),
  /** Extracted value, serialized to a string. */
  value: z.string(),
  /** ISO-8601 capture timestamp. */
  capturedAt: z.string(),
});
export type ProbeResult = z.infer<typeof probeResultSchema>;

/** A reference to a screenshot file, never the image bytes (plain data). */
export const screenshotRefSchema = z.object({
  /** Corpus-relative path to the PNG within the run (e.g. screenshots/<runId>/<stepIndex>.png). */
  filePath: z
    .string()
    .refine((p) => !/^([A-Za-z]:[\\/]|[\\/])/.test(p), {
      message: "filePath must be corpus-relative, not absolute",
    }),
  /** ISO-8601 capture timestamp. */
  capturedAt: z.string(),
});
export type ScreenshotRef = z.infer<typeof screenshotRefSchema>;

// ---- Shared collector input shapes (AD-13: single home for every shared shape) ----

/** A targeted DOM probe definition: stable name + CSS selector (plain data). */
export const probeSchema = z.object({
  /** Stable probe name — required, non-empty, and not whitespace. */
  name: z.string().trim().min(1),
  /** CSS selector identifying the target element — required, non-empty, and not whitespace. */
  selector: z.string().trim().min(1),
});
export type Probe = z.infer<typeof probeSchema>;

/** Options for the snapshot collector: which FSM state the page was captured in. */
export const snapshotCollectorOptionsSchema = z.object({
  /** FSM stateId of the captured page — required, non-empty, and not whitespace. */
  stateId: z.string().trim().min(1),
});
export type SnapshotCollectorOptions = z.infer<typeof snapshotCollectorOptionsSchema>;

// ---- Shared in-memory shapes (AD-13: single home for every shared shape) ----

/** In-memory screenshot capture: raw PNG bytes plus capture timestamp. Never persisted directly — the corpus module writes the bytes and a corpus-relative ref (Story 2.3). */
export interface ScreenshotCapture {
  /** Raw PNG bytes, returned in-memory so the corpus module owns writing and naming. */
  buffer: Buffer;
  /** ISO-8601 capture timestamp. */
  capturedAt: string;
}

/** Live state of one corpus run: unique run-id plus the corpus-relative paths written so far. */
export interface CorpusRun {
  readonly runId: string;
  readonly files: string[];
}

/** Result of running one validator over a corpus (AD-14). */
export const validationResultSchema = z.object({
  /** Id of the contract the validator checks. */
  contractId: z.string(),
  /** Whether the corpus satisfied the contract. */
  passed: z.boolean(),
  /** Optional human-readable detail (typically only on failure). */
  details: z.string().optional(),
  /** Corpus data references the validator read. */
  corpusRefs: z.array(z.string()),
});
export type ValidationResult = z.infer<typeof validationResultSchema>;

// ---- Plan / artifact types ----

/** Named test plans drawn from a fixed traditional taxonomy (AD-19). */
export const planIdSchema = z.enum([
  "smoke",
  "regression",
  "acceptance",
] as const);
export type PlanId = z.infer<typeof planIdSchema>;

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

/** Configuration for the orchestrator run. */
export interface OrchestratorConfig {
  /** Base URL of the app under test. */
  baseUrl: string;
  /** Run in headless mode. Default: true. Meaningless under CDP-attach. */
  headless?: boolean;
  /** CSS selector to wait for after initial navigation. */
  readySelector: string;
  /** Per-step timeout in ms. Default: 30000. */
  stepTimeout: number;
  /** Total run timeout in ms. Default: 300000. */
  runTimeout: number;
  /** Absolute path to the corpus output directory. */
  corpusDir: string;
  /** Probe definitions passed to the probe collector. */
  probes: Probe[];
  /**
   * CDP endpoint to attach to an already-authenticated browser (AD-4 "via CDP").
   * When set, the orchestrator connects over CDP (chromium.connectOverCDP) to the
   * human's logged-in session, preserving 2FA state. When omitted, the orchestrator
   * launches a fresh anonymous Chromium — kept for local/CI tests only, never
   * viable against Kraken Pro's 2FA (no default; the runner sets it explicitly).
   */
  cdpUrl?: string;
}

/** Per-run manifest written to corpus/{runId}/run-manifest.json. */
export const runManifestSchema = z.object({
  /** Unique run identifier (UUID). */
  runId: z.string(),
  /** ISO-8601 timestamp of when the run started. */
  timestamp: z.string(),
  /** Corpus-relative file paths written during the run. */
  files: z.array(z.string()),
});
export type RunManifest = z.infer<typeof runManifestSchema>;

/** A named test plan (AD-19) with per-scenario execution paths. */
export const testPlanSchema = z.object({
  /** Which of the three named plans this is. */
  planId: planIdSchema,
  /** Model version this plan was derived from (SHA-256 of the model files, AD-17). */
  modelVersion: z.string(),
  /** Per-scenario execution paths — replaces scenarioIds. */
  scenarios: z.array(
    z.object({
      id: z.string(),
      steps: z.array(
        z.object({
          stateId: z.string(),
          contractId: z.string(),
        }),
      ),
    }),
  ),
});
export type TestPlan = z.infer<typeof testPlanSchema>;
