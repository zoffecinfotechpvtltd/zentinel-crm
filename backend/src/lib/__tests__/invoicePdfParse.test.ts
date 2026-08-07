import { describe, it, expect } from "vitest";
import { parseInvoicePdfText } from "../invoicePdfParse";

describe("parseInvoicePdfText", () => {
  it("extracts invoice number, dates, party, and amounts from a typical Tally layout", () => {
    const text = `
      Tax Invoice
      Invoice No: ZI-2026-014
      Invoice Date: 05/03/2026
      Due Date: 04/04/2026

      Buyer: Acme Financial Services Pvt Ltd

      Description        Amount
      SEBI CSCRF Audit    250000.00

      Sub Total: 250000.00
      GST @18%
      Total Tax: 45000.00
      Grand Total: 295000.00
    `;
    const result = parseInvoicePdfText(text);
    expect(result.invoice_number).toBe("ZI-2026-014");
    expect(result.invoice_date).toBe("2026-03-05");
    expect(result.due_date).toBe("2026-04-04");
    expect(result.party_name).toContain("Acme Financial Services");
    expect(result.subtotal).toBe(250000);
    expect(result.gst_rate).toBe(18);
    expect(result.tax).toBe(45000);
    expect(result.total).toBe(295000);
  });

  it("degrades gracefully on unrecognizable text — nulls, not a throw", () => {
    const result = parseInvoicePdfText("this PDF has no invoice-shaped text in it at all");
    expect(result.invoice_number).toBeNull();
    expect(result.total).toBeNull();
    expect(result.raw_text).toContain("no invoice-shaped text");
  });

  it("handles a 2-digit year in a date", () => {
    const result = parseInvoicePdfText("Invoice Date: 15/06/26");
    expect(result.invoice_date).toBe("2026-06-15");
  });
});
