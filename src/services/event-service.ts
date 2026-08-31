/**
 * 익명 검색·딥링크 이벤트 기록 — 지금은 no-op 스텁입니다.
 * `search_event`/`navi_click_event` 테이블과 실제 익명화·기록 로직은 Phase 11 범위입니다.
 * 호출하는 쪽(recommendation-service, POST /api/events/navi)이 쓸 시그니처만 먼저
 * 확정해, Phase 11에서 내부만 교체해도 파이프라인 모양이 바뀌지 않게 합니다.
 */

import type { SearchResult, Tier } from "@/domain/types";
import type { NaviApp } from "@/domain/deeplink";

export interface LogSearchMeta {
  durationMs: number;
}

/** POST /api/events/navi 바디와 같은 모양이지만, §2.1 의존 방향(app→services)을 지키기 위해
 * app/api의 zod 스키마 타입을 그대로 가져오지 않고 여기서 독립적으로 정의합니다. */
export interface NaviClickEvent {
  searchId: string;
  app: NaviApp;
  rank: number;
  tier: Tier;
  netSaving: number;
  detourDistanceM: number;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function logSearch(_result: SearchResult, _meta: LogSearchMeta): Promise<void> {
  // Phase 11: search_event 기록으로 교체
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function logNaviClick(_event: NaviClickEvent): Promise<void> {
  // Phase 11: navi_click_event 기록으로 교체
}
