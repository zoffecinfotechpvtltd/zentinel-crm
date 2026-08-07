import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  IconDashboard, IconLeads, IconClients, IconProjects, IconInvoices, IconFollowups,
  IconReports, IconBell, IconUsers, IconTemplate, IconSettings, IconSearch, IconPlus,
} from "./Icons";

type Command = { label: string; hint?: string; to?: string; roles?: string[]; icon: React.ReactNode; action?: () => void };

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: Command[] = useMemo(() => [
    { label: "Dashboard", to: "/", icon: <IconDashboard /> },
    { label: "Leads", to: "/leads", icon: <IconLeads />, roles: ["admin", "sales", "finance"] },
    { label: "Add a lead", to: "/leads?new=1", icon: <IconPlus />, roles: ["admin", "sales"] },
    { label: "Clients", to: "/clients", icon: <IconClients /> },
    { label: "Projects", to: "/projects", icon: <IconProjects />, roles: ["admin", "ops", "finance"] },
    { label: "Invoices", to: "/invoices", icon: <IconInvoices />, roles: ["admin", "sales", "finance"] },
    { label: "Follow-ups", to: "/followups", icon: <IconFollowups />, roles: ["admin", "sales"] },
    { label: "Reports", to: "/reports", icon: <IconReports /> },
    { label: "Notifications", to: "/notifications", icon: <IconBell /> },
    { label: "Users", to: "/users", icon: <IconUsers />, roles: ["admin"] },
    { label: "Message Templates", to: "/templates", icon: <IconTemplate />, roles: ["admin"] },
    { label: "Settings", to: "/settings", icon: <IconSettings />, roles: ["admin"] },
  ], []);

  const filtered = useMemo(() => {
    const available = commands.filter((c) => !c.roles || (user && c.roles.includes(user.role)));
    if (!query.trim()) return available;
    const q = query.toLowerCase();
    return available.filter((c) => c.label.toLowerCase().includes(q));
  }, [commands, query, user]);

  useEffect(() => {
    if (open) { setQuery(""); setActive(0); setTimeout(() => inputRef.current?.focus(), 10); }
  }, [open]);

  useEffect(() => { setActive(0); }, [query]);

  function go(cmd: Command) {
    if (cmd.action) cmd.action();
    else if (cmd.to) navigate(cmd.to);
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === "Enter" && filtered[active]) { e.preventDefault(); go(filtered[active]); }
  }

  if (!open) return null;

  return (
    <div className="cmdk-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cmdk" onKeyDown={onKeyDown}>
        <div className="cmdk-input-wrap">
          <IconSearch size={16} style={{ color: "var(--text3)" }} />
          <input
            ref={inputRef}
            className="cmdk-input"
            placeholder="Jump to a page or action…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="cmdk-list">
          {filtered.length === 0 && <div className="cmdk-empty">Nothing matches "{query}"</div>}
          {filtered.map((c, i) => (
            <div
              key={c.label}
              className={`cmdk-item${i === active ? " active" : ""}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(c)}
            >
              {c.icon}
              <span>{c.label}</span>
            </div>
          ))}
        </div>
        <div className="cmdk-hint">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
