import { createFileRoute } from "@tanstack/react-router";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type AdminAuth = {
  userId: string;
  isDispatch: boolean;
  adminPolo: string | null;
  supabaseAdmin: SupabaseClient<Database>;
};

function getEnv(name: "SUPABASE_URL" | "SUPABASE_PUBLISHABLE_KEY" | "SUPABASE_SERVICE_ROLE_KEY") {
  const value = process.env[name];
  if (!value) throw new Error(`Configuração ausente: ${name}`);
  return value;
}

function createBackendClient(key: string) {
  const url = getEnv("SUPABASE_URL");
  return createClient<Database>(url, key, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

function createAuthClient() {
  return createBackendClient(getEnv("SUPABASE_PUBLISHABLE_KEY"));
}

function createAdminClient() {
  return createBackendClient(getEnv("SUPABASE_SERVICE_ROLE_KEY"));
}

async function authorize(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return { error: new Response("Unauthorized", { status: 401 }) };
  return authorizeToken(authHeader.slice(7));
}

async function authorizeToken(token: string) {
  const supabaseAdmin = createAdminClient();
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return { error: new Response("Unauthorized", { status: 401 }) };
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role, polo")
    .eq("user_id", data.user.id);
  const dispatch = roles?.find((r) => r.role === "ADMIN_DISPATCH");
  const polo = roles?.find((r) => r.role === "ADMIN_POLO");
  if (!dispatch && !polo) return { error: new Response("Forbidden", { status: 403 }) };
  return {
    userId: data.user.id,
    isDispatch: !!dispatch,
    adminPolo: (polo?.polo as string | null) ?? null,
    supabaseAdmin,
  };
}

// O e-mail de login é definido no cadastro e NÃO é alterado ao editar nome/prefixo,
// para que o colaborador continue logando com as mesmas credenciais.

async function listAdmins(supabaseAdmin: SupabaseClient<Database>) {
  const { data: roles, error: rErr } = await supabaseAdmin
    .from("user_roles")
    .select("user_id, role, polo")
    .in("role", ["ADMIN_POLO", "ADMIN_DISPATCH"]);
  if (rErr) throw new Error(rErr.message);
  const ids = (roles ?? []).map((r) => r.user_id);
  if (ids.length === 0) return { admins: [] };
  const { data: profs } = await supabaseAdmin
    .from("profiles")
    .select("id, nome, prefixo, polo")
    .in("id", ids);
  const profById = new Map((profs ?? []).map((p: any) => [p.id, p]));
  const admins: any[] = [];
  for (const r of roles!) {
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(r.user_id);
    const prof = profById.get(r.user_id) as any;
    admins.push({
      user_id: r.user_id,
      email: u?.user?.email ?? null,
      role: r.role,
      polo: r.polo ?? prof?.polo ?? null,
      nome: prof?.nome ?? u?.user?.user_metadata?.nome ?? "—",
    });
  }
  return { admins };
}

async function searchEletricistas(supabaseAdmin: SupabaseClient<Database>, q: string, restrictPolo: string | null) {
  let query = supabaseAdmin
    .from("profiles")
    .select("id, nome, prefixo, polo")
    .eq("ativo", true)
    .limit(50);
  if (restrictPolo) query = query.eq("polo", restrictPolo as any);
  if (q?.trim()) query = query.or(`nome.ilike.%${q}%,prefixo.ilike.%${q}%`);
  const { data: profs, error } = await query;
  if (error) throw new Error(error.message);
  // Exclude any profile that holds an admin role so peers cannot be enumerated/targeted.
  const ids = (profs ?? []).map((p: any) => p.id);
  let adminIds = new Set<string>();
  if (ids.length > 0) {
    const { data: adminRoles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .in("user_id", ids)
      .in("role", ["ADMIN_POLO", "ADMIN_DISPATCH"]);
    adminIds = new Set((adminRoles ?? []).map((r: any) => r.user_id));
  }
  const eletricistas = (profs ?? []).filter((p: any) => !adminIds.has(p.id));
  const users: any[] = [];
  for (const p of eletricistas) {
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(p.id);
    users.push({ ...p, email: u?.user?.email ?? null });
  }
  return { users };
}

async function ensureSamePolo(supabaseAdmin: SupabaseClient<Database>, userId: string, restrictPolo: string | null) {
  if (!restrictPolo) return true;
  const { data: p } = await supabaseAdmin.from("profiles").select("polo").eq("id", userId).maybeSingle();
  return p?.polo === restrictPolo;
}

// Ensure a non-dispatch admin cannot target another admin (peer or higher).
async function ensureTargetIsEletricista(
  supabaseAdmin: SupabaseClient<Database>,
  userId: string,
  callerIsDispatch: boolean,
) {
  if (callerIsDispatch) return true;
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["ADMIN_POLO", "ADMIN_DISPATCH"]);
  return !roles || roles.length === 0;
}

export const Route = createFileRoute("/api/admin-users")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authorize(request);
        if (auth.error) return auth.error;
        const isDispatch = auth.isDispatch;
        const restrictPolo = isDispatch ? null : auth.adminPolo;
        const supabaseAdmin = (auth as AdminAuth).supabaseAdmin;
        let body: any = {};
        try { body = await request.json(); } catch {}
        const action = body?.action as string;
        try {
          if (action === "list") {
            if (!isDispatch) return new Response("Forbidden", { status: 403 });
            return Response.json(await listAdmins(supabaseAdmin));
          }
          if (action === "search-eletricistas") {
            return Response.json(await searchEletricistas(supabaseAdmin, String(body?.q ?? ""), restrictPolo));
          }
          if (action === "update-password") {
            const userId = String(body?.userId ?? "");
            const password = String(body?.password ?? "");
            if (!userId || password.length < 6) return new Response("Dados inválidos", { status: 400 });
            if (!(await ensureSamePolo(supabaseAdmin, userId, restrictPolo))) return new Response("Forbidden", { status: 403 });
            if (!(await ensureTargetIsEletricista(supabaseAdmin, userId, isDispatch))) return new Response("Forbidden", { status: 403 });
            const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
            if (error) return new Response(error.message, { status: 400 });
            return Response.json({ ok: true });
          }
          if (action === "update-email") {
            if (!isDispatch) return new Response("Forbidden", { status: 403 });
            const userId = String(body?.userId ?? "");
            const email = String(body?.email ?? "");
            if (!userId || !email.includes("@")) return new Response("Dados inválidos", { status: 400 });
            const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { email, email_confirm: true });
            if (error) return new Response(error.message, { status: 400 });
            return Response.json({ ok: true });
          }
          if (action === "update-prefixo") {
            const userId = String(body?.userId ?? "");
            const prefixo = String(body?.prefixo ?? "").trim().toUpperCase();
            if (!userId || prefixo.length < 3) return new Response("Dados inválidos", { status: 400 });
            if (!(await ensureSamePolo(supabaseAdmin, userId, restrictPolo))) return new Response("Forbidden", { status: 403 });
            if (!(await ensureTargetIsEletricista(supabaseAdmin, userId, isDispatch))) return new Response("Forbidden", { status: 403 });
            const { error } = await supabaseAdmin.from("profiles").update({ prefixo }).eq("id", userId);
            if (error) return new Response(error.message, { status: 400 });
            return Response.json({ ok: true });
          }
          if (action === "update-nome") {
            const userId = String(body?.userId ?? "");
            const nome = String(body?.nome ?? "").trim();
            if (!userId || nome.length < 2) return new Response("Dados inválidos", { status: 400 });
            if (!(await ensureSamePolo(supabaseAdmin, userId, restrictPolo))) return new Response("Forbidden", { status: 403 });
            if (!(await ensureTargetIsEletricista(supabaseAdmin, userId, isDispatch))) return new Response("Forbidden", { status: 403 });
            const { error } = await supabaseAdmin.from("profiles").update({ nome }).eq("id", userId);
            if (error) return new Response(error.message, { status: 400 });
            return Response.json({ ok: true });
          }
          if (action === "delete-user") {
            const userId = String(body?.userId ?? "");
            if (!userId) return new Response("Dados inválidos", { status: 400 });
            if (!(await ensureSamePolo(supabaseAdmin, userId, restrictPolo))) return new Response("Forbidden", { status: 403 });
            // Não permitir exclusão de administradores por esta rota
            const { data: adminRoles } = await supabaseAdmin
              .from("user_roles")
              .select("role")
              .eq("user_id", userId)
              .in("role", ["ADMIN_POLO", "ADMIN_DISPATCH"]);
            if (adminRoles && adminRoles.length > 0 && !isDispatch) {
              return new Response("Não é possível excluir administradores", { status: 403 });
            }
            if (userId === auth.userId) return new Response("Você não pode excluir a si mesmo", { status: 400 });
            // Mantém o histórico de ponto para auditoria; apenas remove acesso e oculta o perfil da gestão de contas.
            await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
            await supabaseAdmin.from("profiles").update({ ativo: false }).eq("id", userId);
            const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
            if (error) return new Response(error.message, { status: 400 });
            return Response.json({ ok: true });
          }
          return new Response("Ação desconhecida", { status: 400 });
        } catch (e: any) {
          console.error("admin-users error", e);
          return new Response("Erro interno no servidor", { status: 500 });
        }
      },
    },
  },
});