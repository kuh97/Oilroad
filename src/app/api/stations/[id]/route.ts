/**
 * 상세 보강 — ARCHITECTURE.md §6.4·§10 Phase 8.
 * `Candidate`에서 경로 의존 필드(tier·perpDistanceM·detour·netSaving·scores·reason)를
 * 뺀 형태. 경로 컨텍스트가 없으므로 가격은 DB의 최근 스냅샷(`lastPrice`)을 씁니다 —
 * 검색 시점처럼 오피넷을 새로 부르지 않습니다.
 */

import { NextResponse } from "next/server";
import { findRefuelPointRowById, fromRefuelPointRow } from "@/infra/db/repositories";
import type { WireStationSummary } from "@/app/api/_lib/types";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await findRefuelPointRowById(id);
  if (!row) {
    return NextResponse.json(
      { code: "NOT_FOUND", message: "주유소를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  const station = fromRefuelPointRow(row);
  const summary: WireStationSummary = {
    id: station.id,
    name: station.name,
    brand: station.brandCode,
    lat: station.location.lat,
    lng: station.location.lng,
    address: station.addressRoad || station.addressJibun || "",
    tel: station.tel ?? null,
    price: row.lastPrice,
    priceUpdatedAt: row.priceTradedAt ? row.priceTradedAt.toISOString() : null,
    facilities: { ...station.facilities },
    kpetro: station.isKpetro,
  };

  return NextResponse.json(summary);
}
