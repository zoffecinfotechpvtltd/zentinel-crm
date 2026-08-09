import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { Logo } from "./Logo";
import { CommandPalette } from "./CommandPalette";
import { useToast } from "./Toast";
import { useIdleLogout } from "../lib/useIdleLogout";
import {
  IconDashboard, IconLeads, IconClients, IconProjects, IconInvoices, IconFollowups,
  IconReports, IconBell, IconUsers, IconTemplate, IconSettings, IconSearch, IconSun,
  IconMoon, IconLogout, IconMenu, IconChevronDown,
} from "./Icons";

type NavItem = { to: string; label: string; icon: React.ReactNode; roles?: string[] };

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Main",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: <IconDashboard /> },
      { to: "/leads", label: "Leads", icon: <IconLeads />, roles: ["admin", "sales"] },
      { to: "/clients", label: "Clients", icon: <IconClients />, roles: ["admin", "ops", "finance"] },
      { to: "/projects", label: "Projects", icon: <IconProjects />, roles: ["admin", "ops", "finance"] },
    ],
  },
  {
    section: "Finance",
    items: [
      { to: "/invoices", label: "Invoices", icon: <IconInvoices />, roles: ["admin", "finance"] },
      { to: "/followups", label: "Follow-ups", icon: <IconFollowups />, roles: ["admin", "sales", "finance"] },
    ],
  },
  {
    section: "Insights",
    items: [
      { to: "/reports", label: "Reports", icon: <IconReports />, roles: ["admin", "finance", "ops"] },
      { to: "/notifications", label: "Notifications", icon: <IconBell /> },
    ],
  },
];

const THEME_KEY = "zoffec-theme";

export function Layout() {
  const { user, logout } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
    // No explicit choice yet — light is the app's default surface; only
    // follow the OS into dark if it actually prefers dark.
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const [unread, setUnread] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    function poll() {
      api.get<{ count: number }>("/notifications/unread-count").then((r) => {
        if (!cancelled) setUnread(r.count);
      }).catch(() => {});
    }
    poll();
    const id = setInterval(poll, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function toggleTheme() {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_KEY, next);
      return next;
    });
  }

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  useIdleLogout(() => {
    handleLogout();
    push("Signed out after 10 minutes of inactivity", "info");
  });

  const initials = user?.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase() ?? "";

  return (
    <div className="app-shell">
      {mobileNavOpen && <div className="sidebar-scrim" onClick={() => setMobileNavOpen(false)} />}
      <div className={`sidebar${mobileNavOpen ? " open" : ""}`}>
        <div className="logo">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="logo-mark"><Logo size={28} /></div>
            <div>
              <div className="logo-name">Zentinel</div>
              <div className="logo-sub">Zoffec Infotech Pvt. Ltd.</div>
            </div>
          </div>
        </div>
        {NAV.map((group) => {
          const items = group.items.filter((i) => !i.roles || (user && i.roles.includes(user.role)));
          if (items.length === 0) return null;
          return (
            <div className="nav-section" key={group.section}>
              <div className="nav-label">{group.section}</div>
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileNavOpen(false)}
                  className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
                >
                  {item.icon}
                  {item.label}
                  {item.to === "/notifications" && unread > 0 && <span className="nav-badge">{unread}</span>}
                </NavLink>
              ))}
            </div>
          );
        })}
        {user?.role === "admin" && (
          <div className="nav-section">
            <div className="nav-label">Admin</div>
            <NavLink to="/users" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}><IconUsers />Users</NavLink>
            <NavLink to="/templates" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}><IconTemplate />Message Templates</NavLink>
            <NavLink to="/settings" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}><IconSettings />Settings</NavLink>
            <NavLink to="/audit-log" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}><IconFollowups />Audit Log</NavLink>
          </div>
        )}
        <div className="nav-footer">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="avatar av-blue">{initials}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 550, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.name}</div>
              <div style={{ fontSize: 11, color: "var(--text3)" }}>{user?.email}</div>
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 10, width: "100%" }} onClick={handleLogout}>
            <IconLogout size={14} /> Log out
          </button>
        </div>
      </div>

      <div className="main">
        <div className="topbar">
          <button type="button" className="icon-btn menu-btn" onClick={() => setMobileNavOpen(true)} aria-label="Open menu"><IconMenu size={16} /></button>
          <div className="topbar-spacer" />
          <div className="topbar-search" onClick={() => setPaletteOpen(true)}>
            <IconSearch size={14} />
            <span>Search or jump to…</span>
            <kbd>Ctrl K</kbd>
          </div>
          <button type="button" className="topbar-btn" onClick={toggleTheme} title="Toggle theme">
            {theme === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
          </button>
          <button type="button" className="topbar-btn" onClick={() => navigate("/notifications")} title="Notifications">
            <IconBell size={16} />
            {unread > 0 && <span className="nav-badge">{unread}</span>}
          </button>
          <div className="dropdown" ref={userMenuRef}>
            <button type="button" className="topbar-btn" style={{ width: "auto", gap: 6, padding: "0 8px" }} onClick={() => setUserMenuOpen((v) => !v)}>
              <div className="avatar av-blue" style={{ width: 24, height: 24, fontSize: 10.5 }}>{initials}</div>
              <IconChevronDown size={13} />
            </button>
            {userMenuOpen && (
              <div className="dropdown-panel" style={{ minWidth: 200 }}>
                <div className="dropdown-header">
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{user?.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text3)" }}>{user?.email}</div>
                  <div className="role-badge" style={{ marginTop: 8, display: "inline-block" }}>{user?.role}</div>
                </div>
                <div className="dropdown-footer" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <NavLink to="/account" className="btn btn-ghost btn-sm" style={{ width: "100%" }} onClick={() => setUserMenuOpen(false)}>
                    Account &amp; 2FA
                  </NavLink>
                  <button type="button" className="btn btn-ghost btn-sm" style={{ width: "100%" }} onClick={handleLogout}>
                    <IconLogout size={14} /> Log out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="content">
          <Outlet />
        </div>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
