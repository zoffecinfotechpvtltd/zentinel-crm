import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useAuth, isAdminRole } from "../context/AuthContext";
import { api } from "../lib/api";
import { Logo } from "./Logo";
import { UserAvatar } from "./UserAvatar";
import { CommandPalette } from "./CommandPalette";
import { Tooltip, TooltipProvider } from "./Tooltip";
import { useToast } from "./Toast";
import { useIdleLogout } from "../lib/useIdleLogout";
import {
  IconDashboard, IconLeads, IconClients, IconProjects, IconInvoices, IconFollowups,
  IconReports, IconBell, IconUsers, IconTemplate, IconSettings, IconSearch, IconSun,
  IconMoon, IconLogout, IconMenu, IconOpportunities, IconActivity, IconSparkle, IconKey,
  IconChevronLeft, IconChevronRight,
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
const SIDEBAR_COLLAPSED_KEY = "zoffec-sidebar-collapsed";

function SidebarNavLink({
  to, icon, label, collapsed, badge, onClick,
}: { to: string; icon: React.ReactNode; label: string; collapsed: boolean; badge?: React.ReactNode; onClick?: () => void }) {
  const link = (
    <NavLink to={to} onClick={onClick} className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
      {icon}
      <span>{label}</span>
      {badge}
    </NavLink>
  );
  return collapsed ? <Tooltip label={label}>{link}</Tooltip> : link;
}

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  }

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
    <TooltipProvider>
    <div className="app-shell">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      {/* .sidebar is position:fixed - it's already out of normal document
          flow, so rendering .main first here changes nothing visually but
          puts the header search/icons before the sidebar's ~15 nav links
          in keyboard Tab order, matching visual/reading order (Audit
          6.2#5 - focus order used to visit the whole sidebar first despite
          the header being first on screen). */}
      <div className={`main${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
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

      {mobileNavOpen && <div className="sidebar-scrim" onClick={() => setMobileNavOpen(false)} />}
      <div className={`sidebar${mobileNavOpen ? " open" : ""}${sidebarCollapsed ? " collapsed" : ""}`}>
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
                <SidebarNavLink
                  key={item.to}
                  to={item.to}
                  icon={item.icon}
                  label={item.label}
                  collapsed={sidebarCollapsed}
                  onClick={() => setMobileNavOpen(false)}
                  badge={item.to === "/notifications" && unread > 0 ? <span className="nav-badge">{unread}</span> : undefined}
                />
              ))}
            </div>
          );
        })}
        {isAdminRole(user?.role) && (
          <div className="nav-section">
            <div className="nav-label">Admin</div>
            <SidebarNavLink to="/users" icon={<IconUsers />} label="Users" collapsed={sidebarCollapsed} />
            <SidebarNavLink to="/templates" icon={<IconTemplate />} label="Message Templates" collapsed={sidebarCollapsed} />
            <SidebarNavLink to="/settings" icon={<IconSettings />} label="Settings" collapsed={sidebarCollapsed} />
          </div>
        )}
        {user?.role === "superadmin" && (
          <div className="nav-section">
            <div className="nav-label">Superadmin</div>
            <SidebarNavLink to="/automation-rules" icon={<IconSparkle />} label="Automation Rules" collapsed={sidebarCollapsed} />
            <SidebarNavLink to="/custom-fields" icon={<IconSettings />} label="Custom Fields" collapsed={sidebarCollapsed} />
            <SidebarNavLink to="/api-keys" icon={<IconKey />} label="API Keys" collapsed={sidebarCollapsed} />
            <SidebarNavLink to="/audit-log" icon={<IconFollowups />} label="Audit Log" collapsed={sidebarCollapsed} />
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
            <IconLogout size={14} /> <span className="nav-footer-logout-label">Log out</span>
          </button>
          <button type="button" className="sidebar-collapse-btn" onClick={toggleSidebarCollapsed} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {sidebarCollapsed ? <IconChevronRight size={14} /> : <><IconChevronLeft size={14} /> Collapse</>}
          </button>
        </div>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
    </TooltipProvider>
  );
}
