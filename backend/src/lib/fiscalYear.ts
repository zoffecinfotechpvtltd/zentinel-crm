// Indian FY: April 1 – March 31.
export function getFiscalYearRange(referenceDate: Date = new Date()): { start: string; end: string } {
  const year = referenceDate.getMonth() >= 3 ? referenceDate.getFullYear() : referenceDate.getFullYear() - 1;
  return { start: `${year}-04-01`, end: `${year + 1}-03-31` };
}
