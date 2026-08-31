import { describe, expect, it, vi } from "vitest";
import { computeReferencePrice } from "../price-service";
import type { Db } from "@/infra/db/client";

const FAKE_DB = {} as Db;

describe("computeReferencePrice — 중앙값 우선", () => {
  it("T1+T2가 P_REF_MIN_BASE(2) 이상이면 시군구 평균과 무관하게 중앙값을 쓴다", async () => {
    const findSigungu = vi.fn();
    const result = await computeReferencePrice({
      t1t2Prices: [1800, 1900],
      pool: [{ sigunCd: "0101" }, { sigunCd: "0101" }],
      fuel: "GASOLINE",
      db: FAKE_DB,
      findSigunguAvgPrice: findSigungu,
      findSidoAvgPrice: vi.fn(),
      findNationalAvgPrice: vi.fn(),
    });
    expect(result).toEqual({ price: 1850, source: "MEDIAN_T1T2" });
  });
});

describe("computeReferencePrice — 시군구 가중평균 폴백", () => {
  it("T1+T2가 부족하면 sigunCd별 후보 수를 가중치로 한 가중평균을 쓴다", async () => {
    const findSigungu = vi.fn(async (sigunCd: string) => {
      if (sigunCd === "0101") return 1900;
      if (sigunCd === "0102") return 2100;
      return null;
    });
    // 0101: 후보 3개, 0102: 후보 1개 → 가중평균 = (1900*3 + 2100*1) / 4 = 1950
    const result = await computeReferencePrice({
      t1t2Prices: [1800], // P_REF_MIN_BASE(2) 미만
      pool: [
        { sigunCd: "0101" },
        { sigunCd: "0101" },
        { sigunCd: "0101" },
        { sigunCd: "0102" },
      ],
      fuel: "GASOLINE",
      db: FAKE_DB,
      findSigunguAvgPrice: findSigungu,
      findSidoAvgPrice: vi.fn(),
      findNationalAvgPrice: vi.fn(),
    });
    expect(result).toEqual({ price: 1950, source: "SIGUNGU_AVG" });
  });

  it("시군구 평균이 없으면 시도 평균으로, 그것도 없으면 전국 평균으로 폴백한다", async () => {
    const findSigungu = vi.fn().mockResolvedValue(null);
    const findSido = vi.fn(async (sido: string) => (sido === "01" ? 2000 : null));
    const findNational = vi.fn().mockResolvedValue(1750);

    const result = await computeReferencePrice({
      t1t2Prices: [],
      pool: [{ sigunCd: "0101" }, { sigunCd: "9999" }],
      fuel: "LPG",
      db: FAKE_DB,
      findSigunguAvgPrice: findSigungu,
      findSidoAvgPrice: findSido,
      findNationalAvgPrice: findNational,
    });

    // 0101 → 시도(01) 평균 2000, 9999 → 시군구/시도 없음 → 전국 평균 1750
    expect(result).toEqual({ price: 1875, source: "SIGUNGU_AVG" });
  });

  it("sigunCd가 없는 후보는 가중치 계산에서 제외된다", async () => {
    const findSigungu = vi.fn().mockResolvedValue(1900);
    const result = await computeReferencePrice({
      t1t2Prices: [],
      pool: [{ sigunCd: "0101" }, {}, {}],
      fuel: "GASOLINE",
      db: FAKE_DB,
      findSigunguAvgPrice: findSigungu,
      findSidoAvgPrice: vi.fn(),
      findNationalAvgPrice: vi.fn(),
    });
    expect(result).toEqual({ price: 1900, source: "SIGUNGU_AVG" });
    expect(findSigungu).toHaveBeenCalledTimes(1);
  });
});

describe("computeReferencePrice — A14 (모두 없음)", () => {
  it("T1+T2도 부족하고 시군구/시도/전국 평균도 없으면 null을 반환한다", async () => {
    const result = await computeReferencePrice({
      t1t2Prices: [],
      pool: [],
      fuel: "GASOLINE",
      db: FAKE_DB,
      findSigunguAvgPrice: vi.fn().mockResolvedValue(null),
      findSidoAvgPrice: vi.fn().mockResolvedValue(null),
      findNationalAvgPrice: vi.fn().mockResolvedValue(null),
    });
    expect(result).toBeNull();
  });

  it("pool의 모든 그룹이 시군구/시도/전국 전부 null이면 null을 반환한다", async () => {
    const result = await computeReferencePrice({
      t1t2Prices: [1800], // P_REF_MIN_BASE 미만
      pool: [{ sigunCd: "0101" }],
      fuel: "GASOLINE",
      db: FAKE_DB,
      findSigunguAvgPrice: vi.fn().mockResolvedValue(null),
      findSidoAvgPrice: vi.fn().mockResolvedValue(null),
      findNationalAvgPrice: vi.fn().mockResolvedValue(null),
    });
    expect(result).toBeNull();
  });
});
