import { describe, expect, it } from "vitest";
import {
  mapRadiusItem,
  mapDetailItem,
  mapAvgSigunPriceItem,
  FUEL_TO_PRODCD,
  PRODCD_TO_FUEL,
} from "../mapper";
import {
  OpinetRadiusResponseSchema,
  OpinetDetailResponseSchema,
  AvgSigunPriceResponseSchema,
} from "../schema";
import radiusFixture from "../../../../tests/fixtures/opinet-radius.json";
import detailFixture from "../../../../tests/fixtures/opinet-detail.json";
import avgSigunPriceFixture from "../../../../tests/fixtures/opinet-avg-sigun-price.json";

const radiusItems = OpinetRadiusResponseSchema.parse(radiusFixture).RESULT.OIL;
const detailItems = OpinetDetailResponseSchema.parse(detailFixture).RESULT.OIL;
const avgSigunPriceItems = AvgSigunPriceResponseSchema.parse(avgSigunPriceFixture).RESULT.OIL;

describe("mapRadiusItem — 반경검색 매핑", () => {
  it("UNI_ID → id, OS_NM → name, POLL_DIV_CD → brandCode", () => {
    const item = radiusItems[0];
    const mapped = mapRadiusItem(item);
    expect(mapped.id).toBe(item.UNI_ID);
    expect(mapped.name).toBe(item.OS_NM);
    expect(mapped.brandCode).toBe(item.POLL_DIV_CD);
  });

  it("PRICE → priceWon, DISTANCE → distanceM", () => {
    const item = radiusItems[0];
    const mapped = mapRadiusItem(item);
    expect(mapped.priceWon).toBe(item.PRICE);
    expect(mapped.distanceM).toBe(item.DISTANCE);
  });

  it("GIS_X_COOR(KATEC X) → KatecPoint.x, GIS_Y_COOR → KatecPoint.y", () => {
    const item = radiusItems[0];
    const mapped = mapRadiusItem(item);
    expect(mapped.katecLocation.x).toBe(item.GIS_X_COOR);
    expect(mapped.katecLocation.y).toBe(item.GIS_Y_COOR);
  });

  it("KATEC → WGS84 변환 결과가 한국 영역(lat 33~38, lng 125~130)에 있다", () => {
    for (const item of radiusItems) {
      const mapped = mapRadiusItem(item);
      expect(mapped.location.lat).toBeGreaterThan(33);
      expect(mapped.location.lat).toBeLessThan(38.5);
      expect(mapped.location.lng).toBeGreaterThan(124);
      expect(mapped.location.lng).toBeLessThan(131);
    }
  });

  it("★ GIS_X↔Y 뒤집으면 다른(틀린) 위치가 나온다 (불변식 검증)", () => {
    const item = radiusItems[0]; // X ≠ Y 이므로 뒤집으면 반드시 다른 좌표
    const correct = mapRadiusItem(item);
    const flipped = mapRadiusItem({ ...item, GIS_X_COOR: item.GIS_Y_COOR, GIS_Y_COOR: item.GIS_X_COOR });

    // 위치가 유의미하게 달라야 함 (소수점 2자리 이상 차이)
    const latDiff = Math.abs(flipped.location.lat - correct.location.lat);
    const lngDiff = Math.abs(flipped.location.lng - correct.location.lng);
    expect(latDiff + lngDiff).toBeGreaterThan(0.01);
  });

  it("원본 필드명(UNI_ID, OS_NM)이 반환값에 노출되지 않는다", () => {
    const mapped = mapRadiusItem(radiusItems[0]) as unknown as Record<string, unknown>;
    expect(mapped["UNI_ID"]).toBeUndefined();
    expect(mapped["OS_NM"]).toBeUndefined();
    expect(mapped["POLL_DIV_CD"]).toBeUndefined();
    expect(mapped["GIS_X_COOR"]).toBeUndefined();
  });
});

describe("mapDetailItem — 상세정보 매핑", () => {
  it("시설 정보가 boolean으로 변환된다", () => {
    const item = detailItems[0];
    const mapped = mapDetailItem(item);
    expect(typeof mapped.facilities.carWash).toBe("boolean");
    expect(typeof mapped.facilities.maintenance).toBe("boolean");
    expect(typeof mapped.facilities.cvs).toBe("boolean");
    expect(typeof mapped.isKpetro).toBe("boolean");
  });

  it("CAR_WASH_YN=Y → facilities.carWash=true", () => {
    // fixture의 CAR_WASH_YN = "Y"
    const item = detailItems[0]; // "CAR_WASH_YN": "Y"
    const mapped = mapDetailItem(item);
    expect(mapped.facilities.carWash).toBe(item.CAR_WASH_YN === "Y");
  });

  it("LPG_YN=N → energyType=OIL", () => {
    const item = detailItems[0]; // "LPG_YN": "N"
    const mapped = mapDetailItem(item);
    expect(mapped.energyType).toBe("OIL");
  });

  it("LPG_YN=Y → energyType=LPG (전용, 겸업 아님)", () => {
    const fakeDetail = { ...detailItems[0], LPG_YN: "Y" as const };
    const mapped = mapDetailItem(fakeDetail);
    expect(mapped.energyType).toBe("LPG");
  });

  it("LPG_YN=C → energyType=BOTH (겸업)", () => {
    const fakeDetail = { ...detailItems[0], LPG_YN: "C" as const };
    const mapped = mapDetailItem(fakeDetail);
    expect(mapped.energyType).toBe("BOTH");
  });

  it("POLL_DIV_CO → brandCode (CO, CD 아님)", () => {
    const item = detailItems[0];
    const mapped = mapDetailItem(item);
    expect(mapped.brandCode).toBe(item.POLL_DIV_CO);
  });

  it("원본 필드명이 반환값에 노출되지 않는다", () => {
    const mapped = mapDetailItem(detailItems[0]) as unknown as Record<string, unknown>;
    expect(mapped["UNI_ID"]).toBeUndefined();
    expect(mapped["OS_NM"]).toBeUndefined();
    expect(mapped["POLL_DIV_CO"]).toBeUndefined();
  });
});

describe("mapAvgSigunPriceItem — 시군구 평균가 매핑", () => {
  it("SIGUNCD → sigunCd, PRODCD(B027) → fuel=GASOLINE", () => {
    const item = avgSigunPriceItems.find((i) => i.PRODCD === "B027")!;
    const mapped = mapAvgSigunPriceItem(item);
    expect(mapped).not.toBeNull();
    expect(mapped!.sigunCd).toBe(item.SIGUNCD);
    expect(mapped!.fuel).toBe("GASOLINE");
  });

  it("PRODCD(D047) → fuel=DIESEL, PRODCD(K015) → fuel=LPG", () => {
    const diesel = avgSigunPriceItems.find((i) => i.PRODCD === "D047")!;
    const lpg = avgSigunPriceItems.find((i) => i.PRODCD === "K015")!;
    expect(mapAvgSigunPriceItem(diesel)!.fuel).toBe("DIESEL");
    expect(mapAvgSigunPriceItem(lpg)!.fuel).toBe("LPG");
  });

  it("PRODCD가 B034(고급휘발유)·C004(실내등유)면 null을 반환한다", () => {
    const premium = avgSigunPriceItems.find((i) => i.PRODCD === "B034")!;
    const kerosene = avgSigunPriceItems.find((i) => i.PRODCD === "C004")!;
    expect(mapAvgSigunPriceItem(premium)).toBeNull();
    expect(mapAvgSigunPriceItem(kerosene)).toBeNull();
  });

  it("PRICE 소수값을 원단위 정수로 반올림한다", () => {
    const item = { ...avgSigunPriceItems[0], PRODCD: "B027", PRICE: 1906.6 };
    const mapped = mapAvgSigunPriceItem(item);
    expect(mapped!.avgPriceWon).toBe(1907);
    expect(Number.isInteger(mapped!.avgPriceWon)).toBe(true);
  });
});

describe("연료 코드 매핑", () => {
  it("FUEL_TO_PRODCD — 3종 연료 모두 prodcd가 있다", () => {
    expect(FUEL_TO_PRODCD["GASOLINE"]).toBe("B027");
    expect(FUEL_TO_PRODCD["DIESEL"]).toBe("D047");
    expect(FUEL_TO_PRODCD["LPG"]).toBe("K015");
  });

  it("PRODCD_TO_FUEL — B027→GASOLINE, D047→DIESEL, K015→LPG", () => {
    expect(PRODCD_TO_FUEL["B027"]).toBe("GASOLINE");
    expect(PRODCD_TO_FUEL["D047"]).toBe("DIESEL");
    expect(PRODCD_TO_FUEL["K015"]).toBe("LPG");
  });
});
