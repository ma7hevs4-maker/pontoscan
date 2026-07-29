import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { distanceMeters } from "@/lib/geo";

const PREFIX_MAP: Record<string, string> = {
  CP: "Campos",
  AR: "Lagos", CF: "Lagos",
  MC: "Macaé",
  MG: "Magé",
  NI: "Niterói",
  CG: "Noroeste", PD: "Noroeste", IT: "Noroeste",
  SG: "São Gonçalo",
  PE: "Serrana", TE: "Serrana",
  AN: "Sul", RE: "Sul",
};

const PARCEIRAS = ["Engelmig", "PSE", "3C", "ELLCA", "Ceneged"];
const TIPOS = ["ATENDIMENTO_INDIVIDUAL", "ORDEM_2", "IMPRODUTIVO"];

function poloFromPrefixo(prefixo: string): string | null {
  const p = (prefixo ?? "").trim().toUpperCase().slice(0, 2);
  return PREFIX_MAP[p] ?? null;
}

async function poloFromGeo(lat: number | null, lng: number | null): Promise<string | null> {
  if (lat == null || lng == null) return null;
  const { data } = await supabaseAdmin
    .from("bases")
    .select("polo, latitude, longitude")
    .not("latitude", "is", null)
    .not("longitude", "is", null);
  if (!data?.length) return null;
  let best: { polo: string; d: number } | null = null;
  for (const b of data as any[]) {
    const d = distanceMeters(lat, lng, b.latitude, b.longitude);
    if (!best || d < best.d) best = { polo: b.polo as string, d };
  }
  return best?.polo ?? null;
}

function b64ToBytes(dataUrl: string): { bytes: Uint8Array; contentType: string } {
  const m = /^data:(.+?);base64,(.*)$/.exec(dataUrl);
  const contentType = m?.[1] ?? "image/jpeg";
  const b64 = m?.[2] ?? dataUrl;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, contentType };
}

export const Route = createFileRoute("/api/public/incidente-parceira")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: any;
        try { body = await request.json(); }
        catch { return new Response("Invalid JSON", { status: 400 }); }

        const prefixo = String(body?.prefixo ?? "").trim().toUpperCase();
        const nome = String(body?.nome ?? "").trim();
        const parceira = String(body?.parceira ?? "").trim();
        const tipo = String(body?.tipo ?? "");
        const numero = String(body?.numero ?? "").toUpperCase();
        const dados = body?.dados && typeof body.dados === "object" ? body.dados : {};
        const fotos: string[] = Array.isArray(body?.fotos) ? body.fotos : [];
        const lat = typeof body?.latitude === "number" ? body.latitude : null;
        const lng = typeof body?.longitude === "number" ? body.longitude : null;

        if (!prefixo || prefixo.length > 32) return new Response("Prefixo inválido", { status: 400 });
        if (!nome || nome.length > 120) return new Response("Nome inválido", { status: 400 });
        if (!PARCEIRAS.includes(parceira)) return new Response("Parceira inválida", { status: 400 });
        if (!TIPOS.includes(tipo)) return new Response("Tipo inválido", { status: 400 });
        if (!/^[A-Z0-9]{10}$/.test(numero)) return new Response("Nº incidente inválido", { status: 400 });
        if (fotos.length === 0 || fotos.length > 20) return new Response("Fotos inválidas", { status: 400 });

        const poloPrefixo = poloFromPrefixo(prefixo);
        const poloGeo = await poloFromGeo(lat, lng);

        const folder = `parceira/${parceira}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const paths: string[] = [];
        for (let i = 0; i < fotos.length; i++) {
          const { bytes, contentType } = b64ToBytes(String(fotos[i] ?? ""));
          if (bytes.length === 0) return new Response(`Foto ${i + 1} vazia`, { status: 400 });
          if (bytes.length > 8 * 1024 * 1024) return new Response(`Foto ${i + 1} > 8MB`, { status: 400 });
          const ext = contentType.split("/")[1]?.replace(/[^a-z0-9]/gi, "").slice(0, 5) || "jpg";
          const path = `${folder}/${i}.${ext}`;
          const { error } = await supabaseAdmin.storage
            .from("incidentes-fotos")
            .upload(path, bytes, { contentType, upsert: false });
          if (error) return new Response(`Upload foto ${i + 1}: ${error.message}`, { status: 500 });
          paths.push(path);
        }

        const { error: iErr } = await (supabaseAdmin as any).from("incidentes").insert({
          usuario_id: null,
          prefixo,
          nome_colaborador: nome,
          parceira,
          polo_eletricista: null,
          polo_prefixo: poloPrefixo,
          polo_geo: poloGeo,
          origem: "PARCEIRA",
          tipo,
          numero_incidente: numero,
          latitude: lat,
          longitude: lng,
          dados,
          fotos: paths,
        });
        if (iErr) return new Response(iErr.message, { status: 500 });

        return Response.json({ ok: true });
      },
    },
  },
});