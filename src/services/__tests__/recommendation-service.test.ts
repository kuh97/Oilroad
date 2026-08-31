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
