import { describe, expect, it } from "vitest";

import { homePageModel } from "../model/fsm.js";
import { resolveBootstrapPath } from "./bootstrap.js";

describe("resolveBootstrapPath", () => {
  it("resolves an isolated History scenario from home", () => {
    expect(
      resolveBootstrapPath(homePageModel, {
        currentStateId: "homePage",
        givenStateId: "historyMain",
      }).map(({ contractId }) => contractId),
    ).toEqual(["clickHistoryMenuMain"]);
  });

  it("returns no steps when the current state already satisfies Given", () => {
    expect(
      resolveBootstrapPath(homePageModel, {
        currentStateId: "historyMain",
        givenStateId: "historyMain",
      }),
    ).toEqual([]);
  });

  it("returns through home before bootstrapping another page", () => {
    expect(
      resolveBootstrapPath(homePageModel, {
        currentStateId: "historyMain",
        givenStateId: "portfolioMain",
      }).map(({ contractId }) => contractId),
    ).toEqual(["navigateHome", "clickPortfolioMenuMain"]);
  });

  it("rejects an unreachable state", () => {
    const model = {
      ...homePageModel,
      states: [...homePageModel.states, { stateId: "unreachable", label: "Unreachable" }],
    };

    expect(() =>
      resolveBootstrapPath(model, {
        currentStateId: "homePage",
        givenStateId: "unreachable",
      }),
    ).toThrow('No bootstrap path from "homePage" to "unreachable".');
  });

  it("rejects multiple shortest paths without an override", () => {
    const model = {
      ...homePageModel,
      transitions: [
        ...homePageModel.transitions,
        { from: "homePage", to: "historyMain", contractId: "alternateHistory" },
      ],
    };

    expect(() =>
      resolveBootstrapPath(model, {
        currentStateId: "homePage",
        givenStateId: "historyMain",
      }),
    ).toThrow("Multiple shortest bootstrap paths");
  });

  it("rejects an unknown current state left by a failed step", () => {
    expect(() =>
      resolveBootstrapPath(homePageModel, {
        currentStateId: null,
        givenStateId: "historyMain",
      }),
    ).toThrow('Bootstrap state is unknown after a previous failure');
  });

  it("rejects a model with ambiguous duplicate transition keys", () => {
    const model = {
      ...homePageModel,
      transitions: [
        ...homePageModel.transitions,
        { from: "homePage", to: "earn", contractId: "clickHistoryMenuMain" },
      ],
    };

    expect(() =>
      resolveBootstrapPath(model, {
        currentStateId: "homePage",
        givenStateId: "historyMain",
      }),
    ).toThrow("duplicate (from, contractId) transition keys");
  });

  it("terminates on cyclic models instead of looping", () => {
    const model = {
      ...homePageModel,
      states: [...homePageModel.states, { stateId: "detached", label: "Detached" }],
    };

    expect(() =>
      resolveBootstrapPath(model, {
        currentStateId: "homePage",
        givenStateId: "detached",
      }),
    ).toThrow('No bootstrap path from "homePage" to "detached".');
  });

  it("accepts a valid explicit route override", () => {
    expect(
      resolveBootstrapPath(homePageModel, {
        currentStateId: "historyMain",
        givenStateId: "homePage",
        route: [{ stateId: "historyMain", contractId: "navigateHome" }],
      }).map(({ contractId }) => contractId),
    ).toEqual(["navigateHome"]);
  });
});
