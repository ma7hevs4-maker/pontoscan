import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, POLOS } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, Users, Timer, Activity } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export const Route = createFileRoute("/admin/metricas")({ component: MetricasPage });

interface VRow {
  usuario_id: string; nome: string; prefixo: string; polo: string;
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

function MetricasPage() {
  const { role, adminPolo } = useAuth();
  const today = new Date().toISOString().slice(0,10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [polo, setPolo] = useState<string>(role === "ADMIN_POLO" ? (adminPolo ?? "") : "all");
  const [search, setSearch] = useState("");
  const [turno, setTurno] = useState<string>("all");
  const [rows, setRows] = useState<VRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [agrupamento, setAgrupamento] = useState<"equipe" | "pessoa">("equipe");

  const load = async () => {
    setLoading(true);
    let q = supabase.from("vw_tempos").select("*").gte("dia", from).lte("dia", to);
    if (polo && polo !== "all") q = q.eq("polo", polo as any);
    const { data } = await q;
    setRows((data as any) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [from, to, polo]);

  const filtered = rows.filter(r => {
    if (turno !== "all") {
      const letra = (r.prefixo ?? "").split("-")[1]?.[0]?.toUpperCase();
      if (letra !== turno) return false;
    }
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
          nome: g.label,
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
  ranking = ranking.sort((a,b) => a.tempo - b.tempo).slice(0, 10);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-6">
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
              <h3 className="font-semibold">Top 10 — Tempo PONTO → PRÉ DDS (mais rápidos)</h3>
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
            {ranking.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Sem dados no período</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={ranking}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="nome" />
                  <YAxis label={{ value: "min", angle: -90, position: "insideLeft" }} />
                  <Tooltip
                    formatter={(v: number, name) => [fmtMin(v), name === "tempoPonto" ? "PONTO → PRÉ DDS" : "PRÉ DDS → SAÍDA"]}
                    labelFormatter={(l, p: any) => p?.[0]?.payload?.fullName ?? l}
                  />
                  <Bar dataKey="tempoPonto" stackId="t" fill="#60a5fa" radius={[0,0,0,0]} name="PONTO → PRÉ DDS" />
                  <Bar dataKey="tempoSaida" stackId="t" fill="#1d4ed8" radius={[6,6,0,0]} name="PRÉ DDS → SAÍDA" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b p-3 font-semibold">Detalhamento</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-2 text-left">Dia</th>
                    <th className="p-2 text-left">Nome</th>
                    <th className="p-2 text-left">Prefixo</th>
                    <th className="p-2 text-left">Polo</th>
                    <th className="p-2 text-left">Ponto→DDS</th>
                    <th className="p-2 text-left">DDS→Saída</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Sem dados</td></tr>}
                  {filtered.map((r,i) => (
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