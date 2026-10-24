import { createFileRoute } from "@tanstack/react-router";
import { readCampusExport } from "@/lib/export-campus";

// Exportação somente-leitura para integração externa (Campus).
// Protegida por token estático em EXPORT_CAMPUS_TOKEN. Nunca logar o token.

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

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        return readCampusExport(supabaseAdmin, new URL(request.url));
      },
    },
  },
});
