import { describe, it, expect } from "vitest";
import { computeTotals, roundMoney } from "../invoiceMath";

describe("roundMoney", () => {
  it("rounds to 2 decimal places", () => {
    expect(roundMoney(10.005)).toBe(10.01);
    expect(roundMoney(10.004)).toBe(10);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3); // classic float trap, must not leak through
  });
});

describe("computeTotals", () => {
  it("matches hand calculation for 3 lines at different GST rates", () => {
    // Same fixture PROGRESS.md's Phase 5 acceptance test used.
    const result = computeTotals([
      { description: "A", quantity: 1, rate: 100000, gst_rate: 18 },
      { description: "B", quantity: 1, rate: 100000, gst_rate: 12 },
      { description: "C", quantity: 1, rate: 65000, gst_rate: 0 },
    ]);
    expect(result.subtotal).toBe(265000);
    expect(result.tax).toBe(30000); // 18000 + 12000 + 0
    expect(result.total).toBe(295000);
  });

  it("rounds each line to the paisa independently, then sums the rounded values", () => {
    const result = computeTotals([
      { description: "A", quantity: 3, rate: 33.333, gst_rate: 0 }, // 99.999 -> rounds to 100.00
      { description: "B", quantity: 1, rate: 0.004, gst_rate: 0 },  // 0.004 -> rounds to 0.00
    ]);
    expect(result.subtotal).toBe(100);
  });

  it("handles a zero-value line without dividing by zero or producing NaN", () => {
    const result = computeTotals([{ description: "Free", quantity: 1, rate: 0, gst_rate: 18 }]);
    expect(result.subtotal).toBe(0);
    expect(result.tax).toBe(0);
    expect(result.total).toBe(0);
  });

  it("handles quantities greater than 1", () => {
    const result = computeTotals([{ description: "Licenses", quantity: 5, rate: 2000, gst_rate: 18 }]);
    expect(result.subtotal).toBe(10000);
    expect(result.tax).toBe(1800);
    expect(result.total).toBe(11800);
  });
});
