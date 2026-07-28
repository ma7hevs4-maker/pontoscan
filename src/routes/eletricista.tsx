import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QrScanner } from "@/components/QrScanner";
import { IncidenteDialog } from "@/components/IncidenteDialog";
import { getPosition, distanceMeters } from "@/lib/geo";
import { ScanLine, LogOut, Loader2, CheckCircle2, XCircle, QrCode, History, UserCog, X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/eletricista")({ component: EletricistaPage });

type Etapa = "PONTO" | "POS_DDS" | "SAIDA_BASE";
const ETAPA_LABEL: Record<Etapa, string> = { PONTO: "Ponto", POS_DDS: "Pré DDS", SAIDA_BASE: "Sair da Base" };

const PROV_KEY = "pontoscan.prefixo_provisorio";

function getProvisorio(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PROV_KEY);
    if (!raw) return null;
    const { prefixo, date } = JSON.parse(raw) as { prefixo: string; date: string };
    const today = new Date().toISOString().slice(0, 10);
    if (date !== today) { localStorage.removeItem(PROV_KEY); return null; }
    return prefixo;
  } catch { return null; }
}

function EletricistaPage() {
  const { user, profile, role, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [provOpen, setProvOpen] = useState(false);
  const [provPrefixo, setProvPrefixo] = useState("");
  const [provAtivo, setProvAtivo] = useState<string | null>(null);
  const [incidenteOpen, setIncidenteOpen] = useState(false);

  useEffect(() => { setProvAtivo(getProvisorio()); }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/login" });
    else if (role !== "ELETRICISTA") navigate({ to: "/admin" });
  }, [user, role, loading, navigate]);

  const start = () => { setScanning(true); setResult(null); };

  const onScan = async (qr: string) => {
    if (!user || working) return;
    setWorking(true);
    try {
      const [codigoBase, etapaRaw] = qr.split("|");
      if (!codigoBase || !etapaRaw) throw new Error("QR Code inválido");
      const etapa = etapaRaw as Etapa;
      if (!["PONTO", "POS_DDS", "SAIDA_BASE"].includes(etapa)) throw new Error("Etapa do QR inválida");

      const { data: base, error: bErr } = await supabase
        .from("bases").select("*").eq("codigo_qr", codigoBase).eq("ativo", true).maybeSingle();
      if (bErr) throw bErr;
      if (!base) throw new Error("QR Code não reconhecido");

      let lat: number | null = null, lng: number | null = null;
      try {
        const pos = await getPosition();
        lat = pos.coords.latitude; lng = pos.coords.longitude;
      } catch {
        throw new Error("GPS necessário. Habilite a localização.");
      }

      if (base.latitude != null && base.longitude != null) {
        const d = distanceMeters(lat, lng, base.latitude, base.longitude);
        if (d > (base.raio_metros ?? 200)) {
          throw new Error(`Fora do raio permitido (${Math.round(d)}m de ${base.nome})`);
        }
      }

      const overridePref = getProvisorio();
      const { error: iErr } = await supabase.from("registros").insert({
        usuario_id: user.id, base_id: base.id, etapa, latitude: lat, longitude: lng,
        prefixo_override: overridePref,
      });
      if (iErr) throw iErr;

      setResult({ ok: true, msg: `${ETAPA_LABEL[etapa]} registrado em ${base.nome}${overridePref ? ` (prefixo prov.: ${overridePref})` : ""}` });
    } catch (e: any) {
      setResult({ ok: false, msg: e.message ?? "Erro ao registrar" });
    } finally {
      setWorking(false);
      setScanning(false);
    }
  };

  const ativarProvisorio = () => {
    const p = provPrefixo.trim().toUpperCase();
    if (!p) { toast.error("Informe um prefixo"); return; }
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(PROV_KEY, JSON.stringify({ prefixo: p, date: today }));
    setProvAtivo(p);
    setProvOpen(false);
    setProvPrefixo("");
    toast.success(`Prefixo provisório ${p} ativo até o fim do dia`);
  };

  const limparProvisorio = () => {
    localStorage.removeItem(PROV_KEY);
    setProvAtivo(null);
    toast.success("Prefixo provisório removido");
  };

  if (loading || !profile) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary">
      <header className="flex items-center justify-between border-b bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" title="Histórico" onClick={() => setHistoryOpen(true)}>
            <History className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" title="Prefixo provisório" onClick={() => setProvOpen(true)}>
            <UserCog className={`h-5 w-5 ${provAtivo ? "text-amber-600" : ""}`} />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <p className="text-sm font-bold">{profile.nome}</p>
            <p className="text-xs text-muted-foreground">
              {provAtivo ? (
                <><span className="font-semibold text-amber-600">{provAtivo} (prov.)</span> · {profile.polo}</>
              ) : (
                <>{profile.prefixo} · {profile.polo}</>
              )}
            </p>
          </div>
          <ScanLine className="h-6 w-6 text-primary" />
          <Button variant="ghost" size="icon" title="Sair" onClick={() => signOut().then(() => navigate({ to: "/login" }))}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {provAtivo && (
        <div className="flex items-center justify-between gap-2 border-b bg-amber-50 px-4 py-2 text-xs text-amber-900">
          <span>Usando prefixo provisório <b>{provAtivo}</b> apenas para hoje.</span>
          <Button variant="ghost" size="sm" className="h-6 text-amber-900" onClick={limparProvisorio}>
            <X className="mr-1 h-3 w-3" />Remover
          </Button>
        </div>
      )}

      <main className="mx-auto max-w-md p-4">
        <Card className="p-6 text-center">
          <h2 className="mb-2 text-lg font-semibold">Registrar marcação</h2>
          <p className="mb-6 text-sm text-muted-foreground">
            Escaneie o QR Code da etapa correspondente: <b>Ponto</b>, <b>Pré DDS</b> ou <b>Sair da Base</b>.
          </p>
          <button
            onClick={start}
            className="flex w-full items-center justify-center gap-3 rounded-2xl bg-primary p-8 text-primary-foreground shadow-md transition-transform active:scale-95"
          >
            <QrCode className="h-10 w-10" />
            <span className="text-2xl font-bold">Escanear QR</span>
          </button>
          <button
            onClick={() => setIncidenteOpen(true)}
            className="mt-3 flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-amber-500 bg-amber-50 p-6 text-amber-900 shadow-sm transition-transform active:scale-95 hover:bg-amber-100"
          >
            <AlertTriangle className="h-8 w-8" />
            <span className="text-xl font-bold">Incidente</span>
          </button>
        </Card>
      </main>

      <IncidenteDialog open={incidenteOpen} onOpenChange={setIncidenteOpen} />

      <Dialog open={scanning} onOpenChange={(o) => !o && setScanning(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Escanear QR Code</DialogTitle>
          </DialogHeader>
          {scanning && <QrScanner onScan={onScan} />}
          {working && <div className="flex items-center justify-center gap-2 py-2"><Loader2 className="h-4 w-4 animate-spin" /> Registrando…</div>}
        </DialogContent>
      </Dialog>

      <Dialog open={!!result} onOpenChange={(o) => !o && setResult(null)}>
        <DialogContent className="max-w-sm text-center">
          {result?.ok ? (
            <>
              <CheckCircle2 className="mx-auto h-16 w-16 text-green-600" />
              <DialogTitle className="mt-2">Sucesso</DialogTitle>
              <p className="text-sm text-muted-foreground">{result.msg}</p>
            </>
          ) : (
            <>
              <XCircle className="mx-auto h-16 w-16 text-destructive" />
              <DialogTitle className="mt-2">Erro</DialogTitle>
              <p className="text-sm text-muted-foreground">{result?.msg}</p>
            </>
          )}
          <Button onClick={() => setResult(null)}>OK</Button>
        </DialogContent>
      </Dialog>

      <HistoryDialog open={historyOpen} onClose={() => setHistoryOpen(false)} userId={user?.id ?? ""} />

      <Dialog open={provOpen} onOpenChange={(o) => !o && setProvOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Prefixo provisório</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Use outro prefixo para bater pontos somente <b>hoje</b>. Será removido automaticamente amanhã.
          </p>
          <div className="space-y-2">
            <Label htmlFor="prov">Prefixo</Label>
            <Input id="prov" value={provPrefixo} onChange={(e) => setProvPrefixo(e.target.value)} placeholder="Ex.: NI200TST-A" autoCapitalize="characters" />
          </div>
          <div className="flex justify-end gap-2">
            {provAtivo && <Button variant="outline" onClick={limparProvisorio}>Remover atual</Button>}
            <Button onClick={ativarProvisorio}>Ativar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type HistRow = {
  id: string; etapa: Etapa; timestamp: string;
  prefixo_override: string | null;
  bases: { nome: string } | null;
};

function HistoryDialog({ open, onClose, userId }: { open: boolean; onClose: () => void; userId: string }) {
  const [periodo, setPeriodo] = useState<"dia" | "semana" | "mes">("dia");
  const [rows, setRows] = useState<HistRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !userId) return;
    const now = new Date();
    const start = new Date(now);
    if (periodo === "dia") start.setHours(0, 0, 0, 0);
    else if (periodo === "semana") { start.setDate(now.getDate() - 7); start.setHours(0,0,0,0); }
    else { start.setMonth(now.getMonth() - 1); start.setHours(0,0,0,0); }
    setLoading(true);
    supabase.from("registros")
      .select("id, etapa, timestamp, prefixo_override, bases(nome)")
      .eq("usuario_id", userId)
      .gte("timestamp", start.toISOString())
      .order("timestamp", { ascending: false })
      .then(({ data }) => { setRows((data as any) ?? []); setLoading(false); });
  }, [open, periodo, userId]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Meu histórico</DialogTitle></DialogHeader>
        <div className="flex gap-1 rounded-md border p-1">
          {(["dia","semana","mes"] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className={`flex-1 rounded px-2 py-1 text-xs font-medium ${periodo === p ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
            >
              {p === "dia" ? "Hoje" : p === "semana" ? "7 dias" : "30 dias"}
            </button>
          ))}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center p-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Sem registros no período.</p>
          ) : (
            <ul className="divide-y">
              {rows.map(r => {
                const d = new Date(r.timestamp);
                return (
                  <li key={r.id} className="flex items-start justify-between gap-2 py-2 text-sm">
                    <div>
                      <p className="font-medium">{ETAPA_LABEL[r.etapa]}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.bases?.nome ?? "—"}
                        {r.prefixo_override && <span className="ml-1 text-amber-600">· {r.prefixo_override} (prov.)</span>}
                      </p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <p>{d.toLocaleDateString("pt-BR")}</p>
                      <p className="font-mono">{d.toLocaleTimeString("pt-BR")}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}