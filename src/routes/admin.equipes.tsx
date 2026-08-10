import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { POLOS, useAuth } from "@/lib/auth-context";
import { Loader2, Users, AlertTriangle, CheckCircle2, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/equipes")({
  component: EquipesView,
  head: () => ({
    meta: [
      { title: "Equipes ativas · PontoScan Admin" },
      { name: "description", content: "Acompanhe as equipes ativas do dia, pontos batidos por colaborador e a área de atuação (BT, MT Ramal ou MT Tronco)." },
      { property: "og:title", content: "Equipes ativas · PontoScan Admin" },
      { property: "og:description", content: "Acompanhe as equipes ativas do dia, pontos batidos por colaborador e a área de atuação." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const ETAPAS = ["PONTO", "POS_DDS", "SAIDA_BASE"] as const;
const ETAPA_LABEL: Record<string, string> = { PONTO: "PONTO", POS_DDS: "PRÉ DDS", SAIDA_BASE: "SAÍDA BASE" };
type Area = "BT" | "MT_RAMAL" | "MT_TRONCO";
const AREA_LABEL: Record<Area, string> = { BT: "BT", MT_RAMAL: "MT RAMAL", MT_TRONCO: "MT TRONCO" };

interface Reg {
  id: string; etapa: string; timestamp: string; usuario_id: string;
  prefixo_override: string | null; nome: string | null; prefixo: string | null;
  user_polo: string | null; base_nome: string | null; base_polo: string | null;
}

interface Membro {
  usuario_id: string; nome: string;
  marcacoes: Record<string, string>; // etapa -> timestamp
}

interface Equipe {
  key: string; prefixo: string; polo: string;
  membros: Membro[];
  bases: string[];
  area: Area | null;
  gerada: boolean;
}

function hoje() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function EquipesView() {
  const { role, adminPolo } = useAuth();
  const dia = hoje();
  const [polo, setPolo] = useState<string>(role === "ADMIN_POLO" ? (adminPolo ?? "") : "all");
  const [regs, setRegs] = useState<Reg[]>([]);
  const [areas, setAreas] = useState<Record<string, Area>>({});
  const [manuais, setManuais] = useState<{ prefixo: string; polo: string }[]>([]);
  const [areaFiltro, setAreaFiltro] = useState<string>("all");
  const [novaOpen, setNovaOpen] = useState(false);
  const [novoPrefixo, setNovoPrefixo] = useState("");
  const [novoPolo, setNovoPolo] = useState<string>("");
  const [salvando, setSalvando] = useState(false);
  const [loading, setLoading] = useState(true);
  const [aberta, setAberta] = useState<Equipe | null>(null);

  useEffect(() => {
    if (role === "ADMIN_POLO" && adminPolo) setPolo(adminPolo);
  }, [role, adminPolo]);

  const load = useCallback(async () => {
    setLoading(true);
    const start = new Date(`${dia}T00:00:00-03:00`).toISOString();
    const end = new Date(`${dia}T23:59:59-03:00`).toISOString();
    let q = supabase.from("vw_registros_admin")
      .select("id, etapa, timestamp, usuario_id, prefixo_override, nome, prefixo, user_polo, base_nome, base_polo")
      .gte("timestamp", start).lte("timestamp", end)
      .order("timestamp", { ascending: true });
    if (polo && polo !== "all") q = q.or(`user_polo.eq.${polo},base_polo.eq.${polo}`);
    const [{ data, error }, { data: ar }] = await Promise.all([
      q,
      supabase.from("equipe_areas").select("prefixo, polo, area, gerada").eq("dia", dia),
    ]);
    if (!error) setRegs((data as Reg[]) ?? []);
    const map: Record<string, Area> = {};
    (ar ?? []).forEach((a: any) => { if (a.area) map[`${a.prefixo}|${a.polo}`] = a.area as Area; });
    setAreas(map);
    setManuais((ar ?? []).filter((a: any) => a.gerada).map((a: any) => ({ prefixo: a.prefixo, polo: a.polo as string })));
    setLoading(false);
  }, [dia, polo]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const ch = supabase.channel("equipes-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "registros" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const equipes: Equipe[] = useMemo(() => {
    const map = new Map<string, Equipe>();
    for (const m of manuais) {
      if (polo !== "all" && m.polo !== polo) continue;
      const key = `${m.prefixo}|${m.polo}`;
      map.set(key, { key, prefixo: m.prefixo, polo: m.polo, membros: [], bases: [], area: areas[key] ?? null, gerada: true });
    }
    for (const r of regs) {
      const prefixo = (r.prefixo_override ?? r.prefixo ?? "").trim();
      if (!prefixo) continue;
      const p = r.user_polo ?? "";
      const key = `${prefixo}|${p}`;
      let e = map.get(key);
      if (!e) {
        e = { key, prefixo, polo: p, membros: [], bases: [], area: areas[key] ?? null, gerada: false };
        map.set(key, e);
      }
      let m = e.membros.find(x => x.usuario_id === r.usuario_id);
      if (!m) { m = { usuario_id: r.usuario_id, nome: r.nome ?? "—", marcacoes: {} }; e.membros.push(m); }
      if (!m.marcacoes[r.etapa]) m.marcacoes[r.etapa] = r.timestamp;
      if (r.base_nome && !e.bases.includes(r.base_nome)) e.bases.push(r.base_nome);
    }
    // apenas equipes com pelo menos o primeiro ponto
    return [...map.values()]
      .filter(e => e.gerada || e.membros.some(m => m.marcacoes["PONTO"]))
      .sort((a, b) => a.prefixo.localeCompare(b.prefixo));
  }, [regs, areas, manuais, polo]);

  const visiveis = useMemo(() => equipes.filter(e =>
    areaFiltro === "all" ? true : areaFiltro === "none" ? !areas[e.key] : areas[e.key] === areaFiltro
  ), [equipes, areas, areaFiltro]);

  const kpis = useMemo(() => ({
    total: equipes.length,
    BT: equipes.filter(e => e.area === "BT").length,
    MT_RAMAL: equipes.filter(e => e.area === "MT_RAMAL").length,
    MT_TRONCO: equipes.filter(e => e.area === "MT_TRONCO").length,
  }), [equipes]);

  const setArea = async (e: Equipe, area: Area | "none") => {
    if (area === "none") {
      const { error } = e.gerada
        ? await supabase.from("equipe_areas").update({ area: null }).eq("dia", dia).eq("prefixo", e.prefixo).eq("polo", e.polo as any)
        : await supabase.from("equipe_areas").delete().eq("dia", dia).eq("prefixo", e.prefixo).eq("polo", e.polo as any);
      if (error) return toast.error("Não foi possível remover a área");
      setAreas(prev => { const n = { ...prev }; delete n[e.key]; return n; });
      return;
    }
    const { error } = await supabase.from("equipe_areas")
      .upsert({ dia, prefixo: e.prefixo, polo: e.polo as any, area, gerada: e.gerada }, { onConflict: "dia,prefixo,polo" });
    if (error) return toast.error("Não foi possível definir a área");
    setAreas(prev => ({ ...prev, [e.key]: area }));
    setAberta(prev => prev && prev.key === e.key ? { ...prev, area } : prev);
  };

  const criarEquipe = async () => {
    const pref = novoPrefixo.trim().toUpperCase();
    const pol = role === "ADMIN_POLO" ? (adminPolo ?? "") : novoPolo;
    if (!pref || !pol) return toast.error("Informe prefixo e polo");
    setSalvando(true);
    const { error } = await supabase.from("equipe_areas")
      .upsert({ dia, prefixo: pref, polo: pol as any, gerada: true }, { onConflict: "dia,prefixo,polo" });
    setSalvando(false);
    if (error) return toast.error("Não foi possível gerar a equipe");
    toast.success(`Equipe ${pref} gerada`);
    setNovaOpen(false); setNovoPrefixo(""); setNovoPolo("");
    load();
  };

  const excluirGerada = async (e: Equipe) => {
    const { error } = await supabase.from("equipe_areas").delete().eq("dia", dia).eq("prefixo", e.prefixo).eq("polo", e.polo as any);
    if (error) return toast.error("Não foi possível excluir a equipe");
    setAberta(null);
    load();
  };

  const completos = (e: Equipe) => e.membros.filter(m => ETAPAS.every(et => m.marcacoes[et])).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Equipes totais", value: kpis.total },
          { label: "Equipes BT", value: kpis.BT },
          { label: "Equipes MT Ramal", value: kpis.MT_RAMAL },
          { label: "Equipes MT Tronco", value: kpis.MT_TRONCO },
        ].map(k => (
          <Card key={k.label} className="p-4">
            <p className="text-xs font-medium text-muted-foreground">{k.label}</p>
            <p className="mt-1 text-3xl font-bold text-primary">{k.value}</p>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-4">
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
            <Label>Área</Label>
            <Select value={areaFiltro} onValueChange={setAreaFiltro}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="BT">BT</SelectItem>
                <SelectItem value="MT_RAMAL">MT RAMAL</SelectItem>
                <SelectItem value="MT_TRONCO">MT TRONCO</SelectItem>
                <SelectItem value="none">Sem área</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Button variant="outline" onClick={load}>Atualizar</Button>
            <Button onClick={() => { setNovaOpen(true); setNovoPolo(role === "ADMIN_POLO" ? (adminPolo ?? "") : ""); }}>
              <Plus className="mr-2 h-4 w-4" />Gerar equipe
            </Button>
          </div>
          <div className="flex items-end text-sm text-muted-foreground">
            Dia {new Date(`${dia}T12:00:00`).toLocaleDateString("pt-BR")} · as áreas resetam automaticamente todo dia
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
                <TableHead>Equipe</TableHead>
                <TableHead>Polo</TableHead>
                <TableHead>Colaboradores</TableHead>
                <TableHead>Jornada completa</TableHead>
                <TableHead>Base</TableHead>
                <TableHead>Área</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Nenhuma equipe ativa hoje</TableCell></TableRow>
              )}
              {visiveis.map(e => {
                const ok = completos(e);
                const pend = e.membros.length - ok;
                return (
                  <TableRow key={e.key} className="cursor-pointer" onClick={() => setAberta(e)}>
                    <TableCell className="font-mono font-semibold">
                      {e.prefixo}
                      {e.gerada && <span className="ml-2 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800">gerada</span>}
                    </TableCell>
                    <TableCell>{e.polo}</TableCell>
                    <TableCell><span className="inline-flex items-center gap-1"><Users className="h-4 w-4 text-muted-foreground" />{e.membros.length}</span></TableCell>
                    <TableCell>
                      {pend === 0 ? (
                        <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" />{ok}/{e.membros.length}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-sm font-medium text-amber-700"><AlertTriangle className="h-4 w-4" />{ok}/{e.membros.length} · {pend} pendente{pend > 1 ? "s" : ""}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.bases.join(", ") || "—"}</TableCell>
                    <TableCell onClick={(ev) => ev.stopPropagation()}>
                      <Select value={areas[e.key] ?? "none"} onValueChange={(v) => setArea(e, v as Area | "none")}>
                        <SelectTrigger className="h-8 w-[150px]"><SelectValue placeholder="Definir" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem área</SelectItem>
                          <SelectItem value="BT">BT</SelectItem>
                          <SelectItem value="MT_RAMAL">MT RAMAL</SelectItem>
                          <SelectItem value="MT_TRONCO">MT TRONCO</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={!!aberta} onOpenChange={(o) => !o && setAberta(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {aberta?.prefixo} · {aberta?.polo}
              {aberta?.gerada && <span className="ml-2 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800">gerada</span>}
              {aberta && areas[aberta.key] && (
                <span className="ml-2 rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{AREA_LABEL[areas[aberta.key]]}</span>
              )}
            </DialogTitle>
          </DialogHeader>
          {aberta && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">Área de atuação:</span>
                {(["BT", "MT_RAMAL", "MT_TRONCO"] as Area[]).map(a => (
                  <Button key={a} size="sm" variant={areas[aberta.key] === a ? "default" : "outline"} onClick={() => setArea(aberta, a)}>
                    {AREA_LABEL[a]}
                  </Button>
                ))}
                {areas[aberta.key] && <Button size="sm" variant="ghost" onClick={() => setArea(aberta, "none")}>Limpar</Button>}
                {aberta.gerada && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => excluirGerada(aberta)}>Excluir equipe gerada</Button>}
              </div>
              {aberta.membros.length === 0 && (
                <p className="text-sm text-muted-foreground">Equipe gerada manualmente — nenhum colaborador bateu ponto com este prefixo hoje.</p>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Colaborador</TableHead>
                    {ETAPAS.map(et => <TableHead key={et}>{ETAPA_LABEL[et]}</TableHead>)}
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aberta.membros.map(m => {
                    const falta = ETAPAS.filter(et => !m.marcacoes[et]);
                    return (
                      <TableRow key={m.usuario_id}>
                        <TableCell>{m.nome}</TableCell>
                        {ETAPAS.map(et => (
                          <TableCell key={et} className="font-mono text-xs">
                            {m.marcacoes[et] ? new Date(m.marcacoes[et]).toLocaleTimeString("pt-BR") : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                        ))}
                        <TableCell>
                          {falta.length === 0
                            ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3 w-3" />Completo</span>
                            : <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700"><AlertTriangle className="h-3 w-3" />Falta {falta.map(f => ETAPA_LABEL[f]).join(", ")}</span>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={novaOpen} onOpenChange={setNovaOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Gerar equipe</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Prefixo da equipe</Label>
              <Input value={novoPrefixo} onChange={(ev) => setNovoPrefixo(ev.target.value)} placeholder="Ex.: NI200TST-A" />
            </div>
            <div>
              <Label>Polo</Label>
              <Select value={novoPolo} onValueChange={setNovoPolo} disabled={role === "ADMIN_POLO"}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {POLOS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={criarEquipe} disabled={salvando}>
              {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Gerar equipe
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
