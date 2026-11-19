import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { UNAUTHORIZED_EVENT, tokenStore } from "../services/api";
import * as endpoints from "../services/endpoints";
import type { Role, User } from "../types";

const RANK: Record<Role, number> = { viewer: 0, operator: 1, admin: 2 };

interface AuthValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  /** true when the signed-in user has at least this role (anonymous users never do). */
  hasRole: (min: Role) => boolean;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(() => tokenStore.get() !== null);

  useEffect(() => {
    if (!tokenStore.get()) return;
    let alive = true;
    endpoints.fetchMe()
      .then((u) => alive && setUser(u))
      .catch(() => tokenStore.clear())
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const onUnauthorized = () => setUser(null);  // token expired or revoked
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await endpoints.login(email, password);
    tokenStore.set(res.access_token);
    setUser(res.user);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    await endpoints.register(name, email, password);
    await login(email, password);
  }, [login]);

  const logout = useCallback(() => { tokenStore.clear(); setUser(null); }, []);
  const hasRole = useCallback((min: Role) => user !== null && RANK[user.role] >= RANK[min], [user]);

  const value = useMemo(() => ({ user, loading, login, register, logout, hasRole }), [user, loading, login, register, logout, hasRole]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
