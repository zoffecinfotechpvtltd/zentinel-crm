import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "../lib/api";

export type Role = "admin" | "sales" | "finance" | "ops";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

export type LoginResult = { requiresTwoFactor: false } | { requiresTwoFactor: true; pendingToken: string };

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<LoginResult>;
  verifyTwoFactor: (pendingToken: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const me = await api.get<AuthUser>("/auth/me");
      setUser(me);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 423)) {
        setUser(null);
      } else {
        throw err;
      }
    }
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string, rememberMe = false): Promise<LoginResult> {
    const result = await api.post<AuthUser | { requires_2fa: true; pending_token: string }>("/auth/login", { email, password, rememberMe });
    if ("requires_2fa" in result) {
      return { requiresTwoFactor: true, pendingToken: result.pending_token };
    }
    setUser(result);
    return { requiresTwoFactor: false };
  }

  async function verifyTwoFactor(pendingToken: string, code: string) {
    const me = await api.post<AuthUser>("/auth/login/2fa", { pending_token: pendingToken, code });
    setUser(me);
  }

  async function logout() {
    await api.post("/auth/logout");
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, verifyTwoFactor, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
