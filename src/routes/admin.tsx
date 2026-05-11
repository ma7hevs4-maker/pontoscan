import { createFileRoute, Outlet, Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { ScanLine, LogOut, BarChart3, MapPin, FileSpreadsheet, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({ component: AdminLayout });

function AdminLayout() {
  const { user, role, profile, adminPolo, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/login" });
    else if (role === "ELETRICISTA") navigate({ to: "/eletricista" });
  }, [user, role, loading, navigate]);

  // Realtime: notificar quando eletricista do polo do admin registra marcação
  useEffect(() => {
    if (!user || !role || role === "ELETRICISTA") return;
    const channel = supabase
      .channel(`admin-registros-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "registros" },
        async (payload) => {
          const reg: any = payload.new;
          // Buscar perfil do eletricista para filtrar por polo
          const { data: prof } = await supabase
            .from("profiles")
            .select("nome, prefixo, polo")
            .eq("id", reg.usuario_id)
            .maybeSingle();
          if (!prof) return;
          if (role === "ADMIN_POLO" && prof.polo !== adminPolo) return;

          let baseNome = "";
          if (reg.base_id) {
            const { data: b } = await supabase.from("bases").select("nome").eq("id", reg.base_id).maybeSingle();
            baseNome = b?.nome ?? "";
          }
          toast.success(`${reg.etapa.replace("_", " ")} · ${prof.nome}`, {
            description: `${prof.prefixo} · ${prof.polo}${baseNome ? ` · ${baseNome}` : ""}`,
            duration: 6000,
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, role, adminPolo]);

  if (loading || !user || role === "ELETRICISTA") {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const isRoot = location.pathname === "/admin" || location.pathname === "/admin/";

  const tabs = [
    { to: "/admin", label: "Registros", icon: FileSpreadsheet, exact: true },
    { to: "/admin/metricas", label: "Métricas", icon: BarChart3 },
    { to: "/admin/bases", label: "Bases & QR", icon: MapPin },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary p-2 text-primary-foreground"><ScanLine className="h-5 w-5" /></div>
            <div>
              <h1 className="text-lg font-bold">PontoScan · Admin</h1>
              <p className="text-xs text-muted-foreground">
                {role === "ADMIN_DISPATCH" ? "Dispatch · Todos os polos" : `Polo: ${adminPolo}`}
                {profile && ` · ${profile.nome}`}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => signOut().then(() => navigate({ to: "/login" }))}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 px-4">
          {tabs.map(t => {
            const active = t.exact ? isRoot : location.pathname.startsWith(t.to);
            return (
              <Link key={t.to} to={t.to} className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                <t.icon className="h-4 w-4" />{t.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl p-4">
        {isRoot ? <RegistrosView /> : <Outlet />}
      </main>
    </div>
  );
}

import { RegistrosView } from "@/components/admin/RegistrosView";