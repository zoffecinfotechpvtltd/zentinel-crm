import { useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { useSearchParams } from "react-router-dom";
import { useFetch } from "../lib/useFetch";
import { api, downloadFile } from "../lib/api";
import { useAuth, isAdminRole } from "../context/AuthContext";
import { useToast } from "../components/Toast";
import { PageHeader } from "../components/PageHeader";
import { formatDate, formatMoneyExact, isOverdue } from "../lib/format";
import { IconFollowups, IconInbox, IconCheck, IconCalendar } from "../components/Icons";
import { CustomDatePicker } from "../components/CustomDatePicker";

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
  const canSales = isAdminRole(user?.role) || user?.role === "sales";
  const canFinance = isAdminRole(user?.role) || user?.role === "finance";
  // Section and tab both live in the URL now (not just section before) - a
  // notification deep link and the back button both need to land on the
  // exact same view either way, and one control writing to the URL while
  // the other reset it was the inconsistency the audit flagged.
  const [params, setParams] = useSearchParams();
  const requestedSection = params.get("section");
  const section: "sales" | "finance" =
    requestedSection === "finance" && canFinance ? "finance" : requestedSection === "sales" && canSales ? "sales" : canSales ? "sales" : "finance";
  const tab = params.get("tab") ?? "today";

  function setSection(next: "sales" | "finance") {
    setParams({ section: next, tab: "today" });
  }
  function setTab(next: string) {
    setParams({ section, tab: next });
  }

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
      {section === "sales" && canSales && <SalesFollowups tab={tab} setTab={setTab} />}
      {section === "finance" && canFinance && <FinanceFollowups tab={tab} setTab={setTab} />}
    </div>
  );
}

function useFollowupTabCounts(base: "/leads" | "/invoices") {
  // One cheap (per_page=1, just reading `total`) request per bucket, so
  // every tab can show its own count at once instead of only whichever
  // one happens to be active - the active tab's full useFetch below
  // covers that tab already, this is purely for the four tab labels.
  const today = useFetch<ListResponse<unknown>>(`${base}?followup=today&per_page=1`);
  const upcoming = useFetch<ListResponse<unknown>>(`${base}?followup=upcoming&per_page=1`);
  const overdue = useFetch<ListResponse<unknown>>(`${base}?followup=overdue&per_page=1`);
  const all = useFetch<ListResponse<unknown>>(`${base}?followup=all&per_page=1`);
  return { today: today.data?.total, upcoming: upcoming.data?.total, overdue: overdue.data?.total, all: all.data?.total };
}

function SalesFollowups({ tab, setTab }: { tab: string; setTab: (t: string) => void }) {
  const { push } = useToast();
  const { data, loading, error, reload } = useFetch<ListResponse<Lead>>(`/leads?followup=${tab}&per_page=50`, [tab]);
  const { data: templates } = useFetch<Template[]>("/message-templates");
  const tabCounts = useFollowupTabCounts("/leads");

  // WhatsApp templates open wa.me with the message pre-filled — one click
  // instead of copy, switch apps, paste. This is a deep link into the
  // regular WhatsApp app/web client, not the WhatsApp Business API: no
  // automated sending, no delivery tracking, still one message at a time.
  async function copyTemplate(lead: Lead, templateId: string, template: Template) {
    try {
      const rendered = await api.get<{ rendered: string; subject: string | null }>(`/leads/${lead.id}/templates/${templateId}/render`);
      if (template.channel === "whatsapp" && lead.mobile) {
        window.open(`https://wa.me/${lead.mobile.replace(/\D/g, "")}?text=${encodeURIComponent(rendered.rendered)}`, "_blank", "noreferrer");
      } else {
        await navigator.clipboard.writeText(rendered.rendered);
        push("Message copied - paste it wherever you're sending it", "success");
      }
      // Best-effort audit trail — there's no real send to confirm delivery
      // of, just a record that this template was used against this lead.
      api.post(`/leads/${lead.id}/log-message-sent`, { template_id: templateId }).catch(() => {});
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
      push(err instanceof Error ? err.message : "Couldn't update - Won/Lost leads only", "error");
    }
  }

  return (
    <Tabs.Root value={tab} onValueChange={setTab}>
      <Tabs.List className="tab-bar">
        {TABS.map((t) => (
          <Tabs.Trigger key={t.key} value={t.key} className="tab">
            {t.label}{tabCounts[t.key as keyof typeof tabCounts] != null && ` (${tabCounts[t.key as keyof typeof tabCounts]})`}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      <Tabs.Content value={tab} className="grid2">
        <div>
          {loading && <div className="card"><div className="empty">Loading…</div></div>}
          {error && !loading && (
            <div className="banner banner-error" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span>Couldn't load follow-ups - {error}</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={reload}>Retry</button>
            </div>
          )}
          {!loading && !error && data?.data.length === 0 && (
            <div className="card"><div className="empty"><div className="empty-icon"><IconInbox size={30} /></div>Nothing here - you're caught up.</div></div>
          )}
          {!loading && data?.data.map((l) => (
            <div className={`followup-item${isOverdue(l.next_followup_date) ? " overdue" : ""}`} key={l.id} style={{ position: "relative" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div>
                  <div className="followup-company">{l.company}</div>
                  <div className="followup-detail">{l.contact_person} - {l.status} - due {formatDate(l.next_followup_date)}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {l.email && <a className="icon-btn" href={`mailto:${l.email}`} title={`Email ${l.contact_person}`}>@</a>}
                  {l.mobile && <a className="icon-btn" href={`https://wa.me/${l.mobile.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" title={`WhatsApp ${l.contact_person}`}>W</a>}
                  {l.next_followup_date && (
                    <button
                      type="button"
                      className="icon-btn"
                      title="Add to calendar"
                      onClick={() => downloadFile(`/leads/${l.id}/followup.ics`, `followup-${l.company.replace(/[^a-z0-9]/gi, "-")}.ics`)}
                    >
                      <IconCalendar size={14} />
                    </button>
                  )}
                  <button type="button" className="icon-btn" title="Mark done" onClick={() => markDone(l)}><IconCheck size={14} /></button>
                </div>
              </div>
              {templates && templates.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  {templates.map((t) => (
                    <button type="button" key={t.id} className="btn btn-ghost btn-sm" onClick={() => copyTemplate(l, t.id, t)}>
                      {t.channel === "whatsapp" ? `WhatsApp: ${t.name}` : t.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-title">Message Templates</div>
          {templates?.length === 0 && <div className="empty">No templates yet - add one from the Message Templates admin screen.</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {templates?.map((t) => (
              <div key={t.id} style={{ padding: 12, background: "var(--bg3)", borderRadius: 8, border: "1px solid var(--border)", borderLeft: `3px solid ${CATEGORY_TONE[t.category] ?? "var(--accent)"}` }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", marginBottom: 6 }}>{t.channel === "email" ? "Email" : "WhatsApp"} - {t.name}</div>
                <div style={{ fontSize: 12, color: "var(--text2)", lineHeight: 1.6 }}>{t.body}</div>
              </div>
            ))}
          </div>
        </div>
      </Tabs.Content>
    </Tabs.Root>
  );
}

function FinanceFollowups({ tab, setTab }: { tab: string; setTab: (t: string) => void }) {
  const { push } = useToast();
  const { data, loading, error, reload } = useFetch<ListResponse<Invoice>>(`/invoices?followup=${tab}&per_page=50`, [tab]);
  const { data: clientsResp } = useFetch<ListResponse<Client>>("/clients?per_page=200");
  const [draftDates, setDraftDates] = useState<Record<string, string>>({});
  const tabCounts = useFollowupTabCounts("/invoices");

  const clientName = (id: string) => clientsResp?.data.find((c) => c.id === id)?.company ?? "-";

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
    <Tabs.Root value={tab} onValueChange={setTab}>
      <Tabs.List className="tab-bar">
        {TABS.map((t) => (
          <Tabs.Trigger key={t.key} value={t.key} className="tab">
            {t.label}{tabCounts[t.key as keyof typeof tabCounts] != null && ` (${tabCounts[t.key as keyof typeof tabCounts]})`}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      <Tabs.Content value={tab}>
      {loading && <div className="card"><div className="empty">Loading…</div></div>}
      {error && !loading && (
        <div className="banner banner-error" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span>Couldn't load follow-ups - {error}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={reload}>Retry</button>
        </div>
      )}
      {!loading && !error && data?.data.length === 0 && (
        <div className="card"><div className="empty"><div className="empty-icon"><IconInbox size={30} /></div>Nothing to chase - every outstanding invoice is scheduled or paid.</div></div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {!loading && data?.data.map((inv) => (
          <div className={`followup-item${isOverdue(inv.next_followup_date) ? " overdue" : ""}`} key={inv.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div className="followup-company">{clientName(inv.client_id)} - {inv.invoice_number ?? "Draft"}</div>
                <div className="followup-detail">
                  Balance <span className="mono">{formatMoneyExact(inv.balance)}</span> - due {formatDate(inv.due_date)}
                  {inv.next_followup_date && ` - next follow-up ${formatDate(inv.next_followup_date)}`}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                <CustomDatePicker
                  className="sm"
                  value={draftDates[inv.id] ?? inv.next_followup_date ?? ""}
                  onChange={(v) => setDraftDates({ ...draftDates, [inv.id]: v })}
                />
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFollowup(inv, draftDates[inv.id] || null)}>Save</button>
                {inv.next_followup_date && (
                  <button
                    type="button"
                    className="icon-btn"
                    title="Add to calendar"
                    onClick={() => downloadFile(`/invoices/${inv.id}/followup.ics`, `payment-followup-${(inv.invoice_number ?? "draft").replace(/[^a-z0-9]/gi, "-")}.ics`)}
                  >
                    <IconCalendar size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      </Tabs.Content>
    </Tabs.Root>
  );
}
