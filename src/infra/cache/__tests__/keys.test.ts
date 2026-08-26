import { describe, expect, it } from "vitest";
import { stationKey, budgetKey, stationDetailKey, routeKey, placeKey } from "../keys";
import { katec } from "@/domain/types";

describe("stationKey — 2km 격자 스냅", () => {
  it("기본 형식: {prefix}:stn:{gridX}:{gridY}:{prodcd}", () => {
    const center = katec(314_000, 544_000);
    const key = stationKey("dev", center, "B027");
    expect(key).toMatch(/^dev:stn:\d+:\d+:B027$/);
  });

  it("2km 격자 스냅 — 인접 좌표가 같은 키를 생성한다", () => {
    // 314_000 과 314_999 → 둘 다 314_000으로 스냅 (round(x/2000)*2000)
    // round(314000/2000) = round(157) = 157 → 314000
    // round(314999/2000) = round(157.4995) = 157 → 314000
    const k1 = stationKey("dev", katec(314_000, 544_000), "D047");
    const k2 = stationKey("dev", katec(314_999, 544_000), "D047");
    expect(k1).toBe(k2);
  });

  it("2km 이상 떨어진 좌표는 다른 키를 생성한다", () => {
    const k1 = stationKey("dev", katec(314_000, 544_000), "B027");
    const k2 = stationKey("dev", katec(316_001, 544_000), "B027");
    expect(k1).not.toBe(k2);
  });

  it("연료 코드가 다르면 다른 키", () => {
    const center = katec(314_000, 544_000);
    expect(stationKey("dev", center, "B027")).not.toBe(stationKey("dev", center, "D047"));
    expect(stationKey("dev", center, "D047")).not.toBe(stationKey("dev", center, "K015"));
  });

  it("prefix가 키에 포함된다 (dev vs prod 분리)", () => {
    const center = katec(314_000, 544_000);
    const devKey = stationKey("dev", center, "B027");
    const prodKey = stationKey("prod", center, "B027");
    expect(devKey).not.toBe(prodKey);
    expect(devKey.startsWith("dev:")).toBe(true);
    expect(prodKey.startsWith("prod:")).toBe(true);
  });
});

describe("budgetKey", () => {
  it("{prefix}:opinet:budget:{date} 형식", () => {
    expect(budgetKey("dev", "2026-08-26")).toBe("dev:opinet:budget:2026-08-26");
    expect(budgetKey("prod", "2026-01-01")).toBe("prod:opinet:budget:2026-01-01");
  });

  it("날짜가 다르면 다른 키 (일별 카운터 분리)", () => {
    expect(budgetKey("dev", "2026-08-26")).not.toBe(budgetKey("dev", "2026-08-27"));
  });
});

describe("stationDetailKey", () => {
  it("{prefix}:stn-detail:{uniId} 형식", () => {
    expect(stationDetailKey("dev", "A0009916")).toBe("dev:stn-detail:A0009916");
  });
});

describe("routeKey", () => {
  it("경유지 없는 기본 경로", () => {
    const key = routeKey("dev", "37.5_127.0", "35.1_129.0");
    expect(key).toBe("dev:route:37.5_127.0:35.1_129.0");
  });

  it("경유지 포함 경로", () => {
    const key = routeKey("dev", "37.5_127.0", "35.1_129.0", "36.3_128.0");
    expect(key).toBe("dev:route:37.5_127.0:35.1_129.0:36.3_128.0");
  });

  it("경유지 유무에 따라 다른 키", () => {
    const k1 = routeKey("dev", "A", "B");
    const k2 = routeKey("dev", "A", "B", "C");
    expect(k1).not.toBe(k2);
  });
});

describe("placeKey", () => {
  it("{prefix}:place:{encoded} 형식", () => {
    const key = placeKey("dev", "강남역");
    expect(key.startsWith("dev:place:")).toBe(true);
  });

  it("쿼리가 다르면 다른 키", () => {
    expect(placeKey("dev", "강남역")).not.toBe(placeKey("dev", "서울역"));
  });
});
