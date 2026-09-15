import { describe, expect, it } from "vitest";
import { PORTFOLIO_VALUE_PROBE } from "./smoke-config.js";

describe("portfolio probe configuration", () => {
  it("pins the live hero selector", () => {
    expect(PORTFOLIO_VALUE_PROBE).toEqual({
      name: "portfolio-value",
      selector: '[data-testid="overview-portfolio-hero-value-text"]',
      optional: true,
    });
  });
});
