/**
 * 티어 분류 — d_perp 기준 T1 / T2 / T3후보 / 제외
 * PRODUCT.md §6.4
 */

import { T1_MAX, T2_MAX, T3_MAX } from "./params";
import type { Tier } from "./types";

/**
 * d_perp(m) 로 티어를 반환합니다.
 * T3 게이트(NetSaving > 0)는 pricing 단계에서 적용하므로 여기서는 거리만 판정합니다.
 *
 * @returns 티어 또는 null (T3_MAX 초과 → 후보 제거)
 */
export function classifyTier(dPerpM: number): Tier | null {
  if (dPerpM <= T1_MAX) return "T1";
  if (dPerpM <= T2_MAX) return "T2";
  if (dPerpM <= T3_MAX) return "T3";
  return null; // 제거
}

/** T3_MAX 초과 여부 */
export function isOutOfRange(dPerpM: number): boolean {
  return dPerpM > T3_MAX;
}

/** T1 + T2 수가 확장 발동 임계값(MIN_CANDIDATES) 미만인지 확인 */
export function needsExpansion(t1Count: number, t2Count: number, minCandidates: number): boolean {
  return t1Count + t2Count < minCandidates;
}
