// Adjudication record reporter (Story 3.5) — given failing ValidationResults
// and an explicit human decision, writes `{corpusDir}/{runId}/adjudication.json`
// recording the decision, the failing contracts, plan + model version, and the
// human approval marker (FR-8). Pure + deterministic (NFR-1): same inputs →
// byte-identical record; no browser, no network, no AI.
//
// The module is deliberately NOT a write path to the model — it records the
// decision; applying it stays a separate, human-reviewed model edit (Story 1.5,
// AD-10). No function turns a ValidationResult into a model change by itself;
// the record never embeds a git write.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { TestPlan, ValidationResult } from "../model/schemas.js";

/** The two valid adjudication decisions — a discriminated union. */
export type AdjudicationDecision =
  | { decision: "spec-drift"; proposal: string }
  | { decision: "app-bug"; bugReportRef: string };

/** Inputs to `emitAdjudicationRecord`. */
export interface EmitAdjudicationRecordInput {
  /** Absolute path to the corpus output directory. */
  corpusDir: string;
  /** Run-id of the recorded corpus run the results were produced against. */
  runId: string;
  /** The test plan the run executed (names plan id + model version). */
  plan: TestPlan;
  /** Validator results for the run — only failing results are recorded. */
  results: ValidationResult[];
  /** The human decision — must be a complete discriminated-union member. */
  decision: AdjudicationDecision;
  /** Human who approved the decision. Required — a decision without an
   * approver is a silent edit (NO_APPROVAL). */
  approvedBy: string;
  /** ISO-8601 timestamp of the human's approval. Required — supplied by the
   * caller (the human's decision time), never stamped with `new Date()` inside
   * this module (NFR-1). */
  approvedAt: string;
}

/** The adjudication record written to `adjudication.json`. */
export interface AdjudicationRecord {
  runId: string;
  plan: { planId: string; modelVersion: string };
  contractIds: string[];
  decision: "spec-drift" | "app-bug";
  /** Present only for `app-bug` decisions. */
  bugReportRef?: string;
  /** Present only for `spec-drift` decisions — the human-approved proposal,
   * recorded verbatim. */
  proposal?: string;
  updated: string;
  approvedBy: string;
}

/**
 * Validate that the decision is a complete, non-half decision and that the
 * approval markers are present. Throws on any violation — a decision without
 * full approval markers is a silent edit, which is forbidden.
 */
function validateDecision(input: EmitAdjudicationRecordInput): void {
  if (
    !input.decision ||
    typeof input.decision !== "object" ||
    !("decision" in input.decision)
  ) {
    throw new Error(
      "Adjudication requires a complete decision (spec-drift or app-bug). " +
        "A half-decision is not allowed.",
    );
  }

  const d = input.decision as AdjudicationDecision;
  if (d.decision !== "spec-drift" && d.decision !== "app-bug") {
    // The never check is unreachable with a correct discriminated union but
    // guards against a widened input at runtime.
    throw new Error(
      `Unknown decision type: "${String((d as { decision: string }).decision)}". Must be "spec-drift" or "app-bug".`,
    );
  }

  if (d.decision === "spec-drift") {
    const p = (d as { proposal?: unknown }).proposal;
    if (typeof p !== "string" || p.trim() === "") {
      throw new Error(
        'Decision "spec-drift" requires a non-empty "proposal" field.',
      );
    }
  }

  if (d.decision === "app-bug") {
    const r = (d as { bugReportRef?: unknown }).bugReportRef;
    if (typeof r !== "string" || r.trim() === "") {
      throw new Error(
        'Decision "app-bug" requires a non-empty "bugReportRef" field.',
      );
    }
  }

  if (!input.approvedBy) {
    throw new Error(
      "Adjudication requires an approval marker: approvedBy is missing. " +
        "A decision without the approval marker is a silent edit.",
    );
  }

  if (!input.approvedAt) {
    throw new Error(
      "Adjudication requires an approval marker: approvedAt is missing. " +
        "A decision without the approval marker is a silent edit.",
    );
  }
}

/**
 * Render the adjudication record as a deterministic JSON string.
 * Keys are sorted lexicographically so identical inputs always produce
 * byte-identical output (NFR-1).
 */
function renderRecord(record: AdjudicationRecord): string {
  const ordered: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    const val = (record as unknown as Record<string, unknown>)[key];
    if (val !== undefined) {
      ordered[key] = val;
    }
  }
  return JSON.stringify(ordered, null, 2) + "\n";
}

/**
 * Emit an adjudication record for a set of failing results and a human
 * decision (Story 3.5, FR-8).
 *
 * Given failing results and an explicit human decision (`spec-drift` with a
 * proposal, or `app-bug` with a bug-report reference), writes
 * `{corpusDir}/{runId}/adjudication.json` recording the failing contract ids,
 * plan id + model version, the decision, and `updated` equal to the
 * caller-supplied `approvedAt`. For `spec-drift` the record carries the
 * human-approved proposal; for `app-bug` it carries the bug-report reference.
 *
 * Empty or all-passing results write nothing and return `[]`. A missing or
 * incomplete decision or approval marker throws immediately — no unadjudicated
 * record can exist.
 *
 * @returns the corpus-relative paths written (always at most one entry) or `[]`
 *   when nothing was written.
 */
export function emitAdjudicationRecord(
  input: EmitAdjudicationRecordInput,
): string[] {
  const failures = input.results.filter((r) => !r.passed);
  if (failures.length === 0) {
    return [];
  }

  validateDecision(input);

  const contractIds = [...new Set(failures.map((r) => r.contractId))].sort();

  const record: AdjudicationRecord = {
    runId: input.runId,
    plan: { planId: input.plan.planId, modelVersion: input.plan.modelVersion },
    contractIds,
    decision: input.decision.decision,
    updated: input.approvedAt,
    approvedBy: input.approvedBy,
  };

  if (input.decision.decision === "app-bug") {
    record.bugReportRef = input.decision.bugReportRef;
  } else {
    record.proposal = input.decision.proposal;
  }

  const content = renderRecord(record);
  const relPath = `${input.runId}/adjudication.json`;
  mkdirSync(join(input.corpusDir, input.runId), { recursive: true });
  writeFileSync(join(input.corpusDir, relPath), content);

  return [relPath];
}
