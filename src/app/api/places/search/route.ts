/**
 * 장소 자동완성(F1) — ARCHITECTURE.md §6.4·§10 Phase 8.
 */

import { NextResponse } from "next/server";
import { fetchPlaces } from "@/infra/kakao/local";
import { PLACE_QUERY_MIN_LEN } from "@/domain/params";
import { PlaceSearchQuerySchema } from "@/app/api/_lib/schema";
import { parseSearchParams } from "@/app/api/_lib/validate";
import type { WirePlace } from "@/app/api/_lib/types";

const MAX_RESULTS = 5;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = parseSearchParams(url, PlaceSearchQuerySchema);
  if (!parsed.ok) return parsed.response;

  const query = parsed.data.q.trim();
  if (query.length < PLACE_QUERY_MIN_LEN) {
    return NextResponse.json({ places: [] });
  }

  try {
    const places = await fetchPlaces({ query, size: MAX_RESULTS });
    const wire: WirePlace[] = places
      .slice(0, MAX_RESULTS)
      .map((p) => ({ name: p.name, address: p.address, lat: p.location.lat, lng: p.location.lng }));

    return NextResponse.json({ places: wire });
  } catch {
    // PRODUCT.md §10.2 — 자동완성 실패는 안내 + 재시도. 검색 자체는 계속 가능해야 하므로
    // 예외를 그대로 흘려보내지 않고 구조화된 에러로 응답한다.
    return NextResponse.json(
      { code: "PLACE_SEARCH_FAILED", message: "장소를 찾을 수 없습니다." },
      { status: 502 },
    );
  }
}
