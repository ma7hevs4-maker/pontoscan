import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ChevronLeft, Camera, ImageIcon, X, User, Users, MinusCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useFotosEnabled } from "@/hooks/use-fotos-enabled";
import { useAuth } from "@/lib/auth-context";
import { poloFromPrefixo, poloFromGeo } from "@/lib/incidentes";
import { getPosition } from "@/lib/geo";
import { loadFormQuestions, loadFormTipos, visibleQuestions, type FormQuestion, type FormTipo, type TipoIncidente as TipoIncidenteConfig } from "@/lib/form-config";
import { compressImages } from "@/lib/image-compress";

type TipoIncidente = TipoIncidenteConfig;

export type IncidenteActor =
  | { mode: "insourcing"; userId: string; prefixo: string; polo: string }
  | { mode: "parceira"; prefixo: string; nome: string; parceira: string };

function fileToDataUrl(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });
}

async function submitIncidente(args: {
  tipo: TipoIncidente;
  numero: string;
  dados: Record<string, any>;
  fotos: File[];
  actor: IncidenteActor;
  extraFotos?: { key: string; files: File[] }[];
}): Promise<void> {
  let lat: number | null = null, lng: number | null = null;
  try {
    const pos = await getPosition();
    lat = pos.coords.latitude; lng = pos.coords.longitude;
  } catch { /* GPS opcional */ }

  if (args.actor.mode === "parceira") {
    const fotos = await Promise.all(args.fotos.map(fileToDataUrl));
    const dadosExtras: Record<string, any> = { ...args.dados };
    for (const g of args.extraFotos ?? []) {
      dadosExtras[g.key] = await Promise.all(g.files.map(fileToDataUrl));
    }
    const res = await fetch("/api/public/incidente-parceira", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prefixo: args.actor.prefixo,
        nome: args.actor.nome,
        parceira: args.actor.parceira,
        tipo: args.tipo,
        numero: args.numero,
        dados: dadosExtras,
        fotos,
        latitude: lat,
        longitude: lng,
      }),
    });
    if (!res.ok) throw new Error(await res.text().catch(() => "Falha ao enviar"));
    return;
  }

  const poloPrefixo = poloFromPrefixo(args.actor.prefixo);
  const poloGeo = await poloFromGeo(lat, lng);

  // Upload fotos primeiro (pasta = userId, para bater com RLS do storage)
  const paths: string[] = [];
  for (let i = 0; i < args.fotos.length; i++) {
    const f = args.fotos[i];
    const ext = (f.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
    const path = `${args.actor.userId}/${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from("incidentes-fotos").upload(path, f, { contentType: f.type || "image/jpeg", upsert: false });
    if (error) throw new Error(`Falha ao enviar foto ${i + 1}: ${error.message}`);
    paths.push(path);
  }

  const dadosFinal: Record<string, any> = { ...args.dados };
  for (const g of args.extraFotos ?? []) {
    const gPaths: string[] = [];
    for (let i = 0; i < g.files.length; i++) {
      const f = g.files[i];
      const ext = (f.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
      const path = `${args.actor.userId}/${g.key}_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("incidentes-fotos").upload(path, f, { contentType: f.type || "image/jpeg", upsert: false });
      if (error) throw new Error(`Falha ao enviar ${g.key} ${i + 1}: ${error.message}`);
      gPaths.push(path);
    }
    dadosFinal[g.key] = gPaths;
  }

  const { error: iErr } = await (supabase as any).from("incidentes").insert({
    usuario_id: args.actor.userId,
    prefixo: args.actor.prefixo,
    polo_eletricista: args.actor.polo,
    polo_prefixo: poloPrefixo,
    polo_geo: poloGeo,
    origem: "INSOURCING",
    tipo: args.tipo,
    numero_incidente: args.numero,
    latitude: lat,
    longitude: lng,
    dados: dadosFinal,
    fotos: paths,
  });
  if (iErr) throw new Error(iErr.message);
}

const FOTOS_LABEL: Record<string, string> = {
  ATENDIMENTO_INDIVIDUAL: "Insira as evidências (foto do medidor, conexões dos bornes, conexão na rede, etc)",
  ORDEM_2: "Registro Fotográfico",
  IMPRODUTIVO: "Evidência Fotográfica",
};

function iconeTipo(chave: string) {
  if (chave === "ORDEM_2") return <Users className="h-6 w-6" />;
  if (chave === "IMPRODUTIVO") return <MinusCircle className="h-6 w-6" />;
  return <User className="h-6 w-6" />;
}

export function IncidenteDialog({ open, onOpenChange, actor: actorProp }: { open: boolean; onOpenChange: (o: boolean) => void; actor?: IncidenteActor }) {
  const [tipo, setTipo] = useState<TipoIncidente | null>(null);
  const [tipos, setTipos] = useState<FormTipo[]>([]);
  const auth = useAuth();
  const actor: IncidenteActor | null = actorProp
    ?? (auth.user && auth.profile
      ? { mode: "insourcing", userId: auth.user.id, prefixo: auth.profile.prefixo, polo: auth.profile.polo }
      : null);

  useEffect(() => {
    if (!open) return;
    loadFormTipos(true).then(setTipos).catch(() => setTipos([]));
  }, [open]);

  const reset = () => setTipo(null);
  const close = () => { onOpenChange(false); setTimeout(reset, 300); };
  const tipoSel = tipos.find((t) => t.chave === tipo);

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        {!actor ? (
          <p className="text-sm text-muted-foreground">Sessão indisponível.</p>
        ) : !tipo || !tipoSel ? (
          <>
            <DialogHeader>
              <DialogTitle>Registrar incidente</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">Selecione o tipo de atendimento:</p>
            <div className="grid gap-3">
              {tipos.map((t) => (
                <TipoButton key={t.chave} icon={iconeTipo(t.chave)} label={t.rotulo} onClick={() => setTipo(t.chave)} />
              ))}
              {tipos.length === 0 && (
                <p className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
                  Nenhum tipo de incidente disponível.
                </p>
              )}
            </div>
          </>
        ) : (
          <DynamicForm
            tipo={tipoSel.chave}
            title={tipoSel.rotulo}
            fotosLabel={FOTOS_LABEL[tipoSel.chave] ?? "Registro Fotográfico"}
            successMsg={(n) => `${tipoSel.rotulo} ${n} registrado`}
            actor={actor}
            onBack={reset}
            onDone={close}
            withLigacaoCliente={tipoSel.chave === "IMPRODUTIVO"}
          />
        )}
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


function validarExtras(qs: FormQuestion[], vals: Record<string, string>): string | null {
  for (const q of visibleQuestions(qs, vals)) {
    const v = (vals[q.chave] ?? "").trim();
    if (q.obrigatoria && !v) return `Preencha: ${q.rotulo}`;
    if (q.campo_tipo === "choice" && q.permite_outro && v === "Outro") {
      const outro = (vals[`${q.chave}Outro`] ?? "").trim();
      if (!outro) return `Preencha o "Outro" de: ${q.rotulo}`;
    }
  }
  return null;
}

/** Remove respostas de perguntas que ficaram ocultas (o eletricista trocou a resposta do pai). */
function limparOcultas(qs: FormQuestion[], vals: Record<string, string>): Record<string, string> {
  const visiveis = new Set(visibleQuestions(qs, vals).map((q) => q.chave));
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(vals)) {
    const base = k.endsWith("Outro") ? k.slice(0, -5) : k;
    const q = qs.find((x) => x.chave === base);
    if (q && !visiveis.has(q.chave)) continue;
    out[k] = v;
  }
  return out;
}

function ExtrasRenderer({
  questions, values, onChange,
}: {
  questions: FormQuestion[];
  values: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
}) {
  const visiveis = visibleQuestions(questions, values);
  if (!visiveis.length) return null;
  const set = (k: string, v: string) => onChange({ ...values, [k]: v });
  return (
    <div className="space-y-5">
      {visiveis.map((q) => (
        <Field key={q.id} label={q.rotulo} required={q.obrigatoria}>

          {q.campo_tipo === "text" && (
            <Input value={values[q.chave] ?? ""} onChange={(e) => set(q.chave, e.target.value)} placeholder="Texto de resposta" />
          )}
          {q.campo_tipo === "textarea" && (
            <Textarea rows={4} value={values[q.chave] ?? ""} onChange={(e) => set(q.chave, e.target.value)} placeholder="Texto de resposta longa" />
          )}
          {q.campo_tipo === "choice" && (
            <RadioGroup value={values[q.chave] ?? ""} onValueChange={(v) => set(q.chave, v)} className="gap-2">
              {q.opcoes.map((op) => (
                <label key={op} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                  <RadioGroupItem value={op} id={`${q.id}-${op}`} />
                  <span>{op}</span>
                </label>
              ))}
              {q.permite_outro && (
                <div className="flex items-center gap-2 rounded-md border p-2">
                  <RadioGroupItem value="Outro" id={`${q.id}-outro`} />
                  <Label htmlFor={`${q.id}-outro`} className="text-sm">Outro:</Label>
                  <Input
                    value={values[`${q.chave}Outro`] ?? ""}
                    onChange={(e) => {
                      const next = { ...values, [`${q.chave}Outro`]: e.target.value };
                      if (values[q.chave] !== "Outro") next[q.chave] = "Outro";
                      onChange(next);
                    }}
                    className="h-8 flex-1"
                    placeholder="especifique"
                  />
                </div>
              )}
            </RadioGroup>
          )}
        </Field>
      ))}
    </div>
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

  const add = async (list: FileList | null) => {
    if (!list) return;
    const arr = Array.from(list).filter(f => f.type.startsWith("image/"));
    if (!arr.length) return;
    const comp = await compressImages(arr);
    onChange([...fotos, ...comp]);
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

function PrintLigacaoPicker({ fotos, onChange }: { fotos: File[]; onChange: (f: File[]) => void }) {
  const albumRef = useRef<HTMLInputElement>(null);
  const add = async (list: FileList | null) => {
    if (!list) return;
    const arr = Array.from(list).filter(f => f.type.startsWith("image/"));
    if (!arr.length) return;
    const comp = await compressImages(arr);
    onChange([...fotos, ...comp]);
  };
  const remove = (i: number) => onChange(fotos.filter((_, idx) => idx !== i));
  const previews = useMemo(() => fotos.map(f => ({ url: URL.createObjectURL(f), name: f.name })), [fotos]);
  return (
    <Field label="Print da ligação para o cliente" required>
      <Button type="button" variant="outline" onClick={() => albumRef.current?.click()} className="h-12 w-full">
        <ImageIcon className="mr-2 h-5 w-5" /> Álbum
      </Button>
      <input ref={albumRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      {previews.length > 0 && (
        <div className="grid grid-cols-3 gap-2 pt-2">
          {previews.map((p, i) => (
            <div key={i} className="relative aspect-square overflow-hidden rounded-md border">
              <img src={p.url} alt={p.name} className="h-full w-full object-cover" />
              <button type="button" onClick={() => remove(i)} className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white" aria-label="Remover">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">{fotos.length} print(s) anexado(s)</p>
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


function DynamicForm({
  tipo, title, fotosLabel, successMsg, actor, onBack, onDone, withLigacaoCliente,
}: {
  tipo: TipoIncidente;
  title: string;
  fotosLabel: string;
  successMsg: (n: string) => string;
  actor: IncidenteActor;
  onBack: () => void;
  onDone: () => void;
  withLigacaoCliente?: boolean;
}) {
  const [numero, setNumero] = useState("");
  const [fotos, setFotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [questions, setQuestions] = useState<FormQuestion[]>([]);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [ligacaoCliente, setLigacaoCliente] = useState("");
  const fotosEnabled = useFotosEnabled();
  const [printLigacao, setPrintLigacao] = useState<File[]>([]);

  useEffect(() => {
    loadFormQuestions(tipo).then((qs) => { setQuestions(qs); setLoading(false); });
  }, [tipo]);

  const submit = async () => {
    if (!/^[A-Z0-9]{10}$/.test(numero)) return toast.error("Nº Incidente deve ter 10 caracteres (A-Z, 0-9)");
    const err = validarExtras(questions, vals);
    if (err) return toast.error(err);
    if (withLigacaoCliente) {
      if (!ligacaoCliente) return toast.error("Informe se foi efetuada ligação para o cliente");
      if (fotosEnabled && ligacaoCliente === "Sim" && printLigacao.length === 0) return toast.error("Anexe o print da ligação para o cliente");
    }
    if (fotosEnabled && fotos.length === 0) return toast.error(`Anexe ao menos uma foto em ${fotosLabel}`);
    setSubmitting(true);
    try {
      const dados: Record<string, any> = { ...vals };
      if (withLigacaoCliente) dados.ligacaoCliente = ligacaoCliente;
      await submitIncidente({
        tipo,
        numero,
        dados,
        fotos: fotosEnabled ? fotos : [],
        actor,
        extraFotos: fotosEnabled && withLigacaoCliente && ligacaoCliente === "Sim"
          ? [{ key: "ligacaoPrint", files: printLigacao }]
          : [],
      });
      toast.success(successMsg(numero));
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao registrar incidente");
    } finally { setSubmitting(false); }
  };

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}><ChevronLeft className="h-5 w-5" /></Button>
          <DialogTitle>{title}</DialogTitle>
        </div>
      </DialogHeader>
      <div className="space-y-5">
        <NumeroIncidenteField value={numero} onChange={setNumero} />
        {loading ? (
          <p className="text-xs text-muted-foreground">Carregando perguntas…</p>
        ) : (
          <ExtrasRenderer questions={questions} values={vals} onChange={setVals} />
        )}
        {withLigacaoCliente && (
          <>
            <Field label="Foi efetuada ligação para o cliente?" required>
              <RadioGroup value={ligacaoCliente} onValueChange={setLigacaoCliente} className="gap-2">
                {["Sim", "Não"].map((opt) => (
                  <label key={opt} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                    <RadioGroupItem value={opt} id={`lig-${opt}`} />
                    <span>{opt}</span>
                  </label>
                ))}
              </RadioGroup>
            </Field>
            {fotosEnabled && ligacaoCliente === "Sim" && (
              <PrintLigacaoPicker fotos={printLigacao} onChange={setPrintLigacao} />
            )}
          </>
        )}
        {fotosEnabled && <EvidenciasPicker label={fotosLabel} fotos={fotos} onChange={setFotos} />}
        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={onBack} disabled={submitting}>Cancelar</Button>
          <Button className="flex-1" onClick={submit} disabled={submitting}>{submitting ? "Enviando…" : "Enviar"}</Button>
        </div>
      </div>
    </>
  );
}