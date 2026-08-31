import { describe, expect, it } from "vitest";

import {
  contractPredicateSchema,
  validationResultSchema,
} from "../model/schemas.js";
import type { ContractEvidence } from "../model/schemas.js";
import { validatorMap, validatorsFor } from "./validator-map.js";

const evidence: ContractEvidence = {
  pre: {
    stateId: "homePage",
    url: "https://pro.kraken.com/app/home",
    snapshot: "",
    capturedAt: "t",
  },
  post: {
    stateId: "historyMain",
    url: "https://pro.kraken.com/app/history/main/ledger",
    snapshot: "",
    capturedAt: "t",
  },
  probes: [{ name: "selected-view", value: "Ledger", capturedAt: "t" }],
};

describe("validatorMap", () => {
  it("is a pure function: the same evidence yields identical results", () => {
    const validator = validatorsFor("clickHistoryMenuMain")[0]!;
    expect(validator(evidence)).toEqual(validator(evidence));
  });

  it("passes a contract whose postcondition evidence matches, with a conforming result", () => {
    const validator = validatorsFor("clickHistoryMenuMain")[0]!;
    const result = validator(evidence);

    expect(result.passed).toBe(true);
    expect(result.details).toBeUndefined();
    expect(validationResultSchema.safeParse(result).success).toBe(true);
    expect(result.corpusRefs).toEqual(
      expect.arrayContaining(["snapshot:pre", "snapshot:post", "probe:selected-view"]),
    );
  });

  it("fails with a named predicate when the url does not match", () => {
    const validator = validatorsFor("clickHistoryMenuMain")[0]!;
    const result = validator({
      ...evidence,
      post: { ...evidence.post!, url: "https://pro.kraken.com/app/wrong" },
    });

    expect(result.passed).toBe(false);
    expect(result.details).toContain("url-is");
  });

  it("fails with a named predicate when the selected view does not match", () => {
    const validator = validatorsFor("clickHistoryMenuMain")[0]!;
    const result = validator({
      ...evidence,
      probes: [{ name: "selected-view", value: "Orders", capturedAt: "t" }],
    });

    expect(result.passed).toBe(false);
    expect(result.details).toContain("view-selected");
  });

  it("fails with a missing-evidence detail when the post snapshot is absent", () => {
    const validator = validatorsFor("clickHistoryMenuMain")[0]!;
    const result = validator({ pre: evidence.pre });

    expect(result.passed).toBe(false);
    expect(result.details).toContain("missing snapshot evidence");
  });

  it("reports an empty validator list (gap) for an unknown contractId", () => {
    expect(validatorsFor("nonexistent")).toEqual([]);
  });

  it("has a validator for every contract in allContracts and vice versa", async () => {
    const { allContracts } = await import("../model/contracts.js");
    for (const contract of allContracts) {
      expect(validatorMap).toHaveProperty(contract.contractId);
    }
    for (const key of Object.keys(validatorMap)) {
      expect(allContracts.some((c) => c.contractId === key)).toBe(true);
    }
  });
});

describe("contractPredicateSchema", () => {
  it("rejects a predicate outside the closed vocabulary", () => {
    expect(contractPredicateSchema.safeParse({ assert: "nope" }).success).toBe(false);
    expect(contractPredicateSchema.safeParse({ assert: "state-is" }).success).toBe(false);
  });

  it("accepts every vocabulary member", () => {
    expect(contractPredicateSchema.safeParse({ assert: "state-is", stateId: "x" }).success).toBe(true);
    expect(contractPredicateSchema.safeParse({ assert: "url-is", url: "/x" }).success).toBe(true);
    expect(contractPredicateSchema.safeParse({ assert: "view-selected", view: "x" }).success).toBe(true);
    expect(contractPredicateSchema.safeParse({ assert: "dialog-open" }).success).toBe(true);
    expect(contractPredicateSchema.safeParse({ assert: "dialog-closed" }).success).toBe(true);
  });
});
