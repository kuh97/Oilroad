/**
 * 시군구별 주유소 평균가격 동기화 — ARCHITECTURE.md §7.2.
 *
 * `pnpm data:sync-sigungu`로 수동 실행하거나 Vercel Cron이
 * `POST /api/cron/sync-sigungu`를 호출합니다. 그 라우트는 아래 `syncSigunguAvgPrices`를
 * 그대로 호출합니다 — 로직을 복제하지 마십시오 (ARCHITECTURE.md §6.4).
 *
 * 오피넷 호출 수 = 지역코드 조회 1회 + 시도 수(16개, `areaCode.do` 실측)만큼의
 * `avgSigunPrice.do` 호출. `sigun`을 생략해 시도당 전체 시군구를 한 번에 받습니다.
 */

import { fetchAreaCodes, fetchAvgSigunPrice } from "@/infra/opinet/client";
import { mapAvgSigunPriceItem } from "@/infra/opinet/mapper";
import { bulkUpsertSigunguAvgPrices, type SigunguAvgPriceInput } from "@/infra/db/repositories";

export interface SyncSigunguAvgResult {
  updated: number;
  sidoCount: number;
}

export async function syncSigunguAvgPrices(): Promise<SyncSigunguAvgResult> {
  const areas = await fetchAreaCodes();
  const rows: SigunguAvgPriceInput[] = [];

  for (const area of areas) {
    const items = await fetchAvgSigunPrice({ sido: area.AREA_CD });
    for (const item of items) {
      const mapped = mapAvgSigunPriceItem(item);
      if (mapped) rows.push(mapped);
    }
  }

  const updated = await bulkUpsertSigunguAvgPrices(rows);
  return { updated, sidoCount: areas.length };
}

// ─── CLI 진입점 ──────────────────────────────────────────────────────────────

async function main() {
  const result = await syncSigunguAvgPrices();
  console.log(
    `✔ 시군구 평균가 동기화 완료 — 시도 ${result.sidoCount}개, ${result.updated}건 upsert`,
  );
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error("✖ 시군구 평균가 동기화 실패:", err);
    process.exitCode = 1;
  });
}
