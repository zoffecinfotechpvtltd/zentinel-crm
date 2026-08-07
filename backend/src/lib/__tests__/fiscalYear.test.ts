import { describe, it, expect } from "vitest";
import { getFiscalYearRange } from "../fiscalYear";

// Dates constructed with an explicit local-time suffix throughout — a bare
// "yyyy-mm-dd" string parses as UTC midnight, which can silently roll back
// to the previous day (and month) in timezones behind UTC.

describe("getFiscalYearRange", () => {
  it("a date in April starts that year's FY (Apr 1 - Mar 31)", () => {
    expect(getFiscalYearRange(new Date("2026-04-15T00:00:00"))).toEqual({ start: "2026-04-01", end: "2027-03-31" });
  });

  it("a date in March belongs to the FY that started the previous April", () => {
    expect(getFiscalYearRange(new Date("2026-03-31T00:00:00"))).toEqual({ start: "2025-04-01", end: "2026-03-31" });
  });

  it("April 1 itself is the first day of the new FY, not the last day of the old one", () => {
    expect(getFiscalYearRange(new Date("2026-04-01T00:00:00"))).toEqual({ start: "2026-04-01", end: "2027-03-31" });
  });
});
