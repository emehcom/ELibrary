import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  role: "user" | "admin" | null;
  accountStatus: "active" | "deactivated" | null;
  loading: boolean;
  refreshAccount: () => Promise<void>;
};
const AuthContext = createContext<AuthContextValue>({ session: null, user: null, role: null, accountStatus: null, loading: true, refreshAccount: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<"user" | "admin" | null>(null);
  const [accountStatus, setAccountStatus] = useState<"active" | "deactivated" | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshAccount(currentUser?: User | null) {
    const target = currentUser === undefined ? session?.user : currentUser;
    if (!target) { setRole(null); setAccountStatus(null); return; }
    const [{ data: roleRow }, { data: profile }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", target.id).maybeSingle(),
      supabase.from("profiles").select("status").eq("id", target.id).maybeSingle(),
    ]);
    setRole(roleRow?.role === "admin" ? "admin" : "user");
    setAccountStatus(profile?.status === "deactivated" ? "deactivated" : "active");
  }

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (error) console.error("Could not restore session:", error.message);
      if (!mounted) return;
      setSession(data.session);
      await refreshAccount(data.session?.user ?? null);
      if (mounted) setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      // Fetch role/status after the auth event before protected admin routes render.
      queueMicrotask(() => { void refreshAccount(nextSession?.user ?? null).finally(() => setLoading(false)); });
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  return <AuthContext.Provider value={{ session, user: session?.user ?? null, role, accountStatus, loading, refreshAccount: () => refreshAccount() }}>{children}</AuthContext.Provider>;
}
export function useAuth() { return useContext(AuthContext); }
