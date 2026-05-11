import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, POLOS, type Polo } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { QRCodeCanvas } from "qrcode.react";
import { Loader2, MapPin, Plus, QrCode, Printer, Power, Crosshair, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/bases")({ component: BasesPage });

interface Base {
  id: string; nome: string; polo: Polo; codigo_qr: string;
  latitude: number | null; longitude: number | null;
  raio_metros: number; ativo: boolean;
}

function BasesPage() {
  const { role, adminPolo } = useAuth();
  const [bases, setBases] = useState<Base[]>([]);
  const [loading, setLoading] = useState(true);
  const [openForm, setOpenForm] = useState(false);
  const [qrBase, setQrBase] = useState<Base | null>(null);
  const [delBase, setDelBase] = useState<Base | null>(null);

  const load = async () => {
    setLoading(true);
    let q = supabase.from("bases").select("*").order("polo").order("nome");
    if (role === "ADMIN_POLO" && adminPolo) q = q.eq("polo", adminPolo);
    const { data } = await q;
    setBases((data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [adminPolo, role]);

  const toggleAtivo = async (b: Base) => {
    const { error } = await supabase.from("bases").update({ ativo: !b.ativo }).eq("id", b.id);
    if (error) toast.error(error.message); else { toast.success(b.ativo ? "Base desativada" : "Base ativada"); load(); }
  };

  const confirmDelete = async () => {
    if (!delBase) return;
    const { count } = await supabase
      .from("registros")
      .select("id", { count: "exact", head: true })
      .eq("base_id", delBase.id);
    if ((count ?? 0) > 0) {
      toast.error(`Base tem ${count} registros vinculados. Desative ao invés de excluir.`);
      setDelBase(null);
      return;
    }
    const { error } = await supabase.from("bases").delete().eq("id", delBase.id);
    if (error) toast.error(error.message);
    else { toast.success("Base excluída"); load(); }
    setDelBase(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Bases & QR Codes</h2>
          <p className="text-sm text-muted-foreground">Cada base é um ambiente independente com seu próprio QR Code.</p>
        </div>
        <Button onClick={() => setOpenForm(true)}><Plus className="mr-2 h-4 w-4" />Nova base</Button>
      </div>

      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : bases.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <MapPin className="mx-auto mb-2 h-8 w-8" />
          Nenhuma base cadastrada. Crie a primeira para gerar o QR Code.
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {bases.map(b => (
            <Card key={b.id} className={`p-4 ${!b.ativo ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold">{b.nome}</p>
                  <p className="text-xs text-muted-foreground">{b.polo} · raio {b.raio_metros}m</p>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">{b.codigo_qr}</p>
                  {b.latitude != null && (
                    <p className="mt-1 text-[11px] text-muted-foreground">GPS: {b.latitude.toFixed(5)}, {b.longitude!.toFixed(5)}</p>
                  )}
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${b.ativo ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                  {b.ativo ? "Ativa" : "Inativa"}
                </span>
              </div>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => setQrBase(b)}>
                  <QrCode className="mr-1 h-4 w-4" />QR
                </Button>
                <Button size="sm" variant="ghost" onClick={() => toggleAtivo(b)}>
                  <Power className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDelBase(b)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <BaseFormDialog open={openForm} onClose={() => setOpenForm(false)} onSaved={load} />
      <QrDialog base={qrBase} onClose={() => setQrBase(null)} />

      <AlertDialog open={!!delBase} onOpenChange={(o) => !o && setDelBase(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir base "{delBase?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              O QR Code atual deixará de funcionar. Se a base já tiver registros, prefira desativá-la para preservar o histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BaseFormDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { role, adminPolo } = useAuth();
  const [nome, setNome] = useState("");
  const [polo, setPolo] = useState<string>(adminPolo ?? "");
  const [lat, setLat] = useState<string>("");
  const [lng, setLng] = useState<string>("");
  const [raio, setRaio] = useState<string>("200");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setNome(""); setLat(""); setLng(""); setRaio("200"); setPolo(adminPolo ?? ""); } }, [open, adminPolo]);

  const captureGps = () => {
    if (!navigator.geolocation) return toast.error("GPS não disponível");
    navigator.geolocation.getCurrentPosition(
      p => { setLat(String(p.coords.latitude)); setLng(String(p.coords.longitude)); toast.success("GPS capturado"); },
      e => toast.error(e.message),
      { enableHighAccuracy: true }
    );
  };

  const save = async () => {
    if (!nome || !polo) return toast.error("Preencha nome e polo");
    if (!lat || !lng) return toast.error("Capture o GPS da base (obrigatório para validar raio)");
    setSaving(true);
    const codigo = `BASE-${polo.toUpperCase().replace(/\s/g,"")}-${Date.now().toString(36).toUpperCase()}`;
    const { error } = await supabase.from("bases").insert({
      nome, polo: polo as any, codigo_qr: codigo,
      latitude: Number(lat), longitude: Number(lng), raio_metros: Number(raio) || 200,
    });
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success("Base criada"); onSaved(); onClose(); }
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova base</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nome</Label><Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Base Magé Centro" /></div>
          <div>
            <Label>Polo</Label>
            <Select value={polo} onValueChange={setPolo} disabled={role === "ADMIN_POLO"}>
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                {POLOS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Latitude</Label><Input value={lat} onChange={e => setLat(e.target.value)} placeholder="-22.65" /></div>
            <div><Label>Longitude</Label><Input value={lng} onChange={e => setLng(e.target.value)} placeholder="-43.04" /></div>
          </div>
          <Button variant="outline" type="button" onClick={captureGps} className="w-full">
            <Crosshair className="mr-2 h-4 w-4" />Capturar GPS atual
          </Button>
          <div><Label>Raio permitido (metros)</Label><Input type="number" value={raio} onChange={e => setRaio(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QrDialog({ base, onClose }: { base: Base | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const print = () => {
    if (!base || !ref.current) return;
    const w = window.open("", "_blank", "width=600,height=700");
    if (!w) return;
    w.document.write(`<html><head><title>QR ${base.nome}</title>
      <style>body{font-family:sans-serif;text-align:center;padding:40px}
      h1{margin:0 0 4px}h2{margin:0 0 24px;color:#666;font-weight:400}
      .code{font-family:monospace;color:#666;margin-top:16px;font-size:12px}</style>
      </head><body>
      <h1>${base.nome}</h1>
      <h2>Polo ${base.polo} · PontoScan</h2>
      ${ref.current.innerHTML}
      <div class="code">${base.codigo_qr}</div>
      </body></html>`);
    w.document.close();
    setTimeout(() => { w.print(); w.close(); }, 300);
  };

  return (
    <Dialog open={!!base} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-sm text-center">
        <DialogHeader><DialogTitle>{base?.nome}</DialogTitle></DialogHeader>
        {base && (
          <div ref={ref} className="flex justify-center p-4">
            <QRCodeCanvas value={base.codigo_qr} size={240} includeMargin />
          </div>
        )}
        <p className="font-mono text-xs text-muted-foreground">{base?.codigo_qr}</p>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
          <Button onClick={print}><Printer className="mr-2 h-4 w-4" />Imprimir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}