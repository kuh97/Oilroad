/**
 * 시군구 평균가 배치 — ARCHITECTURE.md §6.4·§10 Phase 6.
 * Vercel Cron이 `Authorization: Bearer ${CRON_SECRET}`로 호출합니다.
 * 로직은 scripts/sync-sigungu-avg.ts와 공유합니다 — 여기서 복제하지 마십시오.
 */

import { NextResponse } from "next/server";
import { env } from "@/infra/env";
import { syncSigunguAvgPrices } from "../../../../../scripts/sync-sigungu-avg";

export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await syncSigunguAvgPrices();
  return NextResponse.json({ updated: result.updated });
}
