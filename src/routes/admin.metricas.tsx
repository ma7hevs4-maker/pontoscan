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
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export const Route = createFileRoute("/admin/metricas")({ component: MetricasPage });

interface VRow {
  usuario_id: string; nome: string; prefixo: string; polo: string;
  dia: string; ponto: string | null; pos_dds: string | null; saida_base: string | null;
  tempo_ponto_pos_dds: number | null; tempo_pos_dds_saida: number | null;
}

function fmtMin(m: number | null) {
  if (m == null) return "—";
  const h = Math.floor(m / 60); const r = Math.round(m % 60);
  return h > 0 ? `${h}h${String(r).padStart(2,"0")}` : `${r}min`;
}

function MetricasPage() {
  const { role, adminPolo } = useAuth();
  const today = new Date().toISOString().slice(0,10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [polo, setPolo] = useState<string>(role === "ADMIN_POLO" ? (adminPolo ?? "") : "all");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<VRow[]>([]);
  const [loading, setLoading] = useState(false);

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
    if (!search.trim()) return true;
    const s = search.trim().toLowerCase();
    return (r.nome ?? "").toLowerCase().includes(s) || (r.prefixo ?? "").toLowerCase().includes(s);
  });

  const totalEletricistas = new Set(filtered.map(r => r.usuario_id)).size;
  const completos = filtered.filter(r => r.saida_base).length;
  const tempos = filtered.map(r => (r.tempo_ponto_pos_dds ?? 0) + (r.tempo_pos_dds_saida ?? 0)).filter(v => v > 0);
  const mediaTempo = tempos.length ? tempos.reduce((a,b)=>a+b,0)/tempos.length : 0;

  const ranking = filtered
    .filter(r => r.tempo_ponto_pos_dds != null)
    .sort((a,b)=> (a.tempo_ponto_pos_dds ?? 0) - (b.tempo_ponto_pos_dds ?? 0))
    .slice(0, 10)
    .map(r => ({ nome: `${r.prefixo}`, tempo: r.tempo_ponto_pos_dds ?? 0, fullName: r.nome }));

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-5">
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
            <h3 className="mb-3 font-semibold">Top 10 — Tempo PONTO → POS DDS (mais rápidos)</h3>
            {ranking.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Sem dados no período</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={ranking}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="nome" />
                  <YAxis label={{ value: "min", angle: -90, position: "insideLeft" }} />
                  <Tooltip formatter={(v: number) => fmtMin(v)} labelFormatter={(l, p) => p[0]?.payload.fullName ?? l} />
                  <Bar dataKey="tempo" fill="hsl(var(--primary))" radius={[6,6,0,0]} />
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