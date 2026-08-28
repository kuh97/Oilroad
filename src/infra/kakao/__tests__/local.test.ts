import { describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../../tests/msw/server";
import { fetchPlaces } from "../local";
import { wgs84 } from "@/domain/types";
import localFixture from "../../../../tests/fixtures/kakao-local.json";

vi.stubEnv("KAKAO_REST_API_KEY", "test-rest-key");
vi.stubEnv("KAKAO_LOCAL_BASE_URL", "https://dapi.kakao.com");

const KAKAO_LOCAL_URL = "https://dapi.kakao.com/v2/local/search/keyword.json";

describe("fetchPlaces", () => {
  it("MSW 픽스처 응답을 PlaceResult[]로 매핑한다", async () => {
    const places = await fetchPlaces({ query: "강남역" });
    expect(places.length).toBe(localFixture.documents.length);
    expect(places[0].name).toBe(localFixture.documents[0].place_name);
    expect(places[0].location._brand).toBe("WGS84");
  });

  it("near를 넘기면 x·y·sort=distance 파라미터가 붙는다", async () => {
    let capturedUrl = "";
    server.use(
      http.get(KAKAO_LOCAL_URL, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json(localFixture);
      }),
    );
    await fetchPlaces({ query: "강남역", near: wgs84(37.5, 127.0) });
    const params = new URL(capturedUrl).searchParams;
    expect(params.get("sort")).toBe("distance");
    expect(params.get("x")).toBe("127");
    expect(params.get("y")).toBe("37.5");
  });

  it("near 없이 호출하면 sort 파라미터를 붙이지 않는다", async () => {
    let capturedUrl = "";
    server.use(
      http.get(KAKAO_LOCAL_URL, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json(localFixture);
      }),
    );
    await fetchPlaces({ query: "강남역" });
    expect(new URL(capturedUrl).searchParams.has("sort")).toBe(false);
  });

  it("빈 documents 응답 → 빈 배열 반환", async () => {
    server.use(
      http.get(KAKAO_LOCAL_URL, () =>
        HttpResponse.json({ documents: [], meta: { total_count: 0, pageable_count: 0, is_end: true } }),
      ),
    );
    const places = await fetchPlaces({ query: "존재하지않는장소" });
    expect(places).toEqual([]);
  });

  it("HTTP 오류 → 재시도 후 에러 throw", async () => {
    server.use(http.get(KAKAO_LOCAL_URL, () => new HttpResponse(null, { status: 500 })));
    await expect(fetchPlaces({ query: "강남역", retries: 0 })).rejects.toThrow();
  });

  it("잘못된 응답 형태 → 파싱 에러 throw", async () => {
    server.use(http.get(KAKAO_LOCAL_URL, () => HttpResponse.json({ wrong: true })));
    await expect(fetchPlaces({ query: "강남역", retries: 0 })).rejects.toThrow(/파싱 실패/);
  });
});
