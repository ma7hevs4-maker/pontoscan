import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

async function authorize(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return { error: new Response("Unauthorized", { status: 401 }) };
  }
  const token = authHeader.slice(7);
  const client = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return { error: new Response("Unauthorized", { status: 401 }) };
  const { data: role } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id)
    .eq("role", "ADMIN_DISPATCH")
    .maybeSingle();
  if (!role) return { error: new Response("Forbidden", { status: 403 }) };
  return { userId: data.user.id };
}

async function listAdmins() {
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

async function searchEletricistas(q: string) {
  if (!q?.trim()) return { users: [] };
  const { data: profs, error } = await supabaseAdmin
    .from("profiles")
    .select("id, nome, prefixo, polo")
    .or(`nome.ilike.%${q}%,prefixo.ilike.%${q}%`)
    .limit(20);
  if (error) throw new Error(error.message);
  const users: any[] = [];
  for (const p of profs ?? []) {
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(p.id);
    users.push({ ...p, email: u?.user?.email ?? null });
  }
  return { users };
}

export const Route = createFileRoute("/api/admin-users")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authorize(request);
        if (auth.error) return auth.error;
        let body: any = {};
        try { body = await request.json(); } catch {}
        const action = body?.action as string;
        try {
          if (action === "list") {
            return Response.json(await listAdmins());
          }
          if (action === "search-eletricistas") {
            return Response.json(await searchEletricistas(String(body?.q ?? "")));
          }
          if (action === "update-password") {
            const userId = String(body?.userId ?? "");
            const password = String(body?.password ?? "");
            if (!userId || password.length < 6) return new Response("Dados inválidos", { status: 400 });
            const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
            if (error) return new Response(error.message, { status: 400 });
            return Response.json({ ok: true });
          }
          if (action === "update-email") {
            const userId = String(body?.userId ?? "");
            const email = String(body?.email ?? "");
            if (!userId || !email.includes("@")) return new Response("Dados inválidos", { status: 400 });
            const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { email, email_confirm: true });
            if (error) return new Response(error.message, { status: 400 });
            return Response.json({ ok: true });
          }
          return new Response("Ação desconhecida", { status: 400 });
        } catch (e: any) {
          console.error("admin-users error", e);
          return new Response(e?.message ?? "Erro interno", { status: 500 });
        }
      },
    },
  },
});