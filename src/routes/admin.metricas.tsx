import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, POLOS } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, Users, Timer, Activity, ArrowUp, ArrowDown, ArrowUpDown, Download } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { nomeProcesso, PROCESSOS_UNICOS } from "@/lib/processos";

export const Route = createFileRoute("/admin/metricas")({ head: () => ({ meta: [{ title: "Métricas · PontoScan" }, { name: "description", content: "Indicadores de presença e tempos das equipes de campo no PontoScan." }, { property: "og:title", content: "Métricas · PontoScan" }, { property: "og:description", content: "Indicadores de presença e tempos das equipes de campo no PontoScan." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }), component: MetricasPage });

interface VRow {
  usuario_id: string; nome: string; prefixo: string; polo: string;
  base_polo: string | null;
  dia: string; ponto: string | null; pos_dds: string | null; saida_base: string | null;
  tempo_ponto_pos_dds: number | null; tempo_pos_dds_saida: number | null;
}

function fmtMin(m: number | null) {
  if (m == null) return "—";
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const r = Math.round(m % 60);
    return `${h}h${String(r).padStart(2, "0")}`;
  }
  const min = Math.floor(m);
  const sec = Math.round((m - min) * 60);
  if (sec === 60) return `${min + 1}min`;
  return sec === 0 ? `${min}min` : `${min}min${String(sec).padStart(2, "0")}`;
}

function abreviarNome(nome: string, maxChars = 22) {
  const parts = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return nome;
  const [first, ...rest] = parts;
  // Mantém o primeiro nome e o primeiro sobrenome; abrevia os demais.
  const apelidos = ["de", "da", "do", "das", "dos", "e"];
  const formatted = rest.map((p, idx) => {
    const lower = p.toLowerCase();
    if (apelidos.includes(lower)) return lower;
    // Primeiro sobrenome fica completo; os seguintes viram iniciais.
    if (idx === 0) return p;
    return p[0].toUpperCase() + ".";
  });
  let label = `${first} ${formatted.join(" ")}`;
  // Se ainda estourar, abrevia a partir do segundo sobrenome.
  if (label.length > maxChars) {
    const compact = rest.map((p, idx) => {
      if (idx === 0) return p;
      const lower = p.toLowerCase();
      if (apelidos.includes(lower)) return lower;
      return p[0].toUpperCase() + ".";
    });
    label = `${first} ${compact.join(" ")}`;
  }
  return label;
}

function MetricasPage() {
  const { role, adminPolo } = useAuth();
  const today = new Date().toISOString().slice(0,10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [polo, setPolo] = useState<string>(role === "ADMIN_POLO" ? (adminPolo ?? "") : "all");
  const [search, setSearch] = useState("");
  const [turno, setTurno] = useState<string>("all");
  const [processo, setProcesso] = useState<string>("all");
  const [rows, setRows] = useState<VRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [agrupamento, setAgrupamento] = useState<"equipe" | "pessoa">("equipe");
  const [sortKey, setSortKey] = useState<string>("dia");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const toggleSort = (k: string) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  };

  const load = async () => {
    setLoading(true);
    const pageSize = 1000;
    let offset = 0;
    let all: VRow[] = [];

    while (true) {
      let q = supabase
        .from("vw_tempos")
        .select("*")
        .gte("dia", from)
        .lte("dia", to)
        .range(offset, offset + pageSize - 1);

      if (polo && polo !== "all") q = q.or(`polo.eq.${polo},base_polo.eq.${polo}`);

      const { data, error } = await q;
      if (error) break;

      const batch = ((data as VRow[] | null) ?? []);
      all = all.concat(batch);

      if (batch.length < pageSize) break;
      offset += pageSize;
    }

    setRows(all);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [from, to, polo]);

  const filtered = rows.filter(r => {
    if (turno !== "all") {
      const letra = (r.prefixo ?? "").split("-")[1]?.[0]?.toUpperCase();
      if (letra !== turno) return false;
    }
    if (processo !== "all" && nomeProcesso(r.prefixo ?? "") !== processo) return false;
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      if (!(r.nome ?? "").toLowerCase().includes(s) && !(r.prefixo ?? "").toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const totalEletricistas = new Set(filtered.map(r => r.usuario_id)).size;
  const completos = filtered.filter(r => r.saida_base).length;
  const tempos = filtered.map(r => (r.tempo_ponto_pos_dds ?? 0) + (r.tempo_pos_dds_saida ?? 0)).filter(v => v > 0);
  const mediaTempo = tempos.length ? tempos.reduce((a,b)=>a+b,0)/tempos.length : 0;

  let ranking: { nome: string; fullName: string; tempoPonto: number; tempoSaida: number; tempo: number }[] = [];
  if (agrupamento === "pessoa") {
    const grupos = new Map<string, { label: string; full: string; tempos: number[]; saidas: number[] }>();
    for (const r of filtered) {
      if (r.tempo_ponto_pos_dds == null) continue;
      const key = r.usuario_id ?? r.nome;
      if (!grupos.has(key)) grupos.set(key, { label: r.nome, full: `${r.nome} (${r.prefixo ?? "—"})`, tempos: [], saidas: [] });
      grupos.get(key)!.tempos.push(r.tempo_ponto_pos_dds);
      if (r.tempo_pos_dds_saida != null) grupos.get(key)!.saidas.push(r.tempo_pos_dds_saida);
    }
    ranking = Array.from(grupos.values())
      .map(g => {
        const tp = g.tempos.reduce((a,b)=>a+b,0) / g.tempos.length;
        const ts = g.saidas.length ? g.saidas.reduce((a,b)=>a+b,0) / g.saidas.length : 0;
        return {
          nome: abreviarNome(g.label),
          fullName: `${g.full} — média de ${g.tempos.length} jornada${g.tempos.length > 1 ? "s" : ""}`,
          tempoPonto: tp,
          tempoSaida: ts,
          tempo: tp,
        };
      });
  } else {
    // Por equipe: PONTO→DDS = maior entre integrantes (último a bater o pré DDS).
    // DDS→SAÍDA = maior entre integrantes (último a sair da base).
    const dias = new Map<string, { prefixo: string; tempos: number[]; saidas: number[] }>();
    for (const r of filtered) {
      if (r.tempo_ponto_pos_dds == null) continue;
      const k = `${r.prefixo}|${r.dia}`;
      if (!dias.has(k)) dias.set(k, { prefixo: r.prefixo ?? "—", tempos: [], saidas: [] });
      dias.get(k)!.tempos.push(r.tempo_ponto_pos_dds);
      if (r.tempo_pos_dds_saida != null) dias.get(k)!.saidas.push(r.tempo_pos_dds_saida);
    }
    const sizes = new Map<string, Set<string>>();
    for (const r of filtered) {
      if (!sizes.has(r.prefixo ?? "—")) sizes.set(r.prefixo ?? "—", new Set());
      sizes.get(r.prefixo ?? "—")!.add(r.usuario_id);
    }
    const porEquipe = new Map<string, { tempos: number[]; saidas: number[]; integrantes: number }>();
    for (const g of dias.values()) {
      if (!g.tempos.length) continue;
      const tempoDia = Math.max(...g.tempos);
      if (!porEquipe.has(g.prefixo)) porEquipe.set(g.prefixo, { tempos: [], saidas: [], integrantes: sizes.get(g.prefixo)?.size ?? 0 });
      porEquipe.get(g.prefixo)!.tempos.push(tempoDia);
      if (g.saidas.length) porEquipe.get(g.prefixo)!.saidas.push(Math.max(...g.saidas));
    }
    ranking = Array.from(porEquipe.entries()).map(([prefixo, v]) => {
      const tp = v.tempos.reduce((a,b)=>a+b,0) / v.tempos.length;
      const ts = v.saidas.length ? v.saidas.reduce((a,b)=>a+b,0) / v.saidas.length : 0;
      return {
        nome: prefixo,
        fullName: `Equipe ${prefixo} — ${v.integrantes} integrante${v.integrantes > 1 ? "s" : ""}, ${v.tempos.length} dia${v.tempos.length > 1 ? "s" : ""}`,
        tempoPonto: tp,
        tempoSaida: ts,
        tempo: tp,
      };
    });
  }
  ranking = ranking.sort((a,b) => a.tempo - b.tempo);

  const getVal = (r: VRow, k: string): string | number => {
    switch (k) {
      case "dia": return r.dia ?? "";
      case "nome": return (r.nome ?? "").toLowerCase();
      case "prefixo": return (r.prefixo ?? "").toLowerCase();
      case "polo": return (r.polo ?? "").toLowerCase();
      case "tempo_ponto_pos_dds": return r.tempo_ponto_pos_dds ?? -1;
      case "tempo_pos_dds_saida": return r.tempo_pos_dds_saida ?? -1;
      default: return 0;
    }
  };
  const sortedFiltered = [...filtered].sort((a, b) => {
    const va = getVal(a, sortKey); const vb = getVal(b, sortKey);
    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ? 1 : -1;
    return 0;
  });
  const SortTh = ({ k, children }: { k: string; children: React.ReactNode }) => (
    <th className="p-2 text-left">
      <button onClick={() => toggleSort(k)} className="flex items-center gap-1 hover:text-foreground">
        {children}
        {sortKey === k ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </th>
  );

  const exportRankingCsv = () => {
    const isPessoa = agrupamento === "pessoa";
    const header = isPessoa
      ? ["Nome", "Prefixo", "Jornadas", "Ponto->DDS (min)", "DDS->Saida (min)", "Total (min)"]
      : ["Prefixo", "Integrantes", "Dias", "Ponto->DDS (min)", "DDS->Saida (min)", "Total (min)"];
    const lines = ranking.map((r) => {
      const tp = (r.tempoPonto ?? 0).toFixed(2);
      const ts = (r.tempoSaida ?? 0).toFixed(2);
      const total = ((r.tempoPonto ?? 0) + (r.tempoSaida ?? 0)).toFixed(2);
      if (isPessoa) {
        const match = r.fullName.match(/^(.*?) \((.*?)\)/);
        const nome = match ? match[1] : r.nome;
        const prefixo = match ? match[2] : "";
        const jornadas = r.fullName.match(/média de (\d+)/)?.[1] ?? "";
        return [nome, prefixo, jornadas, tp, ts, total].join(";");
      }
      const integrantes = r.fullName.match(/(\d+) integrante/)?.[1] ?? "";
      const dias = r.fullName.match(/(\d+) dia/)?.[1] ?? "";
      return [r.nome, integrantes, dias, tp, ts, total].join(";");
    });
    const blob = new Blob([[header.join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ranking_${agrupamento}_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportDetalhamentoCsv = () => {
    const header = ["Dia", "Nome", "Prefixo", "Polo", "Ponto->DDS (min)", "DDS->Saida (min)"];
    const lines = sortedFiltered.map((r) => [
      r.dia,
      r.nome,
      r.prefixo ?? "",
      r.polo,
      r.tempo_ponto_pos_dds?.toFixed(2) ?? "",
      r.tempo_pos_dds_saida?.toFixed(2) ?? "",
    ].join(";"));
    const blob = new Blob([[header.join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `metricas_detalhamento_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-7">
          <div><Label>De</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div><Label>Até</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
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
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar…" />
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
            <Label>Processo</Label>
            <Select value={processo} onValueChange={setProcesso}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {PROCESSOS_UNICOS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end"><Button onClick={load} className="w-full">Atualizar</Button></div>
        </div>
      </Card>

      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Stat icon={Users} label="Eletricistas ativos" value={String(totalEletricistas)} />
            <Stat icon={Activity} label="Jornadas completas" value={`${completos}/${rows.length}`} />
            <Stat icon={Timer} label="Tempo médio (PONTO→SAÍDA)" value={fmtMin(mediaTempo)} />
          </div>

          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="font-semibold">Ranking — Tempo PONTO → PRÉ DDS (mais rápidos)</h3>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={exportRankingCsv}>
                  <Download className="mr-2 h-4 w-4" />CSV
                </Button>
                <ToggleGroup
                type="single"
                value={agrupamento}
                onValueChange={(v) => v && setAgrupamento(v as "equipe" | "pessoa")}
                size="sm"
              >
                <ToggleGroupItem value="equipe">Por equipe</ToggleGroupItem>
                <ToggleGroupItem value="pessoa">Por pessoa</ToggleGroupItem>
              </ToggleGroup>
              </div>
            </div>
            {ranking.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Sem dados no período</p>
            ) : (
              <div className="overflow-x-auto">
                <div style={{ width: Math.max(ranking.length * 90, 600), height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ranking}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="nome" interval={0} angle={-40} textAnchor="end" height={90} tick={{ fontSize: 11 }} />
                  <YAxis label={{ value: "min", angle: -90, position: "insideLeft" }} />
                  <Tooltip
                    content={({ active, payload }: any) => {
                      if (!active || !payload?.length) return null;
                      const full = payload[0]?.payload?.fullName ?? "";
                      const tp = payload.find((p: any) => p.dataKey === "tempoPonto")?.value ?? 0;
                      const ts = payload.find((p: any) => p.dataKey === "tempoSaida")?.value ?? 0;
                      return (
                        <div className="rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                          <div className="mb-1 font-medium">{full}</div>
                          <div style={{ color: "#60a5fa" }}>PONTO → PRÉ DDS : {fmtMin(tp)}</div>
                          <div style={{ color: "#1d4ed8" }} className="mt-0.5">PÓS DDS → SAÍDA : {fmtMin(ts)}</div>
                          <div className="mt-1 border-t pt-1 font-medium">Total : {fmtMin(tp + ts)}</div>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="tempoPonto" stackId="t" fill="#60a5fa" radius={[0,0,0,0]} name="PONTO → PRÉ DDS" />
                  <Bar dataKey="tempoSaida" stackId="t" fill="#1d4ed8" radius={[6,6,0,0]} name="PÓS DDS → SAÍDA" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b p-3">
              <span className="font-semibold">Detalhamento</span>
              <Button variant="outline" size="sm" onClick={exportDetalhamentoCsv}>
                <Download className="mr-2 h-4 w-4" />CSV
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <SortTh k="dia">Dia</SortTh>
                    <SortTh k="nome">Nome</SortTh>
                    <SortTh k="prefixo">Prefixo</SortTh>
                    <SortTh k="polo">Polo</SortTh>
                    <SortTh k="tempo_ponto_pos_dds">Ponto→DDS</SortTh>
                    <SortTh k="tempo_pos_dds_saida">DDS→Saída</SortTh>
                  </tr>
                </thead>
                <tbody>
                  {sortedFiltered.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Sem dados</td></tr>}
                  {sortedFiltered.map((r,i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{r.dia}</td>
                      <td className="p-2">{r.nome}</td>
                      <td className="p-2 font-mono">{r.prefixo}</td>
                      <td className="p-2">{r.polo}</td>
                      <td className="p-2">{fmtMin(r.tempo_ponto_pos_dds)}</td>
                      <td className="p-2">{fmtMin(r.tempo_pos_dds_saida)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <div className="rounded-xl bg-primary/10 p-3 text-primary"><Icon className="h-6 w-6" /></div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold">{value}</p>
      </div>
    </Card>
  );
}