"use client";

/**
 * F8 상세 지도 — 기본 경로(회색) + 경유 경로(강조). PRODUCT.md §5.4.
 */

import { useKakaoLoader, Map, Polyline, MapMarker } from "react-kakao-maps-sdk";
import type { WirePoint } from "@/app/api/_lib/types";

export interface RouteMapProps {
  baseRoutePolyline: WirePoint[];
  viaRoutePolyline?: WirePoint[];
  station: WirePoint;
  origin: WirePoint;
  destination: WirePoint;
}

export function RouteMap({ baseRoutePolyline, viaRoutePolyline, station, origin, destination }: RouteMapProps) {
  const [loading, error] = useKakaoLoader({ appkey: process.env.NEXT_PUBLIC_KAKAO_JS_KEY ?? "" });

  if (loading) {
    return (
      <div className="flex h-56 items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
        지도를 불러오는 중…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-56 items-center justify-center rounded-lg bg-muted text-sm text-destructive">
        지도를 불러오지 못했습니다.
      </div>
    );
  }

  return (
    <Map center={station} style={{ width: "100%", height: "224px", borderRadius: "0.5rem" }} level={7}>
      {baseRoutePolyline.length > 0 && (
        <Polyline path={baseRoutePolyline} strokeColor="#9CA3AF" strokeWeight={4} strokeOpacity={0.8} />
      )}
      {viaRoutePolyline && viaRoutePolyline.length > 0 && (
        <Polyline path={viaRoutePolyline} strokeColor="#2563EB" strokeWeight={5} />
      )}
      <MapMarker position={origin} />
      <MapMarker position={destination} />
      <MapMarker position={station} />
    </Map>
  );
}
