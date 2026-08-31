/**
 * 내 주변 (F10) — ARCHITECTURE.md §6.4·§10 Phase 8, PRODUCT.md §5.6.
 * 경로가 없으므로 tier·detour·netSaving·scores·reason은 계산하지 않습니다.
 * 반경은 오피넷 aroundAll.do가 SEARCH_RADIUS(5km)로 고정 — station-service를
 * 좌표 1점으로 호출하는 것으로 충분합니다.
 */

import { NextResponse } from "next/server";
import { collectStations } from "@/services/station-service";
import { wgs84 } from "@/domain/types";
import { wgs84ToProjected, distanceM as projectedDistanceM } from "@/domain/geo";
import { approximateLastUpdateTime } from "@/domain/cache-ttl";
import { NearbyQuerySchema } from "@/app/api/_lib/schema";
import { parseSearchParams } from "@/app/api/_lib/validate";
import type { WireNearbyStation } from "@/app/api/_lib/types";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = parseSearchParams(url, NearbyQuerySchema);
  if (!parsed.ok) return parsed.response;
  const { lat, lng, fuel, sort } = parsed.data;

  const origin = wgs84(lat, lng);
  const originProjected = wgs84ToProjected(origin);
  const now = new Date();

  const { stations } = await collectStations({
    points: [originProjected],
    fuel,
    filters: { facilities: [], brands: [], kpetroOnly: false },
    now,
  });

  const priceUpdatedAt = approximateLastUpdateTime(now).toISOString();
  const items: WireNearbyStation[] = stations.map(({ station, price }) => ({
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
    distanceM: Math.round(projectedDistanceM(originProjected, wgs84ToProjected(station.location))),
  }));

  items.sort((a, b) => (sort === "distance" ? a.distanceM - b.distanceM : a.price - b.price));

  return NextResponse.json({ stations: items });
}
