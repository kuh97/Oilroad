/**
 * 좌표 → 주소 역지오코딩 — 홈 화면 지도 탭·드래그·"현재 위치" 버튼(F1).
 */

import { NextResponse } from "next/server";
import { fetchAddress } from "@/infra/kakao/local";
import { wgs84 } from "@/domain/types";
import { ReverseGeocodeQuerySchema } from "@/app/api/_lib/schema";
import { parseSearchParams } from "@/app/api/_lib/validate";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = parseSearchParams(url, ReverseGeocodeQuerySchema);
  if (!parsed.ok) return parsed.response;

  try {
    const place = await fetchAddress({ point: wgs84(parsed.data.lat, parsed.data.lng) });
    return NextResponse.json({ name: place.name, address: place.address });
  } catch {
    return NextResponse.json(
      { code: "REVERSE_GEOCODE_FAILED", message: "주소를 찾을 수 없습니다." },
      { status: 502 },
    );
  }
}
