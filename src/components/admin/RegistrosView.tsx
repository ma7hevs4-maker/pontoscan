import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { POLOS, useAuth } from "@/lib/auth-context";
import { Download, Loader2 } from "lucide-react";

const ETAPA_LABEL: Record<string, string> = { PONTO: "PONTO", POS_DDS: "PRE_DDS", SAIDA_BASE: "SAIDA_BASE" };

interface Row {
  id: string; etapa: string; timestamp: string; usuario_id: string;
  latitude: number | null; longitude: number | null;
  prefixo_override: string | null;
  profiles: { nome: string; prefixo: string; polo: string } | null;
  bases: { nome: string } | null;
}

export function RegistrosView() {
  const { role, adminPolo } = useAuth();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [polo, setPolo] = useState<string>(role === "ADMIN_POLO" ? (adminPolo ?? "") : "all");
  const [usuario, setUsuario] = useState("");
  const [turno, setTurno] = useState<string>("all");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const start = new Date(date + "T00:00:00").toISOString();
    const end = new Date(date + "T23:59:59").toISOString();
    let q = supabase.from("registros")
      .select("id, etapa, timestamp, usuario_id, latitude, longitude, prefixo_override, profiles!inner(nome, prefixo, polo), bases(nome)")
      .gte("timestamp", start).lte("timestamp", end)
      .order("timestamp", { ascending: false });
    if (polo && polo !== "all") q = q.eq("profiles.polo", polo as any);
    const { data, error } = await q;
    if (!error) setRows((data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [date, polo]);

  const filtered = rows.filter(r => {
    const prefEfetivo = r.prefixo_override ?? r.profiles?.prefixo ?? "";
    if (turno !== "all") {
      const letra = prefEfetivo.split("-")[1]?.[0]?.toUpperCase();
      if (letra !== turno) return false;
    }
    if (usuario.trim()) {
      const s = usuario.trim().toLowerCase();
      const n = (r.profiles?.nome ?? "").toLowerCase();
      const p = prefEfetivo.toLowerCase();
      if (!n.includes(s) && !p.includes(s)) return false;
    }
    return true;
  });

  const exportCsv = () => {
    const header = ["Data","Hora","Nome","Prefixo","Polo","Etapa","Base","Lat","Lng"];
    const lines = filtered.map(r => {
      const d = new Date(r.timestamp);
      const pref = r.prefixo_override ? `${r.prefixo_override} (prov.)` : r.profiles?.prefixo;
      return [d.toLocaleDateString("pt-BR"), d.toLocaleTimeString("pt-BR"), r.profiles?.nome, pref, r.profiles?.polo, ETAPA_LABEL[r.etapa] ?? r.etapa, r.bases?.nome ?? "", r.latitude ?? "", r.longitude ?? ""].join(";");
    });
    const blob = new Blob([[header.join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `registros_${date}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-5">
          <div><Label>Data</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div>
            <Label>Polo</Label>
            <Select value={polo} onValueChange={setPolo} disabled={role === "ADMIN_POLO"}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {POLOS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Nome ou prefixo</Label>
            <Input value={usuario} onChange={(e) => setUsuario(e.target.value)} placeholder="Buscar…" />
          </div>
          <div>
            <Label>Turno</Label>
            <Select value={turno} onValueChange={setTurno}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="A">Turno A</SelectItem>
                <SelectItem value="B">Turno B</SelectItem>
                <SelectItem value="C">Turno C</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={load} className="flex-1">Filtrar</Button>
            <Button variant="outline" onClick={exportCsv}><Download className="mr-2 h-4 w-4" />CSV</Button>
          </div>
        </div>
      </Card>

      <Card>
        {loading ? (
          <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hora</TableHead><TableHead>Nome</TableHead><TableHead>Prefixo</TableHead>
                <TableHead>Polo</TableHead><TableHead>Etapa</TableHead><TableHead>Base</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Sem registros</TableCell></TableRow>}
              {filtered.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{new Date(r.timestamp).toLocaleTimeString("pt-BR")}</TableCell>
                  <TableCell>{r.profiles?.nome}</TableCell>
                  <TableCell className="font-mono">
                    {r.prefixo_override ? (
                      <span title={`Original: ${r.profiles?.prefixo}`}>
                        {r.prefixo_override}
                        <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800">prov.</span>
                      </span>
                    ) : r.profiles?.prefixo}
                  </TableCell>
                  <TableCell>{r.profiles?.polo}</TableCell>
                  <TableCell><span className="rounded-full bg-secondary px-2 py-1 text-xs font-semibold">{ETAPA_LABEL[r.etapa] ?? r.etapa}</span></TableCell>
                  <TableCell>{r.bases?.nome ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}