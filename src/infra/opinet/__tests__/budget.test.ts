import { describe, expect, it } from "vitest";
import { incrementBudget, checkBudget, getBudgetKey } from "../budget";
import type { BudgetStore } from "../budget";

// ─── 인메모리 BudgetStore 목 ──────────────────────────────────────────────────

interface BudgetStoreWithGet extends BudgetStore {
  get(key: string): Promise<string | null>;
}

class MockBudgetStore implements BudgetStoreWithGet {
  private counters: Record<string, number> = {};
  private expires: Record<string, number> = {};

  async incrby(key: string, increment: number): Promise<number> {
    this.counters[key] = (this.counters[key] ?? 0) + increment;
    return this.counters[key];
  }

  async expire(key: string, seconds: number): Promise<number> {
    this.expires[key] = seconds;
    return 1;
  }

  async get(key: string): Promise<string | null> {
    const v = this.counters[key];
    return v !== undefined ? String(v) : null;
  }

  getExpire(key: string): number | undefined { return this.expires[key]; }
  getCount(key: string): number { return this.counters[key] ?? 0; }
}

describe("getBudgetKey", () => {
  it("prefix:opinet:budget:날짜 형식", () => {
    expect(getBudgetKey("dev", "2026-01-01")).toBe("dev:opinet:budget:2026-01-01");
    expect(getBudgetKey("prod", "2026-12-31")).toBe("prod:opinet:budget:2026-12-31");
  });
});

describe("incrementBudget", () => {
  it("첫 번째 호출은 count=1, allowed=true (limit이 1 이상이면)", async () => {
    const store = new MockBudgetStore();
    const result = await incrementBudget(store, "test:budget", 10);
    expect(result.count).toBe(1);
    expect(result.allowed).toBe(true);
  });

  it("limit 이하 → allowed=true", async () => {
    const store = new MockBudgetStore();
    const key = "test:budget";
    for (let i = 0; i < 5; i++) {
      const r = await incrementBudget(store, key, 5);
      expect(r.allowed).toBe(true);
    }
  });

  it("limit 초과 → allowed=false", async () => {
    const store = new MockBudgetStore();
    const key = "test:budget";
    const limit = 3;

    for (let i = 0; i < limit; i++) {
      await incrementBudget(store, key, limit);
    }
    const over = await incrementBudget(store, key, limit);
    expect(over.allowed).toBe(false);
    expect(over.count).toBe(limit + 1);
  });

  it("첫 번째 increment 시 26시간 TTL 설정", async () => {
    const store = new MockBudgetStore();
    const key = "test:ttl";
    await incrementBudget(store, key, 100);
    expect(store.getExpire(key)).toBe(26 * 60 * 60);
  });

  it("두 번째 increment 시 TTL 재설정 없음 (26h TTL이 이미 있음)", async () => {
    const store = new MockBudgetStore();
    const key = "test:once";
    await incrementBudget(store, key, 100);
    const firstExpire = store.getExpire(key);
    await incrementBudget(store, key, 100);
    // expire는 첫 번째에만 호출되므로 두 번 호출해도 같은 값
    expect(store.getExpire(key)).toBe(firstExpire);
  });

  it("★ 동시 호출에서 상한에서 정확히 막힌다", async () => {
    const store = new MockBudgetStore();
    const key = "test:concurrent";
    const limit = 5;

    // 10번 동시 호출
    const results = await Promise.all(
      Array.from({ length: 10 }, () => incrementBudget(store, key, limit)),
    );

    const allowed = results.filter((r) => r.allowed);
    const blocked = results.filter((r) => !r.allowed);

    expect(allowed).toHaveLength(limit);
    expect(blocked).toHaveLength(5);
    expect(store.getCount(key)).toBe(10);
  });
});

describe("checkBudget", () => {
  it("카운터 없으면 허용 (count=0)", async () => {
    const store = new MockBudgetStore();
    expect(await checkBudget(store, "test:empty", 10)).toBe(true);
  });

  it("count < limit → true", async () => {
    const store = new MockBudgetStore();
    await incrementBudget(store, "test:key", 100); // count=1
    expect(await checkBudget(store, "test:key", 10)).toBe(true);
  });

  it("count === limit → false (이미 소진)", async () => {
    const store = new MockBudgetStore();
    const key = "test:exact";
    for (let i = 0; i < 5; i++) {
      await incrementBudget(store, key, 100);
    }
    expect(await checkBudget(store, key, 5)).toBe(false);
  });
});
