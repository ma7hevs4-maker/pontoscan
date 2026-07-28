import { useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ChevronLeft, Camera, ImageIcon, X, User, Users, MinusCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { poloFromPrefixo, poloFromGeo } from "@/lib/incidentes";
import { getPosition } from "@/lib/geo";

type TipoIncidente = "ATENDIMENTO_INDIVIDUAL" | "ORDEM_2" | "IMPRODUTIVO";

async function submitIncidente(args: {
  tipo: TipoIncidente;
  numero: string;
  dados: Record<string, any>;
  fotos: File[];
  userId: string;
  prefixo: string;
  polo: string;
}): Promise<void> {
  let lat: number | null = null, lng: number | null = null;
  try {
    const pos = await getPosition();
    lat = pos.coords.latitude; lng = pos.coords.longitude;
  } catch { /* GPS opcional */ }

  const poloPrefixo = poloFromPrefixo(args.prefixo);
  const poloGeo = await poloFromGeo(lat, lng);

  // Upload fotos primeiro (pasta = userId, para bater com RLS do storage)
  const paths: string[] = [];
  for (let i = 0; i < args.fotos.length; i++) {
    const f = args.fotos[i];
    const ext = (f.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
    const path = `${args.userId}/${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from("incidentes-fotos").upload(path, f, { contentType: f.type || "image/jpeg", upsert: false });
    if (error) throw new Error(`Falha ao enviar foto ${i + 1}: ${error.message}`);
    paths.push(path);
  }

  const { error: iErr } = await (supabase as any).from("incidentes").insert({
    usuario_id: args.userId,
    prefixo: args.prefixo,
    polo_eletricista: args.polo,
    polo_prefixo: poloPrefixo,
    polo_geo: poloGeo,
    origem: "INSOURCING",
    tipo: args.tipo,
    numero_incidente: args.numero,
    latitude: lat,
    longitude: lng,
    dados: args.dados,
    fotos: paths,
  });
  if (iErr) throw new Error(iErr.message);
}

export function IncidenteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [tipo, setTipo] = useState<TipoIncidente | null>(null);

  const reset = () => setTipo(null);
  const close = () => { onOpenChange(false); setTimeout(reset, 300); };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        {!tipo ? (
          <>
            <DialogHeader>
              <DialogTitle>Registrar incidente</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">Selecione o tipo de atendimento:</p>
            <div className="grid gap-3">
              <TipoButton icon={<User className="h-6 w-6" />} label="Atendimento Individual" onClick={() => setTipo("ATENDIMENTO_INDIVIDUAL")} />
              <TipoButton icon={<Users className="h-6 w-6" />} label="Ordem 2" onClick={() => setTipo("ORDEM_2")} />
              <TipoButton icon={<MinusCircle className="h-6 w-6" />} label="Improdutivo" onClick={() => setTipo("IMPRODUTIVO")} />
            </div>
          </>
        ) : tipo === "ATENDIMENTO_INDIVIDUAL" ? (
          <AtendimentoIndividualForm onBack={reset} onDone={close} />
        ) : tipo === "ORDEM_2" ? (
          <Ordem2Form onBack={reset} onDone={close} />
        ) : tipo === "IMPRODUTIVO" ? (
          <ImprodutivoForm onBack={reset} onDone={close} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function TipoButton({ icon, label, onClick, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-3 rounded-xl border-2 border-primary/30 bg-primary/5 p-4 text-left font-semibold text-primary transition hover:bg-primary/10 disabled:opacity-50"
    >
      {icon}
      <span className="flex-1">{label}</span>
      {disabled && <span className="text-xs font-normal text-muted-foreground">em breve</span>}
    </button>
  );
}

/* ---------- Atendimento Individual ---------- */

type AIForm = {
  numeroIncidente: string;
  tipoRede: string; tipoRedeOutro: string;
  tipoConexao: string; tipoConexaoOutro: string;
  caixaDae: string;
  materialRamal: string;
  bitolaRamal: string; bitolaRamalOutro: string;
  tipoRamal: string;
  tipoDisjuntor: string; tipoDisjuntorOutro: string;
  noKirchhoff: string;
  medicao: string;
  correlacaoDefeito: string; correlacaoDefeitoOutro: string;
};

const emptyAI: AIForm = {
  numeroIncidente: "",
  tipoRede: "", tipoRedeOutro: "",
  tipoConexao: "", tipoConexaoOutro: "",
  caixaDae: "",
  materialRamal: "",
  bitolaRamal: "", bitolaRamalOutro: "",
  tipoRamal: "",
  tipoDisjuntor: "", tipoDisjuntorOutro: "",
  noKirchhoff: "",
  medicao: "",
  correlacaoDefeito: "", correlacaoDefeitoOutro: "",
};

function AtendimentoIndividualForm({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const { user, profile } = useAuth();
  const [f, setF] = useState<AIForm>(emptyAI);
  const [fotos, setFotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const set = <K extends keyof AIForm>(k: K, v: AIForm[K]) => setF(prev => ({ ...prev, [k]: v }));

  const numeroValido = /^[A-Z0-9]{10}$/.test(f.numeroIncidente);

  const validar = (): string | null => {
    if (!numeroValido) return "Nº Incidente deve ter 10 caracteres (letras maiúsculas e números)";
    if (!f.tipoRede) return "Selecione o Tipo de Rede";
    if (f.tipoRede === "Outro" && !f.tipoRedeOutro.trim()) return "Preencha o 'Outro' de Tipo de Rede";
    if (!f.tipoConexao) return "Selecione o Tipo de conexão";
    if (f.tipoConexao === "Outro" && !f.tipoConexaoOutro.trim()) return "Preencha o 'Outro' de Tipo de conexão";
    if (!f.caixaDae) return "Selecione a condição da caixa DAE";
    if (!f.materialRamal) return "Selecione o Material do ramal";
    if (!f.bitolaRamal) return "Selecione a Bitola do ramal";
    if (f.bitolaRamal === "Outro" && !f.bitolaRamalOutro.trim()) return "Preencha o 'Outro' de Bitola";
    if (!f.tipoRamal) return "Selecione o Tipo de ramal";
    if (!f.tipoDisjuntor) return "Selecione o Tipo de disjuntor";
    if (f.tipoDisjuntor === "Outro" && !f.tipoDisjuntorOutro.trim()) return "Preencha o 'Outro' de Disjuntor";
    if (!f.noKirchhoff) return "Informe se é Nó de Kirchhoff";
    if (!f.medicao) return "Selecione a condição da medição";
    if (!f.correlacaoDefeito) return "Selecione a correlação do último defeito";
    if (f.correlacaoDefeito === "Outro" && !f.correlacaoDefeitoOutro.trim()) return "Preencha o 'Outro' de correlação";
    if (fotos.length === 0) return "Anexe ao menos uma evidência (foto)";
    return null;
  };

  const submit = async () => {
    const err = validar();
    if (err) { toast.error(err); return; }
    setSubmitting(true);
    try {
      await submitIncidente({
        tipo: "ATENDIMENTO_INDIVIDUAL",
        numero: f.numeroIncidente,
        dados: f,
        fotos,
        userId: user!.id,
        prefixo: profile!.prefixo,
        polo: profile!.polo,
      });
      toast.success(`Incidente ${f.numeroIncidente} registrado`);
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao registrar incidente");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}><ChevronLeft className="h-5 w-5" /></Button>
          <DialogTitle>Atendimento Individual</DialogTitle>
        </div>
      </DialogHeader>

      <div className="space-y-5">
        <Field label="Nº Incidente" required>
          <Input
            value={f.numeroIncidente}
            onChange={(e) => set("numeroIncidente", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))}
            placeholder="10 caracteres (A-Z, 0-9)"
            className="font-mono uppercase"
            autoCapitalize="characters"
            inputMode="text"
          />
          <p className={`text-xs ${numeroValido ? "text-green-700" : "text-muted-foreground"}`}>
            {f.numeroIncidente.length}/10
          </p>
        </Field>

        <RadioField label="Tipo de Rede" required value={f.tipoRede} onChange={(v) => set("tipoRede", v)}
          options={["Pré-reunida", "Aberta"]}
          outroValue={f.tipoRedeOutro} onOutroChange={(v) => set("tipoRedeOutro", v)}
        />

        <RadioField label="Qual o tipo de conexão do cliente na rede" required value={f.tipoConexao} onChange={(v) => set("tipoConexao", v)}
          options={["Conector perfurante", "Charrua", "Caixa Dae", "Enel Chip"]}
          outroValue={f.tipoConexaoOutro} onOutroChange={(v) => set("tipoConexaoOutro", v)}
        />

        <RadioField label="Em que condições está a caixa DAE" required value={f.caixaDae} onChange={(v) => set("caixaDae", v)}
          options={["Não possui caixa DAE", "Fechada Padrão", "Aberta", "Aberta sem tampa", "Deteriorada aberta", "Deteriorada fechada", "Excesso de ligação na caixa"]}
        />

        <RadioField label="Qual o material do ramal?" required value={f.materialRamal} onChange={(v) => set("materialRamal", v)}
          options={["Cobre", "Alumínio"]}
        />

        <RadioField label="Bitola do Ramal" required value={f.bitolaRamal} onChange={(v) => set("bitolaRamal", v)}
          options={["6 mm", "10 mm", "16 mm", "25 mm", "35 mm"]}
          outroValue={f.bitolaRamalOutro} onOutroChange={(v) => set("bitolaRamalOutro", v)}
        />

        <RadioField label="Qual o tipo de ramal do cliente?" required value={f.tipoRamal} onChange={(v) => set("tipoRamal", v)}
          options={["Aberto", "Pré-reunido", "Concêntrico", "Próprio"]}
        />

        <RadioField label="Qual o tipo de disjuntor do cliente" required value={f.tipoDisjuntor} onChange={(v) => set("tipoDisjuntor", v)}
          options={["40A", "50A", "63A", "70A", "100A", "200A"]}
          outroValue={f.tipoDisjuntorOutro} onOutroChange={(v) => set("tipoDisjuntorOutro", v)}
        />

        <RadioField label="Nó de Kirchhoff" required value={f.noKirchhoff} onChange={(v) => set("noKirchhoff", v)}
          options={["Sim", "Não"]}
        />

        <RadioField label="Como está a medição do cliente" required value={f.medicao} onChange={(v) => set("medicao", v)}
          options={["Dentro do Padrão", "Aberta", "Caixa Suja", "Caixa de Ferro", "Borne Queimado"]}
        />

        <RadioField label="A que você correlaciona o último defeito do cliente" required value={f.correlacaoDefeito} onChange={(v) => set("correlacaoDefeito", v)}
          options={[
            "Problemas na conexão da rede",
            "Problemas no bornes do medidor",
            "Problemas na conexão do disjuntor",
            "Problemas na instalação do medidor",
            "Caixa de passagem (Defeito interno do Cliente)",
            "Ramal de entrada não compatível com o medidor",
          ]}
          outroValue={f.correlacaoDefeitoOutro} onOutroChange={(v) => set("correlacaoDefeitoOutro", v)}
        />

        <EvidenciasPicker fotos={fotos} onChange={setFotos} />

        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={onBack} disabled={submitting}>Cancelar</Button>
          <Button className="flex-1" onClick={submit} disabled={submitting}>
            {submitting ? "Enviando…" : "Enviar"}
          </Button>
        </div>
      </div>
    </>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}

function RadioField({
  label, required, value, onChange, options, outroValue, onOutroChange,
}: {
  label: string; required?: boolean; value: string; onChange: (v: string) => void;
  options: string[]; outroValue?: string; onOutroChange?: (v: string) => void;
}) {
  const showOutro = onOutroChange !== undefined;
  return (
    <Field label={label} required={required}>
      <RadioGroup value={value} onValueChange={onChange} className="gap-2">
        {options.map((opt) => (
          <label key={opt} className="flex items-center gap-2 rounded-md border p-2 text-sm">
            <RadioGroupItem value={opt} id={`${label}-${opt}`} />
            <span>{opt}</span>
          </label>
        ))}
        {showOutro && (
          <div className="flex items-center gap-2 rounded-md border p-2">
            <RadioGroupItem value="Outro" id={`${label}-outro`} />
            <Label htmlFor={`${label}-outro`} className="text-sm">Outro:</Label>
            <Input
              value={outroValue ?? ""}
              onChange={(e) => { onOutroChange!(e.target.value); if (value !== "Outro") onChange("Outro"); }}
              className="h-8 flex-1"
              placeholder="especifique"
            />
          </div>
        )}
      </RadioGroup>
    </Field>
  );
}

function EvidenciasPicker({ fotos, onChange, label = "Insira as evidências (foto do medidor, conexões dos bornes, conexão na rede, etc)" }: { fotos: File[]; onChange: (f: File[]) => void; label?: string }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);

  const add = (list: FileList | null) => {
    if (!list) return;
    const arr = Array.from(list).filter(f => f.type.startsWith("image/"));
    onChange([...fotos, ...arr]);
  };
  const remove = (i: number) => onChange(fotos.filter((_, idx) => idx !== i));

  const previews = useMemo(() => fotos.map(f => ({ url: URL.createObjectURL(f), name: f.name })), [fotos]);

  return (
    <Field label={label} required>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" onClick={() => cameraRef.current?.click()} className="h-12">
          <Camera className="mr-2 h-5 w-5" /> Câmera
        </Button>
        <Button type="button" variant="outline" onClick={() => albumRef.current?.click()} className="h-12">
          <ImageIcon className="mr-2 h-5 w-5" /> Álbum
        </Button>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      <input ref={albumRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => { add(e.target.files); e.target.value = ""; }} />

      {previews.length > 0 && (
        <div className="grid grid-cols-3 gap-2 pt-2">
          {previews.map((p, i) => (
            <div key={i} className="relative aspect-square overflow-hidden rounded-md border">
              <img src={p.url} alt={p.name} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => remove(i)}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
                aria-label="Remover"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">{fotos.length} foto(s) anexada(s)</p>
    </Field>
  );
}

/* ---------- Nº Incidente input (shared) ---------- */

function NumeroIncidenteField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const valido = /^[A-Z0-9]{10}$/.test(value);
  return (
    <Field label="Nº Incidente" required>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))}
        placeholder="10 caracteres (A-Z, 0-9)"
        className="font-mono uppercase"
        autoCapitalize="characters"
        inputMode="text"
      />
      <p className={`text-xs ${valido ? "text-green-700" : "text-muted-foreground"}`}>{value.length}/10</p>
    </Field>
  );
}

/* ---------- Ordem 2 ---------- */

function Ordem2Form({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [numero, setNumero] = useState("");
  const [motivo, setMotivo] = useState("");
  const [observacao, setObservacao] = useState("");
  const [fotos, setFotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!/^[A-Z0-9]{10}$/.test(numero)) return toast.error("Nº Incidente deve ter 10 caracteres (A-Z, 0-9)");
    if (!motivo) return toast.error("Selecione o motivo");
    if (fotos.length === 0) return toast.error("Anexe ao menos uma foto no Registro Fotográfico");
    setSubmitting(true);
    try {
      console.log("[Incidente/Ordem2]", { numero, motivo, observacao }, fotos);
      toast.success(`Ordem 2 ${numero} registrada (envio ao backend em breve)`);
      onDone();
    } finally { setSubmitting(false); }
  };

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}><ChevronLeft className="h-5 w-5" /></Button>
          <DialogTitle>Ordem 2</DialogTitle>
        </div>
      </DialogHeader>
      <div className="space-y-5">
        <NumeroIncidenteField value={numero} onChange={setNumero} />
        <RadioField label="Motivo" required value={motivo} onChange={setMotivo}
          options={["Necessário Cesto Aéreo", "Necessário poda", "Gerar OSM"]} />
        <Field label="Observação">
          <Textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={4} placeholder="Texto de resposta longa" />
        </Field>
        <EvidenciasPicker label="Registro Fotográfico" fotos={fotos} onChange={setFotos} />
        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={onBack} disabled={submitting}>Cancelar</Button>
          <Button className="flex-1" onClick={submit} disabled={submitting}>{submitting ? "Enviando…" : "Enviar"}</Button>
        </div>
      </div>
    </>
  );
}

/* ---------- Improdutivo ---------- */

const IMPRODUTIVO_MOTIVOS = [
  "CASA FECHADA",
  "DEFEITO INTERNO CLIENTE",
  "ENDEREÇO NÃO LOCALIZADO",
  "ESTAVA NORMAL",
  "GRANDE CLIENTE DEFEITO INTERNO",
  "INCIDENCIA SEM AFETAÇÃO",
  "LUZ CORTADA",
  "NIVEL DE TENSÃO NORMAL",
  "OSCILAÇÃO",
  "OSCILAÇÃO PROVOCADA POR TERCEIROS",
  "OUTRAS CAUSAS DE TERCEIROS",
  "REGISTRO INDEVIDO DA RECLAMAÇÃO",
];

function ImprodutivoForm({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [numero, setNumero] = useState("");
  const [motivo, setMotivo] = useState("");
  const [observacao, setObservacao] = useState("");
  const [fotos, setFotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!/^[A-Z0-9]{10}$/.test(numero)) return toast.error("Nº Incidente deve ter 10 caracteres (A-Z, 0-9)");
    if (!motivo) return toast.error("Selecione o motivo");
    if (fotos.length === 0) return toast.error("Anexe ao menos uma foto na Evidência Fotográfica");
    setSubmitting(true);
    try {
      console.log("[Incidente/Improdutivo]", { numero, motivo, observacao }, fotos);
      toast.success(`Improdutivo ${numero} registrado (envio ao backend em breve)`);
      onDone();
    } finally { setSubmitting(false); }
  };

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}><ChevronLeft className="h-5 w-5" /></Button>
          <DialogTitle>Improdutivo</DialogTitle>
        </div>
      </DialogHeader>
      <div className="space-y-5">
        <NumeroIncidenteField value={numero} onChange={setNumero} />
        <RadioField label="Motivo" required value={motivo} onChange={setMotivo} options={IMPRODUTIVO_MOTIVOS} />
        <Field label="Observação">
          <Textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={4} placeholder="Texto de resposta longa" />
        </Field>
        <EvidenciasPicker label="Evidência Fotográfica" fotos={fotos} onChange={setFotos} />
        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={onBack} disabled={submitting}>Cancelar</Button>
          <Button className="flex-1" onClick={submit} disabled={submitting}>{submitting ? "Enviando…" : "Enviar"}</Button>
        </div>
      </div>
    </>
  );
}