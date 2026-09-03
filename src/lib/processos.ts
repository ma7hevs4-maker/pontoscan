export interface ProcessoInfo {
  letra: string;
  setor: string;
  identificacao: string;
  processo: string;
}

export const PROCESSOS: ProcessoInfo[] = [
  { letra: "A", setor: "AMP", identificacao: "AMPLA CHIP", processo: "Perdas" },
  { letra: "R", setor: "COR", identificacao: "CORTE E RELIGAÇÃO", processo: "Comercial" },
  { letra: "L", setor: "LIG", identificacao: "NOVAS LIGAÇÕES", processo: "Comercial" },
  { letra: "F", setor: "FIS", identificacao: "GESTOR NOVAS LIGAÇÕES", processo: "Comercial" },
  { letra: "P", setor: "PER", identificacao: "PERDAS", processo: "Perdas" },
  { letra: "M", setor: "MAN", identificacao: "MANUTENÇÃO", processo: "Manutenção" },
  { letra: "D", setor: "POD", identificacao: "PODA", processo: "Poda" },
  { letra: "V", setor: "LIV", identificacao: "LINHA VIVA", processo: "Linha Viva" },
  { letra: "T", setor: "TEL", identificacao: "TELECONTROLE", processo: "Telecontrole" },
  { letra: "B", setor: "OBR", identificacao: "OBRAS", processo: "Obras" },
  { letra: "O", setor: "OPE", identificacao: "OPERAÇÃO", processo: "Emergência" },
  { letra: "X", setor: "EXT", identificacao: "EXTRA OPERAÇÃO", processo: "Emergência" },
];

const POR_LETRA = new Map(PROCESSOS.map((p) => [p.letra, p]));

/** Lista única de processos, na ordem solicitada para os KPIs. */
export const PROCESSOS_UNICOS: string[] = [
  "Emergência",
  "Comercial",
  "Poda",
  "Perdas",
  "Manutenção",
  "Linha Viva",
  "Telecontrole",
  "Obras",
];

/** Retorna o processo da equipe com base no 7º caractere do prefixo. */
export function processoDe(prefixo: string): ProcessoInfo | null {
  const limpo = (prefixo ?? "").trim().toUpperCase();
  const letra = limpo.charAt(6);
  if (!letra) return null;
  return POR_LETRA.get(letra) ?? null;
}

export function nomeProcesso(prefixo: string): string {
  return processoDe(prefixo)?.processo ?? "—";
}
