import { http, HttpResponse } from "msw";
import radiusFixture from "../fixtures/opinet-radius.json";
import detailFixture from "../fixtures/opinet-detail.json";
import directionsFixture from "../fixtures/kakao-directions.json";
import directionsWaypointFixture from "../fixtures/kakao-directions-waypoint.json";
import localFixture from "../fixtures/kakao-local.json";

const OPINET_BASE = "https://www.opinet.co.kr/api";
const KAKAO_MOBILITY_BASE = "https://apis-navi.kakaomobility.com";
const KAKAO_LOCAL_BASE = "https://dapi.kakao.com";

export const handlers = [
  http.get(`${OPINET_BASE}/aroundAll.do`, () => {
    return HttpResponse.json(radiusFixture);
  }),

  http.get(`${OPINET_BASE}/detailById.do`, () => {
    return HttpResponse.json(detailFixture);
  }),

  // waypoints 파라미터 유무로 기본 경로/경유 경로 픽스처를 나눠 응답합니다.
  http.get(`${KAKAO_MOBILITY_BASE}/v1/directions`, ({ request }) => {
    const url = new URL(request.url);
    const hasWaypoint = url.searchParams.has("waypoints");
    return HttpResponse.json(hasWaypoint ? directionsWaypointFixture : directionsFixture);
  }),

  http.get(`${KAKAO_LOCAL_BASE}/v2/local/search/keyword.json`, () => {
    return HttpResponse.json(localFixture);
  }),
];
