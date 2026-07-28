import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

type Role = "ELETRICISTA" | "ADMIN_POLO" | "ADMIN_DISPATCH";
type Polo = "Magé" | "Niterói" | "São Gonçalo" | "Serrana" | "Sul" | "Campos" | "Lagos" | "Macaé" | "Noroeste" | "Perdas";

export interface Profile {
  id: string;
  nome: string;
  prefixo: string;
  polo: Polo;
}

interface AuthCtx {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: Role | null;
  adminPolo: Polo | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [adminPolo, setAdminPolo] = useState<Polo | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMeta = async (uid: string) => {
    const [{ data: prof }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase.from("user_roles").select("role, polo").eq("user_id", uid),
    ]);
    setProfile(prof as Profile | null);
    const r = roles?.[0];
    setRole((r?.role as Role) ?? "ELETRICISTA");
    setAdminPolo((r?.polo as Polo) ?? null);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) {
        setTimeout(() => loadMeta(s.user.id), 0);
      } else {
        setProfile(null); setRole(null); setAdminPolo(null);
      }
    });
    supabase.auth.getUser().then(({ data, error }) => {
      if (error || !data.user) {
        supabase.auth.signOut();
        setSession(null);
        setProfile(null); setRole(null); setAdminPolo(null);
        setLoading(false);
        return;
      }
      supabase.auth.getSession().then(({ data: { session: s } }) => {
        setSession(s);
        loadMeta(data.user.id).finally(() => setLoading(false));
      });
    });
    return () => subscription.unsubscribe();
  }, []);

  const refresh = async () => {
    if (session?.user) await loadMeta(session.user.id);
  };

  const signOut = async () => { await supabase.auth.signOut(); };

  return (
    <Ctx.Provider value={{ user: session?.user ?? null, session, profile, role, adminPolo, loading, signOut, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be inside AuthProvider");
  return c;
};

export const POLOS: Polo[] = ["Magé","Niterói","São Gonçalo","Serrana","Sul","Campos","Lagos","Macaé","Noroeste","Perdas"];
export type { Role, Polo };