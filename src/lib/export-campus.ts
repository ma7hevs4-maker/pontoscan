export const CAMPUS_PAGE_SIZE = 1000;

export function campusLimit(raw: string | null): number {
  const value = Number(raw ?? 5000);
  return Number.isFinite(value) && value > 0
    ? Math.min(Math.floor(value), 10000)
    : 5000;
}

export function campusUsesSince(table: string): boolean {
  return ["registros", "incidentes", "profiles", "equipe_incidentes"].includes(table);
}

export async function collectCampusRows<T>(
  limit: number,
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const rows: T[] = [];
  while (rows.length < limit) {
    const pageSize = Math.min(CAMPUS_PAGE_SIZE, limit - rows.length);
    const { data, error } = await fetchPage(rows.length, rows.length + pageSize - 1);
    if (error) return { data: [], error };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return { data: rows, error: null };
}