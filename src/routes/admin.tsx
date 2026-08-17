import { createFileRoute, Outlet, Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { ScanLine, LogOut, BarChart3, MapPin, FileSpreadsheet, Loader2, HelpCircle, ShieldCheck, AlertTriangle, PieChart, Settings, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormBuilder } from "@/components/admin/FormBuilder";

export const Route = createFileRoute("/admin")({ component: AdminLayout });

function AdminLayout() {
  const { user, role, profile, adminPolo, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [builderOpen, setBuilderOpen] = useState(false);

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

          let baseNome = "";
          let basePolo: string | null = null;
          if (reg.base_id) {
            const { data: b } = await supabase.from("bases").select("nome, polo").eq("id", reg.base_id).maybeSingle();
            baseNome = b?.nome ?? "";
            basePolo = (b?.polo as string) ?? null;
          }
          if (role === "ADMIN_POLO" && prof.polo !== adminPolo && basePolo !== adminPolo) return;

          const poloLabel = basePolo && basePolo !== prof.polo ? `${prof.polo} @ ${basePolo}` : prof.polo;
          toast.success(`${reg.etapa.replace("_", " ")} · ${prof.nome}`, {
            description: `${prof.prefixo} · ${poloLabel}${baseNome ? ` · ${baseNome}` : ""}`,
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
    { to: "/admin/equipes", label: "Equipes", icon: Users },
    { to: "/admin", label: "Registros", icon: FileSpreadsheet, exact: true },
    { to: "/admin/metricas", label: "Métricas", icon: BarChart3 },
    { to: "/admin/incidentes", label: "Incidentes", icon: AlertTriangle },
    { to: "/admin/dash-forms", label: "Dash Forms", icon: PieChart },
    { to: "/admin/bases", label: "Bases & QR", icon: MapPin },
  ];
  if (role === "ADMIN_DISPATCH" || role === "ADMIN_POLO") {
    tabs.push({ to: "/admin/contas", label: "Contas", icon: ShieldCheck } as any);
  }

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
          <div className="flex items-center gap-1">
            {role === "ADMIN_DISPATCH" && (
              <Button variant="ghost" size="icon" aria-label="Construtor de formulários" onClick={() => setBuilderOpen(true)}>
                <Settings className="h-5 w-5" />
              </Button>
            )}
            {(role === "ADMIN_DISPATCH" || role === "ADMIN_POLO") && (
              <Button variant="ghost" size="icon" aria-label="Contas" onClick={() => navigate({ to: "/admin/contas" })}>
                <ShieldCheck className="h-5 w-5" />
              </Button>
            )}
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Ajuda"><HelpCircle className="h-5 w-5" /></Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Ajuda · Glossário</DialogTitle></DialogHeader>
                <div className="space-y-4 text-sm">
                  <div>
                    <p className="font-semibold">Eletricistas ativos</p>
                    <p className="text-muted-foreground">Quantidade de eletricistas distintos que fizeram pelo menos uma marcação (PONTO, PRÉ DDS ou SAÍDA) no período filtrado.</p>
                  </div>
                  <div>
                    <p className="font-semibold">Jornadas completas</p>
                    <p className="text-muted-foreground">Quantos dias-eletricista tiveram as três etapas registradas (PONTO → PRÉ DDS → SAÍDA). O formato “X/Y” significa X jornadas concluídas de Y iniciadas.</p>
                  </div>
                  <div>
                    <p className="font-semibold">Tempo médio (PONTO → SAÍDA)</p>
                    <p className="text-muted-foreground">Média do tempo total entre o PONTO e a SAÍDA DA BASE entre todas as jornadas do período.</p>
                  </div>
                  <div>
                    <p className="font-semibold">Etapas</p>
                    <p className="text-muted-foreground"><b>PONTO</b>: chegada na base. <b>PRÉ DDS</b>: antes do Diálogo Diário de Segurança. <b>SAÍDA BASE</b>: saída da base para campo.</p>
                  </div>
                  <div>
                    <p className="font-semibold">Turno</p>
                    <p className="text-muted-foreground">Identificado pela letra após o hífen no prefixo da equipe (ex.: <b>NI200TST-A</b> = Turno A).</p>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <AlterarSenhaDialog />
            <Button variant="ghost" size="icon" aria-label="Sair" onClick={() => signOut().then(() => navigate({ to: "/login" }))}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
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
      {role === "ADMIN_DISPATCH" && <FormBuilder open={builderOpen} onOpenChange={setBuilderOpen} />}
    </div>
  );
}

import { RegistrosView } from "@/components/admin/RegistrosView";