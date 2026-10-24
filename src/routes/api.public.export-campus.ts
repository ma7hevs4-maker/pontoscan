import { createFileRoute } from "@tanstack/react-router";
import { campusLimit, campusUsesSince, collectCampusRows } from "@/lib/export-campus";

// Exportação somente-leitura para integração externa (Campus).
// Protegida por token estático em EXPORT_CAMPUS_TOKEN. Nunca logar o token.

const TABELAS = ["registros", "incidentes", "profiles", "bases", "equipe_incidentes"] as const;
type Tabela = (typeof TABELAS)[number];

// Comparação em tempo constante (sem depender de node:crypto no runtime edge).
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ba = enc.encode(a);
  const bb = enc.encode(b);
  const len = Math.max(ba.length, bb.length);
  let diff = ba.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    diff |= (ba[i % Math.max(ba.length, 1)] ?? 0) ^ (bb[i % Math.max(bb.length, 1)] ?? 0);
  }
  return diff === 0;
}

function authorized(request: Request): Response | null {
  const expected = process.env.EXPORT_CAMPUS_TOKEN;
  if (!expected) {
    return Response.json({ erro: "Exportação não configurada" }, { status: 503 });
  }
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !timingSafeEqual(token, expected)) {
    return Response.json({ erro: "Não autorizado" }, { status: 401 });
  }
  return null;
}

export const Route = createFileRoute("/api/public/export-campus")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authError = authorized(request);
        if (authError) return authError;

        const url = new URL(request.url);
        const tabela = url.searchParams.get("tabela") as Tabela | null;
        if (!tabela || !TABELAS.includes(tabela)) {
          return Response.json(
            { erro: `Parâmetro "tabela" inválido. Use: ${TABELAS.join(", ")}` },
            { status: 400 },
          );
        }

        const desdeRaw = url.searchParams.get("desde");
        let desde: string | null = null;
        if (desdeRaw) {
          const d = new Date(desdeRaw);
          if (Number.isNaN(d.getTime())) {
            return Response.json({ erro: 'Parâmetro "desde" inválido (use timestamp ISO)' }, { status: 400 });
          }
          desde = d.toISOString();
        }

        const limite = campusLimit(url.searchParams.get("limite"));

        // profiles: somente colunas não sensíveis (sem e-mail, sem nada de auth).
        const select = tabela === "profiles" ? "id, nome, prefixo, polo" : "*";

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await collectCampusRows(limite, (from, to) => {
          let query = supabaseAdmin.from(tabela).select(select)
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to);

          // Todas estas tabelas possuem created_at; bases mantém o comportamento anterior.
          if (desde && campusUsesSince(tabela)) {
            query = query.gt("created_at", desde);
          }
          return query;
        });
        if (error) {
          console.error("export-campus error:", error.message);
          return Response.json({ erro: "Erro ao consultar dados" }, { status: 500 });
        }

        return Response.json({ tabela, total: data?.length ?? 0, linhas: data ?? [] });
      },
    },
  },
});
