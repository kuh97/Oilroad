import { http, HttpResponse } from "msw";
import radiusFixture from "../fixtures/opinet-radius.json";
import detailFixture from "../fixtures/opinet-detail.json";

const OPINET_BASE = "https://www.opinet.co.kr/api";

export const handlers = [
  http.get(`${OPINET_BASE}/aroundAll.do`, () => {
    return HttpResponse.json(radiusFixture);
  }),

  http.get(`${OPINET_BASE}/detailById.do`, () => {
    return HttpResponse.json(detailFixture);
  }),
];
