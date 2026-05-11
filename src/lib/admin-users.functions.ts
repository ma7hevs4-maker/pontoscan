import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertDispatch(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "ADMIN_DISPATCH")
    .maybeSingle();
  if (error || !data) throw new Error("Forbidden");
}

export const listAdmins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertDispatch(context.supabase, context.userId);

    const { data: roles, error: rErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role, polo")
      .in("role", ["ADMIN_POLO", "ADMIN_DISPATCH"]);
    if (rErr) throw new Error(rErr.message);

    const ids = (roles ?? []).map((r) => r.user_id);
    if (ids.length === 0) return { admins: [] as any[] };

    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, nome, prefixo, polo")
      .in("id", ids);
    const profById = new Map((profs ?? []).map((p: any) => [p.id, p]));

    const admins = [] as any[];
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
  });

export const updateUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; password: string }) => {
    if (!d?.userId) throw new Error("userId obrigatório");
    if (!d?.password || d.password.length < 6) throw new Error("Senha precisa ter ao menos 6 caracteres");
    return d;
  })
  .handler(async ({ context, data }) => {
    await assertDispatch(context.supabase, context.userId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password: data.password });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateUserEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; email: string }) => {
    if (!d?.userId) throw new Error("userId obrigatório");
    if (!d?.email || !d.email.includes("@")) throw new Error("E-mail inválido");
    return d;
  })
  .handler(async ({ context, data }) => {
    await assertDispatch(context.supabase, context.userId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      email: data.email,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const searchEletricistas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { q: string }) => ({ q: (d?.q ?? "").trim() }))
  .handler(async ({ context, data }) => {
    await assertDispatch(context.supabase, context.userId);
    if (!data.q) return { users: [] as any[] };
    const { data: profs, error } = await supabaseAdmin
      .from("profiles")
      .select("id, nome, prefixo, polo")
      .or(`nome.ilike.%${data.q}%,prefixo.ilike.%${data.q}%`)
      .limit(20);
    if (error) throw new Error(error.message);
    const out: any[] = [];
    for (const p of profs ?? []) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(p.id);
      out.push({ ...p, email: u?.user?.email ?? null });
    }
    return { users: out };
  });