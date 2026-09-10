import { describe, expect, it } from "vitest";

import { corpusDependenciesFor, requiredProbeNames } from "./dependencies.js";

describe("corpusDependenciesFor", () => {
  it("derives snapshot + probe for a nav contract (state-is/url-is + view-selected)", () => {
    expect(corpusDependenciesFor("clickHistoryMenuMain")).toEqual([
      "snapshot",
      "probe",
    ]);
  });

  it("derives snapshot-only for a url-is-only contract", () => {
    expect(corpusDependenciesFor("clickPortfolioMenuEarn")).toEqual(["snapshot"]);
  });

  it("derives snapshot for dialog contracts (dialog-open/dialog-closed use snapshot)", () => {
    expect(corpusDependenciesFor("closePortfolioSummary")).toEqual(["snapshot"]);
    expect(corpusDependenciesFor("toggleEyeIcon")).toEqual(["snapshot"]);
  });

  it("returns [] for an unknown contractId", () => {
    expect(corpusDependenciesFor("nonexistent")).toEqual([]);
  });

  it("is deterministic", () => {
    expect(corpusDependenciesFor("clickHistoryMenuMain")).toEqual(
      corpusDependenciesFor("clickHistoryMenuMain"),
    );
  });
});

describe("requiredProbeNames", () => {
  it("returns selected-view for a contract declaring view-selected", () => {
    expect(requiredProbeNames("clickHistoryMenuMain")).toEqual(["selected-view"]);
  });

  it("returns the bound probe name when a view-selected predicate binds one (selectOrderBookTab)", () => {
    expect(requiredProbeNames("selectOrderBookTab")).toEqual(["selected-board-tab"]);
  });

  it("derives snapshot + probe for the bound order-book contract", () => {
    expect(corpusDependenciesFor("selectOrderBookTab")).toEqual(["snapshot", "probe"]);
  });

  it("returns [] for a contract without view-selected", () => {
    expect(requiredProbeNames("clickPortfolioMenuEarn")).toEqual([]);
  });

  it("returns [] for an unknown contractId", () => {
    expect(requiredProbeNames("nonexistent")).toEqual([]);
  });
});
