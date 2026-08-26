/**
 * 오피넷 일일 호출 예산 카운터 (Redis INCRBY).
 * ARCHITECTURE.md §5.3
 *
 * 초과 시: 확장 수집(STEP 6) 차단 → skippedReason: "QUOTA"
 * 기본 수집도 초과하면: 캐시 전용 모드 + 사용자 고지
 *
 * Redis를 직접 import하지 않고 인터페이스로 받아 테스트 용이성을 확보합니다.
 */

/** budget.ts가 의존하는 Redis 메서드만 추출한 인터페이스 */
export interface BudgetStore {
  incrby(key: string, increment: number): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
}

const BUDGET_TTL_SECONDS = 26 * 60 * 60; // 26시간 (KST 자정 +2h 여유)

export interface BudgetResult {
  allowed: boolean;
  count: number;  // INCRBY 후 현재 카운터 값
}

/**
 * 예산 키 생성.
 * @param prefix REDIS_KEY_PREFIX (dev/prod)
 * @param dateStr "YYYY-MM-DD" (KST 기준 오늘)
 */
export function getBudgetKey(prefix: string, dateStr: string): string {
  return `${prefix}:opinet:budget:${dateStr}`;
}

/**
 * 카운터를 1 증가시키고 예산 초과 여부를 반환합니다.
 * Redis INCRBY의 원자성으로 동시 호출에서도 정확히 동작합니다.
 *
 * 첫 번째 increment(count === 1) 시 TTL을 26시간으로 설정합니다.
 */
export async function incrementBudget(
  store: BudgetStore,
  key: string,
  limit: number,
): Promise<BudgetResult> {
  const count = await store.incrby(key, 1);
  if (count === 1) {
    await store.expire(key, BUDGET_TTL_SECONDS);
  }
  return { allowed: count <= limit, count };
}

/**
 * 현재 카운터를 확인하고 예산 초과 여부를 반환합니다(카운터 증가 없음).
 * 검색 진입 시 빠른 가드로 사용합니다.
 */
export async function checkBudget(
  store: BudgetStore & { get?(key: string): Promise<string | null> },
  key: string,
  limit: number,
): Promise<boolean> {
  if (!store.get) return true; // get을 지원하지 않으면 허용
  const raw = await store.get(key);
  const count = raw ? Number(raw) : 0;
  return count < limit;
}
