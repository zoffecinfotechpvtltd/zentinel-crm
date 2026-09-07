import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useAuth, isAdminRole } from "../context/AuthContext";
import { api } from "../lib/api";
import { Logo } from "./Logo";
import { UserAvatar } from "./UserAvatar";
import { CommandPalette } from "./CommandPalette";
import { useToast } from "./Toast";
import { useIdleLogout } from "../lib/useIdleLogout";
import {
  IconDashboard, IconLeads, IconClients, IconProjects, IconInvoices, IconFollowups,
  IconReports, IconBell, IconUsers, IconTemplate, IconSettings, IconSearch, IconSun,
  IconMoon, IconLogout, IconMenu, IconOpportunities, IconActivity, IconSparkle, IconKey,
} from "./Icons";

type NavItem = { to: string; label: string; icon: React.ReactNode; roles?: string[] };

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Main",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: <IconDashboard /> },
      { to: "/leads", label: "Leads", icon: <IconLeads />, roles: ["admin", "sales"] },
      { to: "/opportunities", label: "Opportunities", icon: <IconOpportunities />, roles: ["admin", "sales"] },
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
      { to: "/activity", label: "Activity", icon: <IconActivity /> },
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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

  // "Remember me" means exactly that — a session that survives being idle,
  // not just surviving a closed browser. Skip the inactivity auto-logout
  // entirely for a remembered session; everyone else still gets it.
  useIdleLogout(() => {
    handleLogout();
    push("Signed out after 10 minutes of inactivity", "info");
  }, !user?.rememberMe);


  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">Skip to main content</a>
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
          const items = group.items.filter((i) => !i.roles || (user && (i.roles.includes(user.role) || (user.role === "superadmin" && i.roles.includes("admin")))));
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
        {isAdminRole(user?.role) && (
          <div className="nav-section">
            <div className="nav-label">Admin</div>
            <NavLink to="/users" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}><IconUsers />Users</NavLink>
            <NavLink to="/templates" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}><IconTemplate />Message Templates</NavLink>
            <NavLink to="/settings" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}><IconSettings />Settings</NavLink>
          </div>
        )}
        {user?.role === "superadmin" && (
          <div className="nav-section">
            <div className="nav-label">Superadmin</div>
            <NavLink to="/automation-rules" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}><IconSparkle />Automation Rules</NavLink>
            <NavLink to="/custom-fields" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}><IconSettings />Custom Fields</NavLink>
            <NavLink to="/api-keys" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}><IconKey />API Keys</NavLink>
            <NavLink to="/audit-log" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}><IconFollowups />Audit Log</NavLink>
          </div>
        )}
        <div className="nav-footer">
          <NavLink to="/account" className="nav-footer-profile" onClick={() => setMobileNavOpen(false)}>
            <UserAvatar user={user} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 550, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.name}</div>
              <div style={{ fontSize: 11, color: "var(--text3)" }}>{user?.email}</div>
            </div>
          </NavLink>
          <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 10, width: "100%" }} onClick={handleLogout}>
            <IconLogout size={14} /> Log out
          </button>
        </div>
      </div>

      <div className="main">
        <div className="topbar">
          <button type="button" className="icon-btn menu-btn" onClick={() => setMobileNavOpen(true)} aria-label="Open menu"><IconMenu size={16} /></button>
          <div className="topbar-spacer" />
          <div
            className="topbar-search"
            role="button"
            tabIndex={0}
            onClick={() => setPaletteOpen(true)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPaletteOpen(true); } }}
          >
            <IconSearch size={14} />
            <span>Search or jump to…</span>
            <kbd>Ctrl K</kbd>
          </div>
          <button type="button" className="topbar-btn" onClick={toggleTheme} title="Toggle theme" aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} style={{ position: "relative" }}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={theme}
                style={{ display: "flex" }}
                initial={{ opacity: 0, rotate: -90, scale: 0.6 }}
                animate={{ opacity: 1, rotate: 0, scale: 1 }}
                exit={{ opacity: 0, rotate: 90, scale: 0.6 }}
                transition={{ duration: 0.18 }}
              >
                {theme === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
              </motion.span>
            </AnimatePresence>
          </button>
          <button type="button" className="topbar-btn" onClick={() => navigate("/notifications")} title="Notifications" aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}>
            <IconBell size={16} />
            {unread > 0 && <span className="nav-badge">{unread}</span>}
          </button>
        </div>
        <div className="content" id="main-content" tabIndex={-1}>
          <Outlet />
        </div>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
