import { useState } from "react";
import { useFetch } from "../lib/useFetch";
import { IconCheck, IconX, IconSparkle } from "./Icons";

type SmtpConfig = { host: string } | null;
type User = { id: string };

export function OnboardingChecklist({ hasLeads, hasClients }: { hasLeads: boolean; hasClients: boolean }) {
  const [dismissed, setDismissed] = useState(false);
  const { data: smtp } = useFetch<SmtpConfig>("/settings/smtp");
  const { data: users } = useFetch<User[]>("/users");

  const items = [
    { label: "Add your first lead", done: hasLeads },
    { label: "Convert a lead or add a client directly", done: hasClients },
    { label: "Set up email (Settings → Email)", done: !!smtp },
    { label: "Invite the rest of your team (Users)", done: (users?.length ?? 1) > 1 },
  ];
  const allDone = items.every((i) => i.done);

  if (allDone || dismissed) return null;

  return (
    <div className="onboard-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 650 }}>
          <IconSparkle size={16} style={{ color: "var(--accent)" }} /> Getting started
        </div>
        <button type="button" className="icon-btn" style={{ width: 24, height: 24 }} onClick={() => setDismissed(true)} title="Dismiss">
          <IconX size={12} />
        </button>
      </div>
      {items.map((item) => (
        <div className={`onboard-item${item.done ? " done" : ""}`} key={item.label}>
          <div className="onboard-check">{item.done && <IconCheck size={11} />}</div>
          {item.label}
        </div>
      ))}
    </div>
  );
}
