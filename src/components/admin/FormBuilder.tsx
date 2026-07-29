import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowUp, ArrowDown, Plus, Save, Trash2, Loader2, X } from "lucide-react";
import {
  loadAllFormQuestions,
  slugifyChave,
  type CampoTipo,
  type FormQuestion,
  type TipoIncidente,
} from "@/lib/form-config";

type Draft = Omit<FormQuestion, "id"> & { id: string | null; dirty?: boolean };

const TIPOS: { key: TipoIncidente; label: string }[] = [
  { key: "ATENDIMENTO_INDIVIDUAL", label: "Atendimento Individual" },
  { key: "ORDEM_2", label: "Ordem 2" },
  { key: "IMPRODUTIVO", label: "Improdutivo" },
];

export function FormBuilder({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [tab, setTab] = useState<TipoIncidente>("ATENDIMENTO_INDIVIDUAL");
  const [drafts, setDrafts] = useState<Record<TipoIncidente, Draft[]>>({
    ATENDIMENTO_INDIVIDUAL: [], ORDEM_2: [], IMPRODUTIVO: [],
  });
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      const all = await loadAllFormQuestions();
      const d: Record<TipoIncidente, Draft[]> = { ATENDIMENTO_INDIVIDUAL: [], ORDEM_2: [], IMPRODUTIVO: [] };
      for (const t of TIPOS) {
        d[t.key] = (all[t.key] ?? []).map((q) => ({ ...q, id: q.id, dirty: false }));
      }
      setDrafts(d);
      setRemovedIds([]);
      setLoading(false);
    })();
  }, [open]);

  const current = drafts[tab];

  const updateOne = (idx: number, patch: Partial<Draft>) => {
    setDrafts((prev) => {
      const arr = [...prev[tab]];
      arr[idx] = { ...arr[idx], ...patch, dirty: true };
      return { ...prev, [tab]: arr };
    });
  };

  const move = (idx: number, dir: -1 | 1) => {
    setDrafts((prev) => {
      const arr = [...prev[tab]];
      const j = idx + dir;
      if (j < 0 || j >= arr.length) return prev;
      [arr[idx], arr[j]] = [arr[j], arr[idx]];
      arr.forEach((q, i) => { q.ordem = i; q.dirty = true; });
      return { ...prev, [tab]: arr };
    });
  };

  const remove = (idx: number) => {
    setDrafts((prev) => {
      const arr = [...prev[tab]];
      const [gone] = arr.splice(idx, 1);
      arr.forEach((q, i) => { q.ordem = i; q.dirty = true; });
      if (gone.id) setRemovedIds((r) => [...r, gone.id!]);
      return { ...prev, [tab]: arr };
    });
  };

  const add = () => {
    setDrafts((prev) => {
      const arr = [...prev[tab]];
      arr.push({
        id: null,
        tipo: tab,
        chave: "",
        rotulo: "",
        campo_tipo: "text",
        opcoes: [],
        obrigatoria: false,
        permite_outro: false,
        ordem: arr.length,
        ativa: true,
        dirty: true,
      });
      return { ...prev, [tab]: arr };
    });
  };

  const validate = (): string | null => {
    const chavesPorTipo = new Map<string, Set<string>>();
    for (const t of TIPOS) {
      const set = new Set<string>();
      for (const q of drafts[t.key]) {
        if (!q.rotulo.trim()) return `[${t.label}] Rótulo obrigatório`;
        const chave = q.chave.trim() || slugifyChave(q.rotulo);
        if (!chave) return `[${t.label}] Chave inválida em "${q.rotulo}"`;
        if (set.has(chave)) return `[${t.label}] Chave duplicada: ${chave}`;
        set.add(chave);
        if (q.campo_tipo === "choice" && q.opcoes.filter((o) => o.trim()).length < 2) {
          return `[${t.label}] "${q.rotulo}" precisa de ao menos 2 opções`;
        }
      }
      chavesPorTipo.set(t.key, set);
    }
    return null;
  };

  const save = async () => {
    const err = validate();
    if (err) return toast.error(err);
    setSaving(true);
    try {
      if (removedIds.length) {
        const { error } = await (supabase as any).from("form_questions").delete().in("id", removedIds);
        if (error) throw new Error(error.message);
      }
      for (const t of TIPOS) {
        for (const q of drafts[t.key]) {
          if (!q.dirty) continue;
          const chave = (q.chave.trim() || slugifyChave(q.rotulo)).slice(0, 48);
          const opcoes = q.campo_tipo === "choice" ? q.opcoes.map((o) => o.trim()).filter(Boolean) : [];
          const payload = {
            tipo: t.key,
            chave,
            rotulo: q.rotulo.trim(),
            campo_tipo: q.campo_tipo,
            opcoes,
            obrigatoria: q.obrigatoria,
            permite_outro: q.campo_tipo === "choice" ? q.permite_outro : false,
            ordem: q.ordem,
            ativa: q.ativa,
          };
          if (q.id) {
            const { error } = await (supabase as any).from("form_questions").update(payload).eq("id", q.id);
            if (error) throw new Error(error.message);
          } else {
            const { error } = await (supabase as any).from("form_questions").insert(payload);
            if (error) throw new Error(error.message);
          }
        }
      }
      toast.success("Formulários salvos");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const dirtyCount = useMemo(() => {
    let n = removedIds.length;
    for (const t of TIPOS) n += drafts[t.key].filter((q) => q.dirty).length;
    return n;
  }, [drafts, removedIds]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Construtor de formulários</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Adicione perguntas extras por tipo de incidente. O núcleo estruturado (Nº do incidente, GPS, fotos e print da ligação) continua fixo — as perguntas abaixo aparecem após ele para eletricistas e parceiras.
        </p>

        {loading ? (
          <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(v as TipoIncidente)}>
            <TabsList className="w-full">
              {TIPOS.map((t) => (
                <TabsTrigger key={t.key} value={t.key} className="flex-1">
                  {t.label} <span className="ml-1 text-xs text-muted-foreground">({drafts[t.key].length})</span>
                </TabsTrigger>
              ))}
            </TabsList>

            {TIPOS.map((t) => (
              <TabsContent key={t.key} value={t.key} className="space-y-3">
                {current.length === 0 && (
                  <p className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
                    Nenhuma pergunta extra em {t.label}.
                  </p>
                )}
                {tab === t.key && current.map((q, idx) => (
                  <QuestionCard
                    key={q.id ?? `new-${idx}`}
                    q={q}
                    onChange={(patch) => updateOne(idx, patch)}
                    onUp={idx > 0 ? () => move(idx, -1) : undefined}
                    onDown={idx < current.length - 1 ? () => move(idx, 1) : undefined}
                    onRemove={() => remove(idx)}
                  />
                ))}
                {tab === t.key && (
                  <Button variant="outline" onClick={add} className="w-full">
                    <Plus className="mr-2 h-4 w-4" /> Adicionar pergunta
                  </Button>
                )}
              </TabsContent>
            ))}
          </Tabs>
        )}

        <div className="flex items-center justify-between border-t pt-3">
          <span className="text-xs text-muted-foreground">
            {dirtyCount > 0 ? `${dirtyCount} alteração(ões) pendente(s)` : "Sem alterações"}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Fechar</Button>
            <Button onClick={save} disabled={saving || dirtyCount === 0}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function QuestionCard({
  q, onChange, onUp, onDown, onRemove,
}: {
  q: Draft;
  onChange: (patch: Partial<Draft>) => void;
  onUp?: () => void;
  onDown?: () => void;
  onRemove: () => void;
}) {
  const chavePreview = q.chave.trim() || slugifyChave(q.rotulo || "");
  return (
    <Card className="space-y-3 p-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label className="text-xs">Rótulo (visível para o eletricista) *</Label>
          <Input
            value={q.rotulo}
            onChange={(e) => onChange({ rotulo: e.target.value })}
            placeholder="Ex.: Houve religamento?"
          />
          <p className="mt-1 text-[10px] text-muted-foreground">Chave interna: <code>{chavePreview}</code></p>
        </div>
        <div>
          <Label className="text-xs">Tipo de resposta</Label>
          <Select value={q.campo_tipo} onValueChange={(v) => onChange({ campo_tipo: v as CampoTipo })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="text">Texto curto</SelectItem>
              <SelectItem value="textarea">Texto longo</SelectItem>
              <SelectItem value="choice">Escolha única</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {q.campo_tipo === "choice" && (
        <div>
          <Label className="text-xs">Opções</Label>
          <div className="space-y-2">
            {q.opcoes.map((op, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={op}
                  onChange={(e) => {
                    const arr = [...q.opcoes];
                    arr[i] = e.target.value;
                    onChange({ opcoes: arr });
                  }}
                  placeholder={`Opção ${i + 1}`}
                />
                <Button variant="ghost" size="icon" onClick={() => onChange({ opcoes: q.opcoes.filter((_, j) => j !== i) })}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => onChange({ opcoes: [...q.opcoes, ""] })}>
              <Plus className="mr-2 h-3 w-3" /> Adicionar opção
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={q.obrigatoria} onCheckedChange={(v) => onChange({ obrigatoria: v })} />
          Obrigatória
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={q.ativa} onCheckedChange={(v) => onChange({ ativa: v })} />
          Ativa
        </label>
        <div className="ml-auto flex gap-1">
          <Button variant="ghost" size="icon" onClick={onUp} disabled={!onUp}><ArrowUp className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={onDown} disabled={!onDown}><ArrowDown className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={onRemove}><Trash2 className="h-4 w-4 text-destructive" /></Button>
        </div>
      </div>
    </Card>
  );
}