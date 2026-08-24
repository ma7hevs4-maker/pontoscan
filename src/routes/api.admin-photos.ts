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

export const Route = createFileRoute("/api/admin-photos")({
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
          const payload = body as { dataDe?: unknown; dataAte?: unknown };
          if (!validDate(payload.dataDe) || !validDate(payload.dataAte) || payload.dataDe > payload.dataAte) {
            return new Response("Período inválido", { status: 400 });
          }

          const from = `${payload.dataDe}T00:00:00-03:00`;
          const until = `${payload.dataAte}T23:59:59.999-03:00`;
          let offset = 0;
          const pageSize = 500;
          const incidents: Array<{ id: string; fotos: string[]; dados: Record<string, unknown> }> = [];

          while (true) {
            const { data, error } = await admin
              .from("incidentes")
              .select("id, fotos, dados")
              .gte("created_at", from)
              .lte("created_at", until)
              .range(offset, offset + pageSize - 1);
            if (error) throw error;
            const page = (data ?? []) as Array<{ id: string; fotos: string[]; dados: Record<string, unknown> }>;
            incidents.push(...page);
            if (page.length < pageSize) break;
            offset += pageSize;
          }

          const paths = new Set<string>();
          const affected: Array<{ id: string; dados: Record<string, unknown> }> = [];
          for (const incident of incidents) {
            const main = Array.isArray(incident.fotos) ? incident.fotos.filter((path) => typeof path === "string" && path.length > 0) : [];
            const callPrints = Array.isArray(incident.dados?.ligacaoPrint)
              ? incident.dados.ligacaoPrint.filter((path): path is string => typeof path === "string" && path.length > 0 && !path.startsWith("data:"))
              : [];
            main.forEach((path) => paths.add(path));
            callPrints.forEach((path) => paths.add(path));
            if (main.length || Array.isArray(incident.dados?.ligacaoPrint)) {
              const dados = { ...(incident.dados ?? {}) };
              delete dados.ligacaoPrint;
              affected.push({ id: incident.id, dados });
            }
          }

          const allPaths = Array.from(paths);
          for (let i = 0; i < allPaths.length; i += 100) {
            const { error } = await admin.storage.from("incidentes-fotos").remove(allPaths.slice(i, i + 100));
            if (error) throw error;
          }

          for (const incident of affected) {
            const { error } = await admin
              .from("incidentes")
              .update({ fotos: [], dados: incident.dados as any })
              .eq("id", incident.id);
            if (error) throw error;
          }

          return Response.json({ fotosExcluidas: allPaths.length, incidentesAtualizados: affected.length });
        } catch (error) {
          console.error("admin-photos error", error);
          return new Response("Erro interno no servidor", { status: 500 });
        }
      },
    },
  },
});