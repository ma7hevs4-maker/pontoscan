import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowUp, ArrowDown, Plus, Save, Trash2, Loader2, X, Check, CalendarDays } from "lucide-react";
import {
  deleteFormTipo,
  loadAllFormQuestions,
  loadFormTipos,
  loadFormsEnabled,
  loadFotosEnabled,
  saveFormsEnabled,
  saveFotosEnabled,
  slugifyChave,
  slugifyTipoChave,
  upsertFormTipo,
  type CampoTipo,
  type FormQuestion,
  type FormTipo,
  type TipoIncidente,
} from "@/lib/form-config";

type Draft = Omit<FormQuestion, "id"> & { id: string | null; dirty?: boolean };

export function FormBuilder({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [tipos, setTipos] = useState<FormTipo[]>([]);
  const [tab, setTab] = useState<TipoIncidente>("");
  const [drafts, setDrafts] = useState<Record<TipoIncidente, Draft[]>>({});
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formsEnabled, setFormsEnabled] = useState(true);
  const [togglingForms, setTogglingForms] = useState(false);
  const [fotosEnabled, setFotosEnabled] = useState(true);
  const [togglingFotos, setTogglingFotos] = useState(false);
  const hoje = new Date().toISOString().slice(0, 10);
  const [fotosDe, setFotosDe] = useState(hoje);
  const [fotosAte, setFotosAte] = useState(hoje);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [excluindoFotos, setExcluindoFotos] = useState(false);
  const [ultimoResultado, setUltimoResultado] = useState<{ fotosExcluidas: number; incidentesAtualizados: number } | null>(null);

  const [novoRotulo, setNovoRotulo] = useState("");
  const [criandoAba, setCriandoAba] = useState(false);
  const [renome, setRenome] = useState<string>("");

  const carregar = async () => {
    setLoading(true);
    const [all, enabled, ts, fotos] = await Promise.all([loadAllFormQuestions(), loadFormsEnabled(), loadFormTipos(), loadFotosEnabled()]);
    setFormsEnabled(enabled);
    setFotosEnabled(fotos);

    setTipos(ts);
    const d: Record<TipoIncidente, Draft[]> = {};
    for (const t of ts) d[t.chave] = (all[t.chave] ?? []).map((q) => ({ ...q, id: q.id, dirty: false }));
    setDrafts(d);
    setRemovedIds([]);
    setTab((prev) => (prev && d[prev] ? prev : ts[0]?.chave ?? ""));
    setLoading(false);
  };

  useEffect(() => {
    if (!open) return;
    carregar();
  }, [open]);

  useEffect(() => {
    setRenome(tipos.find((t) => t.chave === tab)?.rotulo ?? "");
  }, [tab, tipos]);

  const toggleForms = async (v: boolean) => {
    setTogglingForms(true);
    const prev = formsEnabled;
    setFormsEnabled(v);
    try {
      await saveFormsEnabled(v);
      toast.success(v ? "Formulários ativados" : "Formulários desativados — abas de incidentes ocultas");
    } catch (e: any) {
      setFormsEnabled(prev);
      toast.error(e.message ?? "Falha ao alterar");
    } finally {
      setTogglingForms(false);
    }
  };

  const toggleFotos = async (v: boolean) => {
    setTogglingFotos(true);
    const prev = fotosEnabled;
    setFotosEnabled(v);
    try {
      await saveFotosEnabled(v);
      toast.success(v ? "Fotos ativadas" : "Fotos desativadas — envio e exibição de fotos ocultos");
    } catch (e: any) {
      setFotosEnabled(prev);
      toast.error(e.message ?? "Falha ao alterar");
    } finally {
      setTogglingFotos(false);
    }
  };

  const excluirFotos = async () => {
    if (!fotosDe || !fotosAte || fotosDe > fotosAte) return toast.error("Informe um período válido");
    setExcluindoFotos(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sessão expirada. Entre novamente.");
      const response = await fetch("/api/admin-photos", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ dataDe: fotosDe, dataAte: fotosAte }),
      });
      if (!response.ok) throw new Error(await response.text());
      const result = await response.json() as { fotosExcluidas: number; incidentesAtualizados: number };
      setUltimoResultado(result);
      setConfirmarExclusao(false);
      toast.success(`${result.fotosExcluidas} foto(s) excluída(s) definitivamente`);
    } catch (error: any) {
      toast.error(error.message ?? "Falha ao excluir fotos");
    } finally {
      setExcluindoFotos(false);
    }
  };



  const criarAba = async () => {
    const rotulo = novoRotulo.trim();
    if (!rotulo) return toast.error("Informe o nome da aba");
    let chave = slugifyTipoChave(rotulo);
    if (tipos.some((t) => t.chave === chave)) chave = `${chave}_${Date.now().toString(36).slice(-4).toUpperCase()}`;
    setCriandoAba(true);
    try {
      await upsertFormTipo({ chave, rotulo, ordem: tipos.length, ativo: true });
      setTipos((prev) => [...prev, { chave, rotulo, ordem: prev.length, ativo: true, builtin: false }]);
      setDrafts((prev) => ({ ...prev, [chave]: [] }));
      setTab(chave);
      setNovoRotulo("");
      toast.success(`Aba "${rotulo}" criada`);
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao criar aba");
    } finally {
      setCriandoAba(false);
    }
  };

  const tipoAtual = tipos.find((t) => t.chave === tab);

  const renomearAba = async () => {
    if (!tipoAtual) return;
    const rotulo = renome.trim();
    if (!rotulo || rotulo === tipoAtual.rotulo) return;
    try {
      await upsertFormTipo({ chave: tipoAtual.chave, rotulo, ordem: tipoAtual.ordem, ativo: tipoAtual.ativo });
      setTipos((prev) => prev.map((t) => (t.chave === tipoAtual.chave ? { ...t, rotulo } : t)));
      toast.success("Aba renomeada");
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao renomear");
    }
  };

  const excluirAba = async () => {
    if (!tipoAtual || tipoAtual.builtin) return;
    if (!confirm(`Excluir a aba "${tipoAtual.rotulo}" e todas as suas perguntas?`)) return;
    try {
      await deleteFormTipo(tipoAtual.chave);
      const restantes = tipos.filter((t) => t.chave !== tipoAtual.chave);
      setTipos(restantes);
      setDrafts((prev) => {
        const n = { ...prev };
        delete n[tipoAtual.chave];
        return n;
      });
      setTab(restantes[0]?.chave ?? "");
      toast.success("Aba excluída");
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao excluir");
    }
  };

  const current = drafts[tab] ?? [];

  const updateOne = (idx: number, patch: Partial<Draft>) => {
    setDrafts((prev) => {
      const arr = [...(prev[tab] ?? [])];
      arr[idx] = { ...arr[idx], ...patch, dirty: true };
      return { ...prev, [tab]: arr };
    });
  };

  const move = (idx: number, dir: -1 | 1) => {
    setDrafts((prev) => {
      const arr = [...(prev[tab] ?? [])];
      const j = idx + dir;
      if (j < 0 || j >= arr.length) return prev;
      [arr[idx], arr[j]] = [arr[j], arr[idx]];
      arr.forEach((q, i) => { q.ordem = i; q.dirty = true; });
      return { ...prev, [tab]: arr };
    });
  };

  const remove = (idx: number) => {
    setDrafts((prev) => {
      const arr = [...(prev[tab] ?? [])];
      const [gone] = arr.splice(idx, 1);
      arr.forEach((q, i) => { q.ordem = i; q.dirty = true; });
      if (gone?.id) setRemovedIds((r) => [...r, gone.id!]);
      return { ...prev, [tab]: arr };
    });
  };

  const add = () => {
    setDrafts((prev) => {
      const arr = [...(prev[tab] ?? [])];
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
        parent_chave: null,
        parent_valores: [],
        dirty: true,
      });
      return { ...prev, [tab]: arr };
    });
  };

  const validate = (): string | null => {
    for (const t of tipos) {
      const set = new Set<string>();
      const lista = drafts[t.chave] ?? [];
      for (const q of lista) {
        if (!q.rotulo.trim()) return `[${t.rotulo}] Rótulo obrigatório`;
        const chave = q.chave.trim() || slugifyChave(q.rotulo);
        if (!chave) return `[${t.rotulo}] Chave inválida em "${q.rotulo}"`;
        if (set.has(chave)) return `[${t.rotulo}] Chave duplicada: ${chave}`;
        set.add(chave);
        if (q.campo_tipo === "choice" && q.opcoes.filter((o) => o.trim()).length < 2) {
          return `[${t.rotulo}] "${q.rotulo}" precisa de ao menos 2 opções`;
        }
        if (q.parent_chave) {
          if (q.parent_chave === chave) return `[${t.rotulo}] "${q.rotulo}" não pode depender de si mesma`;
          const pai = lista.find((p) => (p.chave.trim() || slugifyChave(p.rotulo)) === q.parent_chave);
          if (!pai) return `[${t.rotulo}] A pergunta condicionante de "${q.rotulo}" não existe mais`;
          if (!q.parent_valores.length) return `[${t.rotulo}] Escolha ao menos uma resposta que exibe "${q.rotulo}"`;
        }
      }
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
      for (const t of tipos) {
        for (const q of drafts[t.chave] ?? []) {
          if (!q.dirty) continue;
          const chave = (q.chave.trim() || slugifyChave(q.rotulo)).slice(0, 48);
          const opcoes = q.campo_tipo === "choice" ? q.opcoes.map((o) => o.trim()).filter(Boolean) : [];
          const payload = {
            tipo: t.chave,
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
    for (const t of tipos) n += (drafts[t.chave] ?? []).filter((q) => q.dirty).length;
    return n;
  }, [drafts, removedIds, tipos]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Construtor de formulários</DialogTitle>
          <DialogDescription>Configure os formulários, o uso de fotos e os tipos de incidente.</DialogDescription>
        </DialogHeader>

        <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Função de formulários</p>
            <p className="text-xs text-muted-foreground">
              {formsEnabled
                ? "Ligada — o botão Incidente aparece para os eletricistas e as abas Incidentes e Dash Forms ficam visíveis."
                : "Desligada — o botão Incidente fica oculto e as abas Incidentes e Dash Forms desaparecem do admin."}
            </p>
          </div>
          <Switch checked={formsEnabled} disabled={togglingForms || loading} onCheckedChange={toggleForms} />
        </div>

        <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Fotos nos incidentes</p>
            <p className="text-xs text-muted-foreground">
              {fotosEnabled
                ? "Ligada — o eletricista anexa evidências fotográficas e as fotos aparecem na aba Incidentes."
                : "Desligada — nenhum envio de foto é pedido no formulário e as fotos ficam ocultas na aba Incidentes."}
            </p>
          </div>
          <Switch checked={fotosEnabled} disabled={togglingFotos || loading} onCheckedChange={toggleFotos} />
        </div>

        <div className="space-y-3 rounded-lg border border-destructive/40 p-3">
          <div>
            <p className="text-sm font-medium">Excluir fotos armazenadas</p>
            <p className="text-xs text-muted-foreground">
              Remove definitivamente as evidências e prints dos incidentes no período. Os incidentes e suas respostas serão mantidos.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div>
              <Label htmlFor="fotos-de" className="text-xs">De</Label>
              <Input id="fotos-de" type="date" value={fotosDe} onChange={(e) => setFotosDe(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="fotos-ate" className="text-xs">Até</Label>
              <Input id="fotos-ate" type="date" value={fotosAte} onChange={(e) => setFotosAte(e.target.value)} />
            </div>
            <Button variant="destructive" onClick={() => setConfirmarExclusao(true)} disabled={!fotosDe || !fotosAte || fotosDe > fotosAte || excluindoFotos}>
              <Trash2 className="mr-2 h-4 w-4" /> Excluir fotos
            </Button>
          </div>
          {ultimoResultado && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" /> Última limpeza: {ultimoResultado.fotosExcluidas} foto(s) removida(s) de {ultimoResultado.incidentesAtualizados} incidente(s).
            </p>
          )}
        </div>

        <AlertDialog open={confirmarExclusao} onOpenChange={setConfirmarExclusao}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir definitivamente as fotos?</AlertDialogTitle>
              <AlertDialogDescription>
                Todas as fotos e prints de ligação dos incidentes entre {fotosDe.split("-").reverse().join("/")} e {fotosAte.split("-").reverse().join("/")} serão apagados do armazenamento. Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={excluindoFotos}>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={excluirFotos} disabled={excluindoFotos} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {excluindoFotos ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Excluir definitivamente
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>


        <p className="text-xs text-muted-foreground">
          Crie abas (tipos de incidente) e perguntas por aba. O núcleo estruturado (Nº do incidente, GPS e fotos) continua fixo — as perguntas aparecem após ele para eletricistas e parceiras.
        </p>

        <div className="flex items-end gap-2 rounded-lg border p-3">
          <div className="flex-1">
            <Label className="text-xs">Nova aba (tipo de incidente)</Label>
            <Input
              value={novoRotulo}
              onChange={(e) => setNovoRotulo(e.target.value)}
              placeholder="Ex.: Inspeção Programada"
              onKeyDown={(e) => { if (e.key === "Enter") criarAba(); }}
            />
          </div>
          <Button onClick={criarAba} disabled={criandoAba || !novoRotulo.trim()}>
            {criandoAba ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Criar aba
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(v)}>
            <TabsList className="flex w-full flex-wrap">
              {tipos.map((t) => (
                <TabsTrigger key={t.chave} value={t.chave} className="flex-1">
                  {t.rotulo} <span className="ml-1 text-xs text-muted-foreground">({(drafts[t.chave] ?? []).length})</span>
                </TabsTrigger>
              ))}
            </TabsList>

            {tipos.map((t) => (
              <TabsContent key={t.chave} value={t.chave} className="space-y-3">
                {tab === t.chave && (
                  <div className="flex items-end gap-2 rounded-md border bg-muted/30 p-3">
                    <div className="flex-1">
                      <Label className="text-xs">Nome da aba</Label>
                      <Input value={renome} onChange={(e) => setRenome(e.target.value)} />
                      <p className="mt-1 text-[10px] text-muted-foreground">Chave interna: <code>{t.chave}</code></p>
                    </div>
                    <Button variant="outline" size="sm" onClick={renomearAba} disabled={!renome.trim() || renome.trim() === t.rotulo}>
                      <Check className="mr-2 h-3 w-3" /> Renomear
                    </Button>
                    <Button variant="outline" size="sm" onClick={excluirAba} disabled={t.builtin} title={t.builtin ? "Aba padrão do sistema" : "Excluir aba"}>
                      <Trash2 className="mr-2 h-3 w-3 text-destructive" /> Excluir aba
                    </Button>
                  </div>
                )}
                {tab === t.chave && current.length === 0 && (
                  <p className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
                    Nenhuma pergunta extra em {t.rotulo}.
                  </p>
                )}
                {tab === t.chave && current.map((q, idx) => (
                  <QuestionCard
                    key={q.id ?? `new-${idx}`}
                    q={q}
                    onChange={(patch) => updateOne(idx, patch)}
                    onUp={idx > 0 ? () => move(idx, -1) : undefined}
                    onDown={idx < current.length - 1 ? () => move(idx, 1) : undefined}
                    onRemove={() => remove(idx)}
                  />
                ))}
                {tab === t.chave && (
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
          <label className="mt-2 flex items-center gap-2 text-sm">
            <Switch checked={q.permite_outro} onCheckedChange={(v) => onChange({ permite_outro: v })} />
            Permitir "Outro" (texto livre)
          </label>
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