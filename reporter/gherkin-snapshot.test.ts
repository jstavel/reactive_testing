import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

const OUTLINE_THEN_SCENARIO_FEATURE = `Feature: Order book

  Scenario Outline: Selecting the board
    Given I am on the Trade page
    When I select the pair tab

    Examples:
      | pair |
      | BTC/USD |

  Scenario: After the outline
    Given I am on the Trade page
`;

const OUTLINE_EOF_FEATURE = `Feature: Order book

  Scenario Outline: Selecting the board
    Given I am on the Trade page
    When I select the pair tab

    Examples:
      | pair |
      | BTC/USD |
`;

const OUTLINE_MULTI_EXAMPLES_FEATURE = `Feature: Order book

  Scenario Outline: Multi examples
    Given the <pair> page

    Examples:
      | pair |
      | BTC/USD |

    Examples:
      | pair |
      | ETH/USD |
`;

const TAGGED_FEATURE = `Feature: History menu

@feature @regression
  Scenario: Tagged scenario
    Given I am on the Kraken Pro home page
    Then the History page is displayed

  Scenario: Untagged
    Given I am on the Kraken Pro home page
`;

const TAGS_TRAILING_FEATURE = `Feature: Trailing tags

  Scenario: Earlier
    Given a

@tag
  Scenario: Last one
    Given b
`;

const FEATURE_TAGGED_ONLY_FEATURE = `@plan:smoke
Feature: Layout menu

  Scenario: A
    Given b
`;

const TAGS_BEFORE_NEXT_SCENARIO_FEATURE = `Feature: Tag boundary

  Scenario: A
    Given a

@regression
  Scenario: B
    Given b
`;

const KEYWORD_BOUNDARIES_FEATURE = `Feature: Keyword boundaries

  Scenario: Before background
    Given a

  Background:
    Given common

  Scenario: After background
    Given b

  Rule: Scoped

  Scenario: Inside rule
    Given c

Feature: Second document

  Scenario: After feature keyword
    Given d
`;

const TIGHT_TAGS_FEATURE = `Feature: Tight tags

  Scenario: A
    Given a
@next
  Scenario: B
    Given b
`;

const ORPHAN_TAGS_FEATURE = `Feature: Orphan tags

  Scenario: A
    Given a

@t1

@t2
  Scenario: B
    Given b
`;

const TAGGED_EXAMPLES_FEATURE = `Feature: Tagged examples

  Scenario Outline: Tagged examples
    Given the <pair> page

    Examples:
      | pair |
      | BTC/USD |

    @tagged-examples
    Examples:
      | pair |
      | ETH/USD |

  Scenario: After
    Given done
`;

describe("buildGherkinSnapshot", () => {
  it("EXTRACTS_MATCHING_SCENARIO — source text keyed by scenario id, verbatim per title", () => {
    const dir = makeFeatureDir();
    writeFileSync(join(dir, "home-page-history-menu.feature"), HISTORY_FEATURE);

    const rels = [
      relation({ scenarioId: "scenario-a", scenarioTitle: "Scenario A" }),
      relation({ scenarioId: "scenario-b", scenarioTitle: "Scenario B" }),
    ];

    const snapshot = buildGherkinSnapshot(dir, rels);

    expect(snapshot["scenario-a"]).toContain("Scenario: Scenario A");
    expect(snapshot["scenario-a"]).toContain('When I click "Main" in the History menu');
    // Does not leak the next scenario into this block.
    expect(snapshot["scenario-a"]).not.toContain("Scenario: Scenario B");
    expect(snapshot["scenario-b"]).toContain("Scenario: Scenario B");
    expect(snapshot["scenario-b"]).toContain('When I click "Futures" in the History menu');
  });

  it("MISSING_TITLE — scenario not in the feature file is omitted from snapshot", () => {
    const dir = makeFeatureDir();
    writeFileSync(join(dir, "home-page-history-menu.feature"), HISTORY_FEATURE);

    const rels = [relation({ scenarioId: "no-such-scenario", scenarioTitle: "No such scenario" })];
    const snapshot = buildGherkinSnapshot(dir, rels);

    expect(snapshot).toEqual({});
  });

  it("MISSING_FEATURE_FILE — non-existent feature yields no entries for it", () => {
    const dir = makeFeatureDir();
    const rels = [relation({ scenarioId: "scenario-a", scenarioTitle: "Scenario A" })];

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
      relation({ scenarioId: "scenario-a", scenarioTitle: "Scenario A" }),
      relation({
        scenarioId: "scenario-c",
        feature: "home-page-portfolio-menu",
        scenarioTitle: "Scenario C",
      }),
    ];

    const snapshot = buildGherkinSnapshot(dir, rels);

    expect(snapshot["scenario-a"]).toContain("Scenario: Scenario A");
    expect(snapshot["scenario-c"]).toContain("Scenario: Scenario C");
  });

  it("PLAIN_SCENARIO — plain Scenario: blocks extract byte-identically from the existing fixture", () => {
    const dir = makeFeatureDir();
    writeFileSync(join(dir, "home-page-history-menu.feature"), HISTORY_FEATURE);

    const rels = [
      relation({ scenarioId: "scenario-a", scenarioTitle: "Scenario A" }),
      relation({ scenarioId: "scenario-b", scenarioTitle: "Scenario B" }),
    ];
    const snapshot = buildGherkinSnapshot(dir, rels);

    expect(snapshot["scenario-a"]).toBe(`  Scenario: Scenario A
    Given I am on the Kraken Pro home page
    When I click "Main" in the History menu
    Then the History page is displayed
`);
    expect(snapshot["scenario-b"]).toBe(`  Scenario: Scenario B
    Given I am on the Kraken Pro home page
    When I click "Futures" in the History menu
    Then the History page is displayed
`);
  });

  it("OUTLINE_ONLY — outline block is verbatim incl. its Examples table and ends at EOF", () => {
    const dir = makeFeatureDir();
    writeFileSync(join(dir, "home-page-history-menu.feature"), OUTLINE_EOF_FEATURE);

    const snapshot = buildGherkinSnapshot(dir, [
      relation({ scenarioId: "selecting-the-board", scenarioTitle: "Selecting the board" }),
    ]);

    expect(snapshot["selecting-the-board"]).toBe(`  Scenario Outline: Selecting the board
    Given I am on the Trade page
    When I select the pair tab

    Examples:
      | pair |
      | BTC/USD |
`);
  });

  it("OUTLINE_EXAMPLES_NEXT — outline keeps its Examples; next Scenario starts its own block", () => {
    const dir = makeFeatureDir();
    writeFileSync(join(dir, "home-page-history-menu.feature"), OUTLINE_THEN_SCENARIO_FEATURE);

    const snapshot = buildGherkinSnapshot(dir, [
      relation({ scenarioId: "selecting-the-board", scenarioTitle: "Selecting the board" }),
      relation({ scenarioId: "after-the-outline", scenarioTitle: "After the outline" }),
    ]);

    expect(snapshot["selecting-the-board"]).toBe(`  Scenario Outline: Selecting the board
    Given I am on the Trade page
    When I select the pair tab

    Examples:
      | pair |
      | BTC/USD |
`);
    expect(snapshot["selecting-the-board"]).not.toContain("Scenario: After the outline");
    expect(snapshot["after-the-outline"]).toBe(`  Scenario: After the outline
    Given I am on the Trade page
`);
  });

  it("OUTLINE_MULTI_EXAMPLES — both Examples tables stay inside the one outline block, verbatim", () => {
    const dir = makeFeatureDir();
    writeFileSync(join(dir, "home-page-history-menu.feature"), OUTLINE_MULTI_EXAMPLES_FEATURE);

    const snapshot = buildGherkinSnapshot(dir, [
      relation({ scenarioId: "multi-examples", scenarioTitle: "Multi examples" }),
    ]);

    expect(snapshot["multi-examples"]).toBe(`  Scenario Outline: Multi examples
    Given the <pair> page

    Examples:
      | pair |
      | BTC/USD |

    Examples:
      | pair |
      | ETH/USD |
`);
  });

  it("TAGS — tag lines directly above a Scenario: open the block verbatim", () => {
    const dir = makeFeatureDir();
    writeFileSync(join(dir, "home-page-history-menu.feature"), TAGGED_FEATURE);

    const snapshot = buildGherkinSnapshot(dir, [
      relation({ scenarioId: "tagged-scenario", scenarioTitle: "Tagged scenario" }),
      relation({ scenarioId: "untagged", scenarioTitle: "Untagged" }),
    ]);

    expect(snapshot["tagged-scenario"]).toBe(`@feature @regression
  Scenario: Tagged scenario
    Given I am on the Kraken Pro home page
    Then the History page is displayed
`);
    // No lookback beyond the contiguous tag run: the untagged block stays tag-free.
    expect(snapshot.untagged).not.toContain("@feature");
    expect(snapshot.untagged).toContain("Scenario: Untagged");
  });

  it("TAGS_TRAILING — tags above the last scenario are included; the block ends at EOF", () => {
    const dir = makeFeatureDir();
    writeFileSync(join(dir, "home-page-history-menu.feature"), TAGS_TRAILING_FEATURE);

    const snapshot = buildGherkinSnapshot(dir, [
      relation({ scenarioId: "last-one", scenarioTitle: "Last one" }),
    ]);

    expect(snapshot["last-one"]).toBe(`@tag
  Scenario: Last one
    Given b
`);
  });

  it("TAGS_ONLY_FEATURE — a feature-level tag is not attached to a later scenario", () => {
    const dir = makeFeatureDir();
    writeFileSync(join(dir, "home-page-history-menu.feature"), FEATURE_TAGGED_ONLY_FEATURE);

    const snapshot = buildGherkinSnapshot(dir, [relation({ scenarioId: "a", scenarioTitle: "A" })]);

    expect(snapshot.a).toBe(`  Scenario: A
    Given b
`);
    expect(snapshot.a).not.toContain("@plan:smoke");
  });

  it("TAGS_BEFORE_NEXT — a following block's tag run ends the previous block before it", () => {
    const dir = makeFeatureDir();
    writeFileSync(join(dir, "home-page-history-menu.feature"), TAGS_BEFORE_NEXT_SCENARIO_FEATURE);

    const snapshot = buildGherkinSnapshot(dir, [
      relation({ scenarioId: "a", scenarioTitle: "A" }),
      relation({ scenarioId: "b", scenarioTitle: "B" }),
    ]);

    expect(snapshot.a).toBe(`  Scenario: A
    Given a
`);
    expect(snapshot.a).not.toContain("@regression");
    expect(snapshot.a).not.toContain("Scenario: B");
    expect(snapshot.b).toBe(`@regression
  Scenario: B
    Given b
`);
  });

  it("KEYWORD_BOUNDARIES — Background:, Rule:, and Feature: lines each end a block", () => {
    const dir = makeFeatureDir();
    writeFileSync(join(dir, "home-page-history-menu.feature"), KEYWORD_BOUNDARIES_FEATURE);

    const snapshot = buildGherkinSnapshot(dir, [
      relation({ scenarioId: "before-background", scenarioTitle: "Before background" }),
      relation({ scenarioId: "after-background", scenarioTitle: "After background" }),
      relation({ scenarioId: "inside-rule", scenarioTitle: "Inside rule" }),
      relation({ scenarioId: "after-feature-keyword", scenarioTitle: "After feature keyword" }),
    ]);

    expect(snapshot["before-background"]).toBe(`  Scenario: Before background
    Given a
`);
    expect(snapshot["after-background"]).toBe(`  Scenario: After background
    Given b
`);
    expect(snapshot["inside-rule"]).toBe(`  Scenario: Inside rule
    Given c
`);
    expect(snapshot["after-feature-keyword"]).toBe(`  Scenario: After feature keyword
    Given d
`);
  });

  it("TIGHT_TAGS — tags with no blank line above the next scenario still leave the previous block", () => {
    const dir = makeFeatureDir();
    writeFileSync(join(dir, "home-page-history-menu.feature"), TIGHT_TAGS_FEATURE);

    const snapshot = buildGherkinSnapshot(dir, [
      relation({ scenarioId: "a", scenarioTitle: "A" }),
      relation({ scenarioId: "b", scenarioTitle: "B" }),
    ]);

    expect(snapshot.a).toBe(`  Scenario: A
    Given a`);
    expect(snapshot.a).not.toContain("@next");
    expect(snapshot.b).toBe(`@next
  Scenario: B
    Given b
`);
  });

  it("ORPHAN_TAGS — an orphan tag above a blank stays in the previous tail; the contiguous tag attaches to B", () => {
    const dir = makeFeatureDir();
    writeFileSync(join(dir, "home-page-history-menu.feature"), ORPHAN_TAGS_FEATURE);

    const snapshot = buildGherkinSnapshot(dir, [
      relation({ scenarioId: "a", scenarioTitle: "A" }),
      relation({ scenarioId: "b", scenarioTitle: "B" }),
    ]);

    expect(snapshot.a).toBe(`  Scenario: A
    Given a

@t1
`);
    expect(snapshot.a).not.toContain("@t2");
    expect(snapshot.b).toBe(`@t2
  Scenario: B
    Given b
`);
    expect(snapshot.b).not.toContain("@t1");
  });

  it("TAGGED_EXAMPLES — an Examples table's own @ tag stays inside the outline block", () => {
    const dir = makeFeatureDir();
    writeFileSync(join(dir, "home-page-history-menu.feature"), TAGGED_EXAMPLES_FEATURE);

    const snapshot = buildGherkinSnapshot(dir, [
      relation({ scenarioId: "tagged-examples", scenarioTitle: "Tagged examples" }),
      relation({ scenarioId: "after", scenarioTitle: "After" }),
    ]);

    expect(snapshot["tagged-examples"]).toBe(`  Scenario Outline: Tagged examples
    Given the <pair> page

    Examples:
      | pair |
      | BTC/USD |

    @tagged-examples
    Examples:
      | pair |
      | ETH/USD |
`);
    expect(snapshot["tagged-examples"]).not.toContain("Scenario: After");
    expect(snapshot.after).toBe(`  Scenario: After
    Given done
`);
  });

  it("DUPLICATE_ID — malformed relations throw before any feature-file I/O", () => {
    const dir = makeFeatureDir(); // empty dir: no feature file written
    const rels = [relation({}), relation({})];

    expect(() => buildGherkinSnapshot(dir, rels)).toThrow(/relation guard failed with 2 issue/);
    expect(() => buildGherkinSnapshot(dir, rels)).toThrow(/duplicate scenario id "scenario-a"/);
    expect(() => buildGherkinSnapshot(dir, rels)).toThrow(
      /duplicate feature\/scenarioTitle pair "home-page-history-menu" \/ "Scenario A"/,
    );
  });
});
