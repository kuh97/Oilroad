import { describe, expect, it } from "vitest";
import { isPriceStale } from "../cache-ttl";

describe("isPriceStale", () => {
  it("staleDays 초과 → true", () => {
    const base = new Date("2026-01-03T00:00:00Z");
    const old = new Date("2026-01-01T00:00:00Z"); // 2일 전 + 1ms
    expect(isPriceStale(new Date(old.getTime() - 1), base, 2)).toBe(true);
  });

  it("staleDays 이하 → false", () => {
    const base = new Date("2026-01-03T00:00:00Z");
    const recent = new Date("2026-01-02T00:00:00Z"); // 1일 전
    expect(isPriceStale(recent, base, 2)).toBe(false);
  });

  it("정확히 staleDays → false (경계 초과 아님)", () => {
    const base = new Date("2026-01-03T00:00:00Z");
    const exact = new Date("2026-01-01T00:00:00Z"); // 정확히 2일 전
    expect(isPriceStale(exact, base, 2)).toBe(false);
  });
});
