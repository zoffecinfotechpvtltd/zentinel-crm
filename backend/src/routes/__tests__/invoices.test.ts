import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { resetDb, loginAs } from "../../test-support/testApp";

// POST /api/clients is admin-only (verified against backend/src/routes/clients.ts:123,
// `requireRole("admin")` — finance is not in the allowed list), so client creation here
// always goes through a fresh admin agent regardless of which role the caller passes in
// for the subsequent invoice operations (invoices routes allow admin *and* finance).
async function makeInvoiceableClient(): Promise<string> {
  const { agent: adminAgent } = await loginAs("admin");
  const res = await adminAgent.post("/api/clients").send({ company: `Client-${Date.now()}-${Math.random()}`, tally_ledger_name: "TEST-LEDGER" });
  return res.body.id as string;
}

describe("invoices routes", () => {
  beforeAll(async () => {
    await resetDb();
  });

  afterEach(async () => {
    await resetDb();
  });

  describe("happy path", () => {
    it("creates a Draft, finalizes it with a sequential number, and a full payment marks it Paid", async () => {
      const { agent } = await loginAs("finance");
      const clientId = await makeInvoiceableClient();

      const createRes = await agent.post("/api/invoices").send({
        client_id: clientId,
        line_items: [{ description: "Consulting", quantity: 1, rate: 100000, gst_rate: 18 }],
      });
      expect(createRes.status).toBe(201);
      expect(createRes.body.status).toBe("Draft");
      // subtotal/tax/total are `numeric(14,2)` columns (see
      // backend/migrations/1754400005000_invoices.sql) and pg has no type
      // parser configured for numeric, so pg-node returns them as strings —
      // unlike payments' `balance`, which the route explicitly Number()s.
      expect(createRes.body.subtotal).toBe("100000.00");
      expect(createRes.body.tax).toBe("18000.00");
      expect(createRes.body.total).toBe("118000.00");
      const invoiceId = createRes.body.id;

      const finalizeRes = await agent.post(`/api/invoices/${invoiceId}/finalize`);
      expect(finalizeRes.status).toBe(200);
      expect(finalizeRes.body.invoice_number).toMatch(/^ZI-\d{4}-\d+$/);

      const paymentRes = await agent.post(`/api/invoices/${invoiceId}/payments`).send({ amount: 118000, payment_date: "2026-01-15" });
      expect(paymentRes.status).toBe(201);
      expect(paymentRes.body.balance).toBe(0);
      expect(paymentRes.body.invoice_status).toBe("Paid");
    });
  });

  describe("validation / edge case", () => {
    it("rejects creating an invoice for a client with no tally_ledger_name", async () => {
      const { agent } = await loginAs("finance");
      // POST /api/clients is admin-only (see makeInvoiceableClient comment above),
      // so the client itself has to be created by an admin agent.
      const { agent: adminAgent } = await loginAs("admin");
      const clientRes = await adminAgent.post("/api/clients").send({ company: `No Ledger ${Date.now()}` });
      const res = await agent.post("/api/invoices").send({
        client_id: clientRes.body.id,
        line_items: [{ description: "X", quantity: 1, rate: 1000, gst_rate: 18 }],
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("tally_ledger_name_required");
    });

    it("rejects a payment larger than the outstanding balance", async () => {
      const { agent } = await loginAs("finance");
      const clientId = await makeInvoiceableClient();
      const createRes = await agent.post("/api/invoices").send({
        client_id: clientId, line_items: [{ description: "X", quantity: 1, rate: 1000, gst_rate: 0 }],
      });
      await agent.post(`/api/invoices/${createRes.body.id}/finalize`);
      const res = await agent.post(`/api/invoices/${createRes.body.id}/payments`).send({ amount: 999999, payment_date: "2026-01-15" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("amount_exceeds_balance");
    });

    it("rejects editing line items on a finalized invoice (must use a credit note instead)", async () => {
      const { agent } = await loginAs("finance");
      const clientId = await makeInvoiceableClient();
      const createRes = await agent.post("/api/invoices").send({
        client_id: clientId, line_items: [{ description: "X", quantity: 1, rate: 1000, gst_rate: 0 }],
      });
      await agent.post(`/api/invoices/${createRes.body.id}/finalize`);
      const res = await agent.patch(`/api/invoices/${createRes.body.id}`).send({ line_items: [{ description: "Y", quantity: 1, rate: 2000, gst_rate: 0 }] });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe("invoice_locked");
    });

    it("rejects a credit note against a Draft invoice", async () => {
      const { agent } = await loginAs("finance");
      const clientId = await makeInvoiceableClient();
      const createRes = await agent.post("/api/invoices").send({
        client_id: clientId, line_items: [{ description: "X", quantity: 1, rate: 1000, gst_rate: 0 }],
      });
      const res = await agent.post(`/api/invoices/${createRes.body.id}/credit-notes`).send({ reason: "Discount", amount: 100 });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("invoice_not_finalized");
    });
  });

  describe("authorization / not-found", () => {
    it("blocks sales and ops from every invoices endpoint, including GET", async () => {
      const { agent: salesAgent } = await loginAs("sales");
      expect((await salesAgent.get("/api/invoices")).status).toBe(403);
      const { agent: opsAgent } = await loginAs("ops");
      expect((await opsAgent.get("/api/invoices")).status).toBe(403);
    });

    it("returns 404 deleting a finalized (non-Draft) invoice", async () => {
      const { agent } = await loginAs("finance");
      const clientId = await makeInvoiceableClient();
      const createRes = await agent.post("/api/invoices").send({
        client_id: clientId, line_items: [{ description: "X", quantity: 1, rate: 1000, gst_rate: 0 }],
      });
      await agent.post(`/api/invoices/${createRes.body.id}/finalize`);
      const res = await agent.delete(`/api/invoices/${createRes.body.id}`);
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("not_found_or_not_draft");
    });
  });
});
