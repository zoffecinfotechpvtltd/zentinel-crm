import { useState } from "react";
import { useFetch } from "../lib/useFetch";
import { formatDate } from "../lib/format";

type Lead = { id: string; company: string; contact_person: string; next_followup_date: string | null; status: string };
type ListResponse<T> = { data: T[]; total: number };
type Template = { id: string; name: string; channel: string; subject: string | null; body: string; category: string };

const TABS = [
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "overdue", label: "Overdue" },
  { key: "all", label: "All" },
];

export function Followups() {
  const [tab, setTab] = useState("today");
  const { data } = useFetch<ListResponse<Lead>>(`/leads?followup=${tab}&per_page=50`, [tab]);
  const { data: templates } = useFetch<Template[]>("/message-templates");

  return (
    <div>
      <div className="section-header">
        <div className="section-title">Follow-up Management</div>
      </div>
      <div className="tab-bar">
        {TABS.map((t) => (
          <button key={t.key} className={`tab${tab === t.key ? " active" : ""}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>
      <div className="grid2">
        <div>
          {data?.data.length === 0 && <div className="empty">Nothing here</div>}
          {data?.data.map((l) => (
            <div className="followup-item" key={l.id}>
              <div className="followup-company">{l.company}</div>
              <div className="followup-detail">{l.contact_person} — {l.status} — due {formatDate(l.next_followup_date)}</div>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-title">Message Templates</div>
          {templates?.length === 0 && <div className="empty">No templates yet — add one from the Message Templates admin screen.</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {templates?.map((t) => (
              <div key={t.id} style={{ padding: 12, background: "var(--bg3)", borderRadius: 8, border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", marginBottom: 6 }}>{t.channel === "email" ? "✉" : "💬"} {t.name}</div>
                <div style={{ fontSize: 12, color: "var(--text2)", lineHeight: 1.6 }}>{t.body}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
