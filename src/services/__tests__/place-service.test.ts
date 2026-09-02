import { describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../tests/msw/server";
import { searchPlaces, type RedisLike } from "../place-service";
import localFixture from "../../../tests/fixtures/kakao-local.json";

vi.stubEnv("KAKAO_REST_API_KEY", "test-rest-key");
vi.stubEnv("KAKAO_LOCAL_BASE_URL", "https://dapi.kakao.com");
vi.stubEnv("REDIS_KEY_PREFIX", "test");

const KAKAO_LOCAL_URL = "https://dapi.kakao.com/v2/local/search/keyword.json";

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

describe("searchPlaces — 캐시 미스", () => {
  it("카카오 로컬 검색을 호출해 PlaceResult[]를 반환한다", async () => {
    const redis = fakeRedis();
    const places = await searchPlaces({ query: "강남역", redis });
    expect(places.length).toBe(localFixture.documents.length);
    expect(places[0].name).toBe(localFixture.documents[0].place_name);
  });

  it("응답을 캐시에 저장한다", async () => {
    const redis = fakeRedis();
    await searchPlaces({ query: "강남역", redis });
    expect(redis.store.size).toBe(1);
  });
});

describe("searchPlaces — 캐시 히트", () => {
  it("캐시에 값이 있으면 카카오를 호출하지 않는다", async () => {
    const redis = fakeRedis();
    await searchPlaces({ query: "강남역", redis }); // 캐시 채우기

    server.use(
      http.get(KAKAO_LOCAL_URL, () => {
        throw new Error("호출되면 안 됨 — 캐시 히트 기대");
      }),
    );

    const places = await searchPlaces({ query: "강남역", redis });
    expect(places.length).toBe(localFixture.documents.length);
  });

  it("역직렬화된 결과는 WGS84Point 브랜드를 갖는다", async () => {
    const redis = fakeRedis();
    await searchPlaces({ query: "강남역", redis });
    const places = await searchPlaces({ query: "강남역", redis });
    expect(places[0].location._brand).toBe("WGS84");
  });

  it("검색어가 다르면 별도로 캐시된다", async () => {
    const redis = fakeRedis();
    await searchPlaces({ query: "강남역", redis });
    await searchPlaces({ query: "역삼역", redis });
    expect(redis.store.size).toBe(2);
  });
});

describe("searchPlaces — 실패", () => {
  it("카카오 호출이 실패하면 그대로 throw하고 캐시에 저장하지 않는다", async () => {
    const redis = fakeRedis();
    server.use(http.get(KAKAO_LOCAL_URL, () => new HttpResponse(null, { status: 500 })));
    await expect(searchPlaces({ query: "강남역", redis })).rejects.toThrow();
    expect(redis.store.size).toBe(0);
  });
});
