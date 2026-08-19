import { supabase } from "@/integrations/supabase/client";
import { distanceMeters } from "@/lib/geo";

export type Polo =
  | "Magé" | "Niterói" | "São Gonçalo" | "Serrana" | "Sul"
  | "Campos" | "Lagos" | "Macaé" | "Noroeste" | "Perdas";

// Regra: CP-Campos; AR/CF-Lagos; MC-Macaé; MG-Magé; NI-Niterói;
// CG/PD/IT-Noroeste; SG-São Gonçalo; PE/TE-Serrana; AN/RE-Sul.
const PREFIX_MAP: Record<string, Polo> = {
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

export function poloFromPrefixo(prefixo: string): Polo | null {
  const p = (prefixo ?? "").trim().toUpperCase().slice(0, 2);
  return PREFIX_MAP[p] ?? null;
}

// Polo mais próximo por GPS usando as bases cadastradas com lat/lng.
export async function poloFromGeo(lat: number | null, lng: number | null): Promise<Polo | null> {
  if (lat == null || lng == null) return null;
  const { data } = await supabase
    .from("bases")
    .select("polo, latitude, longitude")
    .not("latitude", "is", null)
    .not("longitude", "is", null);
  if (!data?.length) return null;
  let best: { polo: Polo; d: number } | null = null;
  for (const b of data as any[]) {
    const d = distanceMeters(lat, lng, b.latitude, b.longitude);
    if (!best || d < best.d) best = { polo: b.polo as Polo, d };
  }
  return best?.polo ?? null;
}

export const TIPO_LABEL: Record<string, string> = {
  ATENDIMENTO_INDIVIDUAL: "Atendimento Individual",
  ORDEM_2: "Ordem 2",
  IMPRODUTIVO: "Improdutivo",
};

// Cache de URLs assinadas para evitar baixar a mesma foto várias vezes
// (URL nova = query string nova = novo download, sem cache do browser).
const urlCache = new Map<string, { url: string; exp: number }>();

export async function signedPhotoUrl(
  path: string,
  expiresIn = 3600,
  transform?: { width: number; height?: number; quality?: number },
): Promise<string | null> {
  const key = transform ? `${path}@${transform.width}x${transform.height ?? 0}q${transform.quality ?? 0}` : path;
  const hit = urlCache.get(key);
  if (hit && hit.exp > Date.now() + 60_000) return hit.url;

  const { data } = await supabase.storage
    .from("incidentes-fotos")
    .createSignedUrl(path, expiresIn, transform ? { transform: { ...transform, resize: "cover" } } : undefined);
  const url = data?.signedUrl ?? null;
  if (url) urlCache.set(key, { url, exp: Date.now() + expiresIn * 1000 });
  return url;
}