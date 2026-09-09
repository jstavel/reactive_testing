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
  const locatorSelectors: string[] = [];
  const click = vi.fn(async () => {});
  const check = vi.fn(async () => {});
  const chainedLocator = (selector: string): unknown => {
    locatorSelectors.push(selector);
    return { click, locator: chainedLocator };
  };
  const getByRole = vi.fn((role: string, options: unknown) => {
    roleCalls.push({ role, options });
    return { click, check, locator: chainedLocator };
  });
  const locator = vi.fn((selector: string) => {
    locatorSelectors.push(selector);
    return { click, locator: chainedLocator };
  });
  const mouseMove = vi.fn(async () => {});
  const viewportSize = vi.fn(() => ({ width: 1440, height: 800 }));
  const waitForURL = vi.fn(async () => {});
  return {
    getByRole,
    roleCalls,
    locator,
    locatorSelectors,
    click,
    check,
    waitForURL,
    mouse: { move: mouseMove },
    mouseMove,
    viewportSize,
  };
}

// The 6 menu navigation contracts rewritten in Story 2.6: each opens a sidebar
// menu (an exact-named button) then clicks an exact-named menuitem that
// navigates to the contract's postcondition URL, then waits for that URL.
// clickPortfolioMenuEarn left this pattern (gh-22): Earn is a dedicated sidebar
// button — pinned separately below.
const NAV_CONTRACTS = [
  { contractId: "clickHistoryMenuMain", menu: "History", item: "Main", url: "**/app/history/main/ledger" },
  { contractId: "clickHistoryMenuFutures", menu: "History", item: "Futures", url: "**/app/history/derivatives/ledger" },
  { contractId: "clickPortfolioMenuOverview", menu: "Portfolio", item: "Overview", url: "**/app/portfolio/overview" },
  { contractId: "clickPortfolioMenuMain", menu: "Portfolio", item: "Main", url: "**/app/portfolio/main" },
  { contractId: "clickPortfolioMenuFutures", menu: "Portfolio", item: "Futures", url: "**/app/portfolio/derivatives" },
  { contractId: "clickPortfolioMenuLoans", menu: "Portfolio", item: "Loans", url: "**/app/portfolio/loans" },
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

describe("actionMap drifted entries (gh-22)", () => {
  it("clickPortfolioMenuEarn clicks the dedicated sidebar Yield button — no menu open — and waits for /app/earn", async () => {
    const page = makePage();

    await actionMap.clickPortfolioMenuEarn!({ page: page as unknown as Page });

    expect(page.getByRole).toHaveBeenCalledTimes(1);
    expect(page.getByRole).toHaveBeenCalledWith("button", { name: "Yield", exact: true });
    expect(page.roleCalls.map((call) => call.role)).not.toContain("menuitem");
    expect(page.click).toHaveBeenCalledTimes(1);
    expect(page.waitForURL).toHaveBeenCalledTimes(1);
    expect(page.waitForURL).toHaveBeenCalledWith("**/app/earn");
    // Clears the hover-tooltip overlay the resting pointer leaves open
    // (it aria-hides the app root and blinds every later role locator).
    // The dismissal point is the viewport center, not hard-coded coordinates.
    expect(page.mouseMove).toHaveBeenCalledTimes(1);
    expect(page.mouseMove).toHaveBeenCalledWith(720, 400);
  });

  it("filterHistoryByAsset opens the Assets combobox and presses the visible box of the exact Bitcoin (BTC) checkbox", async () => {
    const page = makePage();

    await actionMap.filterHistoryByAsset!({ page: page as unknown as Page });

    expect(page.getByRole).toHaveBeenCalledTimes(2);
    expect(page.getByRole).toHaveBeenNthCalledWith(1, "combobox", { name: "Assets" });
    expect(page.getByRole).toHaveBeenNthCalledWith(2, "checkbox", { name: "Bitcoin (BTC)", exact: true });
    expect(page.locatorSelectors).toEqual(["xpath=..", '[data-testid="checkbox-box"]']);
    expect(page.click).toHaveBeenCalledTimes(2);
    expect(page.check).not.toHaveBeenCalled();
  });

  it("paginateHistoryNext clicks the unnamed chevron pager button and waits for nothing", async () => {
    const page = makePage();

    await actionMap.paginateHistoryNext!({ page: page as unknown as Page });

    expect(page.locatorSelectors).toEqual(['button:has(svg[name="ChevronRightSmall"])']);
    expect(page.click).toHaveBeenCalledTimes(1);
    expect(page.waitForURL).not.toHaveBeenCalled();
  });
});

describe("actionMap parity", () => {
  it("has exactly 13 entries: one per seeded contract, no extras", () => {
    expect(Object.keys(actionMap)).toHaveLength(13);
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
