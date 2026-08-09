import { useEffect, useState, type ReactNode } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./components/Toast";
import { ConfirmProvider } from "./components/ConfirmDialog";
import { RequireAuth, RequireRole } from "./components/RequireAuth";
import { Layout } from "./components/Layout";
import { Marketing } from "./pages/Marketing";
import { Login } from "./pages/Login";
import { ResetPassword } from "./pages/ResetPassword";
import { SignDocument } from "./pages/SignDocument";
import { Setup } from "./pages/Setup";
import { Dashboard } from "./pages/Dashboard";
import { Leads } from "./pages/Leads";
import { Clients } from "./pages/Clients";
import { Projects } from "./pages/Projects";
import { Invoices } from "./pages/Invoices";
import { Followups } from "./pages/Followups";
import { Reports } from "./pages/Reports";
import { Notifications } from "./pages/Notifications";
import { Users } from "./pages/Users";
import { MessageTemplates } from "./pages/MessageTemplates";
import { Settings } from "./pages/Settings";
import { AuditLog } from "./pages/AuditLog";
import { MyAccount } from "./pages/MyAccount";
import { api } from "./lib/api";

// Blocks the entire app until we know whether an admin account exists yet.
// A fresh install (or a fresh embedded database) has zero users — in that
// state, every route shows the Setup screen instead, regardless of path,
// until the first admin account is created. No default credential ever
// ships with this app.
function SetupGate({ children }: { children: ReactNode }) {
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);

  useEffect(() => {
    api.get<{ needsSetup: boolean }>("/setup/status")
      .then((r) => setNeedsSetup(r.needsSetup))
      .catch(() => setNeedsSetup(false));
  }, []);

  if (needsSetup === null) return <div className="empty">Loading…</div>;
  if (needsSetup) return <Setup onDone={() => setNeedsSetup(false)} />;
  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
      <ConfirmProvider>
      <AuthProvider>
        <SetupGate>
          <Routes>
            <Route path="/" element={<Marketing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/sign/:token" element={<SignDocument />} />
            <Route
              element={
                <RequireAuth>
                  <Layout />
                </RequireAuth>
              }
            >
              <Route path="/dashboard" element={<Dashboard />} />
              <Route
                path="/leads"
                element={
                  <RequireRole roles={["admin", "sales"]}>
                    <Leads />
                  </RequireRole>
                }
              />
              <Route
                path="/clients"
                element={
                  <RequireRole roles={["admin", "finance", "ops"]}>
                    <Clients />
                  </RequireRole>
                }
              />
              <Route path="/projects" element={<Projects />} />
              <Route
                path="/invoices"
                element={
                  <RequireRole roles={["admin", "finance"]}>
                    <Invoices />
                  </RequireRole>
                }
              />
              <Route path="/followups" element={<Followups />} />
              <Route
                path="/reports"
                element={
                  <RequireRole roles={["admin", "finance", "ops"]}>
                    <Reports />
                  </RequireRole>
                }
              />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/account" element={<MyAccount />} />
              <Route
                path="/users"
                element={
                  <RequireRole roles={["admin"]}>
                    <Users />
                  </RequireRole>
                }
              />
              <Route
                path="/templates"
                element={
                  <RequireRole roles={["admin"]}>
                    <MessageTemplates />
                  </RequireRole>
                }
              />
              <Route
                path="/settings"
                element={
                  <RequireRole roles={["admin"]}>
                    <Settings />
                  </RequireRole>
                }
              />
              <Route
                path="/audit-log"
                element={
                  <RequireRole roles={["admin"]}>
                    <AuditLog />
                  </RequireRole>
                }
              />
            </Route>
          </Routes>
        </SetupGate>
      </AuthProvider>
      </ConfirmProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
