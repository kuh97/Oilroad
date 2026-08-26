/**
 * 오피넷 갱신 스케줄 기반 가격 캐시 TTL 계산
 * ARCHITECTURE.md §8.1 · PRODUCT.md §6.3
 *
 * 갱신 시각: 1시, 2시, 9시, 12시, 16시, 19시 (KST, 하루 6회)
 * TTL = 다음 갱신 시각 + 5분 여유
 *
 * Date.now() / new Date() 직접 호출 금지 — now를 인자로 받습니다 (AGENTS.md §7.1).
 */

/** 오피넷 가격 갱신 시각 (KST 시 단위, 하루 6회) */
export const OPINET_UPDATE_HOURS: readonly number[] = [1, 2, 9, 12, 16, 19];

const BUFFER_MINUTES = 5;

/**
 * 현재 시각 기준 다음 오피넷 갱신 시각까지의 TTL (초).
 *
 * @param now 현재 시각 (UTC Date)
 * @returns TTL 초 (최소 60초)
 */
export function priceTtlSeconds(now: Date): number {
  const kstOffset = 9 * 60 * 60 * 1000; // KST = UTC+9
  const kstNow = new Date(now.getTime() + kstOffset);

  const kstHour = kstNow.getUTCHours();
  const kstMinute = kstNow.getUTCMinutes();
  const kstSecond = kstNow.getUTCSeconds();

  const nowTotalSeconds = kstHour * 3600 + kstMinute * 60 + kstSecond;

  // 오늘 갱신 시각 중 현재보다 미래인 것 탐색
  for (const hour of OPINET_UPDATE_HOURS) {
    const updateSeconds = hour * 3600 + BUFFER_MINUTES * 60;
    if (updateSeconds > nowTotalSeconds) {
      return Math.max(60, updateSeconds - nowTotalSeconds);
    }
  }

  // 오늘 마지막 갱신(19시)이 지났다면 → 다음 날 1시
  const nextDayFirstUpdate = 24 * 3600 + OPINET_UPDATE_HOURS[0] * 3600 + BUFFER_MINUTES * 60;
  return Math.max(60, nextDayFirstUpdate - nowTotalSeconds);
}

/**
 * 가격 기준시각이 PRICE_STALE_HOURS 초과인지 확인.
 *
 * @param priceUpdatedAt 가격 기준 시각
 * @param now 현재 시각
 * @param staleHours 기준 시간 (기본 PRICE_STALE_HOURS)
 */
export function isPriceStale(
  priceUpdatedAt: Date,
  now: Date,
  staleHours: number,
): boolean {
  const diffMs = now.getTime() - priceUpdatedAt.getTime();
  return diffMs > staleHours * 60 * 60 * 1000;
}

/**
 * 오피넷 갱신 스케줄 기반으로 가장 최근 갱신 시각 근사.
 * 실제 TRADE_DT가 없을 때 UI 표시용으로 사용합니다.
 *
 * @param now 현재 시각 (UTC Date)
 * @returns 가장 최근 갱신 시각 (KST 기준 Date, UTC로 반환)
 */
export function approximateLastUpdateTime(now: Date): Date {
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstNow = new Date(now.getTime() + kstOffset);

  const kstHour = kstNow.getUTCHours();
  const kstMinute = kstNow.getUTCMinutes();
  const nowTotalMinutes = kstHour * 60 + kstMinute;

  // 현재보다 이전인 갱신 시각 중 가장 최근
  let lastUpdateHour = OPINET_UPDATE_HOURS[0] - 24; // 어제 첫 갱신 (폴백)
  for (const hour of OPINET_UPDATE_HOURS) {
    if (hour * 60 <= nowTotalMinutes) {
      lastUpdateHour = hour;
    }
  }

  const result = new Date(kstNow);
  if (lastUpdateHour < 0) {
    // 어제로 이동
    result.setUTCDate(result.getUTCDate() - 1);
    result.setUTCHours(OPINET_UPDATE_HOURS[OPINET_UPDATE_HOURS.length - 1], 0, 0, 0);
  } else {
    result.setUTCHours(lastUpdateHour, 0, 0, 0);
  }

  // KST → UTC 변환
  return new Date(result.getTime() - kstOffset);
}
