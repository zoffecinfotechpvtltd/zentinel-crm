function icsDate(d: string): string {
  return d.replace(/-/g, "");
}
function escapeText(s: string): string {
  return s.replace(/[\\;,]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");
}

// Single all-day VEVENT — enough for "add this follow-up / due date to my
// calendar," which is all either caller needs. No recurrence, no timezone
// juggling; the date is treated as all-day in whatever calendar imports it.
export function buildSingleEventIcs(params: { uid: string; date: string; summary: string; description?: string }): string {
  const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Zentinel//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${params.uid}@zentinel`,
    `DTSTAMP:${now}`,
    `DTSTART;VALUE=DATE:${icsDate(params.date)}`,
    `SUMMARY:${escapeText(params.summary)}`,
    params.description ? `DESCRIPTION:${escapeText(params.description)}` : undefined,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}
