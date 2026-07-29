import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileSpreadsheet, Upload, AlertCircle } from "lucide-react";

type IncidenteLite = {
  numero_incidente: string;
  prefixo: string;
  tipo: string;
  dados: Record<string, any>;
  created_at: string;
};

type LinhaXlsx = { numero: string; equipe: string; causa: string };

const TIPO_LABEL: Record<string, string> = {
  ATENDIMENTO_INDIVIDUAL: "Atendimento Individual",
  ORDEM_2: "Ordem 2",
  IMPRODUTIVO: "Improdutivo",
};

function norm(s: any) {
  return String(s ?? "").trim();
}
function normNum(s: any) {
  return norm(s).replace(/\D+/g, "");
}
function normUp(s: any) {
  return norm(s).toUpperCase();
}

function pickCol(row: Record<string, any>, alvos: string[]): string {
  const keys = Object.keys(row);
  for (const alvo of alvos) {
    const k = keys.find(
      (kk) => kk.trim().toLowerCase().replace(/\.$/, "") === alvo.toLowerCase()
    );
    if (k) return k;
  }
  return "";
}

export function CruzamentoImport({ incidentes }: { incidentes: IncidenteLite[] }) {
  const [open, setOpen] = useState(false);
  const [linhas, setLinhas] = useState<LinhaXlsx[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  const onFile = async (f: File) => {
    setErro(null);
    setFileName(f.name);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      // Lê como matriz e detecta a linha de cabeçalho (planilha traz título nas 1-2 primeiras linhas)
      const matrix = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "" }) as any[][];
      if (!matrix.length) throw new Error("Planilha vazia.");
      const wantNum = ["número", "numero", "nº", "n°"];
      const wantEq = ["equipe desl", "equipe desl.", "equipe", "prefixo"];
      const wantCa = ["causa"];
      const norm2 = (s: any) => String(s ?? "").trim().toLowerCase().replace(/\.$/, "");
      let headerIdx = -1;
      let idxNum = -1, idxEq = -1, idxCa = -1;
      for (let i = 0; i < Math.min(matrix.length, 30); i++) {
        const row = matrix[i] ?? [];
        const cells = row.map(norm2);
        const iNum = cells.findIndex((c) => wantNum.includes(c));
        const iEq = cells.findIndex((c) => wantEq.includes(c));
        const iCa = cells.findIndex((c) => wantCa.includes(c));
        if (iNum >= 0 && iEq >= 0 && iCa >= 0) {
          headerIdx = i; idxNum = iNum; idxEq = iEq; idxCa = iCa; break;
        }
      }
      if (headerIdx < 0) {
        throw new Error(`Cabeçalho não encontrado. A planilha precisa conter as colunas "Número", "Equipe Desl." e "Causa".`);
      }
      const dados: LinhaXlsx[] = [];
      for (let i = headerIdx + 1; i < matrix.length; i++) {
        const row = matrix[i] ?? [];
        const numero = normNum(row[idxNum]);
        if (!numero) continue;
        dados.push({
          numero,
          equipe: normUp(row[idxEq]),
          causa: norm(row[idxCa]),
        });
      }
      if (!dados.length) throw new Error("Nenhuma linha de dados encontrada após o cabeçalho.");
      setLinhas(dados);
    } catch (e: any) {
      setLinhas([]);
      setErro(e?.message ?? "Erro ao ler planilha.");
    }
  };

  const sistemaMap = useMemo(() => {
    const m = new Map<string, IncidenteLite>();
    for (const i of incidentes) {
      const k = normNum(i.numero_incidente);
      if (k && !m.has(k)) m.set(k, i);
    }
    return m;
  }, [incidentes]);

  const xlsxMap = useMemo(() => {
    const m = new Map<string, LinhaXlsx>();
    for (const l of linhas) if (l.numero && !m.has(l.numero)) m.set(l.numero, l);
    return m;
  }, [linhas]);

  const faltantes = useMemo(
    () => linhas.filter((l) => !sistemaMap.has(l.numero)),
    [linhas, sistemaMap]
  );
  const extras = useMemo(
    () => incidentes.filter((i) => !xlsxMap.has(normNum(i.numero_incidente))),
    [incidentes, xlsxMap]
  );
  const divergencias = useMemo(() => {
    const out: { numero: string; equipe_xlsx: string; equipe_sis: string; causa_xlsx: string; causa_sis: string; tipo: string }[] = [];
    for (const l of linhas) {
      const sis = sistemaMap.get(l.numero);
      if (!sis) continue;
      const causaSis = norm(
        sis.dados?.correlacaoDefeito || sis.dados?.correlacaoDefeitoOutro || sis.dados?.motivo
      );
      const eqSis = normUp(sis.prefixo);
      const causaDif = l.causa && causaSis && normUp(l.causa) !== normUp(causaSis);
      const eqDif = l.equipe && eqSis && l.equipe !== eqSis;
      if (causaDif || eqDif) {
        out.push({
          numero: l.numero,
          equipe_xlsx: l.equipe,
          equipe_sis: eqSis,
          causa_xlsx: l.causa,
          causa_sis: causaSis,
          tipo: TIPO_LABEL[sis.tipo] ?? sis.tipo,
        });
      }
    }
    return out;
  }, [linhas, sistemaMap]);

  const reset = () => {
    setLinhas([]);
    setErro(null);
    setFileName("");
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
              Envie um arquivo <b>.xlsx</b> contendo as colunas <b>Número</b>, <b>Equipe desl.</b> e <b>Causa</b>. O sistema compara com os incidentes atualmente carregados na aba ({incidentes.length} incidente(s)).
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls"
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

            {erro && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{erro}</span>
              </div>
            )}

            {linhas.length > 0 && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <StatCard label="Na planilha" value={linhas.length} />
                  <StatCard label="Faltantes no sistema" value={faltantes.length} tone="warn" />
                  <StatCard label="Com divergência" value={divergencias.length} tone="warn" />
                </div>

                <Section title={`Faltantes no sistema (${faltantes.length})`} desc="Presentes na planilha e sem registro no sistema.">
                  {faltantes.length === 0 ? (
                    <Empty>Nenhum incidente faltante.</Empty>
                  ) : (
                    <Tabela
                      headers={["Número", "Equipe (xlsx)", "Causa (xlsx)"]}
                      rows={faltantes.map((f) => [f.numero, f.equipe || "—", f.causa || "—"])}
                    />
                  )}
                </Section>

                <Section title={`Divergências (${divergencias.length})`} desc="Existem em ambos, mas equipe e/ou causa diferem.">
                  {divergencias.length === 0 ? (
                    <Empty>Nenhuma divergência.</Empty>
                  ) : (
                    <Tabela
                      headers={["Número", "Tipo", "Equipe xlsx", "Equipe sistema", "Causa xlsx", "Causa sistema"]}
                      rows={divergencias.map((d) => [
                        d.numero,
                        d.tipo,
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
              </>
            )}
          </div>
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
