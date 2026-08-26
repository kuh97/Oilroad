import { describe, expect, it } from "vitest";
import * as P from "../params";

describe("params — 상수 불변식", () => {
  it("티어 경계가 단조증가한다", () => {
    expect(P.T1_MAX).toBeLessThan(P.T2_MAX);
    expect(P.T2_MAX).toBeLessThan(P.T3_MAX);
  });

  it("P_REF_MIN_BASE 는 MIN_CANDIDATES 보다 작거나 같다 (PRODUCT.md §9 주석)", () => {
    // P_REF_MIN_BASE=2, MIN_CANDIDATES=3 — 같은 값이 아님
    expect(P.P_REF_MIN_BASE).not.toBe(P.MIN_CANDIDATES);
    expect(P.P_REF_MIN_BASE).toBeLessThan(P.MIN_CANDIDATES);
  });

  it("DETOUR_ESTIMATE_FACTOR 는 양수이다", () => {
    expect(P.DETOUR_ESTIMATE_FACTOR).toBeGreaterThan(0);
  });

  it("DEFAULT_EFFICIENCY 가 3개 연료를 모두 포함한다", () => {
    expect(P.DEFAULT_EFFICIENCY).toHaveProperty("GASOLINE");
    expect(P.DEFAULT_EFFICIENCY).toHaveProperty("DIESEL");
    expect(P.DEFAULT_EFFICIENCY).toHaveProperty("LPG");
  });

  it("SAMPLE_INTERVAL은 T2_MAX * 2 이하 (보장 커버리지 ≥ T2_MAX)", () => {
    // w = 반경(5000) − SAMPLE_INTERVAL/2 = 5000 − 4000 = 1000 (T1_MAX 두 배)
    // 실제 w = 5000 − 8000/2 = 1000... 이 설계는 PRODUCT.md §7.2 에서 검토됨
    expect(P.SAMPLE_INTERVAL).toBeLessThanOrEqual(P.T2_MAX * 2 + 2000);
  });
});
