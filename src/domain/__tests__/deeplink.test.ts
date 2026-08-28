import { describe, expect, it } from "vitest";
import { buildDeeplink, buildNaverAndroidIntent } from "../deeplink";
import { wgs84 } from "../types";

const ORIGIN = wgs84(37.5, 127.0);
const DEST = wgs84(35.1, 129.0);
const WP = wgs84(36.3, 128.0);

const BASE = {
  origin: ORIGIN,
  destination: DEST,
  waypoint: WP,
  originName: "출발지",
  destinationName: "목적지",
  waypointName: "경유주유소",
  appName: "com.example.oilroad",
};

describe("buildDeeplink — 카카오", () => {
  it("스킴이 kakaomap:// 으로 시작", () => {
    const url = buildDeeplink({ ...BASE, app: "KAKAO" });
    expect(url).toMatch(/^kakaomap:\/\/route/);
  });

  it("출발(sp), 목적(ep), 경유(vp), by=car 포함", () => {
    const url = buildDeeplink({ ...BASE, app: "KAKAO" });
    expect(url).toContain("sp=37.5%2C127");
    expect(url).toContain("ep=35.1%2C129");
    expect(url).toContain("vp=36.3%2C128");
    expect(url).toContain("by=car");
  });

  it("스냅샷 고정", () => {
    const url = buildDeeplink({ ...BASE, app: "KAKAO" });
    expect(url).toMatchInlineSnapshot(
      `"kakaomap://route?sp=37.5%2C127&ep=35.1%2C129&by=car&vp=36.3%2C128"`,
    );
  });
});

describe("buildDeeplink — 네이버", () => {
  it("스킴이 nmap:// 으로 시작", () => {
    const url = buildDeeplink({ ...BASE, app: "NAVER" });
    expect(url).toMatch(/^nmap:\/\/route\/car/);
  });

  it("slat/slng/dlat/dlng/v1lat/v1lng/appname 포함", () => {
    const url = buildDeeplink({ ...BASE, app: "NAVER" });
    expect(url).toContain("slat=37.5");
    expect(url).toContain("dlat=35.1");
    expect(url).toContain("v1lat=36.3");
    expect(url).toContain("appname=com.example.oilroad");
  });
});

describe("buildDeeplink — 티맵", () => {
  it("스킴이 tmap:// 으로 시작", () => {
    const url = buildDeeplink({ ...BASE, app: "TMAP" });
    expect(url).toMatch(/^tmap:\/\/route/);
  });

  it("주유소 좌표(rGoX/rGoY)와 이름(rGoName)을 목적지로 전달 (PRODUCT.md §5.5)", () => {
    const url = buildDeeplink({ ...BASE, app: "TMAP" });
    expect(url).toContain(`rGoX=${WP.lng}`); // lng
    expect(url).toContain(`rGoY=${WP.lat}`); // lat
    expect(url).toContain(`rGoName=${encodeURIComponent("경유주유소")}`);
  });

  it("최종 목적지를 전달하지 않는다 — 티맵은 주유소까지만 안내", () => {
    const url = buildDeeplink({ ...BASE, app: "TMAP" });
    expect(url).not.toContain(`rGoX=${DEST.lng}`);
    expect(url).not.toContain(`rGoY=${DEST.lat}`);
    expect(url).not.toContain(encodeURIComponent("목적지"));
  });

  it("경유지·출발지 파라미터 포함하지 않음 (티맵 미지원)", () => {
    const url = buildDeeplink({ ...BASE, app: "TMAP" });
    expect(url).not.toContain("v1");
    expect(url).not.toContain("waypoint");
    expect(url).not.toContain("slat");
  });
});

describe("buildDeeplink — 옵션 파라미터 미지정", () => {
  const MINIMAL = {
    origin: ORIGIN,
    destination: DEST,
    waypoint: WP,
  };

  it("카카오: 이름 없이도 동작", () => {
    const url = buildDeeplink({ ...MINIMAL, app: "KAKAO" });
    expect(url).toMatch(/^kakaomap:\/\/route/);
  });

  it("네이버: 이름·appName 없이도 동작 (sname 빈 문자열)", () => {
    const url = buildDeeplink({ ...MINIMAL, app: "NAVER" });
    expect(url).toContain("sname=");
    expect(url).toContain("appname=");
  });

  it("티맵: waypointName 없이도 동작 (rGoName 빈 문자열)", () => {
    const url = buildDeeplink({ ...MINIMAL, app: "TMAP" });
    expect(url).toContain("rGoName=");
  });
});

describe("buildNaverAndroidIntent", () => {
  it("intent:// 스킴으로 시작", () => {
    const naverUrl = buildDeeplink({ ...BASE, app: "NAVER" });
    const intent = buildNaverAndroidIntent(naverUrl, "https://map.naver.com");
    expect(intent).toMatch(/^intent:\/\//);
  });

  it("scheme=nmap 포함", () => {
    const naverUrl = buildDeeplink({ ...BASE, app: "NAVER" });
    const intent = buildNaverAndroidIntent(naverUrl, "https://map.naver.com");
    expect(intent).toContain("scheme=nmap");
  });

  it("폴백 URL 포함", () => {
    const naverUrl = buildDeeplink({ ...BASE, app: "NAVER" });
    const fallback = "https://map.naver.com";
    const intent = buildNaverAndroidIntent(naverUrl, fallback);
    expect(intent).toContain(encodeURIComponent(fallback));
  });
});
