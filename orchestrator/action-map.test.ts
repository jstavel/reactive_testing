import { describe, expect, it, vi } from "vitest";
import type { Page } from "playwright";

import { actionMap } from "./action-map.js";
import { allContracts } from "../model/contracts.js";

interface RoleCall {
  role: string;
  options: unknown;
}

function makePage() {
  const roleCalls: RoleCall[] = [];
  const click = vi.fn(async () => {});
  const getByRole = vi.fn((role: string, options: unknown) => {
    roleCalls.push({ role, options });
    return { click };
  });
  const waitForURL = vi.fn(async () => {});
  return { getByRole, roleCalls, click, waitForURL };
}

// The 7 navigation contracts rewritten in Story 2.6: each opens a sidebar
// menu (an exact-named button) then clicks an exact-named menuitem that
// navigates to the contract's postcondition URL, then waits for that URL.
const NAV_CONTRACTS = [
  { contractId: "clickHistoryMenuMain", menu: "History", item: "Main", url: "**/app/history/main/ledger" },
  { contractId: "clickHistoryMenuFutures", menu: "History", item: "Futures", url: "**/app/history/derivatives/ledger" },
  { contractId: "clickPortfolioMenuOverview", menu: "Portfolio", item: "Overview", url: "**/app/portfolio/overview" },
  { contractId: "clickPortfolioMenuMain", menu: "Portfolio", item: "Main", url: "**/app/portfolio/main" },
  { contractId: "clickPortfolioMenuFutures", menu: "Portfolio", item: "Futures", url: "**/app/portfolio/derivatives" },
  { contractId: "clickPortfolioMenuLoans", menu: "Portfolio", item: "Loans", url: "**/app/portfolio/loans" },
  { contractId: "clickPortfolioMenuEarn", menu: "Portfolio", item: "Earn", url: "**/app/earn" },
] as const;

describe("actionMap navigation entries", () => {
  for (const { contractId, menu, item, url } of NAV_CONTRACTS) {
    it(`${contractId} opens its sidebar menu, clicks the anchored menu item, and waits for the postcondition URL`, async () => {
      const page = makePage();

      await actionMap[contractId]!({ page: page as unknown as Page });

      expect(page.getByRole).toHaveBeenCalledTimes(2);
      expect(page.getByRole).toHaveBeenNthCalledWith(1, "button", { name: menu, exact: true });
      expect(page.getByRole).toHaveBeenNthCalledWith(2, "menuitem", { name: item, exact: true });
      expect(page.click).toHaveBeenCalledTimes(2);
      expect(page.waitForURL).toHaveBeenCalledTimes(1);
      expect(page.waitForURL).toHaveBeenCalledWith(url);
    });
  }
});

describe("actionMap parity", () => {
  it("has exactly 10 entries: one per seeded contract, no extras", () => {
    expect(Object.keys(actionMap)).toHaveLength(10);
  });

  it("maps every seeded contractId to an entry", () => {
    for (const contract of allContracts) {
      expect(actionMap).toHaveProperty(contract.contractId);
    }
  });

  it("maps every entry to a seeded contractId", () => {
    for (const key of Object.keys(actionMap)) {
      expect(allContracts.some((c) => c.contractId === key)).toBe(true);
    }
  });
});
