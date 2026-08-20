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
  /** Path to the screenshot file within the run-namespaced corpus. */
  filePath: z.string(),
  /** ISO-8601 capture timestamp. */
  capturedAt: z.string(),
});
export type ScreenshotRef = z.infer<typeof screenshotRefSchema>;

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

/** A named test plan (AD-19). Minimal for now; the per-scenario path/collection/validators shape lands with Story 1.6. */
export const testPlanSchema = z.object({
  /** Which of the three named plans this is. */
  planId: planIdSchema,
  /** Model version this plan was derived from (SHA-256 of the model files, AD-17). */
  modelVersion: z.string(),
  /** Ids of the scenarios this plan covers. */
  scenarioIds: z.array(z.string()),
});
export type TestPlan = z.infer<typeof testPlanSchema>;
