import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { resetDb, loginAs } from "../../test-support/testApp";

describe("reports routes", () => {
  beforeAll(async () => {
    await resetDb();
  });

  afterEach(async () => {
    await resetDb();
  });

  describe("happy path", () => {
    it("sales can access lead-conversion (the one report open to sales)", async () => {
      const { agent } = await loginAs("sales");
      const res = await agent.get("/api/reports/lead-conversion");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("funnel");
    });

    it("admin sets the fiscal-year revenue target and it's reflected in /revenue", async () => {
      const { agent } = await loginAs("admin");
      const putRes = await agent.put("/api/reports/revenue/target").send({ amount: 5000000, fiscal_year: "2026-27" });
      expect(putRes.status).toBe(200);
      const getRes = await agent.get("/api/reports/revenue");
      expect(getRes.status).toBe(200);
      expect(getRes.body.fy_target.amount).toBe(5000000);
    });

    it("revenue trend rolls a recorded payment into monthly_trend and client_wise", async () => {
      const { agent } = await loginAs("admin");
      const clientRes = await agent.post("/api/clients").send({ company: `Revenue Trend Co ${Date.now()}`, tally_ledger_name: "RT-1" });
      const invoiceRes = await agent.post("/api/invoices").send({
        client_id: clientRes.body.id,
        line_items: [{ description: "Consulting", quantity: 1, rate: 40000, gst_rate: 18 }],
      });
      await agent.post(`/api/invoices/${invoiceRes.body.id}/finalize`);
      await agent.post(`/api/invoices/${invoiceRes.body.id}/payments`).send({ amount: 47200, payment_date: "2026-03-10" });

      const res = await agent.get("/api/reports/revenue?from=2026-01-01&to=2026-12-31");
      expect(res.status).toBe(200);
      // date_trunc() returns a naive timestamp representing local wall-clock
      // midnight; node-pg parses it via local Date getters, so comparing
      // through .toISOString() (which is UTC) can shift across a month
      // boundary — use local getters instead, same fix as the recurring-
      // invoices date-advance bug earlier this session.
      const marchRow = res.body.monthly_trend.find((r: { month: string }) => {
        const d = new Date(r.month);
        return d.getFullYear() === 2026 && d.getMonth() === 2;
      });
      expect(Number(marchRow?.total)).toBe(47200);
      const clientRow = res.body.client_wise.find((r: { client_id: string }) => r.client_id === clientRes.body.id);
      expect(Number(clientRow?.total)).toBe(47200);
    });

    it("service-wise breakdown attributes a payment to the service its invoice's contract is for", async () => {
      const { agent } = await loginAs("admin");
      const serviceRes = await agent.post("/api/services").send({ name: `Trend Service ${Date.now()}` });
      const clientRes = await agent.post("/api/clients").send({ company: `Service Wise Co ${Date.now()}`, tally_ledger_name: "SW-1" });
      const contractRes = await agent.post(`/api/clients/${clientRes.body.id}/contracts`).send({ service_id: serviceRes.body.id, value: 100000 });
      const invoiceRes = await agent.post("/api/invoices").send({
        client_id: clientRes.body.id,
        contract_id: contractRes.body.id,
        line_items: [{ description: "Retainer", quantity: 1, rate: 20000, gst_rate: 18 }],
      });
      await agent.post(`/api/invoices/${invoiceRes.body.id}/finalize`);
      await agent.post(`/api/invoices/${invoiceRes.body.id}/payments`).send({ amount: 23600, payment_date: "2026-04-01" });

      const res = await agent.get("/api/reports/service-wise?from=2026-01-01&to=2026-12-31");
      expect(res.status).toBe(200);
      const row = res.body.revenue_by_service.find((r: { service_id: string }) => r.service_id === serviceRes.body.id);
      expect(Number(row?.revenue)).toBe(23600);
    });
  });

  describe("validation / edge case", () => {
    it("rejects a non-positive target amount", async () => {
      const { agent } = await loginAs("admin");
      const res = await agent.put("/api/reports/revenue/target").send({ amount: -100, fiscal_year: "2026-27" });
      expect(res.status).toBe(400);
    });
  });

  describe("authorization / not-found", () => {
    it("blocks sales from /revenue but allows ops (full report access despite no write access elsewhere)", async () => {
      const { agent: salesAgent } = await loginAs("sales");
      expect((await salesAgent.get("/api/reports/revenue")).status).toBe(403);
      const { agent: opsAgent } = await loginAs("ops");
      expect((await opsAgent.get("/api/reports/revenue")).status).toBe(200);
    });

    it("blocks non-admin from setting the revenue target", async () => {
      const { agent } = await loginAs("finance");
      const res = await agent.put("/api/reports/revenue/target").send({ amount: 100, fiscal_year: "2026-27" });
      expect(res.status).toBe(403);
    });
  });
});
