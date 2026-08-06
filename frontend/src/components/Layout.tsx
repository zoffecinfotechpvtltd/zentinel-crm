import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";

type NavItem = { to: string; label: string; roles?: string[] };

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Main",
    items: [
      { to: "/", label: "Dashboard" },
      { to: "/leads", label: "Leads", roles: ["admin", "sales", "finance"] },
      { to: "/clients", label: "Clients" },
      { to: "/projects", label: "Projects", roles: ["admin", "ops", "finance"] },
    ],
  },
  {
    section: "Finance",
    items: [
      { to: "/invoices", label: "Invoices", roles: ["admin", "sales", "finance"] },
      { to: "/followups", label: "Follow-ups", roles: ["admin", "sales"] },
    ],
  },
  {
    section: "Insights",
    items: [
      { to: "/reports", label: "Reports" },
      { to: "/notifications", label: "Notifications" },
    ],
  },
];

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [unread, setUnread] = useState(0);

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

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.body.classList.toggle("light", next === "light");
  }

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  const initials = user?.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase() ?? "";

  return (
    <div className="app-shell">
      <div className="sidebar">
        <div className="logo">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="logo-mark">Z</div>
            <div>
              <div className="logo-name">Zoffec Sentinel</div>
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
                  end={item.to === "/"}
                  className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
                >
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
            <NavLink to="/users" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>Users</NavLink>
            <NavLink to="/templates" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>Message Templates</NavLink>
            <NavLink to="/settings" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>Settings</NavLink>
          </div>
        )}
        <div className="nav-footer">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="avatar av-blue">{initials}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.name}</div>
              <div style={{ fontSize: 11, color: "var(--text3)" }}>{user?.email}</div>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 10, width: "100%" }} onClick={handleLogout}>Log out</button>
        </div>
      </div>

      <div className="main">
        <div className="topbar">
          <div className="topbar-title" />
          <button className="topbar-btn" onClick={toggleTheme} title="Toggle theme">{theme === "dark" ? "☀" : "☾"}</button>
          <div className="role-badge">{user?.role}</div>
        </div>
        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
