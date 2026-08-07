import { describe, it, expect } from "vitest";
import { buildSingleEventIcs } from "../ics";

describe("buildSingleEventIcs", () => {
  it("produces a valid single-event VCALENDAR with the date formatted YYYYMMDD", () => {
    const ics = buildSingleEventIcs({ uid: "abc-123", date: "2026-03-05", summary: "Follow up — Acme Corp" });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260305");
    expect(ics).toContain("UID:abc-123@zentinel");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("END:VCALENDAR");
  });

  it("escapes commas, semicolons, and backslashes in text fields per RFC 5545", () => {
    const ics = buildSingleEventIcs({ uid: "x", date: "2026-01-01", summary: "Client; Corp, Ltd" });
    expect(ics).toContain("SUMMARY:Client\\; Corp\\, Ltd");
  });

  it("omits the DESCRIPTION line entirely when none is given, rather than emitting one that's blank", () => {
    const ics = buildSingleEventIcs({ uid: "x", date: "2026-01-01", summary: "No description here" });
    expect(ics).not.toContain("DESCRIPTION:");
  });
});
