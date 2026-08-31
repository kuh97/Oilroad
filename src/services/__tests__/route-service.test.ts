import { describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../tests/msw/server";
import { getRoute, type RedisLike } from "../route-service";
import { wgs84 } from "@/domain/types";
import directionsFixture from "../../../tests/fixtures/kakao-directions.json";
import directionsWaypointFixture from "../../../tests/fixtures/kakao-directions-waypoint.json";

vi.stubEnv("KAKAO_REST_API_KEY", "test-kakao-key");
vi.stubEnv("KAKAO_MOBILITY_BASE_URL", "https://apis-navi.kakaomobility.com");
vi.stubEnv("REDIS_KEY_PREFIX", "test");

const ORIGIN = wgs84(37.42, 127.12);
const DESTINATION = wgs84(37.88, 127.73);

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
    async incrby() {
      return 0;
    },
    async expire() {
      return 1;
    },
  };
}

describe("getRoute — 캐시 미스", () => {
  it("카카오 길찾기를 호출해 BaseRoute를 반환한다", async () => {
    const redis = fakeRedis();
    const route = await getRoute({ origin: ORIGIN, destination: DESTINATION, redis });
    expect(route.distanceM).toBe(directionsFixture.routes[0].summary.distance);
    expect(route.durationS).toBe(directionsFixture.routes[0].summary.duration);
    expect(route.polyline.length).toBeGreaterThan(0);
  });

  it("응답을 캐시에 저장한다", async () => {
    const redis = fakeRedis();
    await getRoute({ origin: ORIGIN, destination: DESTINATION, redis });
    expect(redis.store.size).toBe(1);
  });
});

describe("getRoute — 캐시 히트", () => {
  it("캐시에 값이 있으면 카카오를 호출하지 않는다", async () => {
    const redis = fakeRedis();
    await getRoute({ origin: ORIGIN, destination: DESTINATION, redis }); // 캐시 채우기

    server.use(
      http.get("https://apis-navi.kakaomobility.com/v1/directions", () => {
        throw new Error("호출되면 안 됨 — 캐시 히트 기대");
      }),
    );

    const route = await getRoute({ origin: ORIGIN, destination: DESTINATION, redis });
    expect(route.distanceM).toBe(directionsFixture.routes[0].summary.distance);
  });

  it("역직렬화된 polyline은 WGS84Point 브랜드를 갖는다", async () => {
    const redis = fakeRedis();
    await getRoute({ origin: ORIGIN, destination: DESTINATION, redis });
    const route = await getRoute({ origin: ORIGIN, destination: DESTINATION, redis });
    expect(route.polyline[0]._brand).toBe("WGS84");
  });
});

describe("getRoute — 경유지(waypoint)", () => {
  it("waypoint가 있으면 경유 경로 픽스처를 받고, 기본 경로와 다른 캐시 키를 쓴다", async () => {
    const redis = fakeRedis();
    const waypoint = wgs84(37.6, 127.4);
    const route = await getRoute({
      origin: ORIGIN,
      destination: DESTINATION,
      waypoint,
      retries: 0,
      redis,
    });
    expect(route.distanceM).toBe(directionsWaypointFixture.routes[0].summary.distance);

    // 기본 경로도 별도로 캐시됨 (키가 다름)
    await getRoute({ origin: ORIGIN, destination: DESTINATION, redis });
    expect(redis.store.size).toBe(2);
  });
});

describe("getRoute — 실패", () => {
  it("카카오 호출이 실패하면 그대로 throw한다", async () => {
    const redis = fakeRedis();
    server.use(
      http.get("https://apis-navi.kakaomobility.com/v1/directions", () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );
    await expect(
      getRoute({ origin: ORIGIN, destination: DESTINATION, retries: 0, redis }),
    ).rejects.toThrow();
  });
});
