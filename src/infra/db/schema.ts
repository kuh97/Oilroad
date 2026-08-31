/**
 * Drizzle 스키마 — ARCHITECTURE.md §7.
 *
 * 테이블·컬럼 이름을 gas_station/oil_type처럼 좁게 만들지 않습니다.
 * refuel_point/energy_type을 유지합니다 (§9 변경 원칙, 향후 전기차 충전소 확장 대비).
 */

import {
  pgTable,
  text,
  doublePrecision,
  boolean,
  integer,
  timestamp,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

// ─── refuel_point — 주유소 마스터 (§7.1) ───────────────────────────────────────
//
// 폴백 C 채택 — 표준데이터(행안부)는 UNI_ID·시설 컬럼이 없어 임포트하지 않습니다.
// 이 테이블은 오피넷 상세 API 응답으로만 채워집니다 (source='OPINET').

export const refuelPoint = pgTable(
  "refuel_point",
  {
    id: text("id").primaryKey(),                 // 오피넷 UNI_ID
    name: text("name").notNull(),
    brandCode: text("brand_code").notNull(),      // POLL_DIV_CD/CO
    energyType: text("energy_type").notNull(),    // 'OIL' | 'LPG' | 'BOTH'
    lat: doublePrecision("lat").notNull(),         // WGS84
    lng: doublePrecision("lng").notNull(),         // WGS84
    katecX: doublePrecision("katec_x"),
    katecY: doublePrecision("katec_y"),
    addressRoad: text("address_road"),
    addressJibun: text("address_jibun"),
    tel: text("tel"),
    sigunCd: text("sigun_cd"),                     // 시군구 평균가 조인 키

    hasCarWash: boolean("has_car_wash").notNull().default(false),
    hasMaintenance: boolean("has_maintenance").notNull().default(false),
    hasCvs: boolean("has_cvs").notNull().default(false),
    isKpetro: boolean("is_kpetro").notNull().default(false),

    // 가격 스냅샷: 기준시각 표시(§5.1)와 폐업 휴리스틱용
    lastPrice: integer("last_price"),
    lastPriceProd: text("last_price_prod"),        // B027 | D047 | K015
    priceTradedAt: timestamp("price_traded_at", { withTimezone: true }),

    source: text("source").notNull(),              // 'STANDARD_DATA' | 'OPINET'
    detailSyncedAt: timestamp("detail_synced_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_refuel_point_sigun").on(table.sigunCd),
    index("idx_refuel_point_energy").on(table.energyType),
  ],
);

// ─── sigungu_avg_price — P_ref 폴백용 (§7.2) ───────────────────────────────────

export const sigunguAvgPrice = pgTable(
  "sigungu_avg_price",
  {
    sigunCd: text("sigun_cd").notNull(),
    prodCd: text("prod_cd").notNull(),              // B027 · D047 · K015
    avgPrice: integer("avg_price").notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.sigunCd, table.prodCd] }),
  ],
);
