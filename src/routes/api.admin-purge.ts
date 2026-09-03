import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function createBackendClient(key: string) {
  const url = process.env["SUPABASE_URL"];
  if (!url) throw new Error("Configuração do backend ausente");
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export const Route = createFileRoute("/api/admin-purge")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authHeader = request.headers.get("authorization") ?? "";
          if (!authHeader.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });

          const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
          const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
          if (!publishableKey || !serviceKey) throw new Error("Configuração do backend ausente");

          const authClient = createBackendClient(publishableKey);
          const { data: userData, error: userError } = await authClient.auth.getUser(authHeader.slice(7));
          if (userError || !userData.user) return new Response("Unauthorized", { status: 401 });

          const admin = createBackendClient(serviceKey);
          const { data: role } = await admin
            .from("user_roles")
            .select("role")
            .eq("user_id", userData.user.id)
            .eq("role", "ADMIN_DISPATCH")
            .maybeSingle();
          if (!role) return new Response("Forbidden", { status: 403 });

          let body: unknown;
          try { body = await request.json(); } catch { return new Response("Dados inválidos", { status: 400 }); }
          const payload = body as { tipo?: unknown; dataDe?: unknown; dataAte?: unknown };
          if (payload.tipo !== "incidentes" && payload.tipo !== "registros") {
            return new Response("Tipo inválido", { status: 400 });
          }
          if (!validDate(payload.dataDe) || !validDate(payload.dataAte) || payload.dataDe > payload.dataAte) {
            return new Response("Período inválido", { status: 400 });
          }

          const from = `${payload.dataDe}T00:00:00-03:00`;
          const until = `${payload.dataAte}T23:59:59.999-03:00`;

          if (payload.tipo === "registros") {
            const { data, error } = await admin
              .from("registros")
              .delete()
              .gte("timestamp", from)
              .lte("timestamp", until)
              .select("id");
            if (error) throw error;
            return Response.json({ tipo: "registros", excluidos: (data ?? []).length, fotosExcluidas: 0 });
          }

          // Incidentes: remove as fotos do armazenamento antes de apagar as linhas
          let offset = 0;
          const pageSize = 500;
          const paths = new Set<string>();
          while (true) {
            const { data, error } = await admin
              .from("incidentes")
              .select("id, fotos, dados")
              .gte("created_at", from)
              .lte("created_at", until)
              .range(offset, offset + pageSize - 1);
            if (error) throw error;
            const page = (data ?? []) as Array<{ id: string; fotos: string[]; dados: Record<string, unknown> }>;
            for (const inc of page) {
              (Array.isArray(inc.fotos) ? inc.fotos : []).forEach((p) => { if (typeof p === "string" && p) paths.add(p); });
              const prints = inc.dados?.["ligacaoPrint"];
              if (Array.isArray(prints)) prints.forEach((p) => { if (typeof p === "string" && p && !p.startsWith("data:")) paths.add(p); });
            }
            if (page.length < pageSize) break;
            offset += pageSize;
          }

          const allPaths = Array.from(paths);
          for (let i = 0; i < allPaths.length; i += 100) {
            const { error } = await admin.storage.from("incidentes-fotos").remove(allPaths.slice(i, i + 100));
            if (error) throw error;
          }

          const { data: removidos, error: delError } = await admin
            .from("incidentes")
            .delete()
            .gte("created_at", from)
            .lte("created_at", until)
            .select("id");
          if (delError) throw delError;

          return Response.json({ tipo: "incidentes", excluidos: (removidos ?? []).length, fotosExcluidas: allPaths.length });
        } catch (error) {
          console.error("admin-purge error", error);
          return new Response("Erro interno no servidor", { status: 500 });
        }
      },
    },
  },
});
