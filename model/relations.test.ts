import { describe, expect, it } from "vitest";

import type { ScenarioRelation } from "./relations.js";
import {
  assertUniqueScenarioIds,
  deriveScenarioId,
  relations,
  relationsByScenarioId,
} from "./relations.js";

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

function guardMessage(rels: readonly ScenarioRelation[]): string {
  try {
    assertUniqueScenarioIds(rels);
  } catch (error) {
    return (error as Error).message;
  }
  return "";
}

describe("deriveScenarioId", () => {
  it("SEEDED_DERIVATION — every seeded scenarioId is the derivation of its scenarioTitle", () => {
    for (const rel of relations) {
      expect(deriveScenarioId(rel.scenarioTitle), rel.scenarioTitle).toBe(rel.scenarioId);
    }
  });

  it("DERIVE_EDGE — punctuation and slashes collapse to single dashes (BTC/USD)", () => {
    expect(deriveScenarioId("Selecting the Order Book tab shows the BTC/USD board")).toBe(
      "selecting-the-order-book-tab-shows-the-btc-usd-board",
    );
    expect(deriveScenarioId("Hello, World! (v2)")).toBe("hello-world-v2");
  });

  it("DERIVE_EDGE — multiple spaces and tabs collapse to a single dash", () => {
    expect(deriveScenarioId("A   B\tC")).toBe("a-b-c");
  });

  it("DERIVE_EDGE — leading/trailing dashes are trimmed", () => {
    expect(deriveScenarioId("-The Eye-")).toBe("the-eye");
    expect(deriveScenarioId("...Open...")).toBe("open");
  });

  it("DERIVE_EDGE — non-ASCII characters collapse like any other non-alphanumeric", () => {
    expect(deriveScenarioId("Valeur € 100")).toBe("valeur-100");
  });

  it("DERIVE_EDGE — empty title derives the empty string", () => {
    expect(deriveScenarioId("")).toBe("");
    expect(deriveScenarioId("!!!")).toBe("");
  });
});

describe("assertUniqueScenarioIds", () => {
  it("SEEDED — the seeded relations pass every well-formedness rule", () => {
    expect(() => assertUniqueScenarioIds(relations)).not.toThrow();
  });

  it("passes for an empty list", () => {
    expect(() => assertUniqueScenarioIds([])).not.toThrow();
  });

  it("DUPLICATE_ID — a repeated scenarioId is collected even when everything else conforms", () => {
    const dup = [
      relation({ scenarioId: "scenario-a", scenarioTitle: "Scenario A", feature: "feature-one" }),
      relation({ scenarioId: "scenario-a", scenarioTitle: "Scenario A", feature: "feature-two" }),
    ];

    expect(() => assertUniqueScenarioIds(dup)).toThrow(/duplicate scenario id "scenario-a"/);
    // Different features keep the (feature, title) pairs and derivation clean.
    expect(() => assertUniqueScenarioIds(dup)).toThrow(/relation guard failed with 1 issue/);
  });

  it("EMPTY_ID — an empty scenarioId is collected", () => {
    const bad = [relation({ scenarioId: "", scenarioTitle: "" })];

    // deriveScenarioId("") === "" so the derivation conforms; only the empty id fires.
    expect(() => assertUniqueScenarioIds(bad)).toThrow(/empty scenarioId/);
    expect(() => assertUniqueScenarioIds(bad)).toThrow(/relation guard failed with 1 issue/);
  });

  it("CONFORMANCE_DRIFT — a scenarioId that is not deriveScenarioId(scenarioTitle) is collected", () => {
    const bad = [relation({ scenarioId: "wrong-id", scenarioTitle: "Scenario A" })];

    expect(() => assertUniqueScenarioIds(bad)).toThrow(
      /scenarioId "wrong-id" does not derive from scenarioTitle "Scenario A" \(expected "scenario-a"\)/,
    );
    expect(() => assertUniqueScenarioIds(bad)).toThrow(/relation guard failed with 1 issue/);
  });

  it("DUPLICATE_PAIR — the same (feature, scenarioTitle) listed twice is collected", () => {
    const bad = [relation({}), relation({})];

    // Identical conformant entries fire duplicate id AND duplicate pair.
    expect(() => assertUniqueScenarioIds(bad)).toThrow(
      /duplicate feature\/scenarioTitle pair "home-page-history-menu" \/ "Scenario A"/,
    );
    expect(() => assertUniqueScenarioIds(bad)).toThrow(/relation guard failed with 2 issue/);
  });

  it("AGGREGATES — one deterministic error lists every violation", () => {
    const bad = [
      relation({ scenarioId: "dup-id", scenarioTitle: "First title", feature: "f" }),
      relation({ scenarioId: "dup-id", scenarioTitle: "Second title", feature: "g" }),
      relation({ scenarioId: "", scenarioTitle: "Has a title", feature: "h" }),
      relation({ scenarioId: "scenario-a", scenarioTitle: "Scenario A", feature: "same" }),
      relation({ scenarioId: "scenario-a", scenarioTitle: "Scenario A", feature: "same" }),
    ];

    expect(() => assertUniqueScenarioIds(bad)).toThrow(/relation guard failed with 7 issue\(s\)/);
    expect(() => assertUniqueScenarioIds(bad)).toThrow(/duplicate scenario id "dup-id"/);
    expect(() => assertUniqueScenarioIds(bad)).toThrow(/empty scenarioId/);
    expect(() => assertUniqueScenarioIds(bad)).toThrow(
      /does not derive from scenarioTitle "First title"/,
    );
    expect(() => assertUniqueScenarioIds(bad)).toThrow(
      /duplicate feature\/scenarioTitle pair "same" \/ "Scenario A"/,
    );

    // Deterministic: identical input, identical message.
    expect(guardMessage(bad)).toBe(guardMessage(bad));
  });
});

describe("relationsByScenarioId", () => {
  it("SEEDED — indexes all seeded relations by id", () => {
    const byId = relationsByScenarioId();
    expect(byId.size).toBe(relations.length);
    for (const rel of relations) {
      expect(byId.get(rel.scenarioId)).toBe(rel);
    }
  });

  it("accepts a readonly relations array", () => {
    const readonlyRels: readonly ScenarioRelation[] = [relation({})];
    expect(relationsByScenarioId(readonlyRels).get("scenario-a")).toBeDefined();
  });

  it("DUPLICATE_ID — a duplicate scenarioId in the source throws naming the id", () => {
    const dup = [relation({}), relation({})];

    expect(() => relationsByScenarioId(dup)).toThrow(/duplicate scenario id "scenario-a"/);
  });
});
