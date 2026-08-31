import { describe, expect, it, vi } from "vitest";

const fetchPlacesMock = vi.fn();
vi.mock("@/infra/kakao/local", () => ({ fetchPlaces: (...args: unknown[]) => fetchPlacesMock(...args) }));

import { GET } from "../route";
import { wgs84 } from "@/domain/types";

function request(query: string) {
  return new Request(`https://example.com/api/places/search?${query}`);
}

describe("GET /api/places/search", () => {
  it("q가 없으면 400이다", async () => {
    const res = await GET(request(""));
    expect(res.status).toBe(400);
    expect(fetchPlacesMock).not.toHaveBeenCalled();
  });

  it("PLACE_QUERY_MIN_LEN 미만이면 카카오를 호출하지 않고 빈 목록을 반환한다", async () => {
    const res = await GET(request("q=a"));
    expect(res.status).toBe(200);
    expect(fetchPlacesMock).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body).toEqual({ places: [] });
  });

  it("PlaceResult[]를 { name, address, lat, lng }로 평탄화하고 최대 5건만 반환한다", async () => {
    fetchPlacesMock.mockResolvedValue(
      Array.from({ length: 7 }, (_, i) => ({
        name: `장소${i}`,
        address: `주소${i}`,
        location: wgs84(37 + i, 127 + i),
      })),
    );

    const res = await GET(request("q=성남시청"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.places).toHaveLength(5);
    expect(body.places[0]).toEqual({ name: "장소0", address: "주소0", lat: 37, lng: 127 });
  });

  it("fetchPlaces가 실패해도(환경변수 누락 등) 500 HTML이 아니라 구조화된 JSON 에러를 반환한다", async () => {
    fetchPlacesMock.mockRejectedValue(new Error("환경변수 KAKAO_REST_API_KEY가 설정되지 않았습니다."));

    const res = await GET(request("q=성남시청"));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe("PLACE_SEARCH_FAILED");
  });
});
