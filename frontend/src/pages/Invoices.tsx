import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useFetch } from "../lib/useFetch";
import { api, ApiError, API_BASE } from "../lib/api";
import { Badge } from "../components/Badge";
import { Modal } from "../components/Modal";
import { Pagination } from "../components/Pagination";
import { formatDate, formatMoneyExact } from "../lib/format";

type Invoice = {
  id: string; invoice_number: string | null; client_id: string; status: string;
  total: string; balance: string; due_date: string | null; tally_sync_status: string; tally_voucher_ref: string | null;
};
type LineItem = { id: string; description: string; quantity: string; rate: string; gst_rate: string };
type Payment = { id: string; amount: string; payment_date: string; method: string | null; source: string };
type InvoiceDetail = Invoice & { subtotal: string; tax: string; line_items: LineItem[]; payments: Payment[] };
type Client = { id: string; company: string; tally_ledger_name: string | null };
type ListResponse<T> = { data: T[]; total: number; page: number; per_page: number };

type DraftLine = { description: string; quantity: string; rate: string; gst_rate: string };

export function Invoices() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");

  const query = new URLSearchParams({ page: String(page), per_page: "8" });
  if (status) query.set("status", status);

  const { data, loading, reload } = useFetch<ListResponse<Invoice>>(`/invoices?${query.toString()}`, [page, status]);
  const { data: clientsResp } = useFetch<ListResponse<Client>>("/clients?per_page=200");

  const [createOpen, setCreateOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([{ description: "", quantity: "1", rate: "", gst_rate: "18" }]);
  const [createError, setCreateError] = useState<string | null>(null);

  const [detailId, setDetailId] = useState<string | null>(null);
  const { data: detail, reload: reloadDetail } = useFetch<InvoiceDetail>(detailId ? `/invoices/${detailId}` : "", [detailId]);

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState("");
  const [payMethod, setPayMethod] = useState("");
  const [payError, setPayError] = useState<string | null>(null);

  const canEdit = user?.role === "admin" || user?.role === "finance";
  const canViewOnly = user?.role === "sales";
  const clientName = (id: string) => clientsResp?.data.find((c) => c.id === id)?.company ?? "—";

  function addLine() {
    setLines([...lines, { description: "", quantity: "1", rate: "", gst_rate: "18" }]);
  }
  function updateLine(i: number, field: keyof DraftLine, value: string) {
    setLines(lines.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)));
  }
  function removeLine(i: number) {
    setLines(lines.filter((_, idx) => idx !== i));
  }

  const previewSubtotal = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.rate) || 0), 0);
  const previewTax = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.rate) || 0) * ((Number(l.gst_rate) || 0) / 100), 0);

  async function createInvoice() {
    setCreateError(null);
    try {
      await api.post("/invoices", {
        client_id: clientId,
        due_date: dueDate || undefined,
        line_items: lines.map((l) => ({ description: l.description, quantity: Number(l.quantity), rate: Number(l.rate), gst_rate: Number(l.gst_rate) })),
      });
      setCreateOpen(false);
      setClientId(""); setDueDate(""); setLines([{ description: "", quantity: "1", rate: "", gst_rate: "18" }]);
      reload();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "Failed to create invoice");
    }
  }

  async function finalize() {
    if (!detailId || !confirm("Finalize this invoice? It will be locked and assigned a permanent invoice number.")) return;
    await api.post(`/invoices/${detailId}/finalize`);
    reloadDetail();
    reload();
  }

  async function recordPayment() {
    if (!detailId) return;
    setPayError(null);
    try {
      await api.post(`/invoices/${detailId}/payments`, { amount: Number(payAmount), payment_date: payDate, method: payMethod || undefined });
      setPaymentOpen(false);
      setPayAmount(""); setPayDate(""); setPayMethod("");
      reloadDetail();
      reload();
    } catch (err) {
      setPayError(err instanceof ApiError ? err.message : "Failed to record payment");
    }
  }

  function exportTally() {
    if (!detailId) return;
    window.open(`${API_BASE}/api/invoices/${detailId}/tally-export`, "_blank");
    setTimeout(reloadDetail, 1000);
  }

  async function markSynced() {
    if (!detailId) return;
    const ref = prompt("Tally voucher reference (from Tally after import):");
    if (!ref) return;
    await api.post(`/invoices/${detailId}/mark-synced`, { tally_voucher_ref: ref });
    reloadDetail();
  }

  return (
    <div>
      <div className="section-header">
        <div className="section-title">Invoice Management</div>
        {canEdit && <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>+ Create Invoice</button>}
      </div>

      <div className="filter-bar">
        <select className="filter-select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All Status</option>
          {["Draft", "Final", "Sent", "Partial", "Paid", "Overdue", "Cancelled"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Invoice #</th><th>Client</th><th>Due</th><th>Total</th><th>Balance</th><th>Status</th><th>Tally</th><th></th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={8}><div className="empty">Loading…</div></td></tr>}
              {!loading && data?.data.length === 0 && <tr><td colSpan={8}><div className="empty">No invoices found</div></td></tr>}
              {data?.data.map((inv) => (
                <tr key={inv.id}>
                  <td className="mono">{inv.invoice_number ?? <span style={{ color: "var(--text3)" }}>Draft</span>}</td>
                  <td>{clientName(inv.client_id)}</td>
                  <td style={{ fontSize: 12 }}>{formatDate(inv.due_date)}</td>
                  <td className="mono">{formatMoneyExact(inv.total)}</td>
                  <td className="mono">{formatMoneyExact(inv.balance)}</td>
                  <td><Badge status={inv.status} /></td>
                  <td><Badge status={inv.tally_sync_status} /></td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => setDetailId(inv.id)}>View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "0 16px 14px" }}>
          {data && <Pagination page={page} perPage={data.per_page} total={data.total} onChange={setPage} />}
        </div>
      </div>

      {createOpen && (
        <Modal title="Create Invoice" onClose={() => setCreateOpen(false)} wide footer={<>
          <button className="btn btn-ghost" onClick={() => setCreateOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={createInvoice} disabled={!clientId || lines.some((l) => !l.description || !l.rate)}>Save as Draft</button>
        </>}>
          {createError && <div className="banner banner-error">{createError}</div>}
          <div className="form-grid" style={{ marginBottom: 16 }}>
            <div className="form-group">
              <label className="form-label">Client *</label>
              <select className="form-select" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">Select client…</option>
                {clientsResp?.data.map((c) => <option key={c.id} value={c.id} disabled={!c.tally_ledger_name}>{c.company}{!c.tally_ledger_name ? " (needs Tally ledger name)" : ""}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Due Date</label><input className="form-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
          </div>

          <div className="card-title">Line Items</div>
          {lines.map((l, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto", gap: 8, marginBottom: 8 }}>
              <input className="form-input" placeholder="Description" value={l.description} onChange={(e) => updateLine(i, "description", e.target.value)} />
              <input className="form-input" type="number" placeholder="Qty" value={l.quantity} onChange={(e) => updateLine(i, "quantity", e.target.value)} />
              <input className="form-input" type="number" placeholder="Rate" value={l.rate} onChange={(e) => updateLine(i, "rate", e.target.value)} />
              <input className="form-input" type="number" placeholder="GST%" value={l.gst_rate} onChange={(e) => updateLine(i, "gst_rate", e.target.value)} />
              <button className="btn btn-ghost btn-sm" onClick={() => removeLine(i)} disabled={lines.length === 1}>✕</button>
            </div>
          ))}
          <button className="btn btn-ghost btn-sm" onClick={addLine}>+ Add Line</button>

          <div style={{ marginTop: 16, textAlign: "right", fontSize: 13, color: "var(--text2)" }}>
            <div>Subtotal (preview): <span className="mono">{formatMoneyExact(previewSubtotal)}</span></div>
            <div>Tax (preview): <span className="mono">{formatMoneyExact(previewTax)}</span></div>
            <div style={{ fontWeight: 650, color: "var(--text)" }}>Total (preview): <span className="mono">{formatMoneyExact(previewSubtotal + previewTax)}</span></div>
          </div>
        </Modal>
      )}

      {detailId && detail && (
        <Modal title={detail.invoice_number ?? "Draft Invoice"} onClose={() => setDetailId(null)} wide footer={
          <>
            <button className="btn btn-ghost" onClick={() => setDetailId(null)}>Close</button>
            {canEdit && detail.status === "Draft" && <button className="btn btn-primary" onClick={finalize}>Finalize</button>}
            {canEdit && detail.status !== "Draft" && <button className="btn btn-ghost" onClick={() => setPaymentOpen(true)}>Record Payment</button>}
            {canEdit && detail.status !== "Draft" && <button className="btn btn-ghost" onClick={exportTally}>Export for Tally</button>}
            {canEdit && detail.status !== "Draft" && detail.tally_sync_status !== "synced" && <button className="btn btn-ghost" onClick={markSynced}>Mark Synced</button>}
          </>
        }>
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <Badge status={detail.status} /><Badge status={detail.tally_sync_status} />
          </div>
          <div className="table-wrap" style={{ marginBottom: 14 }}>
            <table>
              <thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th>GST%</th></tr></thead>
              <tbody>
                {detail.line_items.map((l) => (
                  <tr key={l.id}><td>{l.description}</td><td>{l.quantity}</td><td className="mono">{formatMoneyExact(l.rate)}</td><td>{l.gst_rate}%</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ textAlign: "right", fontSize: 13, marginBottom: 16 }}>
            <div>Subtotal: <span className="mono">{formatMoneyExact(detail.subtotal)}</span></div>
            <div>Tax: <span className="mono">{formatMoneyExact(detail.tax)}</span></div>
            <div style={{ fontWeight: 650 }}>Total: <span className="mono">{formatMoneyExact(detail.total)}</span></div>
            <div style={{ color: "var(--warning)" }}>Balance: <span className="mono">{formatMoneyExact(detail.balance)}</span></div>
          </div>
          {detail.payments.length > 0 && (
            <>
              <div className="card-title">Payments</div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Source</th></tr></thead>
                  <tbody>
                    {detail.payments.map((p) => (
                      <tr key={p.id}><td style={{ fontSize: 12 }}>{formatDate(p.payment_date)}</td><td className="mono">{formatMoneyExact(p.amount)}</td><td>{p.method ?? "—"}</td><td>{p.source}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {canViewOnly && <div className="banner banner-info" style={{ marginTop: 16 }}>Read-only view — Sales can view but not edit invoices.</div>}
        </Modal>
      )}

      {paymentOpen && (
        <Modal title="Record Payment" onClose={() => setPaymentOpen(false)} footer={<>
          <button className="btn btn-ghost" onClick={() => setPaymentOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={recordPayment}>Record</button>
        </>}>
          {payError && <div className="banner banner-error">{payError}</div>}
          <div className="form-group" style={{ marginBottom: 12 }}><label className="form-label">Amount (₹) *</label><input className="form-input" type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} /></div>
          <div className="form-group" style={{ marginBottom: 12 }}><label className="form-label">Payment Date *</label><input className="form-input" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Method</label><input className="form-input" value={payMethod} onChange={(e) => setPayMethod(e.target.value)} placeholder="Bank transfer, cheque..." /></div>
        </Modal>
      )}
    </div>
  );
}
