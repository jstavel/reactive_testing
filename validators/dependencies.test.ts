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

  it("returns [] for dialog contracts whose predicates are not yet evaluatable", () => {
    expect(corpusDependenciesFor("closePortfolioSummary")).toEqual([]);
    expect(corpusDependenciesFor("toggleEyeIcon")).toEqual([]);
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

  it("returns [] for a contract without view-selected", () => {
    expect(requiredProbeNames("clickPortfolioMenuEarn")).toEqual([]);
  });

  it("returns [] for an unknown contractId", () => {
    expect(requiredProbeNames("nonexistent")).toEqual([]);
  });
});
