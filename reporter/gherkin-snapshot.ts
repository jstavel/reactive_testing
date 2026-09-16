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

import { assertUniqueScenarioIds, type ScenarioRelation } from "../model/relations.js";

/** `scenarioId → verbatim Gherkin scenario source text`. */
export type GherkinSnapshot = Record<string, string>;

/**
 * Build a Gherkin snapshot by reading each referenced feature file and
 * extracting the scenario block that matches each relation's scenario title.
 *
 * Scenarios with no matching block in the feature file are omitted from the
 * snapshot (the reporter then falls back to title-only for those). Malformed
 * `relations` (duplicate/empty/mis-derived `scenarioId`s, duplicate
 * feature/title pairs) throw via `assertUniqueScenarioIds` BEFORE any file
 * I/O, so id-keyed writes can no longer silently overwrite.
 */
export function buildGherkinSnapshot(
  featureDir: string,
  relations: readonly ScenarioRelation[],
): GherkinSnapshot {
  assertUniqueScenarioIds(relations);
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
 * Both `Scenario:` and `Scenario Outline:` lines are candidates; a match must
 * align the title text after the keyword. `Scenarios:` is deliberately
 * asymmetric — the container keyword ENDS a block but is never title-matchable
 * itself. Each block runs from its own contiguous `@`-tag run immediately
 * above the scenario line (a blank or non-tag line stops the lookback, so
 * feature-level tags never leak in) through the line BEFORE the next block's
 * own contiguous tag run — the end-boundary walkback stops there so the next
 * block's tags attach to its own scenario, not to this block's tail — or
 * through the next top-level Gherkin keyword (`Scenario`, `Scenario Outline`,
 * `Scenarios`, `Background`, `Feature`, `Rule`) when the next block is
 * untagged, or the end of the file. An outline's `Examples:` tables belong to
 * its block and are not a boundary.
 */
function extractScenario(source: string, scenarioTitle: string): string | undefined {
  const lines = source.split("\n");
  const startKeywords = ["Scenario:", "Scenario Outline:"] as const;
  const title = scenarioTitle.trim();

  let scenarioLine = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const keyword = startKeywords.find((k) => trimmed.startsWith(k));
    if (keyword !== undefined && trimmed.slice(keyword.length).trim() === title) {
      scenarioLine = i;
      break;
    }
  }
  if (scenarioLine === -1) return undefined;

  // End of block: the next top-level keyword line, or the end of the file —
  // minus the next block's own contiguous `@` tag run (see doc comment).
  const topLevel = /^(Scenario|Scenario Outline|Scenarios|Background|Feature|Rule):/;
  let end = lines.length;
  for (let i = scenarioLine + 1; i < lines.length; i++) {
    if (topLevel.test(lines[i].trim())) {
      end = tagRunStart(lines, i, scenarioLine + 1);
      break;
    }
  }

  // Fold this block's own contiguous `@` tag run in above the scenario line.
  const start = tagRunStart(lines, scenarioLine, 0);

  return lines.slice(start, end).join("\n");
}

/**
 * First line of the contiguous `@` tag run ending directly above `line`:
 * scan upward while the line above, trimmed, starts with `@`, never passing
 * `floor`. A blank or non-tag line stops the scan. Shared by the block-start
 * fold and the end-boundary walkback so the two tag-run notions cannot drift.
 */
function tagRunStart(lines: readonly string[], from: number, floor: number): number {
  let first = from;
  while (first > floor && lines[first - 1].trim().startsWith("@")) {
    first -= 1;
  }
  return first;
}
