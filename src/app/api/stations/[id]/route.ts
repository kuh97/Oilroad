/**
 * 상세 보강 — ARCHITECTURE.md §6.4·§10 Phase 8.
 * `Candidate`에서 경로 의존 필드(tier·perpDistanceM·detour·netSaving·scores·reason)를
 * 뺀 형태. 경로 컨텍스트가 없으므로 가격은 DB의 최근 스냅샷을 씁니다 — 검색
 * 시점처럼 오피넷을 새로 부르지 않습니다.
 *
 * 우선순위: 상세 API 스냅샷(`lastPrice`, 요청 연료와 무관하게 마지막으로 검색됐던
 * 값) → 유가 CSV 스냅샷(`price_gasoline`/`price_lpg`, 이 경로엔 연료 파라미터가
 * 없어 energyType으로 유종을 고른다). docs/MIGRATION-DB.md §5.1 — CSV로만 들어온
 * ~10,900개소는 lastPrice가 항상 null이라 이 폴백이 없으면 가격이 늘 비어 있었다.
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

  let price = row.lastPrice;
  let priceUpdatedAt = row.priceTradedAt ? row.priceTradedAt.toISOString() : null;
  if (price == null) {
    const csvPrice = row.energyType === "LPG" ? row.priceLpg : row.priceGasoline;
    if (csvPrice != null) {
      price = csvPrice;
      priceUpdatedAt = row.pricedOn ? `${row.pricedOn}T00:00:00.000Z` : null;
    }
  }

  const summary: WireStationSummary = {
    id: station.id,
    name: station.name,
    brand: station.brandCode,
    lat: station.location.lat,
    lng: station.location.lng,
    address: station.addressRoad || station.addressJibun || "",
    tel: station.tel ?? null,
    price,
    priceUpdatedAt,
    facilities: { ...station.facilities },
    kpetro: station.isKpetro,
  };

  return NextResponse.json(summary);
}
