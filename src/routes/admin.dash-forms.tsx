import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, Download } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { TIPO_LABEL } from "@/lib/incidentes";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/admin/dash-forms")({ component: DashForms });

const POLOS = ["Magé","Niterói","São Gonçalo","Serrana","Sul","Campos","Lagos","Macaé","Noroeste","Perdas","Comercial"] as const;

function exportarCSV(tipo: string, charts: { field: { label: string }; data: { name: string; value: number }[]; total: number }[]) {
  const sep = ";";
  const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const lines: string[] = [];
  lines.push(["Pergunta", "Resposta", "Quantidade", "Total", "%"].map(esc).join(sep));
  for (const c of charts) {
    if (c.data.length === 0) {
      lines.push([c.field.label, "(sem respostas)", "0", "0", "0%"].map(esc).join(sep));
      continue;
    }
    for (const d of c.data) {
      const pct = c.total ? ((d.value / c.total) * 100).toFixed(1) + "%" : "0%";
      lines.push([c.field.label, d.name, String(d.value), String(c.total), pct].map(esc).join(sep));
    }
  }
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dash-forms-${tipo}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

type Row = {
  tipo: "ATENDIMENTO_INDIVIDUAL" | "ORDEM_2" | "IMPRODUTIVO";
  dados: Record<string, any>;
  created_at: string;
  origem: "INSOURCING" | "PARCEIRA";
  polo_eletricista: string | null;
  polo_prefixo: string | null;
  polo_geo: string | null;
};

type FieldDef = { key: string; label: string; outroKey?: string };

const FIELDS: Record<Row["tipo"], FieldDef[]> = {
  ATENDIMENTO_INDIVIDUAL: [
    { key: "tipoRede", label: "Tipo de Rede", outroKey: "tipoRedeOutro" },
    { key: "tipoConexao", label: "Tipo de Conexão", outroKey: "tipoConexaoOutro" },
    { key: "caixaDae", label: "Caixa DAE" },
    { key: "materialRamal", label: "Material do Ramal" },
    { key: "bitolaRamal", label: "Bitola do Ramal", outroKey: "bitolaRamalOutro" },
    { key: "tipoRamal", label: "Tipo de Ramal" },
    { key: "tipoDisjuntor", label: "Tipo de Disjuntor", outroKey: "tipoDisjuntorOutro" },
    { key: "noKirchhoff", label: "Nó de Kirchhoff" },
    { key: "medicao", label: "Medição" },
    { key: "correlacaoDefeito", label: "Correlação do Defeito", outroKey: "correlacaoDefeitoOutro" },
  ],
  ORDEM_2: [{ key: "motivo", label: "Motivo" }],
  IMPRODUTIVO: [{ key: "motivo", label: "Motivo" }],
};

function DashForms() {
  const { role } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tipo, setTipo] = useState<Row["tipo"]>("ATENDIMENTO_INDIVIDUAL");
  const [origem, setOrigem] = useState<string>("all");
  const [polo, setPolo] = useState<string>("all");
  const hoje = new Date().toISOString().slice(0, 10);
  const trintaDias = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [de, setDe] = useState(trintaDias);
  const [ate, setAte] = useState(hoje);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from("incidentes")
        .select("tipo, dados, created_at, origem, polo_eletricista, polo_prefixo, polo_geo")
        .order("created_at", { ascending: false })
        .limit(5000);
      setRows((data as Row[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const filtradas = useMemo(() => {
    const deTs = new Date(de + "T00:00:00").getTime();
    const ateTs = new Date(ate + "T23:59:59").getTime();
    return rows.filter(r => {
      if (r.tipo !== tipo) return false;
      if (origem !== "all" && r.origem !== origem) return false;
      if (polo !== "all") {
        if (r.polo_eletricista !== polo && r.polo_prefixo !== polo && r.polo_geo !== polo) return false;
      }
      const t = new Date(r.created_at).getTime();
      return t >= deTs && t <= ateTs;
    });
  }, [rows, tipo, origem, polo, de, ate]);

  const charts = useMemo(() => {
    return FIELDS[tipo].map(f => {
      const counts: Record<string, number> = {};
      for (const r of filtradas) {
        let val = r.dados?.[f.key];
        if (val == null || val === "") continue;
        val = String(val);
        if (val === "Outro" && f.outroKey) {
          const outro = String(r.dados?.[f.outroKey] ?? "").trim();
          val = outro ? `Outro: ${outro}` : "Outro";
        }
        counts[val] = (counts[val] ?? 0) + 1;
      }
      const data = Object.entries(counts)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
      return { field: f, data, total: data.reduce((s, d) => s + d.value, 0) };
    });
  }, [filtradas, tipo]);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as Row["tipo"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(FIELDS) as Row["tipo"][]).map(t => (
                  <SelectItem key={t} value={t}>{TIPO_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Origem</Label>
            <Select value={origem} onValueChange={setOrigem}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="INSOURCING">Insourcing</SelectItem>
                <SelectItem value="PARCEIRA">Parceira</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {role === "ADMIN_DISPATCH" && (
            <div>
              <Label className="text-xs">Polo</Label>
              <Select value={polo} onValueChange={setPolo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {POLOS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs">De</Label>
            <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
          <div className="flex items-end justify-between gap-2 md:col-span-2">
            <p className="text-sm text-muted-foreground">{filtradas.length} formulário(s) no período</p>
            <Button variant="outline" size="sm" onClick={() => exportarCSV(tipo, charts)} disabled={filtradas.length === 0}>
              <Download className="mr-2 h-4 w-4" />Exportar CSV
            </Button>
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : filtradas.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">Sem respostas no período.</Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {charts.map(c => (
            <Card key={c.field.key} className="p-4">
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="font-semibold">{c.field.label}</h3>
                <span className="text-xs text-muted-foreground">{c.total} resposta(s)</span>
              </div>
              {c.data.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem respostas.</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(180, c.data.length * 36)}>
                  <BarChart data={c.data} layout="vertical" margin={{ left: 8, right: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {c.data.map((_, i) => (
                        <Cell key={i} fill="var(--primary)" />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}