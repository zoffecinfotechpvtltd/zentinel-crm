import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="empty">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function RequireRole({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { user } = useAuth();
  // superadmin satisfies any check that accepts "admin" (see isAdminRole),
  // but a route that asks for "superadmin" specifically is not satisfied by
  // plain "admin".
  const allowed = !!user && (roles.includes(user.role) || (user.role === "superadmin" && roles.includes("admin")));
  if (!allowed) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
