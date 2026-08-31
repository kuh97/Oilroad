import { describe, expect, it, vi, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../tests/msw/server";
import {
  collectStations,
  isOpinetBudgetAvailable,
  type RedisLike,
} from "../station-service";
import { setSemaphore, createSemaphore } from "@/infra/opinet/client";
import { wgs84ToProjected, wgs84ToKatec, projectedToWgs84 } from "@/domain/geo";
import { wgs84 } from "@/domain/types";
import type { RefuelPoint } from "@/domain/types";

vi.stubEnv("OPINET_CERT_KEY", "test-cert-key");
vi.stubEnv("OPINET_BASE_URL", "https://www.opinet.co.kr/api");
vi.stubEnv("OPINET_CONCURRENCY", "4");
vi.stubEnv("OPINET_DAILY_BUDGET", "1400");
vi.stubEnv("REDIS_KEY_PREFIX", "test");

const POINT_A = wgs84ToProjected(wgs84(37.42, 127.12));
const POINT_B = wgs84ToProjected(wgs84(37.5, 127.2));
// station-service는 지점을 오피넷 호출 전 KATEC으로 변환합니다 — MSW 핸들러에서
// 요청 x/y로 지점을 구분하려면 실제로 전송되는 KATEC 좌표와 비교해야 합니다.
const KATEC_A_X = String(wgs84ToKatec(projectedToWgs84(POINT_A)).x);
const NOW = new Date("2026-08-31T03:00:00.000Z"); // 12:00 KST

beforeEach(() => {
  setSemaphore(createSemaphore(4));
});

// 실제 Redis처럼 get/set/incrby가 같은 키스페이스(단일 Map)를 공유합니다.
function fakeRedis(): RedisLike & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    async get(key) {
      return store.get(key) ?? null;
    },
    async set(key, value) {
      store.set(key, value);
      return "OK";
    },
    async incrby(key, n) {
      const next = (Number(store.get(key)) || 0) + n;
      store.set(key, String(next));
      return next;
    },
    async expire() {
      return 1;
    },
  };
}

function radiusResponse(items: Array<{ uniId: string; brand: string; name: string; price: number }>) {
  return {
    RESULT: {
      OIL: items.map((i) => ({
        UNI_ID: i.uniId,
        POLL_DIV_CD: i.brand,
        OS_NM: i.name,
        PRICE: i.price,
        DISTANCE: 500,
        GIS_X_COOR: 315_000,
        GIS_Y_COOR: 544_000,
      })),
    },
  };
}

function refuelPoint(overrides: Partial<RefuelPoint> = {}): RefuelPoint {
  return {
    id: "A0000001",
    name: "테스트주유소",
    brandCode: "SKE",
    energyType: "OIL",
    location: wgs84(37.46, 127.03),
    facilities: { carWash: false, maintenance: false, cvs: false },
    isKpetro: false,
    ...overrides,
  };
}

const noFilters = { facilities: [], brands: [], kpetroOnly: false };

describe("collectStations — dedupe", () => {
  it("여러 지점에서 같은 UNI_ID가 나오면 첫 항목의 가격을 유지한다", async () => {
    server.use(
      http.get("https://www.opinet.co.kr/api/aroundAll.do", ({ request }) => {
        const x = new URL(request.url).searchParams.get("x");
        const items =
          x === KATEC_A_X
            ? [{ uniId: "A0000001", brand: "SKE", name: "A", price: 1700 }]
            : [{ uniId: "A0000001", brand: "SKE", name: "A", price: 1800 }];
        return HttpResponse.json(radiusResponse(items));
      }),
    );

    const findByIds = vi.fn().mockResolvedValue([refuelPoint()]);
    const result = await collectStations({
      points: [POINT_A, POINT_B],
      fuel: "GASOLINE",
      filters: noFilters,
      redis: fakeRedis(),
      now: NOW,
      findRefuelPointsByIds: findByIds,
    });

    expect(result.stations).toHaveLength(1);
    expect(result.stations[0].price).toBe(1700);
  });
});

describe("collectStations — 마스터 DB 조인 / 폴백 C", () => {
  it("마스터에 있으면 findRefuelPointsByIds 결과를 쓰고 상세 API를 호출하지 않는다", async () => {
    server.use(
      http.get("https://www.opinet.co.kr/api/aroundAll.do", () =>
        HttpResponse.json(radiusResponse([{ uniId: "A0000001", brand: "SKE", name: "A", price: 1700 }])),
      ),
      http.get("https://www.opinet.co.kr/api/detailById.do", () => {
        throw new Error("호출되면 안 됨 — 마스터에 이미 있음");
      }),
    );

    const findByIds = vi.fn().mockResolvedValue([refuelPoint({ facilities: { carWash: true, maintenance: false, cvs: false } })]);
    const result = await collectStations({
      points: [POINT_A],
      fuel: "GASOLINE",
      filters: noFilters,
      redis: fakeRedis(),
      now: NOW,
      findRefuelPointsByIds: findByIds,
    });

    expect(result.stations).toHaveLength(1);
    expect(result.stations[0].station.facilities.carWash).toBe(true);
  });

  it("마스터에 없으면 상세 API로 보강(폴백 C) 후 사용한다", async () => {
    server.use(
      http.get("https://www.opinet.co.kr/api/aroundAll.do", () =>
        HttpResponse.json(radiusResponse([{ uniId: "A0009916", brand: "SKE", name: "A", price: 1700 }])),
      ),
      http.get("https://www.opinet.co.kr/api/detailById.do", () =>
        HttpResponse.json({
          RESULT: {
            OIL: [
              {
                UNI_ID: "A0009916",
                POLL_DIV_CO: "SKE",
                OS_NM: "대신석유",
                GIS_X_COOR: 315_069.06,
                GIS_Y_COOR: 540_497.58,
                MAINT_YN: "N",
                CAR_WASH_YN: "Y",
                KPETRO_YN: "N",
                CVS_YN: "N",
              },
            ],
          },
        }),
      ),
    );

    const findByIds = vi
      .fn()
      .mockResolvedValueOnce([]) // 첫 조회 — 마스터에 없음
      .mockResolvedValueOnce([refuelPoint({ id: "A0009916", facilities: { carWash: true, maintenance: false, cvs: false } })]); // upsert 후 재조회
    const upsert = vi.fn().mockResolvedValue(undefined);

    const result = await collectStations({
      points: [POINT_A],
      fuel: "GASOLINE",
      filters: noFilters,
      redis: fakeRedis(),
      now: NOW,
      findRefuelPointsByIds: findByIds,
      upsertRefuelPointFromDetail: upsert,
    });

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(result.stations).toHaveLength(1);
    expect(result.stations[0].station.id).toBe("A0009916");
  });

  it("상세 API 보강도 실패하면 그 후보는 조용히 제외한다", async () => {
    server.use(
      http.get("https://www.opinet.co.kr/api/aroundAll.do", () =>
        HttpResponse.json(radiusResponse([{ uniId: "A0009916", brand: "SKE", name: "A", price: 1700 }])),
      ),
      http.get("https://www.opinet.co.kr/api/detailById.do", () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );

    const findByIds = vi.fn().mockResolvedValue([]); // 마스터에도 없음
    const result = await collectStations({
      points: [POINT_A],
      fuel: "GASOLINE",
      filters: noFilters,
      retries: 0,
      redis: fakeRedis(),
      now: NOW,
      findRefuelPointsByIds: findByIds,
    });

    expect(result.stations).toHaveLength(0);
  });
});

describe("collectStations — 필터 적용", () => {
  it("시설 필터를 모두 만족하지 않으면 제외한다", async () => {
    server.use(
      http.get("https://www.opinet.co.kr/api/aroundAll.do", () =>
        HttpResponse.json(radiusResponse([{ uniId: "A0000001", brand: "SKE", name: "A", price: 1700 }])),
      ),
    );
    const findByIds = vi.fn().mockResolvedValue([refuelPoint({ facilities: { carWash: false, maintenance: false, cvs: false } })]);

    const result = await collectStations({
      points: [POINT_A],
      fuel: "GASOLINE",
      filters: { facilities: ["CAR_WASH"], brands: [], kpetroOnly: false },
      redis: fakeRedis(),
      now: NOW,
      findRefuelPointsByIds: findByIds,
    });

    expect(result.stations).toHaveLength(0);
  });

  it("brands 필터에 없는 브랜드는 제외한다", async () => {
    server.use(
      http.get("https://www.opinet.co.kr/api/aroundAll.do", () =>
        HttpResponse.json(radiusResponse([{ uniId: "A0000001", brand: "GSC", name: "A", price: 1700 }])),
      ),
    );
    const findByIds = vi.fn().mockResolvedValue([refuelPoint({ brandCode: "GSC" })]);

    const result = await collectStations({
      points: [POINT_A],
      fuel: "GASOLINE",
      filters: { facilities: [], brands: ["SKE"], kpetroOnly: false },
      redis: fakeRedis(),
      now: NOW,
      findRefuelPointsByIds: findByIds,
    });

    expect(result.stations).toHaveLength(0);
  });

  it("kpetroOnly=true면 알뜰주유소가 아닌 곳은 제외한다", async () => {
    server.use(
      http.get("https://www.opinet.co.kr/api/aroundAll.do", () =>
        HttpResponse.json(radiusResponse([{ uniId: "A0000001", brand: "SKE", name: "A", price: 1700 }])),
      ),
    );
    const findByIds = vi.fn().mockResolvedValue([refuelPoint({ isKpetro: false })]);

    const result = await collectStations({
      points: [POINT_A],
      fuel: "GASOLINE",
      filters: { facilities: [], brands: [], kpetroOnly: true },
      redis: fakeRedis(),
      now: NOW,
      findRefuelPointsByIds: findByIds,
    });

    expect(result.stations).toHaveLength(0);
  });
});

describe("collectStations — A3 가격 0/null 제외", () => {
  it("가격이 0이면 제외한다", async () => {
    server.use(
      http.get("https://www.opinet.co.kr/api/aroundAll.do", () =>
        HttpResponse.json(radiusResponse([{ uniId: "A0000001", brand: "SKE", name: "A", price: 0 }])),
      ),
    );
    const findByIds = vi.fn().mockResolvedValue([refuelPoint()]);

    const result = await collectStations({
      points: [POINT_A],
      fuel: "GASOLINE",
      filters: noFilters,
      redis: fakeRedis(),
      now: NOW,
      findRefuelPointsByIds: findByIds,
    });

    expect(result.stations).toHaveLength(0);
  });
});

describe("collectStations — A9 부분 실패", () => {
  it("한 지점 호출이 실패해도 나머지로 진행하고 경고를 남긴다", async () => {
    server.use(
      http.get("https://www.opinet.co.kr/api/aroundAll.do", ({ request }) => {
        const x = new URL(request.url).searchParams.get("x");
        if (x === KATEC_A_X) {
          return new HttpResponse(null, { status: 500 });
        }
        return HttpResponse.json(radiusResponse([{ uniId: "A0000002", brand: "SKE", name: "B", price: 1700 }]));
      }),
    );
    const findByIds = vi.fn().mockResolvedValue([refuelPoint({ id: "A0000002" })]);

    const result = await collectStations({
      points: [POINT_A, POINT_B],
      fuel: "GASOLINE",
      filters: noFilters,
      retries: 0,
      redis: fakeRedis(),
      now: NOW,
      findRefuelPointsByIds: findByIds,
    });

    expect(result.stations).toHaveLength(1);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "PARTIAL_STATION_FETCH_FAILED" }),
    );
  });
});

describe("collectStations — 캐시 히트", () => {
  it("캐시가 있으면 오피넷을 호출하지 않고 예산도 소모하지 않는다", async () => {
    const redis = fakeRedis();
    server.use(
      http.get("https://www.opinet.co.kr/api/aroundAll.do", () =>
        HttpResponse.json(radiusResponse([{ uniId: "A0000001", brand: "SKE", name: "A", price: 1700 }])),
      ),
    );
    const findByIds = vi.fn().mockResolvedValue([refuelPoint()]);

    await collectStations({
      points: [POINT_A],
      fuel: "GASOLINE",
      filters: noFilters,
      redis,
      now: NOW,
      findRefuelPointsByIds: findByIds,
    });
    const budgetKey = "test:opinet:budget:2026-08-31";
    const countAfterFirst = redis.store.get(budgetKey);

    server.use(
      http.get("https://www.opinet.co.kr/api/aroundAll.do", () => {
        throw new Error("호출되면 안 됨 — 캐시 히트 기대");
      }),
    );

    const result = await collectStations({
      points: [POINT_A],
      fuel: "GASOLINE",
      filters: noFilters,
      redis,
      now: NOW,
      findRefuelPointsByIds: findByIds,
    });

    expect(result.stations).toHaveLength(1);
    expect(redis.store.get(budgetKey)).toBe(countAfterFirst); // 예산 카운터 변화 없음
  });
});

describe("collectStations — 예산 소진", () => {
  it("예산이 이미 소진된 지점은 건너뛰고 QUOTA_EXCEEDED 경고를 남긴다", async () => {
    const redis = fakeRedis();
    // 예산을 한도까지 미리 채워둠
    await redis.incrby("test:opinet:budget:2026-08-31", 5);

    server.use(
      http.get("https://www.opinet.co.kr/api/aroundAll.do", () => {
        throw new Error("호출되면 안 됨 — 예산 소진");
      }),
    );

    const result = await collectStations({
      points: [POINT_A],
      fuel: "GASOLINE",
      filters: noFilters,
      redis,
      now: NOW,
      budgetLimit: 5,
      findRefuelPointsByIds: vi.fn().mockResolvedValue([]),
    });

    expect(result.stations).toHaveLength(0);
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "QUOTA_EXCEEDED" }));
  });
});

describe("isOpinetBudgetAvailable", () => {
  it("카운터가 한도 미만이면 true", async () => {
    const redis = fakeRedis();
    const available = await isOpinetBudgetAvailable(redis, "test", 1400, NOW);
    expect(available).toBe(true);
  });

  it("카운터가 한도 이상이면 false", async () => {
    const redis = fakeRedis();
    await redis.incrby("test:opinet:budget:2026-08-31", 1400);
    const available = await isOpinetBudgetAvailable(redis, "test", 1400, NOW);
    expect(available).toBe(false);
  });
});
