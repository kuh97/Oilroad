import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../route-service", () => ({ getRoute: vi.fn() }));
vi.mock("../station-service", () => ({
  collectStations: vi.fn(),
  isOpinetBudgetAvailable: vi.fn(),
}));
vi.mock("../price-service", () => ({ computeReferencePrice: vi.fn() }));
vi.mock("../event-service", () => ({ logSearch: vi.fn().mockResolvedValue(undefined) }));

import { search, QuotaExhaustedError, type ProgressEvent } from "../recommendation-service";
import { getRoute } from "../route-service";
import { collectStations, isOpinetBudgetAvailable } from "../station-service";
import { computeReferencePrice } from "../price-service";
import { logSearch } from "../event-service";
import { wgs84 } from "@/domain/types";
import { MAX_PRECISE } from "@/domain/params";
import type { BaseRoute, RefuelPoint, SearchInput, Fuel } from "@/domain/types";
import type { RedisLike } from "../route-service";
import type { Db } from "@/infra/db/client";

const getRouteMock = vi.mocked(getRoute);
const collectStationsMock = vi.mocked(collectStations);
const isOpinetBudgetAvailableMock = vi.mocked(isOpinetBudgetAvailable);
const computeReferencePriceMock = vi.mocked(computeReferencePrice);
const logSearchMock = vi.mocked(logSearch);

const FAKE_DEPS = { redis: {} as RedisLike, db: {} as Db, now: new Date("2026-08-31T03:00:00.000Z") };

// 동서 방향 약 26.4km 직선 — MIN_ROUTE_DISTANCE(20km) 초과
const BASE_ROUTE: BaseRoute = {
  distanceM: 26_400,
  durationS: 1_800,
  polyline: [wgs84(37.0, 127.0), wgs84(37.0, 127.3)],
};

function station(overrides: Partial<RefuelPoint> = {}): RefuelPoint {
  return {
    id: "A0000001",
    name: "테스트주유소",
    brandCode: "SKE",
    energyType: "OIL",
    location: wgs84(37.0, 127.15), // 경로 위 (T1)
    facilities: { carWash: false, maintenance: false, cvs: false },
    isKpetro: false,
    ...overrides,
  };
}

const VEHICLE = { fuel: "GASOLINE" as Fuel, efficiencyKmPerL: 10, refuelAmountL: 45, timeValuePerMin: 200 };

function baseInput(overrides: Partial<SearchInput> = {}): SearchInput {
  return {
    origin: wgs84(37.0, 127.0),
    destination: wgs84(37.0, 127.3),
    vehicle: VEHICLE,
    filters: { facilities: [], brands: [], kpetroOnly: false },
    mode: "balanced",
    ...overrides,
  };
}

/**
 * T1·T2·T3가 고루 섞이고 "가까움"과 "쌈"이 서로 반대 방향인 후보 묶음.
 * minDistance는 NEAR를, minCost·balanced는 FAR를 선호하므로 모드별 top3가 갈린다.
 */
function mixedCandidates() {
  return [
    // 경로 위(d_perp ≈ 0) · 비쌈 → minDistance가 선호
    ...Array.from({ length: 4 }, (_, i) => ({
      station: station({ id: `NEAR${i}`, location: wgs84(37.0, 127.02 + i * 0.03) }),
      price: 1890 - i,
    })),
    // 멀리(d_perp ≈ 5.5km) · 매우 쌈 → minCost·balanced가 선호
    ...Array.from({ length: 4 }, (_, i) => ({
      station: station({ id: `FAR${i}`, location: wgs84(37.05, 127.04 + i * 0.03) }),
      price: 1600 - i,
    })),
    // 중간(d_perp ≈ 2km) · 중간 가격
    ...Array.from({ length: 4 }, (_, i) => ({
      station: station({ id: `MID${i}`, location: wgs84(37.018, 127.06 + i * 0.03) }),
      price: 1750 - i,
    })),
  ];
}

/** getRoute가 실제로 경유지로 불러간 주유소 id */
function preciseStationIds(pool: Array<{ station: RefuelPoint }>): string[] {
  const waypoints = getRouteMock.mock.calls
    .map(([o]) => o.waypoint)
    .filter((w): w is NonNullable<typeof w> => w != null);
  return pool
    .filter((c) => waypoints.some((w) => w.lat === c.station.location.lat && w.lng === c.station.location.lng))
    .map((c) => c.station.id);
}

beforeEach(() => {
  vi.clearAllMocks();
  logSearchMock.mockResolvedValue(undefined);
  getRouteMock.mockImplementation(async (opts) => {
    if (opts.waypoint) {
      return { distanceM: BASE_ROUTE.distanceM + 6_800, durationS: BASE_ROUTE.durationS + 400, polyline: BASE_ROUTE.polyline };
    }
    return BASE_ROUTE;
  });
  isOpinetBudgetAvailableMock.mockResolvedValue(true);
  computeReferencePriceMock.mockResolvedValue({ price: 1900, source: "MEDIAN_T1T2" });
});

describe("search — 예산 소진 (STEP1 전)", () => {
  it("예산이 이미 소진됐으면 아무 것도 호출하지 않고 QuotaExhaustedError를 던진다", async () => {
    isOpinetBudgetAvailableMock.mockResolvedValue(false);

    await expect(search(baseInput(), undefined, FAKE_DEPS)).rejects.toThrow(QuotaExhaustedError);

    expect(getRouteMock).not.toHaveBeenCalled();
    expect(collectStationsMock).not.toHaveBeenCalled();
  });
});

describe("search — 확장 미발동 (T1+T2 충분)", () => {
  it("T1+T2가 MIN_CANDIDATES 이상이면 확장 수집을 하지 않는다", async () => {
    collectStationsMock.mockResolvedValue({
      stations: [
        { station: station({ id: "A1", location: wgs84(37.0, 127.1) }), price: 1700 }, // T1
        { station: station({ id: "A2", location: wgs84(37.005, 127.15) }), price: 1750 }, // T2 근처
        { station: station({ id: "A3", location: wgs84(37.0, 127.2) }), price: 1800 }, // T1
      ],
      warnings: [],
    });

    const events: ProgressEvent[] = [];
    const result = await search(baseInput(), (e) => events.push(e), FAKE_DEPS);

    expect(collectStationsMock).toHaveBeenCalledTimes(1); // 확장 호출 없음
    expect(result.expansion.triggered).toBe(false);
    expect(events.some((e) => e.type === "progress" && e.step === "EXPAND")).toBe(false);
    expect(result.candidates.length).toBeGreaterThan(0);
  });

  it("각 후보에 priceUpdatedAt(오피넷 갱신 스케줄 근사치)이 채워진다 — §6.1 가격 기준시각 표시용", async () => {
    collectStationsMock.mockResolvedValue({
      stations: [{ station: station({ id: "A1", location: wgs84(37.0, 127.1) }), price: 1700 }],
      warnings: [],
    });

    const result = await search(baseInput(), undefined, FAKE_DEPS);
    for (const c of result.candidates) {
      expect(c.priceUpdatedAt).toBeInstanceOf(Date);
    }
  });
});

describe("search — 경로 API 호출 예산 (ARCHITECTURE.md §5.3)", () => {
  // "카카오 경로 API는 검색당 항상 7회 이하 (기본 1 + 정밀 최대 MAX_PRECISE)".
  // 경유지 캐시 격자를 좁힌 뒤(근접 주유소가 더 이상 캐시를 공유하지 않음) 실제
  // 호출이 늘어나므로, 상한이 여전히 지켜지는지 후보를 많이 깔아놓고 확인한다.
  it("후보가 많아도 경로 API 호출은 1(기본) + MAX_PRECISE 이하다", async () => {
    // 모드별 top3가 갈리는 후보를 깔아 합집합이 최대로 불어난 상황을 만든다.
    // 선정 로직 자체는 "정밀 계산 대상 선정 (STEP10)" describe가 검증한다.
    collectStationsMock.mockResolvedValue({ stations: mixedCandidates(), warnings: [] });

    await search(baseInput(), undefined, FAKE_DEPS);

    const total = getRouteMock.mock.calls.length;
    const base = getRouteMock.mock.calls.filter(([o]) => !o.waypoint).length;
    const precise = getRouteMock.mock.calls.filter(([o]) => o.waypoint).length;

    expect(base).toBe(1);
    expect(precise).toBeLessThanOrEqual(MAX_PRECISE);
    expect(total).toBeLessThanOrEqual(1 + MAX_PRECISE);
  });

  it("정밀 계산 대상은 서로 다른 경유지를 쓴다 (같은 주유소를 중복 계산하지 않는다)", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      station: station({ id: `B${i}`, location: wgs84(37.0, 127.02 + i * 0.02) }),
      price: 1700 + i,
    }));
    collectStationsMock.mockResolvedValue({ stations: many, warnings: [] });

    await search(baseInput(), undefined, FAKE_DEPS);

    const waypoints = getRouteMock.mock.calls
      .map(([o]) => o.waypoint)
      .filter((w): w is NonNullable<typeof w> => w != null)
      .map((w) => `${w.lat},${w.lng}`);
    expect(new Set(waypoints).size).toBe(waypoints.length);
  });
});

describe("search — 정밀 계산 대상 선정 (STEP10)", () => {
  // PRODUCT.md §7.2 STEP 10 — "각 모드의 추정 순위 상위 3개 합집합 → MAX_PRECISE로 절단".
  // 여기서 "추정"인 것은 ΔD̂·ΔT̂뿐이고 차량 파라미터는 STEP 9와 같아야 한다(§8).
  // Q를 0으로 두면 지배항인 주유비 Q×P_s가 사라져 세 모드가 전부 우회거리 순으로
  // 무너지고, 합집합이 항상 같은 3개(=가장 가까운 후보)로 줄어든다.
  it("모드마다 다른 후보를 뽑아 합집합이 MAX_PRECISE까지 채워진다", async () => {
    const pool = mixedCandidates();
    collectStationsMock.mockResolvedValue({ stations: pool, warnings: [] });

    await search(baseInput(), undefined, FAKE_DEPS);

    const ids = preciseStationIds(pool);
    expect(ids).toHaveLength(MAX_PRECISE);
    // minDistance가 고른 "경로 위"와 minCost·balanced가 고른 "멀지만 싼" 후보가 함께 들어간다
    expect(ids.some((id) => id.startsWith("NEAR"))).toBe(true);
    expect(ids.some((id) => id.startsWith("FAR"))).toBe(true);
  });

  it("최종 목록 상위 후보는 추정치가 아니라 정밀 계산값을 쓴다", async () => {
    collectStationsMock.mockResolvedValue({ stations: mixedCandidates(), warnings: [] });

    const result = await search(baseInput(), undefined, FAKE_DEPS);

    for (const c of result.candidates.slice(0, 3)) {
      expect(c.detour.precise).toBe(true);
    }
  });

  it("minCost 모드에서도 1위 후보가 정밀 계산된다 (선정 순위와 표시 순위가 어긋나지 않는다)", async () => {
    collectStationsMock.mockResolvedValue({ stations: mixedCandidates(), warnings: [] });

    const result = await search(baseInput({ mode: "minCost" }), undefined, FAKE_DEPS);

    expect(result.candidates[0].detour.precise).toBe(true);
  });
});

describe("search — T3 게이트 (STEP8)", () => {
  it("NetSaving>0인 T3 후보는 살아남고, expansion.finalRadiusM에 그 d_perp가 반영된다", async () => {
    collectStationsMock.mockResolvedValue({
      stations: [
        { station: station({ id: "A1", location: wgs84(37.0, 127.1) }), price: 1700 }, // T1
        { station: station({ id: "A2", location: wgs84(37.0, 127.2) }), price: 1750 }, // T1
        { station: station({ id: "A3", location: wgs84(37.05, 127.15) }), price: 1700 }, // T3, 가격도 저렴 → 게이트 통과
      ],
      warnings: [],
    });

    const result = await search(baseInput(), undefined, FAKE_DEPS);

    const t3 = result.candidates.find((c) => c.station.id === "A3");
    expect(t3).toBeDefined();
    expect(t3!.tier).toBe("T3");
    expect(result.expansion.finalRadiusM).toBeGreaterThan(3_000); // T2_MAX 초과 — T3가 채택됐다는 뜻
    expect(result.expansion.finalRadiusM).toBe(t3!.dPerp);
  });

  it("NetSaving<=0인 T3 후보는 목록에서 제외된다", async () => {
    collectStationsMock.mockResolvedValue({
      stations: [
        { station: station({ id: "A1", location: wgs84(37.0, 127.1) }), price: 1700 },
        { station: station({ id: "A2", location: wgs84(37.0, 127.2) }), price: 1750 },
        // T3인데 오히려 더 비쌈 → 우회할 이유가 없어 게이트 탈락
        { station: station({ id: "A3", location: wgs84(37.05, 127.15) }), price: 2500 },
      ],
      warnings: [],
    });

    const result = await search(baseInput(), undefined, FAKE_DEPS);

    expect(result.candidates.find((c) => c.station.id === "A3")).toBeUndefined();
    expect(result.expansion.finalRadiusM).toBe(3_000); // 채택된 T3 없음 → T2_MAX 폴백
  });
});

describe("search — 짧은 경로에서도 우회 후보를 보여준다 (사용자 실측: 남한산성입구역→을지대학교)", () => {
  it("기본 경로가 MIN_ROUTE_DISTANCE 미만이면 우회가 D_base×50%를 넘어도 후보를 제외하지 않는다", async () => {
    // 기본 경로 2km — 실사용 보고 사례와 같은 규모. 50% cap이면 1km인데, 실제 우회는
    // 훨씬 크게 나온다(정밀 계산 결과 10km). 짧은 경로 예외가 없으면 STEP11에서 전부 걸러진다.
    getRouteMock.mockImplementation(async (opts) => {
      if (opts.waypoint) {
        return { distanceM: 12_000, durationS: 900, polyline: BASE_ROUTE.polyline }; // 우회 10,000m
      }
      return { distanceM: 2_000, durationS: 300, polyline: BASE_ROUTE.polyline };
    });
    collectStationsMock.mockResolvedValue({
      stations: [
        { station: station({ id: "A1", location: wgs84(37.0, 127.1) }), price: 1700 }, // T1
        { station: station({ id: "A2", location: wgs84(37.0, 127.2) }), price: 1750 }, // T1
        { station: station({ id: "A3", location: wgs84(37.05, 127.15) }), price: 1500 }, // T3, 저렴 → 게이트 통과
      ],
      warnings: [],
    });

    const result = await search(baseInput(), undefined, FAKE_DEPS);

    const t3 = result.candidates.find((c) => c.station.id === "A3");
    expect(t3).toBeDefined();
    expect(t3!.detour.distanceM).toBe(10_000); // 50% cap(1,000m)을 훨씬 넘지만 살아있어야 함
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "SHORT_ROUTE" }));
  });
});

describe("search — 확장 발동", () => {
  it("T1+T2가 MIN_CANDIDATES 미만이면 확장 수집을 하고 결과에 반영한다", async () => {
    collectStationsMock
      .mockResolvedValueOnce({
        stations: [{ station: station({ id: "A1", location: wgs84(37.0, 127.1) }), price: 1700 }], // T1 1개뿐
        warnings: [],
      })
      .mockResolvedValueOnce({
        stations: [{ station: station({ id: "A2", location: wgs84(37.002, 127.15) }), price: 1750 }], // 확장으로 추가 발견 (T2)
        warnings: [],
      });

    const events: ProgressEvent[] = [];
    const result = await search(baseInput(), (e) => events.push(e), {
      ...FAKE_DEPS,
      expansionEnabled: true,
    });

    expect(collectStationsMock).toHaveBeenCalledTimes(2);
    expect(result.expansion.triggered).toBe(true);
    expect(events.some((e) => e.type === "progress" && e.step === "EXPAND")).toBe(true);
    expect(result.candidates.map((c) => c.station.id).sort()).toEqual(["A1", "A2"]);
  });

  it("FEATURE_EXPANSION_ENABLED이 꺼져 있으면 확장하지 않고 DISABLED로 표시한다", async () => {
    collectStationsMock.mockResolvedValue({
      stations: [{ station: station({ id: "A1" }), price: 1700 }],
      warnings: [],
    });

    const result = await search(baseInput(), undefined, { ...FAKE_DEPS, expansionEnabled: false });

    expect(collectStationsMock).toHaveBeenCalledTimes(1);
    expect(result.expansion.triggered).toBe(false);
    expect(result.expansion.skippedReason).toBe("DISABLED");
  });

  it("확장 시점에 예산이 소진돼 있으면 QUOTA로 건너뛰고 경고를 남긴다", async () => {
    collectStationsMock.mockResolvedValue({
      stations: [{ station: station({ id: "A1" }), price: 1700 }],
      warnings: [],
    });
    isOpinetBudgetAvailableMock
      .mockResolvedValueOnce(true) // STEP0 진입 가드
      .mockResolvedValueOnce(false); // STEP5→6 게이트

    const result = await search(baseInput(), undefined, { ...FAKE_DEPS, expansionEnabled: true });

    expect(collectStationsMock).toHaveBeenCalledTimes(1);
    expect(result.expansion.skippedReason).toBe("QUOTA");
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "QUOTA_EXCEEDED" }));
  });
});

describe("search — 부분 실패", () => {
  it("station-service 경고가 있어도 성공 구간으로 결과를 만들고 경고를 전달한다", async () => {
    collectStationsMock.mockResolvedValue({
      stations: [
        { station: station({ id: "A1", location: wgs84(37.0, 127.1) }), price: 1700 },
        { station: station({ id: "A2", location: wgs84(37.0, 127.2) }), price: 1750 },
        { station: station({ id: "A3", location: wgs84(37.0, 127.25) }), price: 1800 },
      ],
      warnings: [{ code: "PARTIAL_STATION_FETCH_FAILED", message: "일부 지점 실패" }],
    });

    const events: ProgressEvent[] = [];
    const result = await search(baseInput(), (e) => events.push(e), FAKE_DEPS);

    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "PARTIAL_STATION_FETCH_FAILED" }),
    );
    expect(events.some((e) => e.type === "warning" && e.data.code === "PARTIAL_STATION_FETCH_FAILED")).toBe(
      true,
    );
  });
});

describe("search — onProgress 유무와 무관하게 동일한 결과", () => {
  it("콜백을 넘기지 않아도 같은 SearchResult(가 searchId 제외)를 반환한다", async () => {
    collectStationsMock.mockResolvedValue({
      stations: [
        { station: station({ id: "A1", location: wgs84(37.0, 127.1) }), price: 1700 },
        { station: station({ id: "A2", location: wgs84(37.0, 127.2) }), price: 1750 },
        { station: station({ id: "A3", location: wgs84(37.0, 127.25) }), price: 1800 },
      ],
      warnings: [],
    });

    const withCallback = await search(baseInput(), () => {}, FAKE_DEPS);
    const withoutCallback = await search(baseInput(), undefined, FAKE_DEPS);

    const { searchId: searchIdA, ...a } = withCallback;
    const { searchId: searchIdB, ...b } = withoutCallback;
    void searchIdA;
    void searchIdB;
    expect(a).toEqual(b);
  });
});

describe("search — event-service 호출 (fire-and-forget 스텁)", () => {
  it("결과를 반환하면서 logSearch를 호출한다", async () => {
    collectStationsMock.mockResolvedValue({
      stations: [
        { station: station({ id: "A1", location: wgs84(37.0, 127.1) }), price: 1700 },
        { station: station({ id: "A2", location: wgs84(37.0, 127.2) }), price: 1750 },
        { station: station({ id: "A3", location: wgs84(37.0, 127.25) }), price: 1800 },
      ],
      warnings: [],
    });

    await search(baseInput(), undefined, FAKE_DEPS);
    expect(logSearchMock).toHaveBeenCalledTimes(1);
  });
});
