import { describe, expect, test } from "bun:test";
import { campusLimit, campusUsesSince, collectCampusRows, campusOrder, CAMPUS_TABLES, readCampusExport } from "./export-campus";

describe("Campus export", () => {
  test("defaults to 5000 rows", () => {
    expect(campusLimit(null)).toBe(5000);
  });
  test("caps requests at 10000 rows", () => {
    expect(campusLimit("20000")).toBe(10000);
  });
  test("uses since for every dated table and ignores it for app settings", () => {
    expect(campusUsesSince("profiles")).toBe(true);
    expect(campusUsesSince("equipe_incidentes")).toBe(true);
    for (const table of CAMPUS_TABLES.filter((name) => name !== "app_settings")) expect(campusUsesSince(table)).toBe(true);
    expect(campusUsesSince("app_settings")).toBe(false);
  });
  test("orders forms by ordem and their unique key", () => {
    expect(campusOrder("form_tipos")).toEqual(["ordem", "chave"]);
    expect(campusOrder("form_questions")).toEqual(["ordem", "id"]);
    expect(campusOrder("app_settings")).toEqual(["chave"]);
    expect(campusOrder("equipe_incidentes")).toEqual(["created_at", "id"]);
  });
  for (const table of CAMPUS_TABLES) {
    test(`exports ${table} with pagination, ordering and applicable since`, async () => {
      const calls = [];
      const rows = Array.from({ length: 1250 }, (_, id) => ({ id, ponto_eletrico: "PE", alimentador: "AL" }));
      const query = {
        select(value) { calls.push(["select", value]); return this; },
        order(column, options) { calls.push(["order", column, options.ascending]); return this; },
        gt(column, value) { calls.push(["gt", column, value]); return this; },
        range(from, to) { calls.push(["range", from, to]); return Promise.resolve({ data: rows.slice(from, to + 1), error: null }); },
      };
      const client = { from(name) { expect(name).toBe(table); return query; } };
      const response = await readCampusExport(client, new URL(`https://example.test/?tabela=${table}&limite=1250&desde=2026-09-01T00:00:00Z`));
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.total).toBe(1250);
      expect(calls.filter(([name]) => name === "range")).toEqual([["range", 0, 999], ["range", 1000, 1249]]);
      expect(calls.filter(([name]) => name === "order").slice(0, campusOrder(table).length)).toEqual(campusOrder(table).map((column) => ["order", column, true]));
      expect(calls.find(([name]) => name === "select")?.[1]).toBe(table === "profiles" ? "id, nome, prefixo, polo" : "*");
      expect(calls.filter(([name]) => name === "gt").length).toBe(table === "app_settings" ? 0 : 2);
      if (table === "equipe_incidentes") expect(body.linhas[0]).toEqual({ id: 0, ponto_eletrico: "PE", alimentador: "AL" });
    });
  }
  test("photo signs from incidentes-fotos for exactly one hour", async () => {
    const client = { storage: { from(bucket) {
      expect(bucket).toBe("incidentes-fotos");
      return { async createSignedUrl(path, expiry) {
        expect(path).toBe("user/photo.jpg");
        expect(expiry).toBe(3600);
        return { data: { signedUrl: "https://example.test/signed" }, error: null };
      } };
    } } };
    const response = await readCampusExport(client, new URL("https://example.test/?foto=user%2Fphoto.jpg"));
    expect(await response.json()).toEqual({ url: "https://example.test/signed" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  test("invalid photo paths do not reach storage", async () => {
    for (const path of ["", "../photo.jpg", "/photo.jpg"]) {
      const response = await readCampusExport({}, new URL(`https://example.test/?foto=${encodeURIComponent(path)}`));
      expect(response.status).toBe(400);
    }
  });
  test("collects 5000 rows in five inclusive ranges of 1000", async () => {
    const calls = [];
    const result = await collectCampusRows(5000, async (from, to) => {
      calls.push([from, to]);
      return { data: Array.from({ length: to - from + 1 }, (_, i) => from + i), error: null };
    });
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999], [3000, 3999], [4000, 4999]]);
    expect(result.data.length).toBe(5000);
    expect(result.data[4999]).toBe(4999);
  });
  test("stops when rows run out", async () => {
    let calls = 0;
    const result = await collectCampusRows(5000, async (from, to) => {
      calls++;
      return { data: Array.from({ length: Math.min(to - from + 1, 1264 - from) }, (_, i) => from + i), error: null };
    });
    expect(result.data.length).toBe(1264);
    expect(calls).toBe(2);
  });
  test("handles a final range smaller than 1000", async () => {
    const calls = [];
    const result = await collectCampusRows(1250, async (from, to) => {
      calls.push([from, to]);
      return { data: Array(to - from + 1).fill(0), error: null };
    });
    expect(calls).toEqual([[0, 999], [1000, 1249]]);
    expect(result.data.length).toBe(1250);
  });
  test("does not return partial rows on a page error", async () => {
    const result = await collectCampusRows(5000, async (from) => from === 0
      ? { data: Array(1000).fill(0), error: null }
      : { data: null, error: { message: "failed" } });
    expect(result.error?.message).toBe("failed");
    expect(result.data).toEqual([]);
  });
});