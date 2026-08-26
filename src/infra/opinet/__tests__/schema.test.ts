import { describe, expect, it } from "vitest";
import {
  OpinetRadiusResponseSchema,
  OpinetDetailResponseSchema,
} from "../schema";
import radiusFixture from "../../../../tests/fixtures/opinet-radius.json";
import detailFixture from "../../../../tests/fixtures/opinet-detail.json";

describe("OpinetRadiusResponseSchema — 픽스처 파싱", () => {
  it("Phase 0 반경검색 픽스처가 스키마를 통과한다", () => {
    const result = OpinetRadiusResponseSchema.safeParse(radiusFixture);
    expect(result.success).toBe(true);
  });

  it("파싱 후 OIL 배열이 비어있지 않다", () => {
    const result = OpinetRadiusResponseSchema.parse(radiusFixture);
    expect(result.RESULT.OIL.length).toBeGreaterThan(0);
  });

  it("각 항목이 필수 필드를 모두 갖는다", () => {
    const result = OpinetRadiusResponseSchema.parse(radiusFixture);
    for (const item of result.RESULT.OIL) {
      expect(typeof item.UNI_ID).toBe("string");
      expect(typeof item.POLL_DIV_CD).toBe("string");
      expect(typeof item.OS_NM).toBe("string");
      expect(Number.isInteger(item.PRICE)).toBe(true);
      expect(typeof item.GIS_X_COOR).toBe("number");
      expect(typeof item.GIS_Y_COOR).toBe("number");
    }
  });

  it("RESULT.OIL 없는 응답 → 파싱 실패", () => {
    const bad = { RESULT: { OIL: null } };
    expect(OpinetRadiusResponseSchema.safeParse(bad).success).toBe(false);
  });
});

describe("OpinetDetailResponseSchema — 픽스처 파싱", () => {
  it("Phase 0 상세 픽스처가 스키마를 통과한다", () => {
    const result = OpinetDetailResponseSchema.safeParse(detailFixture);
    expect(result.success).toBe(true);
  });

  it("시설 필드가 Y/N으로 파싱된다", () => {
    const result = OpinetDetailResponseSchema.parse(detailFixture);
    const item = result.RESULT.OIL[0];
    expect(["Y", "N"]).toContain(item.CAR_WASH_YN);
    expect(["Y", "N"]).toContain(item.MAINT_YN);
    expect(["Y", "N"]).toContain(item.CVS_YN);
    expect(["Y", "N"]).toContain(item.KPETRO_YN);
  });

  it("OIL_PRICE 배열이 있고 PRODCD·PRICE를 갖는다", () => {
    const result = OpinetDetailResponseSchema.parse(detailFixture);
    const item = result.RESULT.OIL[0];
    expect(Array.isArray(item.OIL_PRICE)).toBe(true);
    const first = item.OIL_PRICE![0];
    expect(typeof first.PRODCD).toBe("string");
    expect(Number.isInteger(first.PRICE)).toBe(true);
  });

  it("detail API 필드명은 POLL_DIV_CO (CD 아님)", () => {
    const result = OpinetDetailResponseSchema.parse(detailFixture);
    const item = result.RESULT.OIL[0];
    // 타입 레벨 검증: POLL_DIV_CO가 존재해야 스키마 통과
    expect(typeof item.POLL_DIV_CO).toBe("string");
  });
});
