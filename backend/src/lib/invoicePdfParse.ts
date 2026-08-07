// Best-effort field extraction from a Tally-exported invoice PDF's text layer.
// Tally's print layout isn't standardized across companies, so this is
// heuristic (regex over the flattened text), not a real PDF form parser —
// every field it returns is meant to be reviewed/edited by a human before
// the invoice is saved, never written straight to the database.

export type ParsedInvoicePdf = {
  invoice_number: string | null;
  invoice_date: string | null; // ISO yyyy-mm-dd
  due_date: string | null;
  party_name: string | null;
  subtotal: number | null;
  gst_rate: number | null;
  tax: number | null;
  total: number | null;
  raw_text: string;
};

function toIsoDate(day: string, month: string, year: string): string | null {
  const y = year.length === 2 ? `20${year}` : year;
  const mm = month.padStart(2, "0");
  const dd = day.padStart(2, "0");
  const d = new Date(`${y}-${mm}-${dd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return `${y}-${mm}-${dd}`;
}

function findDate(text: string, labelPattern: string): string | null {
  const re = new RegExp(`${labelPattern}[^\\n0-9]{0,20}(\\d{1,2})[\\/\\-](\\d{1,2})[\\/\\-](\\d{2,4})`, "i");
  const m = text.match(re);
  if (!m) return null;
  return toIsoDate(m[1], m[2], m[3]);
}

function findAmount(text: string, labelPattern: string): number | null {
  const re = new RegExp(`${labelPattern}[^\\n\\d₹]{0,15}[₹\\s]*([\\d,]+(?:\\.\\d{1,2})?)`, "i");
  const m = text.match(re);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function parseInvoicePdfText(text: string): ParsedInvoicePdf {
  const normalized = text.replace(/\r/g, "");

  // Case-insensitive (/i) throughout, so each class only needs one of A-Z/a-z.
  const invoiceNumberMatch = normalized.match(/(?:invoice|voucher|bill)\s*(?:no\.?|number|#)[:\s]*([A-Z0-9-/]+)/i);
  const partyMatch = normalized.match(/(?:buyer|party|bill\s*to|client|customer)\s*[:-]?\s*\n?\s*([A-Z0-9&.,'\s]{3,60})/i);
  const gstRateMatch = normalized.match(/(?:gst|igst|cgst\s*\+\s*sgst)\s*@?\s*(\d{1,2})\s*%/i);

  return {
    invoice_number: invoiceNumberMatch ? invoiceNumberMatch[1].trim() : null,
    invoice_date: findDate(normalized, "(?:invoice\\s*date|dated|date)"),
    due_date: findDate(normalized, "(?:due\\s*date|payment\\s*due)"),
    party_name: partyMatch ? partyMatch[1].trim().replace(/\s{2,}/g, " ") : null,
    subtotal: findAmount(normalized, "(?:sub\\s*total|taxable\\s*value|subtotal)"),
    gst_rate: gstRateMatch ? Number(gstRateMatch[1]) : null,
    tax: findAmount(normalized, "(?:total\\s*tax|gst\\s*amount|tax\\s*amount)"),
    total: findAmount(normalized, "(?:grand\\s*total|total\\s*amount|invoice\\s*total|amount\\s*payable)"),
    raw_text: normalized,
  };
}
