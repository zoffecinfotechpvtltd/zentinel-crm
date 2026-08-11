import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useFetch } from "../lib/useFetch";
import { api } from "../lib/api";
import { Badge } from "../components/Badge";
import { Modal } from "../components/Modal";
import { Pagination } from "../components/Pagination";
import { PageHeader } from "../components/PageHeader";
import { NotesAndFiles } from "../components/NotesAndFiles";
import { TableSkeleton } from "../components/Skeleton";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/ConfirmDialog";
import { formatDate, formatMoney } from "../lib/format";
import { IconClients, IconPlus, IconInbox } from "../components/Icons";
import { CustomSelect } from "../components/CustomSelect";
import { CustomDatePicker } from "../components/CustomDatePicker";

type Client = {
  id: string; company: string; gstin: string | null; tally_ledger_name: string | null; status: string;
  primary_contact_name: string | null; primary_contact_email: string | null; primary_contact_mobile: string | null;
  primary_service_name: string | null; contract_value_total: string | number; contract_end_date: string | null;
};
type Contact = { id: string; name: string; email: string | null; mobile: string | null; designation: string | null; is_primary: boolean };
type Contract = { id: string; service_id: string | null; value: string | null; start_date: string | null; end_date: string | null; status: string };
type ClientDetail = Client & {
  billing_address: string | null; is_archived: boolean;
  contacts: Contact[]; contracts: Contract[]; contract_value_total: number;
  originating_lead: { id: string; company: string; status: string } | null;
};
type ListResponse<T> = { data: T[]; total: number; page: number; per_page: number };
type Service = { id: string; name: string };

export function Clients() {
  const { user } = useAuth();
  const { push } = useToast();
  const confirm = useConfirm();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  const query = new URLSearchParams({ page: String(page), per_page: "8" });
  if (search) query.set("search", search);
  if (status) query.set("status", status);

  const { data, loading, reload: reloadList } = useFetch<ListResponse<Client>>(`/clients?${query.toString()}`, [page, search, status]);
  const { data: services } = useFetch<Service[]>("/services");

  const [detailId, setDetailId] = useState<string | null>(null);
  const { data: detail, reload: reloadDetail } = useFetch<ClientDetail>(detailId ? `/clients/${detailId}` : "", [detailId]);

  const [addOpen, setAddOpen] = useState(false);
  const [newCompany, setNewCompany] = useState("");
  const [newGstin, setNewGstin] = useState("");
  const [newLedger, setNewLedger] = useState("");

  const [contactForm, setContactForm] = useState({ name: "", email: "", mobile: "", designation: "" });
  const [contractForm, setContractForm] = useState({ service_id: "", value: "", start_date: "", end_date: "" });
  const [ledgerDraft, setLedgerDraft] = useState("");

  const canEdit = user?.role === "admin";

  async function createClient() {
    try {
      await api.post("/clients", { company: newCompany, gstin: newGstin || undefined, tally_ledger_name: newLedger || undefined });
      setAddOpen(false);
      setNewCompany(""); setNewGstin(""); setNewLedger("");
      push("Client added", "success");
      reloadList();
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to add client", "error");
    }
  }

  async function removeClient(c: Client) {
    if (!(await confirm({ message: `Delete client "${c.company}"? This can't be undone.`, confirmLabel: "Delete", danger: true }))) return;
    try {
      await api.delete(`/clients/${c.id}`);
      push("Client deleted", "success");
      reloadList();
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to delete client", "error");
    }
  }

  useEffect(() => {
    setLedgerDraft(detail?.tally_ledger_name ?? "");
  }, [detail?.tally_ledger_name]);

  async function saveLedger() {
    if (!detailId) return;
    await api.patch(`/clients/${detailId}`, { tally_ledger_name: ledgerDraft || null });
    reloadDetail();
  }

  async function addContact() {
    if (!detailId) return;
    await api.post(`/clients/${detailId}/contacts`, { ...contactForm, email: contactForm.email || undefined, mobile: contactForm.mobile || undefined, designation: contactForm.designation || undefined });
    setContactForm({ name: "", email: "", mobile: "", designation: "" });
    reloadDetail();
  }

  async function setPrimary(contactId: string) {
    if (!detailId) return;
    await api.patch(`/clients/${detailId}/contacts/${contactId}`, { is_primary: true });
    reloadDetail();
  }

  async function addContract() {
    if (!detailId) return;
    await api.post(`/clients/${detailId}/contracts`, {
      service_id: contractForm.service_id || undefined,
      value: contractForm.value ? Number(contractForm.value) : undefined,
      start_date: contractForm.start_date || undefined,
      end_date: contractForm.end_date || undefined,
    });
    setContractForm({ service_id: "", value: "", start_date: "", end_date: "" });
    reloadDetail();
  }

  const serviceName = (id: string | null) => services?.find((s) => s.id === id)?.name ?? "—";

  return (
    <div>
      <PageHeader
        icon={<IconClients size={19} />}
        title="Client Management"
        subtitle={data ? `${data.total} client${data.total === 1 ? "" : "s"} on file` : undefined}
        actions={canEdit && <button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)}><IconPlus size={14} /> Add Client</button>}
      />

      <div className="filter-bar">
        <input className="filter-input" placeholder="Search client..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <CustomSelect
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          placeholder="All Status"
          options={[{ value: "", label: "All Status" }, { value: "Active", label: "Active" }, { value: "Inactive", label: "Inactive" }]}
        />
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Company</th><th>Contact</th><th>Service</th><th>Contract Value</th><th>Renewal</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {loading && <TableSkeleton rows={6} cols={7} />}
              {!loading && data?.data.length === 0 && (
                <tr><td colSpan={7}>
                  <div className="empty"><div className="empty-icon"><IconInbox size={30} /></div>No clients match these filters yet.</div>
                </td></tr>
              )}
              {data?.data.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div style={{ fontWeight: 550, color: "var(--text)" }}>{c.company}</div>
                    <div style={{ fontSize: 11, color: "var(--text3)" }}>{c.gstin ?? "no GSTIN"}</div>
                  </td>
                  <td>
                    <div>{c.primary_contact_name ?? "—"}</div>
                    <div style={{ fontSize: 11, color: "var(--text3)" }}>{c.primary_contact_email ?? c.primary_contact_mobile ?? ""}</div>
                  </td>
                  <td style={{ fontSize: 12 }}>{c.primary_service_name ?? "—"}</td>
                  <td className="mono">{Number(c.contract_value_total) > 0 ? formatMoney(c.contract_value_total) : "—"}</td>
                  <td style={{ fontSize: 12 }}>{c.contract_end_date ? formatDate(c.contract_end_date) : "—"}</td>
                  <td><Badge status={c.status} /></td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDetailId(c.id)}>View</button>
                      {canEdit && <button type="button" className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => removeClient(c)}>Delete</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "0 16px 14px" }}>
          {data && <Pagination page={page} perPage={data.per_page} total={data.total} onChange={setPage} />}
        </div>
      </div>

      {addOpen && (
        <Modal title="Add New Client" onClose={() => setAddOpen(false)} footer={<>
          <button type="button" className="btn btn-ghost" onClick={() => setAddOpen(false)}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={createClient}>Save Client</button>
        </>}>
          <div className="form-grid">
            <div className="form-group full"><label className="form-label">Company Name *</label><input className="form-input" value={newCompany} onChange={(e) => setNewCompany(e.target.value)} /></div>
            <div className="form-group"><label className="form-label">GSTIN</label><input className="form-input" value={newGstin} onChange={(e) => setNewGstin(e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Tally Ledger Name</label><input className="form-input" value={newLedger} onChange={(e) => setNewLedger(e.target.value)} /></div>
          </div>
        </Modal>
      )}

      {detailId && detail && (
        <Modal title={detail.company} onClose={() => setDetailId(null)} wide footer={<button type="button" className="btn btn-ghost" onClick={() => setDetailId(null)}>Close</button>}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
            <Badge status={detail.status} />
            {detail.originating_lead && <span style={{ fontSize: 12, color: "var(--text3)" }}>Converted from lead: {detail.originating_lead.company}</span>}
          </div>

          {!detail.tally_ledger_name && (
            <div className="banner banner-error">No Tally ledger name set — invoices can't be created for this client until Finance sets one.</div>
          )}

          {canEdit && (
            <div className="form-group full" style={{ marginBottom: 20 }}>
              <label className="form-label">Tally Ledger Name</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input className="form-input" value={ledgerDraft} onChange={(e) => setLedgerDraft(e.target.value)} />
                <button type="button" className="btn btn-ghost btn-sm" onClick={saveLedger}>Save</button>
              </div>
            </div>
          )}

          <div className="card-title">Contacts</div>
          <div className="table-wrap" style={{ marginBottom: 14 }}>
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>Mobile</th><th>Primary</th><th></th></tr></thead>
              <tbody>
                {detail.contacts.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td><td style={{ fontSize: 12 }}>{c.email ?? "—"}</td><td style={{ fontSize: 12 }}>{c.mobile ?? "—"}</td>
                    <td>{c.is_primary ? <Badge status="Active" /> : ""}</td>
                    <td>{!c.is_primary && canEdit && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPrimary(c.id)}>Make primary</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canEdit && (
            <div className="filter-bar" style={{ marginBottom: 20 }}>
              <input className="filter-input" placeholder="Name" value={contactForm.name} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} />
              <input className="filter-input" placeholder="Email" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} />
              <input className="filter-input" placeholder="Mobile" value={contactForm.mobile} onChange={(e) => setContactForm({ ...contactForm, mobile: e.target.value })} />
              <button type="button" className="btn btn-ghost btn-sm" onClick={addContact} disabled={!contactForm.name}>+ Add Contact</button>
            </div>
          )}

          <div className="card-title">Contracts <span style={{ fontSize: 12, color: "var(--text3)", fontWeight: 400 }}>Total: {formatMoney(detail.contract_value_total)}</span></div>
          <div className="table-wrap" style={{ marginBottom: 14 }}>
            <table>
              <thead><tr><th>Service</th><th>Value</th><th>Start</th><th>End</th><th>Status</th></tr></thead>
              <tbody>
                {detail.contracts.map((c) => (
                  <tr key={c.id}>
                    <td>{serviceName(c.service_id)}</td><td className="mono">{c.value ? formatMoney(c.value) : "—"}</td>
                    <td style={{ fontSize: 12 }}>{formatDate(c.start_date)}</td><td style={{ fontSize: 12 }}>{formatDate(c.end_date)}</td>
                    <td><Badge status={c.status === "active" ? "Active" : c.status === "completed" ? "Completed" : "Cancelled"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canEdit && (
            <div className="filter-bar">
              <CustomSelect
                value={contractForm.service_id}
                onChange={(v) => setContractForm({ ...contractForm, service_id: v })}
                placeholder="Service…"
                options={services?.map((s) => ({ value: s.id, label: s.name })) ?? []}
              />
              <input className="filter-input" placeholder="Value ₹" type="number" value={contractForm.value} onChange={(e) => setContractForm({ ...contractForm, value: e.target.value })} />
              <CustomDatePicker value={contractForm.start_date} onChange={(v) => setContractForm({ ...contractForm, start_date: v })} placeholder="Start date" />
              <CustomDatePicker value={contractForm.end_date} onChange={(v) => setContractForm({ ...contractForm, end_date: v })} placeholder="End date" />
              <button type="button" className="btn btn-ghost btn-sm" onClick={addContract}>+ Add Contract</button>
            </div>
          )}

          <NotesAndFiles entityType="client" entityId={detail.id} />
        </Modal>
      )}
    </div>
  );
}
