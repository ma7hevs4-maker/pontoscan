import { supabase } from "@/integrations/supabase/client";

export type CampoTipo = "text" | "textarea" | "choice";
export type TipoIncidente = "ATENDIMENTO_INDIVIDUAL" | "ORDEM_2" | "IMPRODUTIVO";

export interface FormQuestion {
  id: string;
  tipo: TipoIncidente;
  chave: string;
  rotulo: string;
  campo_tipo: CampoTipo;
  opcoes: string[];
  obrigatoria: boolean;
  ordem: number;
  ativa: boolean;
}

export function slugifyChave(label: string): string {
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
    opcoes: Array.isArray(r.opcoes) ? r.opcoes : [],
  }));
}

export async function loadAllFormQuestions(): Promise<Record<TipoIncidente, FormQuestion[]>> {
  const { data } = await (supabase as any)
    .from("form_questions")
    .select("*")
    .order("ordem", { ascending: true });
  const out: Record<TipoIncidente, FormQuestion[]> = {
    ATENDIMENTO_INDIVIDUAL: [],
    ORDEM_2: [],
    IMPRODUTIVO: [],
  };
  for (const r of ((data as any[]) ?? [])) {
    const q: FormQuestion = { ...r, opcoes: Array.isArray(r.opcoes) ? r.opcoes : [] };
    if (out[q.tipo]) out[q.tipo].push(q);
  }
  return out;
}