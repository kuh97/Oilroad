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

  const places = await fetchPlaces({ query, size: MAX_RESULTS });
  const wire: WirePlace[] = places
    .slice(0, MAX_RESULTS)
    .map((p) => ({ name: p.name, address: p.address, lat: p.location.lat, lng: p.location.lng }));

  return NextResponse.json({ places: wire });
}
