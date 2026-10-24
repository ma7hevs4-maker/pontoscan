import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const CAMPUS_PAGE_SIZE = 1000;
export const CAMPUS_PHOTO_EXPIRY = 3600;
export const CAMPUS_TABLES = [
  "registros", "incidentes", "profiles", "bases", "equipe_incidentes",
  "form_tipos", "form_questions", "equipe_areas", "equipe_telefones",
  "equipe_membros_override", "equipe_area_logs", "app_settings",
] as const;
export type CampusTable = (typeof CAMPUS_TABLES)[number];

export function campusOrder(table: CampusTable): string[] {
  if (table === "app_settings") return ["chave"];
  if (table === "form_tipos") return ["ordem", "chave"];
  if (table === "form_questions") return ["ordem", "id"];
  return ["created_at", "id"];
}

export function campusLimit(raw: string | null): number {
  const value = Number(raw ?? 5000);
  return Number.isFinite(value) && value > 0
    ? Math.min(Math.floor(value), 10000)
    : 5000;
}

export function campusUsesSince(table: string): boolean {
  return CAMPUS_TABLES.some((name) => name === table) && table !== "app_settings";
}

export async function readCampusExport(client: SupabaseClient<Database>, url: URL): Promise<Response> {
  const privateHeaders = { "Cache-Control": "no-store" };
  if (url.searchParams.has("foto")) {
    const path = url.searchParams.get("foto") ?? "";
    if (!path.trim() || path.length > 2048 || path.startsWith("/") || /[\u0000-\u001f\u007f]/.test(path) || path.split("/").some((part) => part === "." || part === "..")) {
      return Response.json({ erro: "Caminho de foto inválido" }, { status: 400, headers: privateHeaders });
    }
    const { data, error } = await client.storage.from("incidentes-fotos").createSignedUrl(path, CAMPUS_PHOTO_EXPIRY);
    if (error || !data?.signedUrl) {
      return Response.json({ erro: "Não foi possível gerar o link da foto" }, { status: 404, headers: privateHeaders });
    }
    return Response.json({ url: data.signedUrl }, { headers: privateHeaders });
  }

  const rawTable = url.searchParams.get("tabela");
  const tabela = CAMPUS_TABLES.find((table) => table === rawTable);
  if (!tabela) return Response.json({ erro: `Parâmetro "tabela" inválido. Use: ${CAMPUS_TABLES.join(", ")}` }, { status: 400 });

  const desdeRaw = url.searchParams.get("desde");
  let desde: string | null = null;
  if (desdeRaw && campusUsesSince(tabela)) {
    const date = new Date(desdeRaw);
    if (Number.isNaN(date.getTime())) return Response.json({ erro: 'Parâmetro "desde" inválido (use timestamp ISO)' }, { status: 400 });
    desde = date.toISOString();
  }
  const limite = campusLimit(url.searchParams.get("limite"));
  const select = tabela === "profiles" ? "id, nome, prefixo, polo" : "*";
  const { data, error } = await collectCampusRows(limite, (from, to) => {
    let query = client.from(tabela).select(select);
    for (const column of campusOrder(tabela)) query = query.order(column, { ascending: true });
    if (desde) query = query.gt("created_at", desde);
    return query.range(from, to);
  });
  if (error) return Response.json({ erro: "Erro ao consultar dados" }, { status: 500 });
  return Response.json({ tabela, total: data.length, linhas: data }, { headers: privateHeaders });
}

export async function collectCampusRows<T>(
  limit: number,
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const rows: T[] = [];
  while (rows.length < limit) {
    const pageSize = Math.min(CAMPUS_PAGE_SIZE, limit - rows.length);
    const { data, error } = await fetchPage(rows.length, rows.length + pageSize - 1);
    if (error) return { data: [], error };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return { data: rows, error: null };
}