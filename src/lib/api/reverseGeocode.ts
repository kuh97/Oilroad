/**
 * 좌표 → 주소 역지오코딩 클라이언트 호출.
 * 탭·드래그종료·Geolocation 성공처럼 "한 번" 호출하면 되는 이벤트 트리거라
 * usePlacesSearch류의 훅이 아니라 평범한 비동기 함수로 둔다.
 */
import type { WGS84Point } from "@/domain/types";

export async function reverseGeocode(point: WGS84Point): Promise<string | null> {
  try {
    const params = new URLSearchParams({ lat: String(point.lat), lng: String(point.lng) });
    const res = await fetch(`/api/places/reverse?${params}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { name?: string };
    return json.name || null;
  } catch {
    return null;
  }
}
