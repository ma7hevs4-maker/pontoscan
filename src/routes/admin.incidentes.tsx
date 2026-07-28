import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPin, ImageOff, Image as ImgIcon, Download, Radio } from "lucide-react";
import { TIPO_LABEL, signedPhotoUrl } from "@/lib/incidentes";

export const Route = createFileRoute("/admin/incidentes")({ component: IncidentesFeed });

const POLOS = ["Magé","Niterói","São Gonçalo","Serrana","Sul","Campos","Lagos","Macaé","Noroeste","Perdas"] as const;

type Incidente = {
  id: string;
  usuario_id: string | null;
  prefixo: string;
  polo_eletricista: string | null;
  polo_prefixo: string | null;
  polo_geo: string | null;
  origem: "INSOURCING" | "PARCEIRA";
  tipo: "ATENDIMENTO_INDIVIDUAL" | "ORDEM_2" | "IMPRODUTIVO";
  numero_incidente: string;
  latitude: number | null;
  longitude: number | null;
  dados: Record<string, any>;
  fotos: string[];
  created_at: string;
  parceira: string | null;
  nome_colaborador: string | null;
};

function IncidentesFeed() {
  const { role, adminPolo } = useAuth();
  const [rows, setRows] = useState<Incidente[]>([]);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [novosIds, setNovosIds] = useState<Set<string>>(new Set());
  const [aoVivo, setAoVivo] = useState(false);
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState<string>("all");
  const [origem, setOrigem] = useState<string>("all");
  const [polo, setPolo] = useState<string>("all");
  const hoje = new Date().toISOString().slice(0, 10);
  const trintaDias = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [dataDe, setDataDe] = useState<string>(trintaDias);
  const [dataAte, setDataAte] = useState<string>(hoje);
  const [detalhe, setDetalhe] = useState<Incidente | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("incidentes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    const list = (data as Incidente[]) ?? [];
    setRows(list);
    const ids = Array.from(new Set(list.map(r => r.usuario_id).filter(Boolean))) as string[];
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, nome").in("id", ids);
      const map: Record<string, string> = {};
      (profs ?? []).forEach((p: any) => { map[p.id] = p.nome; });
      setNomes(map);
    } else {
      setNomes({});
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel("admin-incidentes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "incidentes" }, async (payload) => {
        const novo = payload.new as Incidente;
        // Evita duplicatas se o INSERT vier antes do reload inicial
        setRows((prev) => (prev.some((r) => r.id === novo.id) ? prev : [novo, ...prev]));
        setNovosIds((prev) => {
          const next = new Set(prev);
          next.add(novo.id);
          return next;
        });
        // Busca o nome do colaborador vinculado, se houver
        if (novo.usuario_id && !nomes[novo.usuario_id]) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("id, nome")
            .eq("id", novo.usuario_id)
            .maybeSingle();
          if (prof) setNomes((m) => ({ ...m, [prof.id]: (prof as any).nome }));
        }
        // Pequeno "beep" visual: pisca o indicador
        setAoVivo(true);
        setTimeout(() => setAoVivo(false), 1200);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const abrirDetalhe = (inc: Incidente) => {
    setDetalhe(inc);
    if (novosIds.has(inc.id)) {
      setNovosIds((prev) => {
        const next = new Set(prev);
        next.delete(inc.id);
        return next;
      });
    }
  };

  const marcarTodosVistos = () => setNovosIds(new Set());

  const filtradas = useMemo(() => {
    const q = busca.trim().toUpperCase();
    const deTs = dataDe ? new Date(dataDe + "T00:00:00").getTime() : null;
    const ateTs = dataAte ? new Date(dataAte + "T23:59:59.999").getTime() : null;
    return rows.filter(r => {
      if (tipo !== "all" && r.tipo !== tipo) return false;
      if (origem !== "all" && r.origem !== origem) return false;
      if (polo !== "all") {
        if (r.polo_eletricista !== polo && r.polo_prefixo !== polo && r.polo_geo !== polo) return false;
      }
      const ts = new Date(r.created_at).getTime();
      if (deTs != null && ts < deTs) return false;
      if (ateTs != null && ts > ateTs) return false;
      if (q) {
        const nome = ((r.usuario_id && nomes[r.usuario_id]) || r.nome_colaborador || "").toUpperCase();
        if (!r.numero_incidente.includes(q) && !r.prefixo.toUpperCase().includes(q) && !nome.includes(q) && !(r.parceira ?? "").toUpperCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, busca, tipo, origem, polo, dataDe, dataAte, nomes]);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <Label>Buscar (nº ou prefixo)</Label>
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nº, prefixo ou nome" />
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="ATENDIMENTO_INDIVIDUAL">Atendimento Individual</SelectItem>
                <SelectItem value="ORDEM_2">Ordem 2</SelectItem>
                <SelectItem value="IMPRODUTIVO">Improdutivo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Origem</Label>
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
              <Label>Polo</Label>
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
            <Label>De</Label>
            <Input type="date" value={dataDe} onChange={(e) => setDataDe(e.target.value)} />
          </div>
          <div>
            <Label>Até</Label>
            <Input type="date" value={dataAte} onChange={(e) => setDataAte(e.target.value)} />
          </div>
          <div className="flex items-end justify-between gap-2 md:col-span-2">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className={`relative inline-flex h-2 w-2 rounded-full ${aoVivo ? "bg-primary" : "bg-emerald-500"}`}>
                  <span className={`absolute inset-0 rounded-full ${aoVivo ? "bg-primary" : "bg-emerald-500"} opacity-75 animate-ping`} />
                </span>
                Ao vivo
              </span>
              <span>·</span>
              <span>{role === "ADMIN_POLO" ? `Polo: ${adminPolo}` : "Todos os polos"} · {filtradas.length} incidente(s)</span>
              {novosIds.size > 0 && (
                <>
                  <span>·</span>
                  <button onClick={marcarTodosVistos} className="text-primary underline underline-offset-2 hover:opacity-80">
                    {novosIds.size} novo(s) — marcar como visto
                  </button>
                </>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => exportarCSV(filtradas, nomes)} disabled={filtradas.length === 0}>
              <Download className="mr-2 h-4 w-4" />Exportar CSV
            </Button>
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : filtradas.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">Nenhum incidente encontrado.</Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtradas.map(inc => (
            <IncidenteCard key={inc.id} inc={inc} isNovo={novosIds.has(inc.id)} nome={inc.usuario_id ? nomes[inc.usuario_id] : (inc.nome_colaborador ?? undefined)} onOpen={() => abrirDetalhe(inc)} />
          ))}
        </div>
      )}

      <IncidenteDetalhe inc={detalhe} nome={detalhe?.usuario_id ? nomes[detalhe.usuario_id] : (detalhe?.nome_colaborador ?? undefined)} onClose={() => setDetalhe(null)} />
    </div>
  );
}

function IncidenteCard({ inc, nome, onOpen, isNovo }: { inc: Incidente; nome?: string; onOpen: () => void; isNovo?: boolean }) {
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (inc.fotos?.[0]) {
      signedPhotoUrl(inc.fotos[0]).then(u => { if (alive) setThumb(u); });
    }
    return () => { alive = false; };
  }, [inc.id]);

  const date = new Date(inc.created_at).toLocaleString("pt-BR");
  const gmaps = inc.latitude != null && inc.longitude != null
    ? `https://www.google.com/maps?q=${inc.latitude},${inc.longitude}`
    : null;

  return (
    <Card className={`overflow-hidden transition-shadow ${isNovo ? "ring-2 ring-primary shadow-lg" : ""}`}>
      <button onClick={onOpen} className="block w-full text-left">
        <div className="relative aspect-video bg-muted">
          {isNovo && (
            <span className="absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground shadow">
              <Radio className="h-3 w-3 animate-pulse" /> Novo
            </span>
          )}
          {thumb ? (
            <img src={thumb} alt="Evidência" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              {inc.fotos?.length ? <ImgIcon className="h-8 w-8 animate-pulse" /> : <ImageOff className="h-8 w-8" />}
            </div>
          )}
          {inc.fotos?.length > 1 && (
            <span className="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
              +{inc.fotos.length - 1} foto(s)
            </span>
          )}
        </div>
        <div className="space-y-2 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-sm font-bold">{inc.numero_incidente}</span>
            <Badge variant={inc.origem === "INSOURCING" ? "default" : "secondary"}>
              {inc.origem === "INSOURCING" ? "Insourcing" : (inc.parceira ?? "Parceira")}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            <p><b>{TIPO_LABEL[inc.tipo]}</b></p>
            <p>Colaborador: <span className="font-medium text-foreground">{nome ?? "—"}</span></p>
            <p>Equipe: <span className="font-mono">{inc.prefixo}</span></p>
            <p>{date}</p>
          </div>
        </div>
      </button>
      <div className="border-t p-2">
        {gmaps ? (
          <a href={gmaps} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
            <Button variant="outline" size="sm" className="w-full">
              <MapPin className="mr-2 h-4 w-4" />Ver no mapa
            </Button>
          </a>
        ) : (
          <Button variant="outline" size="sm" className="w-full" disabled>
            <MapPin className="mr-2 h-4 w-4" />Sem GPS
          </Button>
        )}
      </div>
    </Card>
  );
}

function IncidenteDetalhe({ inc, nome, onClose }: { inc: Incidente | null; nome?: string; onClose: () => void }) {
  const [urls, setUrls] = useState<string[]>([]);
  const [ligacaoUrls, setLigacaoUrls] = useState<string[]>([]);
  useEffect(() => {
    if (!inc) { setUrls([]); setLigacaoUrls([]); return; }
    Promise.all(inc.fotos.map(p => signedPhotoUrl(p, 3600))).then(us => setUrls(us.filter(Boolean) as string[]));
    const lp = (inc.dados as any)?.ligacaoPrint;
    const arr: string[] = Array.isArray(lp) ? lp : [];
    Promise.all(arr.map(p => p?.startsWith("data:") ? Promise.resolve(p) : signedPhotoUrl(p, 3600)))
      .then(us => setLigacaoUrls(us.filter(Boolean) as string[]));
  }, [inc?.id]);

  if (!inc) return null;
  const gmaps = inc.latitude != null && inc.longitude != null
    ? `https://www.google.com/maps?q=${inc.latitude},${inc.longitude}`
    : null;

  return (
    <Dialog open={!!inc} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{TIPO_LABEL[inc.tipo]} · {inc.numero_incidente}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <Info label="Colaborador" value={nome ?? "—"} />
            <Info label="Equipe" value={inc.prefixo} mono />
            <Info label="Origem" value={inc.origem === "INSOURCING" ? "Insourcing" : `Parceira · ${inc.parceira ?? "—"}`} />
            <Info label="Polo (eletricista)" value={inc.polo_eletricista ?? "—"} />
            <Info label="Polo (prefixo)" value={inc.polo_prefixo ?? "—"} />
            <Info label="Polo (GPS)" value={inc.polo_geo ?? "—"} />
            <Info label="Data/hora" value={new Date(inc.created_at).toLocaleString("pt-BR")} />
          </div>

          {gmaps && (
            <a href={gmaps} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm">
                <MapPin className="mr-2 h-4 w-4" />Abrir no Google Maps ({inc.latitude?.toFixed(5)}, {inc.longitude?.toFixed(5)})
              </Button>
            </a>
          )}

          <div>
            <p className="mb-2 font-semibold">Respostas do formulário</p>
            <div className="divide-y rounded-md border">
              {Object.entries(inc.dados ?? {}).filter(([k, v]) => v !== "" && v != null && k !== "ligacaoPrint").map(([k, v]) => (
                <div key={k} className="grid grid-cols-3 gap-2 p-2 text-xs">
                  <div className="col-span-1 font-medium text-muted-foreground">{fieldLabel(k)}</div>
                  <div className="col-span-2 break-words">{String(v)}</div>
                </div>
              ))}
            </div>
          </div>

          {ligacaoUrls.length > 0 && (
            <div>
              <p className="mb-2 font-semibold">Print da ligação ({ligacaoUrls.length})</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {ligacaoUrls.map((u, i) => (
                  <a key={i} href={u} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border">
                    <img src={u} alt={`Print ligação ${i + 1}`} className="aspect-square w-full object-cover" />
                  </a>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 font-semibold">Fotos ({inc.fotos.length})</p>
            {urls.length === 0 ? (
              <div className="flex justify-center p-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {urls.map((u, i) => (
                  <a key={i} href={u} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border">
                    <img src={u} alt={`Foto ${i + 1}`} className="aspect-square w-full object-cover" />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-sm font-medium ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function fieldLabel(k: string): string {
  const map: Record<string, string> = {
    numeroIncidente: "Nº Incidente",
    tipoRede: "Tipo de Rede", tipoRedeOutro: "Tipo de Rede (outro)",
    tipoConexao: "Tipo de conexão", tipoConexaoOutro: "Tipo de conexão (outro)",
    caixaDae: "Caixa DAE",
    materialRamal: "Material do ramal",
    bitolaRamal: "Bitola do ramal", bitolaRamalOutro: "Bitola (outro)",
    tipoRamal: "Tipo de ramal",
    tipoDisjuntor: "Tipo de disjuntor", tipoDisjuntorOutro: "Disjuntor (outro)",
    noKirchhoff: "Nó de Kirchhoff",
    medicao: "Medição",
    correlacaoDefeito: "Correlação do defeito", correlacaoDefeitoOutro: "Correlação (outro)",
    motivo: "Motivo",
    observacao: "Observação",
  };
  return map[k] ?? k;
}

function escapeCSV(v: string): string {
  const s = String(v ?? "").replace(/\r?\n/g, " ");
  if (/[";\n]/.test(s)) return `"${s.replace(/"/g, "\"\"")}"`;
  return s;
}

function exportarCSV(incidentes: Incidente[], nomes: Record<string, string>) {
  const dadosKeys = Array.from(new Set(incidentes.flatMap(i => Object.keys(i.dados ?? {})))).filter(k => k !== "ligacaoPrint");
  const headers = [
    "Data/Hora", "Tipo", "Nº Incidente", "Origem", "Parceira", "Colaborador",
    "Equipe", "Polo (eletricista)", "Polo (prefixo)", "Polo (GPS)", "Latitude", "Longitude",
    ...dadosKeys.map(fieldLabel),
  ];
  const rows = incidentes.map(i => {
    const nome = i.usuario_id ? nomes[i.usuario_id] : (i.nome_colaborador ?? "");
    const base = [
      new Date(i.created_at).toLocaleString("pt-BR"),
      TIPO_LABEL[i.tipo],
      i.numero_incidente,
      i.origem,
      i.parceira ?? "",
      nome,
      i.prefixo,
      i.polo_eletricista ?? "",
      i.polo_prefixo ?? "",
      i.polo_geo ?? "",
      i.latitude ?? "",
      i.longitude ?? "",
    ];
    const dados = dadosKeys.map(k => i.dados?.[k] ?? "");
    return [...base, ...dados].map(escapeCSV).join(";");
  });
  const csv = [headers.map(escapeCSV).join(";"), ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `incidentes_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}