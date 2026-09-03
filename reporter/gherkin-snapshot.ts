// Run-time Gherkin snapshot producer (Story 2 follow-up).
//
// The .feature files are not part of the model and can drift during evolution,
// yet the report must embed the Gherkin that was actually run (CAP-4). Instead
// of hand-authoring the Gherkin into the relation map — a redundant copy that
// could go stale — the runner captures it at run time from the feature files
// and stores the snapshot (scenarioId → source text) into the run dir, where
// the reporter reads it back. This module produces that snapshot.
//
// Pure with respect to a given file set: given a feature directory and the
// relation map, it returns the exact Gherkin blocks keyed by scenario id.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { ScenarioRelation } from "../model/relations.js";

/** `scenarioId → verbatim Gherkin scenario source text`. */
export type GherkinSnapshot = Record<string, string>;

/**
 * Build a Gherkin snapshot by reading each referenced feature file and
 * extracting the scenario block that matches each relation's scenario title.
 *
 * Scenarios with no matching block in the feature file are omitted from the
 * snapshot (the reporter then falls back to title-only for those).
 */
export function buildGherkinSnapshot(
  featureDir: string,
  relations: readonly ScenarioRelation[],
): GherkinSnapshot {
  const snapshot: GherkinSnapshot = {};
  const byFeature = new Map<string, ScenarioRelation[]>();

  for (const rel of relations) {
    const list = byFeature.get(rel.feature) ?? [];
    list.push(rel);
    byFeature.set(rel.feature, list);
  }

  for (const [feature, rels] of byFeature) {
    let source: string;
    try {
      source = readFileSync(join(featureDir, `${feature}.feature`), "utf8");
    } catch (error) {
      // A missing feature file legitimately contributes no scenarios, so it is
      // skipped silently. Any other read failure (permissions, encoding) is a
      // real error and must not be masked as an empty snapshot.
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    for (const rel of rels) {
      const block = extractScenario(source, rel.scenarioTitle);
      if (block !== undefined) snapshot[rel.scenarioId] = block;
    }
  }

  return snapshot;
}

/**
 * Extract the verbatim Gherkin block for the scenario whose title matches
 * `scenarioTitle`. Returns `undefined` when no matching scenario is found.
 *
 * A scenario block runs from its `Scenario:` line (or `Scenario Outline:`,
 * `Scenarios:`) through the next top-level Gherkin keyword (`Scenario`,
 * `Scenario Outline`, `Scenarios`, `Background`, `Feature`, `Rule`, `Examples`)
 * or the end of the file. Only `Scenario` blocks are candidates; a match must
 * align the title text after the `Scenario:` keyword.
 */
function extractScenario(source: string, scenarioTitle: string): string | undefined {
  const lines = source.split("\n");
  const prefix = "Scenario:";
  const title = scenarioTitle.trim();

  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith(prefix)) {
      const candidate = trimmed.slice(prefix.length).trim();
      if (candidate === title) {
        start = i;
        break;
      }
    }
  }
  if (start === -1) return undefined;

  // Find the end of this scenario — the next top-level keyword line.
  const topLevel = /^(Scenario|Scenario Outline|Scenarios|Background|Feature|Rule|Examples):/;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (topLevel.test(lines[i].trim())) {
      end = i;
      break;
    }
  }

  return lines.slice(start, end).join("\n");
}
