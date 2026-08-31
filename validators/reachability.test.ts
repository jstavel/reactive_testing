import { describe, expect, it } from "vitest";

import { homePageModel } from "../model/fsm.js";
import type { FsmModel } from "../model/fsm.js";
import { blockedContractIds } from "./reachability.js";

describe("blockedContractIds", () => {
  it("flags no contract blocked on the real home-page model", () => {
    expect(blockedContractIds(homePageModel)).toEqual([]);
  });

  it("flags a contract whose only from-state is unreachable", () => {
    const synthetic: FsmModel = {
      states: [
        { stateId: "a", label: "A" },
        { stateId: "b", label: "B" },
        { stateId: "c", label: "C" },
      ],
      transitions: [
        { from: "a", to: "b", contractId: "reachableContract" },
        { from: "c", to: "a", contractId: "blockedContract" },
      ],
      initialStateId: "a",
    };
    expect(blockedContractIds(synthetic)).toEqual(["blockedContract"]);
  });

  it("is deterministic", () => {
    expect(blockedContractIds(homePageModel)).toEqual(
      blockedContractIds(homePageModel),
    );
  });
});
