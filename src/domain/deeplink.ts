/**
 * 외부 내비게이션 딥링크 생성
 * ARCHITECTURE.md §5.5
 *
 * 순수 함수 — URL 문자열만 반환하고 side effect 없음.
 */

import type { WGS84Point } from "./types";

export type NaviApp = "KAKAO" | "NAVER" | "TMAP";

export interface DeeplinkInput {
  app: NaviApp;
  origin: WGS84Point;
  destination: WGS84Point;
  waypoint: WGS84Point;    // 경유 주유소
  originName?: string;
  destinationName?: string;
  waypointName?: string;
  appName?: string;         // 네이버지도 appname 파라미터
}

/**
 * 딥링크 URL 생성.
 * ARCHITECTURE.md §5.5 스킴 정의 기준.
 */
export function buildDeeplink(input: DeeplinkInput): string {
  switch (input.app) {
    case "KAKAO":  return buildKakaoDeeplink(input);
    case "NAVER":  return buildNaverDeeplink(input);
    case "TMAP":   return buildTmapDeeplink(input);
  }
}

function buildKakaoDeeplink(input: DeeplinkInput): string {
  const { origin, destination, waypoint } = input;
  // kakaomap://route?sp={slat},{slng}&ep={elat},{elng}&by=car&vp={vlat},{vlng}
  const params = new URLSearchParams({
    sp: `${origin.lat},${origin.lng}`,
    ep: `${destination.lat},${destination.lng}`,
    by: "car",
    vp: `${waypoint.lat},${waypoint.lng}`,
  });
  return `kakaomap://route?${params.toString()}`;
}

function buildNaverDeeplink(input: DeeplinkInput): string {
  const { origin, destination, waypoint, originName, destinationName, waypointName, appName } = input;
  // nmap://route/car?slat=&slng=&sname=&dlat=&dlng=&dname=&v1lat=&v1lng=&v1name=&appname=
  const params = new URLSearchParams({
    slat: String(origin.lat),
    slng: String(origin.lng),
    sname: originName ?? "",
    dlat: String(destination.lat),
    dlng: String(destination.lng),
    dname: destinationName ?? "",
    v1lat: String(waypoint.lat),
    v1lng: String(waypoint.lng),
    v1name: waypointName ?? "",
    appname: appName ?? "",
  });
  return `nmap://route/car?${params.toString()}`;
}

function buildTmapDeeplink(input: DeeplinkInput): string {
  const { waypoint, waypointName } = input;
  // 티맵은 경유지를 전달할 수 없으므로 주유소를 목적지로 넣습니다 (PRODUCT.md §5.5).
  // 최종 목적지는 주유 후 사용자가 다시 입력합니다 — UI에 그 안내를 붙입니다.
  // 경유지 파라미터(rV1*)는 실기기에서 무시됨을 확인 (ARCHITECTURE.md §12 ⑧, 2026-08-28).
  const params = new URLSearchParams({
    rGoName: waypointName ?? "",
    rGoX: String(waypoint.lng),
    rGoY: String(waypoint.lat),
  });
  return `tmap://route?${params.toString()}`;
}

/** Android intent 래퍼 (네이버지도 폴백) */
export function buildNaverAndroidIntent(naverUrl: string, fallbackUrl: string): string {
  const encoded = encodeURIComponent(naverUrl.replace("nmap://", ""));
  return `intent://${encoded}#Intent;scheme=nmap;S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};end`;
}
