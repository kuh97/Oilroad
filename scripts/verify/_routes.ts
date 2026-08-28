/**
 * Phase 5 측정 스크립트 공용 — 노선 4개.
 *
 * 선정 기준 (PRODUCT.md §1.4·§1.5 타깃 세그먼트):
 *   1. LPG 장거리 대표 — PRODUCT.md §5.3 검산 예시와 동일한 구간 (문서와 대조 가능)
 *   2. 저밀도(강원 산간) 대표 — 미시령·한계령을 넘는 장거리 국도 구간
 *   3. 도심 밀집 대조군 — T3가 거의 발동하지 않아야 정상인 짧은 도심 구간
 */

import type { WGS84Point } from "@/domain/types";
import { wgs84 } from "@/domain/types";

export interface RouteFixture {
  label: string;
  origin: WGS84Point;
  destination: WGS84Point;
  note: string;
}

export const ROUTES: RouteFixture[] = [
  {
    label: "성남→춘천 (LPG 장거리 대표)",
    origin: wgs84(37.4200, 127.1268), // 성남시청
    destination: wgs84(37.8813, 127.7298), // 춘천역
    note: "PRODUCT.md §5.3 검산 예시와 동일 구간. 실측 거리 약 98.7km (Phase 4에서 확인)",
  },
  {
    label: "원주→속초 (저밀도 산간 대표)",
    origin: wgs84(37.3422, 127.9202), // 원주시청
    destination: wgs84(38.2070, 128.5918), // 속초시청
    note: "미시령·한계령 경유 가능 구간. 강원 산간 저밀도 세그먼트",
  },
  {
    label: "강남→수원 (도심 밀집 대조군)",
    origin: wgs84(37.4979, 127.0276), // 강남역
    destination: wgs84(37.2636, 127.0286), // 수원시청
    note: "짧은 도심 구간. T3가 거의 발동하지 않아야 정상 — 대조군",
  },
  {
    label: "단대동→금광동 (초단거리 실사용 사례)",
    origin: wgs84(37.4499208459673, 127.155817131857), // 성남시 수정구 단대동 130
    destination: wgs84(37.4504811309608, 127.161364049027), // 성남시 중원구 산성대로440번길 16
    note: "사용자 실사용 보고 — 이 구간은 검색해도 경로상에 주유소가 없어 반드시 우회해야 함. 직선거리 약 500m — MIN_CANDIDATES/확장 수집 코드 경로를 실제로 exercise하기 위한 극단 사례",
  },
];
