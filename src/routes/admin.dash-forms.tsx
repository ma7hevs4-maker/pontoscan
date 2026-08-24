import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, Download } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";

import { useAuth } from "@/lib/auth-context";
import { loadAllFormQuestions, loadFormTipos, visibleQuestions, type FormQuestion, type FormTipo } from "@/lib/form-config";

export const Route = createFileRoute("/admin/dash-forms")({ component: DashForms });

const POLOS = ["Magé","Niterói","São Gonçalo","Serrana","Sul","Campos","Lagos","Macaé","Noroeste","Perdas"] as const;

const POLO_COLORS: Record<string, string> = {
  "Magé": "hsl(210 80% 45%)",
  "Niterói": "hsl(190 75% 40%)",
  "São Gonçalo": "hsl(160 60% 40%)",
  "Serrana": "hsl(140 55% 40%)",
  "Sul": "hsl(35 85% 50%)",
  "Campos": "hsl(15 80% 50%)",
  "Lagos": "hsl(260 60% 55%)",
  "Macaé": "hsl(290 55% 50%)",
  "Noroeste": "hsl(340 65% 50%)",
  "Perdas": "hsl(55 80% 45%)",
};

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

function exportarCSVPorPolo(tipo: string, charts: { field: { label: string }; polos: string[]; rows: { name: string; counts: Record<string, number>; total: number }[] }[]) {
  const sep = ";";
  const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const lines: string[] = [];
  for (const c of charts) {
    lines.push([c.field.label].map(esc).join(sep));
    lines.push(["Resposta", ...c.polos, "Total"].map(esc).join(sep));
    if (c.rows.length === 0) {
      lines.push(["(sem respostas)", ...c.polos.map(() => "0"), "0"].map(esc).join(sep));
    } else {
      for (const r of c.rows) {
        lines.push([r.name, ...c.polos.map(p => String(r.counts[p] ?? 0)), String(r.total)].map(esc).join(sep));
      }
    }
    lines.push("");
  }
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dash-forms-${tipo}-por-polo-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

type Row = {
  tipo: string;
  dados: Record<string, any>;
  created_at: string;
  origem: "INSOURCING" | "PARCEIRA";
  polo_eletricista: string | null;
  polo_prefixo: string | null;
  polo_geo: string | null;
};

type FieldDef = { key: string; label: string; outroKey?: string; cond?: string };

const FIELDS: Record<string, FieldDef[]> = {
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
    { key: "ligacaoCliente", label: "Ligação para o cliente" },
  ],
  ORDEM_2: [{ key: "motivo", label: "Motivo" }],
  IMPRODUTIVO: [
    { key: "motivo", label: "Motivo" },
    { key: "ligacaoCliente", label: "Ligação para o cliente" },
  ],
};

function DashForms() {
  const { role } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tipo, setTipo] = useState<string>("ATENDIMENTO_INDIVIDUAL");
  const [tipos, setTipos] = useState<FormTipo[]>([]);
  const [allQs, setAllQs] = useState<Record<string, FormQuestion[]>>({});
  const [origem, setOrigem] = useState<string>("all");
  const [polo, setPolo] = useState<string>("all");
  const [porPolo, setPorPolo] = useState(false);
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
      const [ts, qs] = await Promise.all([loadFormTipos(true), loadAllFormQuestions()]);
      setTipos(ts);
      setAllQs(qs);
      setTipo((prev) => (ts.some((t) => t.chave === prev) ? prev : ts[0]?.chave ?? prev));
      setLoading(false);
    })();
  }, []);

  const qsDoTipo = useMemo(() => allQs[tipo] ?? [], [allQs, tipo]);

  const fieldDefs = useMemo<FieldDef[]>(() => {
    const base = FIELDS[tipo] ? [...FIELDS[tipo]] : [];
    const seen = new Set(base.map((f) => f.key));
    for (const q of qsDoTipo) {
      if (q.campo_tipo !== "choice" || seen.has(q.chave)) continue;
      const pai = q.parent_chave ? qsDoTipo.find((p) => p.chave === q.parent_chave) : undefined;
      base.push({
        key: q.chave,
        label: q.rotulo,
        outroKey: q.permite_outro ? `${q.chave}Outro` : undefined,
        cond: pai ? `${pai.rotulo} = ${q.parent_valores.join(" ou ")}` : undefined,
      });
      seen.add(q.chave);
    }
    return base;
  }, [tipo, qsDoTipo]);

  /** Uma resposta só entra no gráfico se a pergunta estava realmente visível para aquele registro. */
  const aplicavel = (f: FieldDef, dados: Record<string, any>) => {
    const q = qsDoTipo.find((x) => x.chave === f.key);
    if (!q) return true;
    return visibleQuestions(qsDoTipo, dados ?? {}).some((v) => v.chave === f.key);
  };

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
    return fieldDefs.map(f => {
      const counts: Record<string, number> = {};
      let elegiveis = 0;
      for (const r of filtradas) {
        if (!aplicavel(f, r.dados)) continue;
        elegiveis++;
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
      return { field: f, data, total: data.reduce((s, d) => s + d.value, 0), elegiveis };
    });
  }, [filtradas, tipo, fieldDefs, qsDoTipo]);

  const chartsPorPolo = useMemo(() => {
    return fieldDefs.map(f => {
      const rowsByResp: Record<string, Record<string, number>> = {};
      const polosSet = new Set<string>();
      for (const r of filtradas) {
        if (!aplicavel(f, r.dados)) continue;
        let val = r.dados?.[f.key];
        if (val == null || val === "") continue;
        val = String(val);
        if (val === "Outro" && f.outroKey) {
          const outro = String(r.dados?.[f.outroKey] ?? "").trim();
          val = outro ? `Outro: ${outro}` : "Outro";
        }
        const p = r.polo_eletricista ?? r.polo_prefixo ?? r.polo_geo ?? "Sem polo";
        polosSet.add(p);
        if (!rowsByResp[val]) rowsByResp[val] = {};
        rowsByResp[val][p] = (rowsByResp[val][p] ?? 0) + 1;
      }
      const polos = Array.from(polosSet).sort();
      const rows = Object.entries(rowsByResp).map(([name, counts]) => ({
        name,
        counts,
        total: Object.values(counts).reduce((s, n) => s + n, 0),
      })).sort((a, b) => b.total - a.total);
      return { field: f, polos, rows };
    });
  }, [filtradas, tipo, fieldDefs, qsDoTipo]);


  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {tipos.map(t => (
                  <SelectItem key={t.chave} value={t.chave}>{t.rotulo}</SelectItem>
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
          <div className="flex flex-wrap items-end justify-between gap-3 md:col-span-2">
            <p className="text-sm text-muted-foreground">{filtradas.length} formulário(s) no período</p>
            {role === "ADMIN_DISPATCH" && (
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={porPolo} onCheckedChange={setPorPolo} />
                <span>{porPolo ? "Por polo" : "Geral"}</span>
              </label>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => porPolo ? exportarCSVPorPolo(tipo, chartsPorPolo) : exportarCSV(tipo, charts)}
              disabled={filtradas.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />Exportar CSV
            </Button>
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : filtradas.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">Sem respostas no período.</Card>
      ) : porPolo ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {chartsPorPolo.map(c => {
            const data = c.rows.map(r => ({ name: r.name, ...r.counts }));
            return (
              <Card key={c.field.key} className="p-4">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">{c.field.label}</h3>
                    {c.field.cond && <p className="text-[11px] text-muted-foreground">Sub-pergunta de: {c.field.cond}</p>}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{c.rows.reduce((s, r) => s + r.total, 0)} resposta(s) · {c.polos.length} polo(s)</span>
                </div>

                {c.rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem respostas.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(200, c.rows.length * 44)}>
                    <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} />
                      <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 12 }} />
                      <Tooltip />
                      {c.polos.map(p => (
                        <Bar key={p} dataKey={p} stackId="polo" fill={POLO_COLORS[p] ?? "var(--primary)"} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                )}
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {c.polos.map(p => (
                    <span key={p} className="flex items-center gap-1">
                      <span className="inline-block h-3 w-3 rounded" style={{ background: POLO_COLORS[p] ?? "var(--primary)" }} />
                      {p}
                    </span>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {charts.map(c => (
            <Card key={c.field.key} className="p-4">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{c.field.label}</h3>
                  {c.field.cond && <p className="text-[11px] text-muted-foreground">Sub-pergunta de: {c.field.cond}</p>}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {c.total} resposta(s){c.field.cond ? ` de ${c.elegiveis} aplicável(is)` : ""}
                </span>
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