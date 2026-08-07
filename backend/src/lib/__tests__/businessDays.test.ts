import { describe, it, expect } from "vitest";
import { businessDaysBetween } from "../businessDays";

describe("businessDaysBetween", () => {
  it("counts weekdays only, excluding the start date and including the end date", () => {
    // Mon 2026-01-05 -> Fri 2026-01-09: Tue, Wed, Thu, Fri = 4 business days
    expect(businessDaysBetween(new Date("2026-01-05T00:00:00"), new Date("2026-01-09T00:00:00"))).toBe(4);
  });

  it("skips a full weekend correctly", () => {
    // Fri 2026-01-09 -> Mon 2026-01-12: only Mon counts (Sat/Sun excluded)
    expect(businessDaysBetween(new Date("2026-01-09T00:00:00"), new Date("2026-01-12T00:00:00"))).toBe(1);
  });

  it("returns 0 for the same day", () => {
    const d = new Date("2026-01-05T00:00:00");
    expect(businessDaysBetween(d, d)).toBe(0);
  });

  it("matches the followup-escalation fixture: 4 business days overdue", () => {
    // A Monday follow-up date; 4 business days later should land on a Friday.
    const start = new Date("2026-01-05T00:00:00"); // Monday
    const fourBusinessDaysLater = new Date("2026-01-09T00:00:00"); // Friday
    expect(businessDaysBetween(start, fourBusinessDaysLater)).toBe(4);
  });
});
