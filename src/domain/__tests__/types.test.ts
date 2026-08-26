import { describe, expect, it } from "vitest";
import { wgs84, katec, projected } from "../types";
import type { WGS84Point, KatecPoint, ProjectedPoint } from "../types";

describe("브랜드 타입 — 런타임 팩토리", () => {
  it("wgs84() 는 _brand: WGS84 를 갖는다", () => {
    const p = wgs84(37.5, 127.0);
    expect(p._brand).toBe("WGS84");
    expect(p.lat).toBe(37.5);
    expect(p.lng).toBe(127.0);
  });

  it("katec() 는 _brand: Katec 를 갖는다", () => {
    const p = katec(314820, 544030);
    expect(p._brand).toBe("Katec");
  });

  it("projected() 는 _brand: Projected 를 갖는다", () => {
    const p = projected(1000000, 2000000);
    expect(p._brand).toBe("Projected");
  });
});

/**
 * 컴파일 타임 타입 안전성 확인 — 아래 줄을 주석 해제하면 tsc가 실패합니다.
 * 브랜드 타입이 서로 대입 불가함을 증명합니다 (AGENTS.md §7.3).
 *
 * acceptsWGS84(katec(0, 0));     // TS error: Katec is not assignable to WGS84
 * acceptsKatec(wgs84(0, 0));     // TS error
 * acceptsProjected(katec(0, 0)); // TS error
 */
it("브랜드 타입은 서로 구별된다 (런타임 _brand 필드 확인)", () => {
  const w = wgs84(0, 0);
  const k = katec(0, 0);
  const p = projected(0, 0);
  expect(w._brand).not.toBe(k._brand);
  expect(k._brand).not.toBe(p._brand);
  expect(w._brand).not.toBe(p._brand);
});

// TypeScript 타입 추론 — 아래가 컴파일되면 브랜드 타입이 제대로 작동하는 것입니다.
const _w: WGS84Point = wgs84(37.5, 127.0);
const _k: KatecPoint = katec(314820, 544030);
const _p: ProjectedPoint = projected(1000000, 2000000);
// 사용되지 않는 변수 lint 경고를 피하기 위해 타입만 확인
void _w; void _k; void _p;
