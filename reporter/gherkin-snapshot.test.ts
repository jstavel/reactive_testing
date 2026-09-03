import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { ScenarioRelation } from "../model/relations.js";
import { buildGherkinSnapshot } from "./gherkin-snapshot.js";

let tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

function makeFeatureDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "gherkin-snapshot-test-"));
  tempDirs.push(dir);
  return dir;
}

function relation(overrides: Partial<ScenarioRelation>): ScenarioRelation {
  return {
    scenarioId: "scenario-a",
    feature: "home-page-history-menu",
    featureTitle: "Home page History menu",
    scenarioTitle: "Scenario A",
    states: ["homePage"],
    contracts: ["clickHistoryMenuMain"],
    ...overrides,
  };
}

const HISTORY_FEATURE = `Feature: Home page History menu

  Scenario: Scenario A
    Given I am on the Kraken Pro home page
    When I click "Main" in the History menu
    Then the History page is displayed

  Scenario: Scenario B
    Given I am on the Kraken Pro home page
    When I click "Futures" in the History menu
    Then the History page is displayed
`;

describe("buildGherkinSnapshot", () => {
  it("EXTRACTS_MATCHING_SCENARIO — source text keyed by scenario id, verbatim per title", () => {
    const dir = makeFeatureDir();
    writeFileSync(join(dir, "home-page-history-menu.feature"), HISTORY_FEATURE);

    const rels = [
      relation({ scenarioId: "a", scenarioTitle: "Scenario A" }),
      relation({ scenarioId: "b", scenarioTitle: "Scenario B" }),
    ];

    const snapshot = buildGherkinSnapshot(dir, rels);

    expect(snapshot["a"]).toContain("Scenario: Scenario A");
    expect(snapshot["a"]).toContain('When I click "Main" in the History menu');
    // Does not leak the next scenario into this block.
    expect(snapshot["a"]).not.toContain("Scenario: Scenario B");
    expect(snapshot["b"]).toContain("Scenario: Scenario B");
    expect(snapshot["b"]).toContain('When I click "Futures" in the History menu');
  });

  it("MISSING_TITLE — scenario not in the feature file is omitted from snapshot", () => {
    const dir = makeFeatureDir();
    writeFileSync(join(dir, "home-page-history-menu.feature"), HISTORY_FEATURE);

    const rels = [relation({ scenarioId: "ghost", scenarioTitle: "No such scenario" })];
    const snapshot = buildGherkinSnapshot(dir, rels);

    expect(snapshot).toEqual({});
  });

  it("MISSING_FEATURE_FILE — non-existent feature yields no entries for it", () => {
    const dir = makeFeatureDir();
    const rels = [relation({ scenarioId: "a", scenarioTitle: "Scenario A" })];

    const snapshot = buildGherkinSnapshot(dir, rels);

    expect(snapshot).toEqual({});
  });

  it("MULTI_FEATURE — aggregates scenarios across several feature files", () => {
    const dir = makeFeatureDir();
    writeFileSync(join(dir, "home-page-history-menu.feature"), HISTORY_FEATURE);
    writeFileSync(
      join(dir, "home-page-portfolio-menu.feature"),
      `Feature: Home page Portfolio menu

  Scenario: Scenario C
    Given I am on the Kraken Pro home page
    When I click "Main" in the Portfolio menu
    Then the Portfolio page is displayed
`,
    );

    const rels = [
      relation({ scenarioId: "a", scenarioTitle: "Scenario A" }),
      relation({ scenarioId: "c", feature: "home-page-portfolio-menu", scenarioTitle: "Scenario C" }),
    ];

    const snapshot = buildGherkinSnapshot(dir, rels);

    expect(snapshot["a"]).toContain("Scenario: Scenario A");
    expect(snapshot["c"]).toContain("Scenario: Scenario C");
  });
});
