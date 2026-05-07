import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QrScanner } from "@/components/QrScanner";
import { getPosition, distanceMeters } from "@/lib/geo";
import { ScanLine, LogOut, Clock, FileText, DoorOpen, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/eletricista")({ component: EletricistaPage });

type Etapa = "PONTO" | "POS_DDS" | "SAIDA_BASE";

function EletricistaPage() {
  const { user, profile, role, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [etapa, setEtapa] = useState<Etapa | null>(null);
  const [scanning, setScanning] = useState(false);
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/login" });
    else if (role !== "ELETRICISTA") navigate({ to: "/admin" });
  }, [user, role, loading, navigate]);

  const start = (e: Etapa) => { setEtapa(e); setScanning(true); setResult(null); };

  const onScan = async (qr: string) => {
    if (!etapa || !user || working) return;
    setWorking(true);
    try {
      const { data: base, error: bErr } = await supabase
        .from("bases").select("*").eq("codigo_qr", qr).eq("ativo", true).maybeSingle();
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

      const { error: iErr } = await supabase.from("registros").insert({
        usuario_id: user.id, base_id: base.id, etapa, latitude: lat, longitude: lng,
      });
      if (iErr) throw iErr;

      setResult({ ok: true, msg: `${etapa} registrado em ${base.nome}` });
    } catch (e: any) {
      setResult({ ok: false, msg: e.message ?? "Erro ao registrar" });
    } finally {
      setWorking(false);
      setScanning(false);
    }
  };

  if (loading || !profile) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary">
      <header className="flex items-center justify-between border-b bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <ScanLine className="h-6 w-6 text-primary" />
          <div>
            <p className="text-sm font-bold">{profile.nome}</p>
            <p className="text-xs text-muted-foreground">{profile.prefixo} · {profile.polo}</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => signOut().then(() => navigate({ to: "/login" }))}>
          <LogOut className="h-5 w-5" />
        </Button>
      </header>

      <main className="mx-auto max-w-md p-4">
        <h2 className="mb-4 text-lg font-semibold text-muted-foreground">Selecione a etapa</h2>
        <div className="space-y-3">
          <BigButton icon={Clock} label="Ponto" onClick={() => start("PONTO")} />
          <BigButton icon={FileText} label="Pós DDS" onClick={() => start("POS_DDS")} />
          <BigButton icon={DoorOpen} label="Sair da Base" onClick={() => start("SAIDA_BASE")} />
        </div>
      </main>

      <Dialog open={scanning} onOpenChange={(o) => !o && setScanning(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Escanear QR — {etapa?.replace("_", " ")}</DialogTitle>
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
    </div>
  );
}

function BigButton({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) {
  return (
    <Card asChild className="cursor-pointer transition-transform active:scale-95">
      <button onClick={onClick} className="flex w-full items-center gap-4 p-6 text-left hover:bg-accent/5">
        <div className="rounded-2xl bg-primary p-4 text-primary-foreground">
          <Icon className="h-8 w-8" />
        </div>
        <span className="text-2xl font-bold">{label}</span>
      </button>
    </Card>
  );
}