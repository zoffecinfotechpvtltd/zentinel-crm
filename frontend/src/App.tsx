import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { RequireAuth, RequireRole } from "./components/RequireAuth";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
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

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route path="/" element={<Dashboard />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/invoices" element={<Invoices />} />
            <Route path="/followups" element={<Followups />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/notifications" element={<Notifications />} />
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
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
