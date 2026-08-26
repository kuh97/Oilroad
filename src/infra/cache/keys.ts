/**
 * Redis 키 생성 규칙.
 * 모든 키에 REDIS_KEY_PREFIX(dev/prod)를 접두사로 붙입니다.
 * ARCHITECTURE.md §8
 */

import type { KatecPoint } from "@/domain/types";

/** 2km 격자 스냅 — 반경검색 캐시 키 중복 최대화 */
const STATION_GRID_M = 2_000;

function snapToGrid(coord: number, gridSize: number): number {
  return Math.round(coord / gridSize) * gridSize;
}

/**
 * 반경 내 주유소 캐시 키.
 * KATEC 좌표를 2km 격자로 스냅해 인접 검색이 같은 캐시를 공유하게 합니다.
 *
 * @param prefix REDIS_KEY_PREFIX
 * @param center 검색 기준점 (KATEC)
 * @param prodcd 오피넷 연료 코드 (B027·D047·K015)
 */
export function stationKey(prefix: string, center: KatecPoint, prodcd: string): string {
  const gx = snapToGrid(center.x, STATION_GRID_M);
  const gy = snapToGrid(center.y, STATION_GRID_M);
  return `${prefix}:stn:${gx}:${gy}:${prodcd}`;
}

/**
 * 일일 오피넷 호출 예산 카운터 키.
 *
 * @param prefix REDIS_KEY_PREFIX
 * @param dateStr "YYYY-MM-DD" (KST 기준)
 */
export function budgetKey(prefix: string, dateStr: string): string {
  return `${prefix}:opinet:budget:${dateStr}`;
}

/**
 * 주유소 상세정보 캐시 키 (Fallback C — 7일 TTL).
 *
 * @param prefix REDIS_KEY_PREFIX
 * @param uniId 오피넷 UNI_ID
 */
export function stationDetailKey(prefix: string, uniId: string): string {
  return `${prefix}:stn-detail:${uniId}`;
}

/**
 * 경로 캐시 키 (1시간 TTL).
 * 격자 기반으로 동일 구간 경로를 공유합니다.
 * Phase 4 (카카오 infra)에서 사용.
 *
 * @param prefix REDIS_KEY_PREFIX
 * @param originGrid "lat_lng" 스냅 문자열
 * @param destGrid   "lat_lng" 스냅 문자열
 * @param viaGrid    경유지 스냅 (없으면 생략)
 */
export function routeKey(
  prefix: string,
  originGrid: string,
  destGrid: string,
  viaGrid?: string,
): string {
  const via = viaGrid ? `:${viaGrid}` : "";
  return `${prefix}:route:${originGrid}:${destGrid}${via}`;
}

/**
 * 장소 검색 캐시 키 (24시간 TTL).
 * Phase 4 (카카오 infra)에서 사용.
 */
export function placeKey(prefix: string, query: string): string {
  return `${prefix}:place:${encodeURIComponent(query)}`;
}
