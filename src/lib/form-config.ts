import { supabase } from "@/integrations/supabase/client";

export type CampoTipo = "text" | "textarea" | "choice";
export type TipoIncidente = string;

export interface FormTipo {
  chave: string;
  rotulo: string;
  ordem: number;
  ativo: boolean;
  builtin: boolean;
}

export const TIPOS_BUILTIN: FormTipo[] = [
  { chave: "ATENDIMENTO_INDIVIDUAL", rotulo: "Atendimento Individual", ordem: 0, ativo: true, builtin: true },
  { chave: "ORDEM_2", rotulo: "Ordem 2", ordem: 1, ativo: true, builtin: true },
  { chave: "IMPRODUTIVO", rotulo: "Improdutivo", ordem: 2, ativo: true, builtin: true },
];

export async function loadFormTipos(apenasAtivos = false): Promise<FormTipo[]> {
  const { data, error } = await (supabase as any)
    .from("form_tipos")
    .select("*")
    .order("ordem", { ascending: true });
  if (error || !data?.length) return TIPOS_BUILTIN;
  const list = (data as any[]).map((r) => ({
    chave: r.chave as string,
    rotulo: r.rotulo as string,
    ordem: r.ordem as number,
    ativo: !!r.ativo,
    builtin: !!r.builtin,
  }));
  return apenasAtivos ? list.filter((t) => t.ativo) : list;
}

export function slugifyTipoChave(rotulo: string): string {
  const base = rotulo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  return (base || "TIPO").slice(0, 48);
}

export async function upsertFormTipo(t: { chave: string; rotulo: string; ordem: number; ativo: boolean }): Promise<void> {
  const { error } = await (supabase as any).from("form_tipos").upsert(t, { onConflict: "chave" });
  if (error) throw new Error(error.message);
}

export async function deleteFormTipo(chave: string): Promise<void> {
  const { error: e1 } = await (supabase as any).from("form_questions").delete().eq("tipo", chave);
  if (e1) throw new Error(e1.message);
  const { error } = await (supabase as any).from("form_tipos").delete().eq("chave", chave);
  if (error) throw new Error(error.message);
}


export interface FormQuestion {
  id: string;
  tipo: TipoIncidente;
  chave: string;
  rotulo: string;
  campo_tipo: CampoTipo;
  opcoes: string[];
  obrigatoria: boolean;
  permite_outro: boolean;
  ordem: number;
  ativa: boolean;
}

export function slugifyChave(label: string): string {
  return slugifyChaveImpl(label);
}

export const FORMS_ENABLED_KEY = "forms_enabled";

export async function loadFormsEnabled(): Promise<boolean> {
  const { data, error } = await (supabase as any)
    .from("app_settings")
    .select("valor")
    .eq("chave", FORMS_ENABLED_KEY)
    .maybeSingle();
  if (error || !data) return true;
  return !!data.valor;
}

export async function saveFormsEnabled(valor: boolean): Promise<void> {
  const { error } = await (supabase as any)
    .from("app_settings")
    .upsert({ chave: FORMS_ENABLED_KEY, valor, updated_at: new Date().toISOString() }, { onConflict: "chave" });
  if (error) throw new Error(error.message);
}

export const FOTOS_ENABLED_KEY = "fotos_enabled";

export async function loadFotosEnabled(): Promise<boolean> {
  const { data, error } = await (supabase as any)
    .from("app_settings")
    .select("valor")
    .eq("chave", FOTOS_ENABLED_KEY)
    .maybeSingle();
  if (error || !data) return true;
  return !!data.valor;
}

export async function saveFotosEnabled(valor: boolean): Promise<void> {
  const { error } = await (supabase as any)
    .from("app_settings")
    .upsert({ chave: FOTOS_ENABLED_KEY, valor, updated_at: new Date().toISOString() }, { onConflict: "chave" });
  if (error) throw new Error(error.message);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("pontoscan:fotos-enabled", { detail: valor }));
  }
}


function slugifyChaveImpl(label: string): string {
  const base = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]+/g, " ")
    .trim()
    .split(/\s+/);
  if (!base.length) return "campo";
  const camel = base
    .map((w, i) => {
      const lower = w.toLowerCase();
      return i === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
  return camel.slice(0, 48) || "campo";
}

export async function loadFormQuestions(tipo: TipoIncidente): Promise<FormQuestion[]> {
  const { data, error } = await (supabase as any)
    .from("form_questions")
    .select("*")
    .eq("tipo", tipo)
    .eq("ativa", true)
    .order("ordem", { ascending: true });
  if (error) return [];
  return ((data as any[]) ?? []).map((r) => ({
    ...r,
    permite_outro: !!r.permite_outro,
    opcoes: Array.isArray(r.opcoes) ? r.opcoes : [],
  }));
}

export async function loadAllFormQuestions(): Promise<Record<TipoIncidente, FormQuestion[]>> {
  const { data } = await (supabase as any)
    .from("form_questions")
    .select("*")
    .order("ordem", { ascending: true });
  const out: Record<TipoIncidente, FormQuestion[]> = {};
  for (const r of ((data as any[]) ?? [])) {
    const q: FormQuestion = { ...r, permite_outro: !!r.permite_outro, opcoes: Array.isArray(r.opcoes) ? r.opcoes : [] };
    (out[q.tipo] ??= []).push(q);
  }

  return out;
}