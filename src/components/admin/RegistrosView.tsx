import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { POLOS, useAuth } from "@/lib/auth-context";
import { Download, Loader2, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

const ETAPA_LABEL: Record<string, string> = { PONTO: "PONTO", POS_DDS: "PRE_DDS", SAIDA_BASE: "SAIDA_BASE" };

interface Row {
  id: string; etapa: string; timestamp: string; usuario_id: string;
  latitude: number | null; longitude: number | null;
  prefixo_override: string | null;
  nome: string | null;
  prefixo: string | null;
  user_polo: string | null;
  base_nome: string | null;
  base_polo: string | null;
}

export function RegistrosView() {
  const { role, adminPolo } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [polo, setPolo] = useState<string>(role === "ADMIN_POLO" ? (adminPolo ?? "") : "all");
  const [usuario, setUsuario] = useState("");
  const [turno, setTurno] = useState<string>("all");
  const [etapa, setEtapa] = useState<string>("all");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortKey, setSortKey] = useState<string>("timestamp");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const toggleSort = (k: string) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  };

  const load = async () => {
    setLoading(true);
    const start = new Date(from + "T00:00:00").toISOString();
    const end = new Date(to + "T23:59:59").toISOString();
    const pageSize = 1000;
    let all: any[] = [];
    let offset = 0;
    while (true) {
      let q = supabase.from("vw_registros_admin")
        .select("id, etapa, timestamp, usuario_id, latitude, longitude, prefixo_override, nome, prefixo, user_polo, base_nome, base_polo")
        .gte("timestamp", start).lte("timestamp", end)
        .order("timestamp", { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (polo && polo !== "all") q = q.or(`user_polo.eq.${polo},base_polo.eq.${polo}`);
      const { data, error } = await q;
      if (error) break;
      const batch = (data as any[]) ?? [];
      all = all.concat(batch);
      if (batch.length < pageSize) break;
      offset += pageSize;
    }
    setRows(all as any);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [from, to, polo]);

  const filteredBase = rows.filter(r => {
    const prefEfetivo = r.prefixo_override ?? r.prefixo ?? "";
    if (turno !== "all") {
      const letra = prefEfetivo.split("-")[1]?.[0]?.toUpperCase();
      if (letra !== turno) return false;
    }
    if (etapa !== "all" && r.etapa !== etapa) return false;
    if (usuario.trim()) {
      const s = usuario.trim().toLowerCase();
      const n = (r.nome ?? "").toLowerCase();
      const p = prefEfetivo.toLowerCase();
      if (!n.includes(s) && !p.includes(s)) return false;
    }
    return true;
  });

  const getVal = (r: Row, k: string): string | number => {
    const pref = r.prefixo_override ?? r.prefixo ?? "";
    switch (k) {
      case "timestamp": return new Date(r.timestamp).getTime();
      case "nome": return (r.nome ?? "").toLowerCase();
      case "prefixo": return pref.toLowerCase();
      case "polo": return (r.user_polo ?? "").toLowerCase();
      case "etapa": return (ETAPA_LABEL[r.etapa] ?? r.etapa).toLowerCase();
      case "base": return (r.base_nome ?? "").toLowerCase();
      default: return 0;
    }
  };
  const filtered = [...filteredBase].sort((a, b) => {
    const va = getVal(a, sortKey); const vb = getVal(b, sortKey);
    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const SortBtn = ({ k, children }: { k: string; children: React.ReactNode }) => (
    <button onClick={() => toggleSort(k)} className="flex items-center gap-1 hover:text-foreground">
      {children}
      {sortKey === k ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
    </button>
  );

  const exportCsv = () => {
    const header = ["Data","Hora","Nome","Prefixo","Polo","Etapa","Base","Polo da base","Lat","Lng"];
    const lines = filtered.map(r => {
      const d = new Date(r.timestamp);
      const pref = r.prefixo_override ? `${r.prefixo_override} (prov.)` : r.prefixo;
      return [d.toLocaleDateString("pt-BR"), d.toLocaleTimeString("pt-BR"), r.nome, pref, r.user_polo, ETAPA_LABEL[r.etapa] ?? r.etapa, r.base_nome ?? "", r.base_polo ?? "", r.latitude ?? "", r.longitude ?? ""].join(";");
    });
    const blob = new Blob([[header.join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `registros_${from}_${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-7">
          <div><Label>De</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label>Até</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
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
          <div>
            <Label>Etapa</Label>
            <Select value={etapa} onValueChange={setEtapa}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="PONTO">PONTO</SelectItem>
                <SelectItem value="POS_DDS">PRE_DDS</SelectItem>
                <SelectItem value="SAIDA_BASE">SAIDA_BASE</SelectItem>
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
                <TableHead><SortBtn k="timestamp">Data</SortBtn></TableHead>
                <TableHead><SortBtn k="timestamp">Hora</SortBtn></TableHead>
                <TableHead><SortBtn k="nome">Nome</SortBtn></TableHead>
                <TableHead><SortBtn k="prefixo">Prefixo</SortBtn></TableHead>
                <TableHead><SortBtn k="polo">Polo</SortBtn></TableHead>
                <TableHead><SortBtn k="etapa">Etapa</SortBtn></TableHead>
                <TableHead><SortBtn k="base">Base</SortBtn></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Sem registros</TableCell></TableRow>}
              {filtered.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{new Date(r.timestamp).toLocaleDateString("pt-BR")}</TableCell>
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