/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { campusLimit, campusUsesSince, collectCampusRows } from "./export-campus";

describe("Campus export", () => {
  test("defaults to 5000 rows", () => {
    expect(campusLimit(null)).toBe(5000);
  });
  test("caps requests at 10000 rows", () => {
    expect(campusLimit("20000")).toBe(10000);
  });
  test("uses since for profiles and team incidents, but not bases", () => {
    expect(campusUsesSince("profiles")).toBe(true);
    expect(campusUsesSince("equipe_incidentes")).toBe(true);
    expect(campusUsesSince("bases")).toBe(false);
  });
  test("collects 5000 rows in five inclusive ranges of 1000", async () => {
    const calls: number[][] = [];
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
    const calls: number[][] = [];
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