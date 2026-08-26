/**
 * 오피넷 API 응답 zod 스키마.
 * 이 파일 밖으로 UNI_ID·OS_NM 등 원본 필드명이 나가지 않도록
 * mapper.ts가 도메인 타입으로 변환합니다.
 */

import { z } from "zod";

// ─── 반경 내 주유소 ───────────────────────────────────────────────────────────

export const OpinetRadiusItemSchema = z.object({
  UNI_ID: z.string(),
  POLL_DIV_CD: z.string(),
  OS_NM: z.string(),
  PRICE: z.number().int(),
  DISTANCE: z.number(),
  GIS_X_COOR: z.number(),  // KATEC X (easting) → 경도 방향
  GIS_Y_COOR: z.number(),  // KATEC Y (northing) → 위도 방향
});

export const OpinetRadiusResponseSchema = z.object({
  RESULT: z.object({
    OIL: z.array(OpinetRadiusItemSchema),
  }),
});

// ─── 주유소 상세 (Fallback C) ─────────────────────────────────────────────────

export const OpinetDetailOilPriceSchema = z.object({
  PRODCD: z.string(),
  PRICE: z.number().int(),
  TRADE_DT: z.string().optional(),
  TRADE_TM: z.string().optional(),
});

export const OpinetDetailItemSchema = z.object({
  UNI_ID: z.string(),
  POLL_DIV_CO: z.string(),          // detail API는 CO (CD 아님)
  GPOLL_DIV_CO: z.string().optional(),
  OS_NM: z.string(),
  VAN_ADR: z.string().optional(),   // 지번주소
  NEW_ADR: z.string().optional(),   // 도로명주소
  TEL: z.string().optional(),
  SIGUNCD: z.string().optional(),
  LPG_YN: z.enum(["Y", "N"]).optional(),
  MAINT_YN: z.enum(["Y", "N"]),
  CAR_WASH_YN: z.enum(["Y", "N"]),
  KPETRO_YN: z.enum(["Y", "N"]),
  CVS_YN: z.enum(["Y", "N"]),
  GOOD_YN: z.enum(["Y", "N"]).optional(),
  GOOD_YN5: z.enum(["Y", "N"]).optional(),
  GIS_X_COOR: z.number(),
  GIS_Y_COOR: z.number(),
  OIL_PRICE: z.array(OpinetDetailOilPriceSchema).optional(),
});

export const OpinetDetailResponseSchema = z.object({
  RESULT: z.object({
    OIL: z.array(OpinetDetailItemSchema),
  }),
});

export type OpinetRadiusItem = z.infer<typeof OpinetRadiusItemSchema>;
export type OpinetDetailItem = z.infer<typeof OpinetDetailItemSchema>;
export type OpinetDetailOilPrice = z.infer<typeof OpinetDetailOilPriceSchema>;
