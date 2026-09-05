/**
 * 가격 기준일자 신선도 판정.
 * PRODUCT.md §6.3, docs/MIGRATION-DB.md §9.1.
 *
 * 유가 CSV는 일 1회 스냅샷입니다 — 이전엔 오피넷 실시간 갱신 스케줄(1·2·9·12·16·19시)
 * 기준으로 시간 단위 신선도를 판정했지만, CSV 스냅샷은 그 개념이 없어 일자 단위로
 * 판정합니다 ("오늘/어제 기준"이 정상, 그 이상이면 "오래된 정보" 배지).
 *
 * Date.now() / new Date() 직접 호출 금지 — now를 인자로 받습니다 (AGENTS.md §7.1).
 */

/**
 * 가격 기준일자가 staleDays 초과로 오래됐는지 확인.
 *
 * @param priceUpdatedAt 가격 기준일자
 * @param now 현재 시각
 * @param staleDays 기준 일수 (기본 PRICE_STALE_DAYS)
 */
export function isPriceStale(
  priceUpdatedAt: Date,
  now: Date,
  staleDays: number,
): boolean {
  const diffMs = now.getTime() - priceUpdatedAt.getTime();
  return diffMs > staleDays * 24 * 60 * 60 * 1000;
}
