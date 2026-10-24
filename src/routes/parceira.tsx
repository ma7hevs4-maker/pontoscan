import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IncidenteDialog, type IncidenteActor } from "@/components/IncidenteDialog";
import { AlertTriangle, LogOut, ScanLine, Building2 } from "lucide-react";

export const Route = createFileRoute("/parceira")({ head: () => ({ meta: [{ title: "Área da parceira · PontoScan" }, { name: "description", content: "Registro de incidentes das equipes parceiras no PontoScan." }, { property: "og:title", content: "Área da parceira · PontoScan" }, { property: "og:description", content: "Registro de incidentes das equipes parceiras no PontoScan." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }), component: ParceiraPage });

const PARCEIRA_KEY = "pontoscan.parceira_session";

type ParceiraSession = { prefixo: string; nome: string; parceira: string };

function readSession(): ParceiraSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PARCEIRA_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s?.prefixo || !s?.nome || !s?.parceira) return null;
    return s;
  } catch { return null; }
}

function ParceiraPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<ParceiraSession | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const s = readSession();
    if (!s) { navigate({ to: "/login" }); return; }
    setSession(s); setReady(true);
  }, [navigate]);

  const sair = () => {
    localStorage.removeItem(PARCEIRA_KEY);
    navigate({ to: "/login" });
  };

  if (!ready || !session) return null;

  const actor: IncidenteActor = {
    mode: "parceira",
    prefixo: session.prefixo,
    nome: session.nome,
    parceira: session.parceira,
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary">
      <header className="flex items-center justify-between border-b bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-bold">{session.nome}</p>
            <p className="text-xs text-muted-foreground">
              <span className="font-mono">{session.prefixo}</span> · {session.parceira}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ScanLine className="h-6 w-6 text-primary" />
          <Button variant="ghost" size="icon" title="Sair" onClick={sair}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-md p-4">
        <Card className="p-6 text-center">
          <h2 className="mb-2 text-lg font-semibold">Registrar incidente</h2>
          <p className="mb-6 text-sm text-muted-foreground">
            Equipe parceira <b>{session.parceira}</b>. Preencha o formulário do incidente.
          </p>
          <button
            onClick={() => setOpen(true)}
            className="flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-amber-500 bg-amber-50 p-8 text-amber-900 shadow-sm transition-transform active:scale-95 hover:bg-amber-100"
          >
            <AlertTriangle className="h-10 w-10" />
            <span className="text-2xl font-bold">Incidente</span>
          </button>
        </Card>
      </main>

      <IncidenteDialog open={open} onOpenChange={setOpen} actor={actor} />
    </div>
  );
}