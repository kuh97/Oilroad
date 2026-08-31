/**
 * 익명 검색 이벤트 기록 — 지금은 no-op 스텁입니다.
 * `search_event`/`navi_click_event` 테이블과 실제 익명화·기록 로직은 Phase 11 범위입니다.
 * recommendation-service가 호출하는 시그니처만 먼저 확정해, Phase 11에서 내부만
 * 교체해도 파이프라인 모양이 바뀌지 않게 합니다.
 */

import type { SearchResult } from "@/domain/types";

export interface LogSearchMeta {
  durationMs: number;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function logSearch(_result: SearchResult, _meta: LogSearchMeta): Promise<void> {
  // Phase 11: search_event 기록으로 교체
}
