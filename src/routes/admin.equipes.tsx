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
import { Loader2, Users, AlertTriangle, CheckCircle2, Plus, History, Trash2, Merge, Pencil, Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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
type Area = "BT" | "MT_RAMAL" | "MT_TRONCO" | "INATIVA";
const ACAO_LABEL: Record<string, string> = {
  EQUIPE_GERADA: "Equipe gerada",
  EQUIPE_EXCLUIDA: "Equipe gerada excluída",
  AREA_DEFINIDA: "Área definida",
  AREA_ALTERADA: "Área alterada",
  AREA_REMOVIDA: "Área removida",
  INCIDENTE_ATRIBUIDO: "Incidente atribuído",
  INCIDENTE_REMOVIDO: "Incidente removido",
  PREFIXO_AJUSTADO: "Prefixo ajustado",
};
const AREA_LABEL: Record<Area, string> = { BT: "BT", MT_RAMAL: "MT RAMAL", MT_TRONCO: "MT TRONCO", INATIVA: "INATIVA" };

interface Reg {
  id: string; etapa: string; timestamp: string; usuario_id: string;
  prefixo_override: string | null; nome: string | null; prefixo: string | null;
  user_polo: string | null; base_nome: string | null; base_polo: string | null;
}

interface Membro {
  usuario_id: string; nome: string;
  marcacoes: Record<string, string>; // etapa -> timestamp
}

interface Inc {
  numero: string;
  ponto_eletrico: string;
  alimentador: string;
}

interface Equipe {
  key: string; prefixo: string; polo: string;
  membros: Membro[];
  bases: string[];
  area: Area | null;
  gerada: boolean;
  ajustado: boolean;
  incidentes: Inc[];
}

function hoje() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function turnoDe(prefixo: string) {
  const m = prefixo.trim().toUpperCase().match(/-\s*([A-Z])/);
  return m ? m[1] : "";
}

function EquipesView() {
  const { role, adminPolo } = useAuth();
  const dia = hoje();
  const [polo, setPolo] = useState<string>(role === "ADMIN_POLO" ? (adminPolo ?? "") : "all");
  const [regs, setRegs] = useState<Reg[]>([]);
  const [areas, setAreas] = useState<Record<string, Area>>({});
  const [manuais, setManuais] = useState<{ prefixo: string; polo: string }[]>([]);
  const [ajustados, setAjustados] = useState<Record<string, boolean>>({});
  const [overrides, setOverrides] = useState<Record<string, { prefixo: string; polo: string }>>({});
  const [incidentesMap, setIncidentesMap] = useState<Record<string, Inc[]>>({});
  const [areaFiltro, setAreaFiltro] = useState<string>("all");
  const [busca, setBusca] = useState("");
  const [turno, setTurno] = useState<string>("all");
  const [mesclarOpen, setMesclarOpen] = useState(false);
  const [selEquipes, setSelEquipes] = useState<string[]>([]);
  const [selMembros, setSelMembros] = useState<string[]>([]);
  const [destino, setDestino] = useState<string>("");
  const [prefixoMescla, setPrefixoMescla] = useState("");
  const [editarOpen, setEditarOpen] = useState(false);
  const [prefixoEdit, setPrefixoEdit] = useState("");
  const [novaOpen, setNovaOpen] = useState(false);
  const [novoPrefixo, setNovoPrefixo] = useState("");
  const [novoPolo, setNovoPolo] = useState<string>("");
  const [salvando, setSalvando] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [logPolo, setLogPolo] = useState<string>("all");
  const [logs, setLogs] = useState<any[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [aberta, setAberta] = useState<Equipe | null>(null);
  const [novoIncidente, setNovoIncidente] = useState("");
  const [novoPonto, setNovoPonto] = useState("");
  const [novoAlim, setNovoAlim] = useState("");

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
    const [{ data, error }, { data: ar }, { data: inc }, { data: ov }] = await Promise.all([
      q,
      supabase.from("equipe_areas").select("prefixo, polo, area, gerada, ajustado").eq("dia", dia),
      supabase.from("equipe_incidentes")
        .select("prefixo, polo, numero_incidente, ponto_eletrico, alimentador, created_at")
        .eq("dia", dia).order("created_at", { ascending: true }),
      supabase.from("equipe_membros_override").select("usuario_id, prefixo, polo").eq("dia", dia),
    ]);
    if (!error) setRegs((data as Reg[]) ?? []);
    const map: Record<string, Area> = {};
    (ar ?? []).forEach((a: any) => { if (a.area) map[`${a.prefixo}|${a.polo}`] = a.area as Area; });
    setAreas(map);
    const aj: Record<string, boolean> = {};
    (ar ?? []).forEach((a: any) => { if (a.ajustado) aj[`${a.prefixo}|${a.polo}`] = true; });
    setAjustados(aj);
    const omap: Record<string, { prefixo: string; polo: string }> = {};
    (ov ?? []).forEach((o: any) => { omap[o.usuario_id] = { prefixo: o.prefixo, polo: o.polo }; });
    setOverrides(omap);
    setManuais((ar ?? []).filter((a: any) => a.gerada).map((a: any) => ({ prefixo: a.prefixo, polo: a.polo as string })));
    const imap: Record<string, Inc[]> = {};
    (inc ?? []).forEach((i: any) => {
      const key = `${i.prefixo}|${i.polo}`;
      if (!imap[key]) imap[key] = [];
      imap[key].push({ numero: i.numero_incidente, ponto_eletrico: i.ponto_eletrico ?? "", alimentador: i.alimentador ?? "" });
    });
    setIncidentesMap(imap);
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
      map.set(key, { key, prefixo: m.prefixo, polo: m.polo, membros: [], bases: [], area: areas[key] ?? null, gerada: true, ajustado: !!ajustados[key], incidentes: incidentesMap[key] ?? [] });
    }
    for (const r of regs) {
      const ov = overrides[r.usuario_id];
      const prefixo = (ov?.prefixo ?? r.prefixo_override ?? r.prefixo ?? "").trim();
      if (!prefixo) continue;
      const p = ov?.polo ?? r.user_polo ?? "";
      const key = `${prefixo}|${p}`;
      let e = map.get(key);
      if (!e) {
        e = { key, prefixo, polo: p, membros: [], bases: [], area: areas[key] ?? null, gerada: false, ajustado: !!ajustados[key], incidentes: incidentesMap[key] ?? [] };
        map.set(key, e);
      }
      let m = e.membros.find(x => x.usuario_id === r.usuario_id);
      if (!m) { m = { usuario_id: r.usuario_id, nome: r.nome ?? "—", marcacoes: {} }; e.membros.push(m); }
      if (!m.marcacoes[r.etapa]) m.marcacoes[r.etapa] = r.timestamp;
      if (r.base_nome && !e.bases.includes(r.base_nome)) e.bases.push(r.base_nome);
    }
    return [...map.values()]
      .filter(e => e.gerada || e.membros.some(m => m.marcacoes["PONTO"]))
      .sort((a, b) => a.prefixo.localeCompare(b.prefixo));
  }, [regs, areas, manuais, polo, incidentesMap, overrides, ajustados]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return equipes.filter(e => {
      const okArea = areaFiltro === "all" ? true : areaFiltro === "none" ? !areas[e.key] : areas[e.key] === areaFiltro;
      if (!okArea) return false;
      if (turno !== "all" && turnoDe(e.prefixo) !== turno) return false;
      if (!termo) return true;
      return e.prefixo.toLowerCase().includes(termo) || e.membros.some(m => m.nome.toLowerCase().includes(termo));
    });
  }, [equipes, areas, areaFiltro, busca, turno]);

  const kpis = useMemo(() => ({
    total: equipes.filter(e => e.area !== "INATIVA").length,
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

  const adicionarIncidente = async (e: Equipe) => {
    const num = novoIncidente.trim().replace(/\s+/g, " ").toUpperCase();
    const ponto = novoPonto.trim().toUpperCase();
    const alim = novoAlim.trim().toUpperCase();
    if (!num) return toast.error("Digite o número do incidente");
    if (!ponto) return toast.error("Informe o ponto elétrico");
    if (!alim) return toast.error("Informe o alimentador");
    if (e.incidentes.some(i => i.numero === num)) return toast.error("Incidente já atribuído a esta equipe");
    setSalvando(true);
    const { error } = await supabase.from("equipe_incidentes")
      .insert({ dia, prefixo: e.prefixo, polo: e.polo as any, numero_incidente: num, ponto_eletrico: ponto, alimentador: alim });
    setSalvando(false);
    if (error) return toast.error("Não foi possível atribuir o incidente");
    const novo: Inc = { numero: num, ponto_eletrico: ponto, alimentador: alim };
    setIncidentesMap(prev => ({ ...prev, [e.key]: [...(prev[e.key] ?? []), novo] }));
    setAberta(prev => prev && prev.key === e.key ? { ...prev, incidentes: [...prev.incidentes, novo] } : prev);
    setNovoIncidente("");
    setNovoPonto("");
    setNovoAlim("");
    toast.success(`Incidente ${num} atribuído`);
  };

  const removerIncidente = async (e: Equipe, num: string) => {
    const { error } = await supabase.from("equipe_incidentes")
      .delete().eq("dia", dia).eq("prefixo", e.prefixo).eq("polo", e.polo as any).eq("numero_incidente", num);
    if (error) return toast.error("Não foi possível remover o incidente");
    setIncidentesMap(prev => ({ ...prev, [e.key]: (prev[e.key] ?? []).filter(x => x.numero !== num) }));
    setAberta(prev => prev && prev.key === e.key ? { ...prev, incidentes: prev.incidentes.filter(x => x.numero !== num) } : prev);
    toast.success(`Incidente ${num} removido`);
  };

  const carregarLogs = useCallback(async () => {
    setLogLoading(true);
    let q = supabase.from("equipe_area_logs")
      .select("id, dia, prefixo, polo, acao, area_anterior, area_nova, numero_incidente, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (logPolo !== "all") q = q.eq("polo", logPolo as any);
    const { data } = await q;
    setLogs((data as any[]) ?? []);
    setLogLoading(false);
  }, [logPolo]);

  useEffect(() => { if (logOpen) carregarLogs(); }, [logOpen, carregarLogs]);

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

  const moverMembros = async (usuarios: string[], prefixo: string, poloAlvo: string) => {
    if (usuarios.length === 0) return null;
    return supabase.from("equipe_membros_override").upsert(
      usuarios.map(u => ({ dia, usuario_id: u, prefixo, polo: poloAlvo as any })),
      { onConflict: "dia,usuario_id" },
    );
  };

  const ajustarPrefixo = async () => {
    if (!aberta) return;
    const novo = prefixoEdit.trim().toUpperCase();
    if (!novo) return toast.error("Informe o novo prefixo");
    if (novo === aberta.prefixo) { setEditarOpen(false); return; }
    setSalvando(true);
    const res = await moverMembros(aberta.membros.map(m => m.usuario_id), novo, aberta.polo);
    if (res?.error) { setSalvando(false); return toast.error("Não foi possível ajustar o prefixo"); }
    await supabase.from("equipe_areas").delete().eq("dia", dia).eq("prefixo", aberta.prefixo).eq("polo", aberta.polo as any);
    const { error } = await supabase.from("equipe_areas").upsert(
      { dia, prefixo: novo, polo: aberta.polo as any, area: aberta.area, gerada: aberta.gerada, ajustado: true },
      { onConflict: "dia,prefixo,polo" },
    );
    setSalvando(false);
    if (error) return toast.error("Não foi possível ajustar o prefixo");
    toast.success(`Prefixo ajustado para ${novo}`);
    setEditarOpen(false);
    setAberta(null);
    load();
  };

  const equipesMescla = useMemo(() => equipes.filter(e => selEquipes.includes(e.key)), [equipes, selEquipes]);

  const toggleEquipeMescla = (e: Equipe) => {
    setSelEquipes(prev => {
      const on = prev.includes(e.key);
      const next = on ? prev.filter(k => k !== e.key) : [...prev, e.key];
      setSelMembros(ms => on
        ? ms.filter(id => !e.membros.some(m => m.usuario_id === id))
        : [...ms, ...e.membros.map(m => m.usuario_id)]);
      if (on && destino === e.key) setDestino("");
      return next;
    });
  };

  const mesclar = async () => {
    if (selEquipes.length < 2) return toast.error("Selecione ao menos duas equipes");
    if (selMembros.length === 0) return toast.error("Selecione ao menos um colaborador");
    const novo = prefixoMescla.trim().toUpperCase();
    const alvo = destino === "__novo" ? null : equipes.find(e => e.key === destino);
    if (destino === "__novo" && !novo) return toast.error("Informe o prefixo da nova equipe");
    if (!alvo && destino !== "__novo") return toast.error("Escolha a equipe de destino");
    const poloAlvo = alvo?.polo ?? equipesMescla[0].polo;
    const prefixoAlvo = alvo?.prefixo ?? novo;
    const keyAlvo = `${prefixoAlvo}|${poloAlvo}`;

    setSalvando(true);
    const res = await moverMembros(selMembros, prefixoAlvo, poloAlvo);
    if (res?.error) { setSalvando(false); return toast.error("Não foi possível mesclar as equipes"); }
    for (const e of equipesMescla) {
      if (e.key === keyAlvo) continue;
      await supabase.from("equipe_areas").delete().eq("dia", dia).eq("prefixo", e.prefixo).eq("polo", e.polo as any);
    }
    const { error } = await supabase.from("equipe_areas").upsert(
      { dia, prefixo: prefixoAlvo, polo: poloAlvo as any, area: alvo?.area ?? null, gerada: alvo?.gerada ?? false, ajustado: true },
      { onConflict: "dia,prefixo,polo" },
    );
    setSalvando(false);
    if (error) return toast.error("Não foi possível mesclar as equipes");
    toast.success(`Equipes mescladas em ${prefixoAlvo}`);
    setMesclarOpen(false); setSelEquipes([]); setSelMembros([]); setDestino(""); setPrefixoMescla("");
    load();
  };

  const completos = (e: Equipe) => e.membros.filter(m => ETAPAS.every(et => m.marcacoes[et])).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Equipes totais (ativas)", value: kpis.total },
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
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:w-auto">
            <div className="min-w-0 sm:w-48">
              <Label>Polo</Label>
              <Select value={polo} onValueChange={setPolo} disabled={role === "ADMIN_POLO"}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {POLOS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 sm:w-48">
              <Label>Área</Label>
              <Select value={areaFiltro} onValueChange={setAreaFiltro}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="BT">BT</SelectItem>
                  <SelectItem value="MT_RAMAL">MT RAMAL</SelectItem>
                  <SelectItem value="MT_TRONCO">MT TRONCO</SelectItem>
                  <SelectItem value="INATIVA">INATIVA</SelectItem>
                  <SelectItem value="none">Sem área</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <p className="text-xs text-muted-foreground sm:text-right">
              Dia {new Date(`${dia}T12:00:00`).toLocaleDateString("pt-BR")} · as áreas resetam automaticamente todo dia
            </p>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <Button variant="outline" onClick={load}>Atualizar</Button>
              {role === "ADMIN_DISPATCH" && (
                <Button variant="outline" onClick={() => setLogOpen(true)}><History className="mr-2 h-4 w-4" />Log</Button>
              )}
              <Button onClick={() => { setNovaOpen(true); setNovoPolo(role === "ADMIN_POLO" ? (adminPolo ?? "") : ""); }}>
                <Plus className="mr-2 h-4 w-4" />Gerar equipe
              </Button>
            </div>
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
                <TableHead>Incidentes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Nenhuma equipe ativa hoje</TableCell></TableRow>
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
                          <SelectItem value="INATIVA">INATIVA</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell onClick={(ev) => ev.stopPropagation()}>
                      {e.incidentes.length === 0 ? (
                        <span className="text-sm text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {e.incidentes.map((inc, idx) => {
                            const atual = idx === e.incidentes.length - 1;
                            return (
                              <span key={inc.numero} title={`Ponto elétrico: ${inc.ponto_eletrico || "—"} · Alimentador: ${inc.alimentador || "—"}`}
                                className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold ${atual ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-500" : "bg-primary/10 text-primary"}`}>
                                {inc.numero}
                                {atual && <span className="rounded bg-emerald-600 px-1 text-[9px] font-bold text-white">ATUAL</span>}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={!!aberta} onOpenChange={(o) => { if (!o) setAberta(null); setNovoIncidente(""); setNovoPonto(""); setNovoAlim(""); }}>
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
                {(["BT", "MT_RAMAL", "MT_TRONCO", "INATIVA"] as Area[]).map(a => (
                  <Button key={a} size="sm" variant={areas[aberta.key] === a ? "default" : "outline"} onClick={() => setArea(aberta, a)}>
                    {AREA_LABEL[a]}
                  </Button>
                ))}
                {areas[aberta.key] && <Button size="sm" variant="ghost" onClick={() => setArea(aberta, "none")}>Limpar</Button>}
                {aberta.gerada && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => excluirGerada(aberta)}>Excluir equipe gerada</Button>}
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="incidente" className="text-sm text-muted-foreground">Incidente atribuído:</Label>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <Input
                    id="incidente"
                    value={novoIncidente}
                    onChange={(ev) => setNovoIncidente(ev.target.value)}
                    placeholder="Número do incidente"
                    className="w-48"
                    onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); adicionarIncidente(aberta); } }}
                  />
                  <Input
                    value={novoPonto}
                    onChange={(ev) => setNovoPonto(ev.target.value)}
                    placeholder="Ponto elétrico *"
                    className="w-40"
                    onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); adicionarIncidente(aberta); } }}
                  />
                  <Input
                    value={novoAlim}
                    onChange={(ev) => setNovoAlim(ev.target.value)}
                    placeholder="Alimentador *"
                    className="w-40"
                    onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); adicionarIncidente(aberta); } }}
                  />
                  <Button size="sm" onClick={() => adicionarIncidente(aberta)} disabled={salvando}>
                    <Plus className="mr-2 h-4 w-4" />Atribuir
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {aberta.incidentes.length === 0 && <span className="text-sm text-muted-foreground">Nenhum incidente atribuído</span>}
                  {aberta.incidentes.map((inc, idx) => {
                    const atual = idx === aberta.incidentes.length - 1;
                    return (
                      <span key={inc.numero}
                        className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold ${atual ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-500" : "bg-primary/10 text-primary"}`}>
                        {inc.numero}
                        {atual && <span className="rounded bg-emerald-600 px-1 text-[9px] font-bold text-white">ATUAL</span>}
                        <span className="font-normal opacity-80">· PE {inc.ponto_eletrico || "—"} · AL {inc.alimentador || "—"}</span>
                        <button className="ml-1 hover:text-destructive" onClick={() => removerIncidente(aberta, inc.numero)} title="Remover"><Trash2 className="h-3 w-3" /></button>
                      </span>
                    );
                  })}
                </div>
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

      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>Log de equipes, áreas e incidentes</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="w-56">
              <Label>Polo</Label>
              <Select value={logPolo} onValueChange={setLogPolo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {POLOS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="max-h-[60vh] overflow-auto">
              {logLoading ? (
                <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Quando</TableHead>
                      <TableHead>Equipe</TableHead>
                      <TableHead>Polo</TableHead>
                      <TableHead>Ação</TableHead>
                      <TableHead>De → Para</TableHead>
                      <TableHead>Incidente</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Sem registros</TableCell></TableRow>}
                    {logs.map(l => (
                      <TableRow key={l.id}>
                        <TableCell className="font-mono text-xs">{new Date(l.created_at).toLocaleString("pt-BR")}</TableCell>
                        <TableCell className="font-mono">{l.prefixo}</TableCell>
                        <TableCell>{l.polo}</TableCell>
                        <TableCell>{ACAO_LABEL[l.acao] ?? l.acao}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {(l.area_anterior ? AREA_LABEL[l.area_anterior as Area] : "—")} → {(l.area_nova ? AREA_LABEL[l.area_nova as Area] : "—")}
                        </TableCell>
                        <TableCell>{l.numero_incidente ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
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
