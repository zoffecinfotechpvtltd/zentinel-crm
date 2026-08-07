import { useState } from "react";
import { useFetch } from "../lib/useFetch";
import { api, API_BASE } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/Toast";
import { PageHeader } from "../components/PageHeader";
import { formatDate, formatMoneyExact } from "../lib/format";
import { IconFollowups, IconInbox, IconCheck, IconCalendar } from "../components/Icons";

type Lead = {
  id: string; company: string; contact_person: string; email: string; mobile: string | null;
  next_followup_date: string | null; status: string;
};
type Invoice = {
  id: string; invoice_number: string | null; client_id: string; balance: string;
  due_date: string | null; next_followup_date: string | null; status: string;
};
type Client = { id: string; company: string };
type ListResponse<T> = { data: T[]; total: number };
type Template = { id: string; name: string; channel: string; subject: string | null; body: string; category: string };

const TABS = [
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "overdue", label: "Overdue" },
  { key: "all", label: "All" },
];

const CATEGORY_TONE: Record<string, string> = {
  payment_reminder: "var(--warning)", proposal_followup: "var(--info)", check_in: "var(--success)",
};

export function Followups() {
  const { user } = useAuth();
  const canSales = user?.role === "admin" || user?.role === "sales";
  const canFinance = user?.role === "admin" || user?.role === "finance";
  const [section, setSection] = useState<"sales" | "finance">(canSales ? "sales" : "finance");

  return (
    <div>
      <PageHeader
        icon={<IconFollowups size={19} />}
        title="Follow-up Management"
        subtitle={section === "sales" ? "Today's calls, upcoming check-ins, and anything overdue" : "Payments to chase, by when you said you'd chase them"}
        actions={canSales && canFinance && (
          <div className="view-toggle">
            <button type="button" className={section === "sales" ? "active" : ""} onClick={() => setSection("sales")}>Sales</button>
            <button type="button" className={section === "finance" ? "active" : ""} onClick={() => setSection("finance")}>Finance</button>
          </div>
        )}
      />
      {section === "sales" && canSales && <SalesFollowups />}
      {section === "finance" && canFinance && <FinanceFollowups />}
    </div>
  );
}

function SalesFollowups() {
  const { push } = useToast();
  const [tab, setTab] = useState("today");
  const { data, reload } = useFetch<ListResponse<Lead>>(`/leads?followup=${tab}&per_page=50`, [tab]);
  const { data: templates } = useFetch<Template[]>("/message-templates");

  async function copyTemplate(leadId: string, templateId: string) {
    try {
      const rendered = await api.get<{ rendered: string; subject: string | null }>(`/leads/${leadId}/templates/${templateId}/render`);
      await navigator.clipboard.writeText(rendered.rendered);
      push("Message copied — paste it wherever you're sending it", "success");
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't render that template", "error");
    }
  }

  async function markDone(l: Lead) {
    try {
      await api.post(`/leads/${l.id}/log-interaction`, { note: "Marked done from Follow-ups", no_further_followup: true });
      push(`${l.company} cleared from follow-ups`, "success");
      reload();
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't update — Won/Lost leads only", "error");
    }
  }

  return (
    <>
      <div className="tab-bar">
        {TABS.map((t) => (
          <button type="button" key={t.key} className={`tab${tab === t.key ? " active" : ""}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>
      <div className="grid2">
        <div>
          {data?.data.length === 0 && (
            <div className="card"><div className="empty"><div className="empty-icon"><IconInbox size={30} /></div>Nothing here — you're caught up.</div></div>
          )}
          {data?.data.map((l) => (
            <div className="followup-item" key={l.id} style={{ position: "relative" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div>
                  <div className="followup-company">{l.company}</div>
                  <div className="followup-detail">{l.contact_person} — {l.status} — due {formatDate(l.next_followup_date)}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {l.email && <a className="icon-btn" href={`mailto:${l.email}`} title={`Email ${l.contact_person}`}>@</a>}
                  {l.mobile && <a className="icon-btn" href={`https://wa.me/${l.mobile.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" title={`WhatsApp ${l.contact_person}`}>W</a>}
                  {l.next_followup_date && <a className="icon-btn" href={`${API_BASE}/api/leads/${l.id}/followup.ics`} title="Add to calendar"><IconCalendar size={14} /></a>}
                  <button type="button" className="icon-btn" title="Mark done" onClick={() => markDone(l)}><IconCheck size={14} /></button>
                </div>
              </div>
              {templates && templates.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  {templates.map((t) => (
                    <button type="button" key={t.id} className="btn btn-ghost btn-sm" onClick={() => copyTemplate(l.id, t.id)}>
                      {t.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-title">Message Templates</div>
          {templates?.length === 0 && <div className="empty">No templates yet — add one from the Message Templates admin screen.</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {templates?.map((t) => (
              <div key={t.id} style={{ padding: 12, background: "var(--bg3)", borderRadius: 8, border: "1px solid var(--border)", borderLeft: `3px solid ${CATEGORY_TONE[t.category] ?? "var(--accent)"}` }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", marginBottom: 6 }}>{t.channel === "email" ? "Email" : "WhatsApp"} — {t.name}</div>
                <div style={{ fontSize: 12, color: "var(--text2)", lineHeight: 1.6 }}>{t.body}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function FinanceFollowups() {
  const { push } = useToast();
  const [tab, setTab] = useState("today");
  const { data, reload } = useFetch<ListResponse<Invoice>>(`/invoices?followup=${tab}&per_page=50`, [tab]);
  const { data: clientsResp } = useFetch<ListResponse<Client>>("/clients?per_page=200");
  const [draftDates, setDraftDates] = useState<Record<string, string>>({});

  const clientName = (id: string) => clientsResp?.data.find((c) => c.id === id)?.company ?? "—";

  async function setFollowup(inv: Invoice, date: string | null) {
    try {
      await api.patch(`/invoices/${inv.id}/followup`, { next_followup_date: date });
      push(date ? "Follow-up date set" : "Follow-up cleared", "success");
      reload();
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't update follow-up date", "error");
    }
  }

  return (
    <>
      <div className="tab-bar">
        {TABS.map((t) => (
          <button type="button" key={t.key} className={`tab${tab === t.key ? " active" : ""}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>
      {data?.data.length === 0 && (
        <div className="card"><div className="empty"><div className="empty-icon"><IconInbox size={30} /></div>Nothing to chase — every outstanding invoice is scheduled or paid.</div></div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data?.data.map((inv) => (
          <div className="followup-item" key={inv.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div className="followup-company">{clientName(inv.client_id)} — {inv.invoice_number ?? "Draft"}</div>
                <div className="followup-detail">
                  Balance <span className="mono">{formatMoneyExact(inv.balance)}</span> — due {formatDate(inv.due_date)}
                  {inv.next_followup_date && ` — next follow-up ${formatDate(inv.next_followup_date)}`}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                <input
                  type="date"
                  className="form-input"
                  style={{ width: 150, padding: "6px 8px", fontSize: 12 }}
                  value={draftDates[inv.id] ?? inv.next_followup_date ?? ""}
                  onChange={(e) => setDraftDates({ ...draftDates, [inv.id]: e.target.value })}
                />
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFollowup(inv, draftDates[inv.id] || null)}>Save</button>
                {inv.next_followup_date && (
                  <a className="icon-btn" href={`${API_BASE}/api/invoices/${inv.id}/followup.ics`} title="Add to calendar"><IconCalendar size={14} /></a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
