import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FileSpreadsheet, Upload, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { poloFromPrefixo, type Polo } from "@/lib/incidentes";

type IncidenteLite = {
  numero_incidente: string;
  prefixo: string;
  tipo: string;
  dados: Record<string, any>;
  created_at: string;
};

type Tipo = "ATENDIMENTO_INDIVIDUAL" | "ORDEM_2" | "IMPRODUTIVO";

type LinhaXlsx = {
  numero: string;
  equipe: string;
  causa: string;
  polo: Polo | null;
  tipo: Tipo | null;
  data: Date | null;
  observacao: string;
};

const TIPO_LABEL: Record<string, string> = {
  ATENDIMENTO_INDIVIDUAL: "Atendimento Individual",
  ORDEM_2: "Ordem 2",
  IMPRODUTIVO: "Improdutivo",
};

const TIPO_COR: Record<string, string> = {
  ATENDIMENTO_INDIVIDUAL: "hsl(217 91% 55%)",
  ORDEM_2: "hsl(199 89% 48%)",
  IMPRODUTIVO: "hsl(38 92% 50%)",
};

const TIPOS: Tipo[] = ["ATENDIMENTO_INDIVIDUAL", "ORDEM_2", "IMPRODUTIVO"];

const UTN: Polo[] = ["Campos", "Lagos", "Macaé", "Noroeste"];

const POLOS: Polo[] = ["Magé","Niterói","São Gonçalo","Serrana","Sul","Campos","Lagos","Macaé","Noroeste","Perdas"];

// Causas que caracterizam Improdutivo na planilha externa.
const CAUSAS_IMPRODUTIVO = [
  "CASA FECHADA",
  "DEFEITO INTERNO CLIENTE",
  "ENDERECO NAO LOCALIZADO",
  "ESTAVA NORMAL",
  "GRANDE CLIENTE DEFEITO INTERNO",
  "INCIDENCIA SEM AFETACAO",
  "LUZ CORTADA",
  "NIVEL DE TENSAO NORMAL",
  "OSCILACAO",
  "OSCILACAO PROVOCADA POR TERCEIROS",
  "OUTRAS CAUSAS DE TERCEIROS",
  "REGISTRO INDEVIDO DA RECLAMACAO",
  "UC FECHADA",
];

const RE_ORD2 = /ord(em)?\s*\.?\s*2/i;

function norm(s: any) {
  return String(s ?? "").trim();
}
// Chave de comparação: só dígitos e sem zeros à esquerda
// (o sistema grava "0029438039" / "DT29438039" e a planilha "29438039").
function normNum(s: any) {
  return norm(s).replace(/\D+/g, "").replace(/^0+/, "");
}

function normUp(s: any) {
  return norm(s).toUpperCase();
}
// Uppercase sem acentos, para comparar causas com segurança.
function flat(s: any) {
  return normUp(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

function parseData(v: any): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === "number") {
    // Serial de data do Excel (base 1899-12-30).
    const ms = Math.round((v - 25569) * 86400000);
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  const s = norm(v);
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) {
    const ano = Number(m[3].length === 2 ? "20" + m[3] : m[3]);
    return new Date(ano, Number(m[2]) - 1, Number(m[1]), Number(m[4] ?? 0), Number(m[5] ?? 0));
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function classificar(causa: string, cliAfMax: any, nt: any, ord2: any, obs: string): Tipo | null {
  const ord2Flag = ["SIM", "S", "X", "TRUE", "1"].includes(flat(ord2));
  if (ord2Flag || RE_ORD2.test(obs)) return "ORDEM_2";
  if (CAUSAS_IMPRODUTIVO.includes(flat(causa))) return "IMPRODUTIVO";
  const cli = Number(String(cliAfMax ?? "").replace(",", ".").replace(/[^\d.\-]/g, ""));
  if (cli === 1 && flat(nt).includes("BT")) return "ATENDIMENTO_INDIVIDUAL";
  return null;
}

export function CruzamentoImport({
  incidentes,
  dataDe,
  dataAte,
}: {
  incidentes: IncidenteLite[];
  dataDe?: string;
  dataAte?: string;
}) {
  const { role, adminPolo } = useAuth();
  const [open, setOpen] = useState(false);
  const [linhas, setLinhas] = useState<LinhaXlsx[]>([]);
  const [semData, setSemData] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [fPolos, setFPolos] = useState<string[]>([]);
  const [fUt, setFUt] = useState<"all" | "UTN" | "UTS">("all");
  const [fEquipe, setFEquipe] = useState<string>("");
  const [fTipo, setFTipo] = useState<string>("all");
  // Foco em Ordem 2 / Improdutivo: descarta Atendimento Individual de todo o cruzamento.
  const [semAtInd, setSemAtInd] = useState(false);
  const [drill, setDrill] = useState<
    | { titulo: string; headers: string[]; rows: (string | number)[][] }
    | null
  >(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFile = async (f: File) => {
    setErro(null);
    setFileName(f.name);
    try {
      const buf = await f.arrayBuffer();
      let wb: XLSX.WorkBook;
      if (/\.csv$/i.test(f.name) || f.type === "text/csv") {
        let text = new TextDecoder("utf-8").decode(buf);
        if (text.includes("\uFFFD")) text = new TextDecoder("windows-1252").decode(buf);
        const head = text.split(/\r?\n/)[0] ?? "";
        const FS = head.split(";").length > head.split(",").length ? ";" : ",";
        wb = XLSX.read(text, { type: "string", FS, raw: false, cellDates: true });
      } else {
        wb = XLSX.read(buf, { type: "array", cellDates: true });
      }
      const ws = wb.Sheets[wb.SheetNames[0]];
      const matrix = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "" }) as any[][];
      if (!matrix.length) throw new Error("Planilha vazia.");
      const norm2 = (s: any) => flat(s).replace(/\.$/, "").trim();
      const find = (cells: string[], alvos: string[]) =>
        cells.findIndex((c) => alvos.some((a) => c === a));
      const wantNum = ["NUMERO", "NUMERO", "N", "N INCIDENTE", "NUMERO INCIDENTE"];
      const wantEq = ["EQUIPE DESL", "EQUIPE", "PREFIXO"];
      const wantCa = ["CAUSA"];
      const wantCli = ["CLI AF MAX", "CLIAFMAX", "CLI AF MAX."];
      const wantNt = ["NT", "N T"];
      const wantOrd = ["ORD 2", "ORD2", "ORDEM 2", "ORDEM2"];
      const wantObs = ["OBSERVACAO", "OBSERVACOES", "OBS"];
      const wantData = ["DATA INICIO", "DATA DE INICIO", "DT INICIO", "INICIO"];

      let headerIdx = -1;
      let idxNum = -1, idxEq = -1, idxCa = -1, idxCli = -1, idxNt = -1, idxOrd = -1, idxObs = -1, idxData = -1;
      for (let i = 0; i < Math.min(matrix.length, 30); i++) {
        const cells = (matrix[i] ?? []).map(norm2);
        const iNum = find(cells, wantNum);
        const iEq = find(cells, wantEq);
        if (iNum >= 0 && iEq >= 0) {
          headerIdx = i;
          idxNum = iNum; idxEq = iEq;
          idxCa = find(cells, wantCa);
          idxCli = find(cells, wantCli);
          idxNt = find(cells, wantNt);
          idxOrd = find(cells, wantOrd);
          idxObs = find(cells, wantObs);
          idxData = find(cells, wantData);
          break;
        }
      }
      if (headerIdx < 0) {
        throw new Error(`Cabeçalho não encontrado. A planilha precisa conter ao menos as colunas "Número" e "Equipe Desl.".`);
      }
      const dados: LinhaXlsx[] = [];
      let nulos = 0;
      for (let i = headerIdx + 1; i < matrix.length; i++) {
        const row = matrix[i] ?? [];
        const numero = normNum(row[idxNum]);
        if (!numero) continue;
        const equipe = normUp(row[idxEq]);
        const causa = idxCa >= 0 ? norm(row[idxCa]) : "";
        const obs = idxObs >= 0 ? norm(row[idxObs]) : "";
        const data = idxData >= 0 ? parseData(row[idxData]) : null;
        if (!data) nulos++;
        dados.push({
          numero,
          equipe,
          causa,
          polo: poloFromPrefixo(equipe),
          observacao: obs,
          data,
          tipo: classificar(
            causa,
            idxCli >= 0 ? row[idxCli] : "",
            idxNt >= 0 ? row[idxNt] : "",
            idxOrd >= 0 ? row[idxOrd] : "",
            obs
          ),
        });
      }
      if (!dados.length) throw new Error("Nenhuma linha de dados encontrada após o cabeçalho.");
      setSemData(nulos);
      setLinhas(dados);
    } catch (e: any) {
      setLinhas([]);
      setErro(e?.message ?? "Erro ao ler planilha.");
    }
  };

  // Escopo por polo: ADMIN_POLO só vê o próprio; ADMIN_DISPATCH usa UT + multi-seleção.
  const polosDaUt = useMemo<Polo[]>(
    () => (fUt === "all" ? POLOS : POLOS.filter((p) => (fUt === "UTN" ? UTN.includes(p) : !UTN.includes(p)))),
    [fUt]
  );
  const polosAtivos = useMemo<Polo[]>(() => {
    if (role !== "ADMIN_DISPATCH") return adminPolo ? [adminPolo as Polo] : [];
    return fPolos.length ? (fPolos as Polo[]) : polosDaUt;
  }, [role, adminPolo, fPolos, polosDaUt]);
  const restringePolo = polosAtivos.length > 0 && polosAtivos.length < POLOS.length;

  const equipeQ = fEquipe.trim().toUpperCase();

  // Tipos exibidos nos gráficos/tabela conforme filtro de tipo e toggle.
  const tiposVisiveis = useMemo(
    () =>
      TIPOS.filter(
        (t) => !(semAtInd && t === "ATENDIMENTO_INDIVIDUAL") && (fTipo === "all" || fTipo === t)
      ),
    [semAtInd, fTipo]
  );

  const deTs = dataDe ? new Date(dataDe + "T00:00:00").getTime() : null;
  const ateTs = dataAte ? new Date(dataAte + "T23:59:59.999").getTime() : null;

  const incidentesEscopo = useMemo(() => {
    return incidentes.filter((i) => {
      if (semAtInd && i.tipo === "ATENDIMENTO_INDIVIDUAL") return false;
      if (fTipo !== "all" && i.tipo !== fTipo) return false;
      if (equipeQ && !i.prefixo.toUpperCase().includes(equipeQ)) return false;
      if (restringePolo) {
        const pi = poloFromPrefixo(i.prefixo);
        if (!pi || !polosAtivos.includes(pi)) return false;
      }
      return true;
    });
  }, [incidentes, fTipo, equipeQ, polosAtivos, restringePolo, semAtInd]);

  const linhasEscopo = useMemo(() => {
    return linhas.filter((l) => {
      if (semAtInd && l.tipo === "ATENDIMENTO_INDIVIDUAL") return false;
      if (equipeQ && !l.equipe.includes(equipeQ)) return false;
      if (restringePolo && (!l.polo || !polosAtivos.includes(l.polo))) return false;
      if (fTipo !== "all" && l.tipo !== fTipo) return false;

      // Período da aba de incidentes, aplicado pela coluna "Data Início".
      if (l.data) {
        const ts = l.data.getTime();
        if (deTs != null && ts < deTs) return false;
        if (ateTs != null && ts > ateTs) return false;
      }
      return true;
    });
  }, [linhas, equipeQ, polosAtivos, restringePolo, fTipo, deTs, ateTs, semAtInd]);

  const naoClassificadas = useMemo(() => linhasEscopo.filter((l) => !l.tipo), [linhasEscopo]);

  // Conjuntos de COMPARAÇÃO: nunca filtrados por tipo.
  // A classificação da planilha e a do sistema podem divergir para o mesmo
  // incidente; se o casamento usasse o filtro de tipo, um registro existente
  // apareceria como "faltando" (era a causa de 35 planilha / 31 sistema / 33 faltando).
  const incidentesMatch = useMemo(() => {
    return incidentes.filter((i) => {
      if (equipeQ && !i.prefixo.toUpperCase().includes(equipeQ)) return false;
      if (restringePolo) {
        const pi = poloFromPrefixo(i.prefixo);
        if (!pi || !polosAtivos.includes(pi)) return false;
      }
      return true;
    });
  }, [incidentes, equipeQ, polosAtivos, restringePolo]);

  const linhasMatch = useMemo(() => {
    return linhas.filter((l) => {
      if (equipeQ && !l.equipe.includes(equipeQ)) return false;
      if (restringePolo && (!l.polo || !polosAtivos.includes(l.polo))) return false;
      if (l.data) {
        const ts = l.data.getTime();
        if (deTs != null && ts < deTs) return false;
        if (ateTs != null && ts > ateTs) return false;
      }
      return true;
    });
  }, [linhas, equipeQ, polosAtivos, restringePolo, deTs, ateTs]);

  const sistemaMap = useMemo(() => {
    const m = new Map<string, IncidenteLite>();
    for (const i of incidentesMatch) {
      const k = normNum(i.numero_incidente);
      if (k && !m.has(k)) m.set(k, i);
    }
    return m;
  }, [incidentesMatch]);

  const xlsxMap = useMemo(() => {
    const m = new Map<string, LinhaXlsx>();
    for (const l of linhasMatch) if (l.numero && !m.has(l.numero)) m.set(l.numero, l);
    return m;
  }, [linhasMatch]);

  const faltantes = useMemo(
    () => linhasEscopo.filter((l) => !sistemaMap.has(l.numero)),
    [linhasEscopo, sistemaMap]
  );
  const extras = useMemo(
    () => incidentesEscopo.filter((i) => !xlsxMap.has(normNum(i.numero_incidente))),
    [incidentesEscopo, xlsxMap]
  );
  const divergencias = useMemo(() => {
    const out: {
      numero: string; equipe_xlsx: string; equipe_sis: string;
      causa_xlsx: string; causa_sis: string; tipo_xlsx: string; tipo_sis: string;
    }[] = [];
    for (const l of linhasEscopo) {
      const sis = sistemaMap.get(l.numero);
      if (!sis) continue;
      const causaSis = norm(
        sis.dados?.correlacaoDefeito || sis.dados?.correlacaoDefeitoOutro || sis.dados?.motivo
      );
      const eqSis = normUp(sis.prefixo);
      // Causas só são comparáveis para IMPRODUTIVO — os demais tipos usam
      // taxonomias diferentes entre o sistema e a planilha externa.
      const causaDif = sis.tipo === "IMPRODUTIVO" && l.tipo === "IMPRODUTIVO"
        && l.causa && causaSis && flat(l.causa) !== flat(causaSis);
      const eqDif = l.equipe && eqSis && l.equipe !== eqSis;
      const tipoDif = !!l.tipo && l.tipo !== sis.tipo;
      if (causaDif || eqDif || tipoDif) {
        out.push({
          numero: l.numero,
          equipe_xlsx: l.equipe,
          equipe_sis: eqSis,
          causa_xlsx: l.causa,
          causa_sis: causaSis,
          tipo_xlsx: l.tipo ? TIPO_LABEL[l.tipo] : "—",
          tipo_sis: TIPO_LABEL[sis.tipo] ?? sis.tipo,
        });
      }
    }
    return out;
  }, [linhasEscopo, sistemaMap]);

  // Comparativo de quantidade por equipe — foco principal do cruzamento.
  const porEquipe = useMemo(() => {
    const map = new Map<string, { sistema: number; xlsx: number }>();
    for (const i of incidentesEscopo) {
      const k = normUp(i.prefixo);
      if (!k) continue;
      const cur = map.get(k) ?? { sistema: 0, xlsx: 0 };
      cur.sistema++;
      map.set(k, cur);
    }
    for (const l of linhasEscopo) {
      const k = l.equipe;
      if (!k) continue;
      const cur = map.get(k) ?? { sistema: 0, xlsx: 0 };
      cur.xlsx++;
      map.set(k, cur);
    }
    return Array.from(map.entries())
      .map(([equipe, v]) => ({ equipe, ...v, dif: v.xlsx - v.sistema }))
      .sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif) || b.xlsx - a.xlsx);
  }, [incidentesEscopo, linhasEscopo]);

  const equipesFaltando = porEquipe.filter((e) => e.dif > 0);

  // Diagnóstico por polo: quanto da planilha está efetivamente no PontoScan.
  // "Sem polo" (prefixo não reconhecido) é ignorado a pedido da operação.
  const porPolo = useMemo(() => {
    type Row = {
      polo: string; planilha: number; sistema: number; faltando: number; encontrados: number;
      falta_ATENDIMENTO_INDIVIDUAL: number; falta_ORDEM_2: number; falta_IMPRODUTIVO: number;
      aderencia: number;
    };
    const map = new Map<string, Row>();
    const get = (p: string) =>
      map.get(p) ?? (map.set(p, {
        polo: p, planilha: 0, sistema: 0, faltando: 0, encontrados: 0,
        falta_ATENDIMENTO_INDIVIDUAL: 0, falta_ORDEM_2: 0, falta_IMPRODUTIVO: 0, aderencia: 0,
      }), map.get(p)!);

    for (const l of linhasEscopo) {
      if (!l.polo) continue;
      const r = get(l.polo);
      r.planilha++;
      if (sistemaMap.has(l.numero)) {
        r.encontrados++;
      } else {
        r.faltando++;
        if (l.tipo) r[`falta_${l.tipo}` as const]++;
      }
    }
    // "sistema" = total registrado no PontoScan no escopo (usa a classificação do
    // próprio sistema). É informativo; a conta que fecha é planilha = encontrados + faltando.
    for (const i of incidentesEscopo) {
      const p = poloFromPrefixo(i.prefixo);
      if (!p) continue;
      get(p).sistema++;
    }
    return Array.from(map.values())
      .map((r) => ({ ...r, aderencia: r.planilha ? Math.round((r.encontrados / r.planilha) * 100) : 0 }))
      .sort((a, b) => b.faltando - a.faltando || b.planilha - a.planilha);
  }, [linhasEscopo, incidentesEscopo, sistemaMap]);


  const abrirSistema = (equipe: string) => {
    const lista = incidentesEscopo.filter((i) => normUp(i.prefixo) === equipe);
    setDrill({
      titulo: `Sistema — ${equipe} (${lista.length})`,
      headers: ["Número", "Tipo", "Data", "Na planilha?"],
      rows: lista.map((i) => [
        i.numero_incidente,
        TIPO_LABEL[i.tipo] ?? i.tipo,
        new Date(i.created_at).toLocaleString("pt-BR"),
        xlsxMap.has(normNum(i.numero_incidente)) ? "Sim" : "Não",
      ]),
    });
  };

  const abrirPlanilha = (equipe: string) => {
    const lista = linhasEscopo.filter((l) => l.equipe === equipe);
    setDrill({
      titulo: `Planilha — ${equipe} (${lista.length})`,
      headers: ["Número", "Tipo (planilha)", "Causa", "Data Início", "No sistema?"],
      rows: lista.map((l) => [
        l.numero,
        l.tipo ? TIPO_LABEL[l.tipo] : "Não classificado",
        l.causa || "—",
        l.data ? l.data.toLocaleString("pt-BR") : "—",
        sistemaMap.has(l.numero) ? "Sim" : "Não",
      ]),
    });
  };

  const reset = () => {
    setLinhas([]);
    setErro(null);
    setFileName("");
    setSemData(0);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <FileSpreadsheet className="mr-2 h-4 w-4" />
        Importar planilha
      </Button>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cruzamento com planilha externa</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              Envie um arquivo <b>.xlsx</b> ou <b>.csv</b> com as colunas <b>Número</b>, <b>Equipe desl.</b>, <b>Causa</b>, <b>Cli Af Max</b>, <b>NT</b>, <b>Ord 2</b>, <b>Observação</b> e <b>Data Início</b>. O tipo é deduzido automaticamente: Ordem 2 (coluna Ord 2 = Sim ou menção na observação), Improdutivo (causa da lista padrão) e Atendimento Individual (Cli Af Max = 1 e NT = BT).
              <br />
              Comparando com {incidentesEscopo.length} de {incidentes.length} incidentes do período {dataDe || "—"} a {dataAte || "—"}.
              {role !== "ADMIN_DISPATCH" && adminPolo && (
                <> Escopo restrito ao polo <b>{adminPolo}</b>.</>
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.csv,text/csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
              />
              <Button size="sm" onClick={() => inputRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" />
                Escolher arquivo
              </Button>
              {fileName && <span className="text-xs text-muted-foreground truncate">{fileName}</span>}
              {linhas.length > 0 && (
                <Button variant="ghost" size="sm" onClick={reset}>Limpar</Button>
              )}
            </div>

            {role === "ADMIN_DISPATCH" && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Label className="text-xs">UT</Label>
                  {(["all", "UTN", "UTS"] as const).map((u) => (
                    <Button
                      key={u}
                      type="button"
                      size="sm"
                      variant={fUt === u ? "default" : "outline"}
                      onClick={() => { setFUt(u); setFPolos([]); }}
                    >
                      {u === "all" ? "Todas" : u}
                    </Button>
                  ))}
                </div>
                <div>
                  <Label className="text-xs">Polos (multi-seleção)</Label>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {polosDaUt.map((p) => {
                      const on = fPolos.includes(p);
                      return (
                        <Button
                          key={p}
                          type="button"
                          size="sm"
                          variant={on ? "default" : "outline"}
                          onClick={() =>
                            setFPolos((prev) => (on ? prev.filter((x) => x !== p) : [...prev, p]))
                          }
                        >
                          {p}
                        </Button>
                      );
                    })}
                    {fPolos.length > 0 && (
                      <Button type="button" size="sm" variant="ghost" onClick={() => setFPolos([])}>
                        Limpar
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label className="text-xs">Equipe (prefixo)</Label>
                <Input value={fEquipe} onChange={(e) => setFEquipe(e.target.value)} placeholder="Ex.: SG010" />
              </div>
              <div>
                <Label className="text-xs">Tipo (sistema e planilha)</Label>
                <Select value={fTipo} onValueChange={setFTipo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {!semAtInd && <SelectItem value="ATENDIMENTO_INDIVIDUAL">Atendimento Individual</SelectItem>}
                    <SelectItem value="ORDEM_2">Ordem 2</SelectItem>
                    <SelectItem value="IMPRODUTIVO">Improdutivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label className="text-xs">Desconsiderar Atendimento Individual</Label>
                <p className="text-[11px] text-muted-foreground">
                  Foca a análise em Ordem 2 e Improdutivos (remove os atendimentos individuais da planilha e do sistema).
                </p>
              </div>
              <Switch
                checked={semAtInd}
                onCheckedChange={(v) => {
                  setSemAtInd(v);
                  if (v && fTipo === "ATENDIMENTO_INDIVIDUAL") setFTipo("all");
                }}
              />
            </div>



            {erro && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{erro}</span>
              </div>
            )}

            {linhas.length > 0 && (
              <>
                {semData > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {semData} linha(s) sem "Data Início" legível foram mantidas no cruzamento.
                  </p>
                )}

                <div className="grid grid-cols-4 gap-2">
                  <StatCard label="Na planilha (período)" value={linhasEscopo.length} />
                  <StatCard label="Equipes com quantidade menor no sistema" value={equipesFaltando.length} tone="warn" />
                  <StatCard label="Faltantes no sistema" value={faltantes.length} tone="warn" />
                  <StatCard label="Com divergência" value={divergencias.length} tone="warn" />
                </div>

                <Tabs defaultValue="polos">
                  <TabsList>
                    <TabsTrigger value="polos">Diagnóstico por polo</TabsTrigger>
                    <TabsTrigger value="equipes">Detalhamento</TabsTrigger>
                  </TabsList>

                  <TabsContent value="polos" className="space-y-4">
                    <Section
                      title="Preenchimento do PontoScan por polo"
                      desc="Planilha = incidentes da planilha no escopo. No PontoScan = os que têm registro correspondente. Faltando = os que não têm. Planilha = No PontoScan + Faltando."
                    >
                      <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={porPolo} margin={{ top: 20, right: 8, bottom: 8, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="polo" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={54} />
                            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                            <Tooltip contentStyle={{ fontSize: 12 }} />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Bar dataKey="planilha" name="Planilha" fill="hsl(217 91% 55%)" radius={[4, 4, 0, 0]}>
                              <LabelList dataKey="planilha" position="top" style={{ fontSize: 10 }} />
                            </Bar>
                            <Bar dataKey="encontrados" name="No PontoScan" fill="hsl(152 55% 40%)" radius={[4, 4, 0, 0]}>
                              <LabelList dataKey="encontrados" position="top" style={{ fontSize: 10 }} />
                            </Bar>
                            <Bar dataKey="faltando" name="Faltando" fill="hsl(38 92% 50%)" radius={[4, 4, 0, 0]}>
                              <LabelList dataKey="faltando" position="top" style={{ fontSize: 10 }} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                    </Section>

                    <Section
                      title="Faltando por tipo e por polo"
                      desc={
                        semAtInd
                          ? "Quantidade de incidentes da planilha ausentes no PontoScan (apenas Ordem 2 e Improdutivo)."
                          : "Quantidade de incidentes da planilha ausentes no PontoScan, separados por tipo."
                      }
                    >
                      <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={porPolo} margin={{ top: 20, right: 8, bottom: 8, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="polo" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={54} />
                            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                            <Tooltip contentStyle={{ fontSize: 12 }} />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            {tiposVisiveis.map((t, idx) => (
                              <Bar
                                key={t}
                                stackId="f"
                                dataKey={`falta_${t}`}
                                name={TIPO_LABEL[t]}
                                fill={TIPO_COR[t]}
                                radius={idx === tiposVisiveis.length - 1 ? [4, 4, 0, 0] : undefined}
                              >
                                <LabelList
                                  dataKey={idx === tiposVisiveis.length - 1 ? "faltando" : `falta_${t}`}
                                  position={idx === tiposVisiveis.length - 1 ? "top" : "inside"}
                                  style={{ fontSize: 10, fill: idx === tiposVisiveis.length - 1 ? undefined : "#fff" }}
                                  formatter={(v: number) => (v ? v : "")}
                                />
                              </Bar>
                            ))}
                          </BarChart>

                        </ResponsiveContainer>
                      </div>
                    </Section>

                    <Section
                      title={`Tabela por polo (${porPolo.length})`}
                      desc="Aderência = No PontoScan ÷ Planilha. “Total PontoScan” é tudo que o polo registrou no escopo (pode ser maior que a planilha)."
                    >
                      {porPolo.length === 0 ? (
                        <Empty>Sem dados no escopo atual.</Empty>
                      ) : (
                        <Tabela
                          headers={[
                            "Polo", "Planilha", "No PontoScan", "Faltando",
                            ...tiposVisiveis.map((t) => `Falta ${TIPO_LABEL[t]}`),
                            "Total PontoScan", "Aderência",
                          ]}
                          rows={porPolo.map((p) => [
                            p.polo, p.planilha, p.encontrados, p.faltando,
                            ...tiposVisiveis.map((t) => p[`falta_${t}` as const]),
                            p.sistema,
                            `${p.aderencia}%`,
                          ])}
                        />
                      )}
                    </Section>
                  </TabsContent>

                  <TabsContent value="equipes" className="space-y-4">
                <Section
                  title={`Quantidade por equipe (${porEquipe.length})`}
                  desc="Clique em uma quantidade para ver os incidentes correspondentes. Diferença positiva indica registros que a equipe deveria ter feito no sistema e não fez."
                >
                  {porEquipe.length === 0 ? (
                    <Empty>Sem dados no escopo atual.</Empty>
                  ) : (
                    <div className="max-h-64 overflow-auto rounded-md border">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-muted">
                          <tr>
                            {["Equipe", "Sistema", "Planilha", "Diferença"].map((h) => (
                              <th key={h} className="p-2 text-left font-medium">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {porEquipe.map((e) => (
                            <tr key={e.equipe} className="border-t">
                              <td className="p-2">{e.equipe}</td>
                              <td className="p-2">
                                <button
                                  className="text-primary underline underline-offset-2 disabled:text-muted-foreground disabled:no-underline"
                                  disabled={e.sistema === 0}
                                  onClick={() => abrirSistema(e.equipe)}
                                >
                                  {e.sistema}
                                </button>
                              </td>
                              <td className="p-2">
                                <button
                                  className="text-primary underline underline-offset-2 disabled:text-muted-foreground disabled:no-underline"
                                  disabled={e.xlsx === 0}
                                  onClick={() => abrirPlanilha(e.equipe)}
                                >
                                  {e.xlsx}
                                </button>
                              </td>
                              <td className={`p-2 ${e.dif > 0 ? "font-semibold text-amber-600" : ""}`}>
                                {e.dif > 0 ? `+${e.dif}` : String(e.dif)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Section>

                <Section title={`Faltantes no sistema (${faltantes.length})`} desc="Presentes na planilha e sem registro no sistema.">
                  {faltantes.length === 0 ? (
                    <Empty>Nenhum incidente faltante.</Empty>
                  ) : (
                    <Tabela
                      headers={["Número", "Equipe (xlsx)", "Tipo (xlsx)", "Causa (xlsx)", "Data Início"]}
                      rows={faltantes.map((f) => [
                        f.numero,
                        f.equipe || "—",
                        f.tipo ? TIPO_LABEL[f.tipo] : "Não classificado",
                        f.causa || "—",
                        f.data ? f.data.toLocaleString("pt-BR") : "—",
                      ])}
                    />
                  )}
                </Section>

                <Section title={`Divergências (${divergencias.length})`} desc="Existem em ambos, mas equipe ou tipo difere — ou, para Improdutivo, a causa difere. Causas de Atendimento Individual e Ordem 2 não são comparadas (taxonomias distintas).">
                  {divergencias.length === 0 ? (
                    <Empty>Nenhuma divergência.</Empty>
                  ) : (
                    <Tabela
                      headers={["Número", "Tipo xlsx", "Tipo sistema", "Equipe xlsx", "Equipe sistema", "Causa xlsx", "Causa sistema"]}
                      rows={divergencias.map((d) => [
                        d.numero,
                        d.tipo_xlsx,
                        d.tipo_sis,
                        d.equipe_xlsx || "—",
                        d.equipe_sis || "—",
                        d.causa_xlsx || "—",
                        d.causa_sis || "—",
                      ])}
                    />
                  )}
                </Section>

                <Section title={`Extras no sistema (${extras.length})`} desc="Registrados no sistema e ausentes na planilha.">
                  {extras.length === 0 ? (
                    <Empty>Nenhum extra.</Empty>
                  ) : (
                    <Tabela
                      headers={["Número", "Tipo", "Equipe", "Data"]}
                      rows={extras.map((e) => [
                        e.numero_incidente,
                        TIPO_LABEL[e.tipo] ?? e.tipo,
                        e.prefixo,
                        new Date(e.created_at).toLocaleString("pt-BR"),
                      ])}
                    />
                  )}
                </Section>

                <Section title={`Não classificados na planilha (${naoClassificadas.length})`} desc="Linhas que não se encaixam em Ordem 2, Improdutivo nem Atendimento Individual pelas regras definidas.">
                  {naoClassificadas.length === 0 ? (
                    <Empty>Todas as linhas foram classificadas.</Empty>
                  ) : (
                    <Tabela
                      headers={["Número", "Equipe", "Causa", "Data Início"]}
                      rows={naoClassificadas.map((l) => [
                        l.numero,
                        l.equipe || "—",
                        l.causa || "—",
                        l.data ? l.data.toLocaleString("pt-BR") : "—",
                      ])}
                    />
                  )}
                </Section>
                </TabsContent>
                </Tabs>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
        <DialogContent className="max-h-[80vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{drill?.titulo}</DialogTitle>
          </DialogHeader>
          {drill && (drill.rows.length ? (
            <Tabela headers={drill.headers} rows={drill.rows} />
          ) : (
            <Empty>Nenhum incidente.</Empty>
          ))}
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <div className={`rounded-md border p-3 ${tone === "warn" && value > 0 ? "border-amber-400/60 bg-amber-50 dark:bg-amber-950/20" : ""}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div>
        <p className="font-semibold">{title}</p>
        {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border p-3 text-center text-xs text-muted-foreground">{children}</div>;
}

function Tabela({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <div className="max-h-64 overflow-auto rounded-md border">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-muted">
          <tr>
            {headers.map((h) => (
              <th key={h} className="p-2 text-left font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t">
              {r.map((c, j) => <td key={j} className="p-2 align-top">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}