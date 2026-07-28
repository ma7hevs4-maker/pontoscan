import { supabase } from "@/integrations/supabase/client";
import { distanceMeters } from "@/lib/geo";

export type Polo =
  | "Magé" | "Niterói" | "São Gonçalo" | "Serrana" | "Sul"
  | "Campos" | "Lagos" | "Macaé" | "Noroeste" | "Perdas" | "Comercial";

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

export async function signedPhotoUrl(path: string, expiresIn = 3600): Promise<string | null> {
  const { data } = await supabase.storage.from("incidentes-fotos").createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}