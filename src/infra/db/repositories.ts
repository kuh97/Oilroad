/**
 * refuel_point · sigungu_avg_price 리포지토리.
 * ARCHITECTURE.md §7·§10 Phase 6.
 *
 * 순수 변환 함수(to___/from___ 접두사)와 DB 접근 함수를 분리합니다 — 전자는 DB 없이,
 * 후자는 주입된 db(기본값 getDb())로 테스트합니다 (opinet/budget.ts의
 * BudgetStore 주입 패턴과 동일).
 */

import { and, avg, eq, inArray, like, sql } from "drizzle-orm";
import { getDb, type Db } from "./client";
import { refuelPoint, sigunguAvgPrice } from "./schema";
import { mapDetailItem, FUEL_TO_PRODCD } from "@/infra/opinet/mapper";
import type { OpinetDetailItem } from "@/infra/opinet/schema";
import { wgs84, katec } from "@/domain/types";
import type { RefuelPoint, EnergyType, Fuel } from "@/domain/types";

// ─── refuel_point ───────────────────────────────────────────────────────────

export type RefuelPointInsert = typeof refuelPoint.$inferInsert;
export type RefuelPointRow = typeof refuelPoint.$inferSelect;

export interface UpsertRefuelPointOptions {
  /** 상세 조회를 촉발한 연료 — OIL_PRICE에서 가격 스냅샷을 골라내는 데 씀 */
  searchedFuel?: Fuel;
  now?: Date;
}

/** OpinetDetailItem → refuel_point insert row. 순수 함수 (DB 미접근). */
export function toRefuelPointInsert(
  item: OpinetDetailItem,
  opts: UpsertRefuelPointOptions = {},
): RefuelPointInsert {
  const mapped = mapDetailItem(item);
  const now = opts.now ?? new Date();

  let lastPrice: number | null = null;
  let lastPriceProd: string | null = null;
  if (opts.searchedFuel && item.OIL_PRICE) {
    const prodcd = FUEL_TO_PRODCD[opts.searchedFuel];
    const entry = item.OIL_PRICE.find((p) => p.PRODCD === prodcd);
    if (entry) {
      lastPrice = entry.PRICE;
      lastPriceProd = entry.PRODCD;
    }
  }

  return {
    id: mapped.id,
    name: mapped.name,
    brandCode: mapped.brandCode,
    energyType: mapped.energyType,
    lat: mapped.location.lat,
    lng: mapped.location.lng,
    katecX: mapped.katecLocation?.x ?? null,
    katecY: mapped.katecLocation?.y ?? null,
    addressRoad: mapped.addressRoad ?? null,
    addressJibun: mapped.addressJibun ?? null,
    tel: mapped.tel ?? null,
    sigunCd: mapped.sigunCd ?? null,
    hasCarWash: mapped.facilities.carWash,
    hasMaintenance: mapped.facilities.maintenance,
    hasCvs: mapped.facilities.cvs,
    isKpetro: mapped.isKpetro,
    lastPrice,
    lastPriceProd,
    priceTradedAt: null, // 오피넷 응답에 기준시각 없음 — ARCHITECTURE.md §5.1 실측 확정
    source: "OPINET",
    detailSyncedAt: now,
    updatedAt: now,
  };
}

/** refuel_point row → 도메인 RefuelPoint. 순수 함수 (DB 미접근). */
export function fromRefuelPointRow(row: RefuelPointRow): RefuelPoint {
  return {
    id: row.id,
    name: row.name,
    brandCode: row.brandCode,
    energyType: row.energyType as EnergyType,
    location: wgs84(row.lat, row.lng),
    katecLocation:
      row.katecX != null && row.katecY != null ? katec(row.katecX, row.katecY) : undefined,
    addressRoad: row.addressRoad ?? undefined,
    addressJibun: row.addressJibun ?? undefined,
    tel: row.tel ?? undefined,
    sigunCd: row.sigunCd ?? undefined,
    facilities: {
      carWash: row.hasCarWash,
      maintenance: row.hasMaintenance,
      cvs: row.hasCvs,
    },
    isKpetro: row.isKpetro,
  };
}

/**
 * 오피넷 상세 API 응답을 refuel_point에 upsert.
 * Fallback C — 마스터에 없는 UNI_ID를 반경검색에서 처음 만났을 때 호출합니다 (§7.1).
 * 가격 스냅샷은 새로 얻은 값이 있을 때만 덮어씁니다 — 매번 null로 지우지 않습니다.
 */
export async function upsertRefuelPointFromDetail(
  item: OpinetDetailItem,
  opts: UpsertRefuelPointOptions = {},
  db: Db = getDb(),
): Promise<void> {
  const row = toRefuelPointInsert(item, opts);
  await db
    .insert(refuelPoint)
    .values(row)
    .onConflictDoUpdate({
      target: refuelPoint.id,
      set: {
        name: row.name,
        brandCode: row.brandCode,
        energyType: row.energyType,
        lat: row.lat,
        lng: row.lng,
        katecX: row.katecX,
        katecY: row.katecY,
        addressRoad: row.addressRoad,
        addressJibun: row.addressJibun,
        tel: row.tel,
        sigunCd: row.sigunCd,
        hasCarWash: row.hasCarWash,
        hasMaintenance: row.hasMaintenance,
        hasCvs: row.hasCvs,
        isKpetro: row.isKpetro,
        ...(row.lastPrice != null
          ? { lastPrice: row.lastPrice, lastPriceProd: row.lastPriceProd }
          : {}),
        source: row.source,
        detailSyncedAt: row.detailSyncedAt,
        updatedAt: row.updatedAt,
      },
    });
}

/**
 * UNI_ID 목록으로 마스터를 조회 — 반경검색 결과를 이 결과와 조인하면
 * 시설 필터의 상세 조회 호출이 0으로 떨어집니다 (§10 Phase 6 완료 기준).
 */
export async function findRefuelPointsByIds(
  ids: string[],
  db: Db = getDb(),
): Promise<RefuelPoint[]> {
  if (ids.length === 0) return [];
  const rows = await db.select().from(refuelPoint).where(inArray(refuelPoint.id, ids));
  return rows.map(fromRefuelPointRow);
}

/**
 * 단일 주유소를 가격 스냅샷(`lastPrice`)까지 포함한 원본 row로 조회.
 * `fromRefuelPointRow`는 가격을 domain `RefuelPoint`에 포함시키지 않으므로(가격은
 * 검색 시점 값이라 station 엔티티가 아닌 Candidate가 들고 있음 — §7.1), 경로 없이
 * 상세만 필요한 GET /api/stations/:id(§6.4)는 이 함수를 씁니다.
 * `lastPrice`는 마지막으로 검색됐던 연료(`lastPriceProd`) 기준이라, 요청한 연료와
 * 다를 수 있습니다 — PRODUCT.md §5.6이 이 기능에 시간을 많이 쓰지 말라고 명시한 만큼
 * 현재는 이 한계를 그대로 노출합니다.
 */
export async function findRefuelPointRowById(
  id: string,
  db: Db = getDb(),
): Promise<RefuelPointRow | undefined> {
  const [row] = await db.select().from(refuelPoint).where(eq(refuelPoint.id, id));
  return row;
}

// ─── refuel_point — 유가 CSV 임포트 (docs/MIGRATION-DB.md §6 컬럼 소유권 규칙) ──
//
// upsertRefuelPointFromDetail(상세 API 소유 컬럼)과 SET 절이 절대 겹치면 안 됩니다.
// has_car_wash·has_maintenance·has_cvs·is_kpetro·tel·detail_synced_at은 여기서
// 건드리지 않습니다 — 매일 CSV를 다시 임포트해도 상세 API로 백필한 시설정보가
// 지워지지 않는 이유입니다. lat/lng/coord_source는 기존 값이 없을 때만 채웁니다
// (오피넷 실좌표를 지오코딩 값으로 덮지 않기 위함 — 좌표는 호출부가 미리 조회해서
// 채워 넘기므로 여기 COALESCE는 이중 안전장치입니다).

export interface CsvUpsertRow {
  id: string;
  name: string;
  brandCode: string;
  energyType: EnergyType;
  lat: number;
  lng: number;
  coordSource: string; // 'OPINET' | 'KAKAO_ADDR' | 'KAKAO_KEYWORD'
  addressRoad: string;
  sigunCd: string | null;
  isSelf: boolean;
  pricedOn: string;    // "YYYY-MM-DD"
  lastSeenOn: string;  // "YYYY-MM-DD"
  priceGasoline: number | null;
  priceDiesel: number | null;
  priceLpg: number | null;
  pricePremium: number | null;
  priceKerosene: number | null;
}

/**
 * 유가 CSV 병합 결과를 refuel_point에 upsert.
 * scripts/import-price-csv.ts가 일 1회(또는 최초 1회 구축 시) 호출합니다.
 * 반환값은 upsert를 시도한 행 수입니다. 호출부가 청크 단위로 나눠 부릅니다
 * (Neon HTTP 드라이버 한 요청에 만 건 단위를 그대로 보내지 않기 위함).
 */
export async function bulkUpsertFromCsv(
  rows: CsvUpsertRow[],
  db: Db = getDb(),
  now: Date = new Date(),
): Promise<number> {
  if (rows.length === 0) return 0;

  const values = rows.map((r) => ({
    id: r.id,
    name: r.name,
    brandCode: r.brandCode,
    energyType: r.energyType,
    lat: r.lat,
    lng: r.lng,
    coordSource: r.coordSource,
    addressRoad: r.addressRoad,
    sigunCd: r.sigunCd,
    isSelf: r.isSelf,
    pricedOn: r.pricedOn,
    lastSeenOn: r.lastSeenOn,
    priceGasoline: r.priceGasoline,
    priceDiesel: r.priceDiesel,
    priceLpg: r.priceLpg,
    pricePremium: r.pricePremium,
    priceKerosene: r.priceKerosene,
    source: "OPINET_CSV",
    updatedAt: now,
  }));

  await db
    .insert(refuelPoint)
    .values(values)
    .onConflictDoUpdate({
      target: refuelPoint.id,
      set: {
        name: sql`excluded.name`,
        brandCode: sql`excluded.brand_code`,
        energyType: sql`excluded.energy_type`,
        addressRoad: sql`excluded.address_road`,
        sigunCd: sql`excluded.sigun_cd`,
        isSelf: sql`excluded.is_self`,
        pricedOn: sql`excluded.priced_on`,
        lastSeenOn: sql`excluded.last_seen_on`,
        priceGasoline: sql`excluded.price_gasoline`,
        priceDiesel: sql`excluded.price_diesel`,
        priceLpg: sql`excluded.price_lpg`,
        pricePremium: sql`excluded.price_premium`,
        priceKerosene: sql`excluded.price_kerosene`,
        lat: sql`coalesce(${refuelPoint.lat}, excluded.lat)`,
        lng: sql`coalesce(${refuelPoint.lng}, excluded.lng)`,
        coordSource: sql`coalesce(${refuelPoint.coordSource}, excluded.coord_source)`,
        updatedAt: sql`excluded.updated_at`,
        // has_car_wash / has_maintenance / has_cvs / is_kpetro / tel /
        // detail_synced_at / source — 의도적으로 없음 (컬럼 소유권 규칙)
      },
    });

  return values.length;
}

// ─── sigungu_avg_price ──────────────────────────────────────────────────────

export interface SigunguAvgPriceInput {
  sigunCd: string;
  fuel: Fuel;
  avgPriceWon: number;
}

export type SigunguAvgPriceInsert = typeof sigunguAvgPrice.$inferInsert;

/** SigunguAvgPriceInput[] → sigungu_avg_price insert rows. 순수 함수 (DB 미접근). */
export function toSigunguAvgPriceInserts(
  rows: SigunguAvgPriceInput[],
  now: Date = new Date(),
): SigunguAvgPriceInsert[] {
  return rows.map((r) => ({
    sigunCd: r.sigunCd,
    prodCd: FUEL_TO_PRODCD[r.fuel],
    avgPrice: r.avgPriceWon,
    syncedAt: now,
  }));
}

/**
 * 시군구 평균가 일괄 upsert — `scripts/sync-sigungu-avg.ts`가 일 1회 호출합니다 (§7.2).
 * 반환값은 upsert를 시도한 행 수입니다.
 */
export async function bulkUpsertSigunguAvgPrices(
  rows: SigunguAvgPriceInput[],
  db: Db = getDb(),
  now: Date = new Date(),
): Promise<number> {
  if (rows.length === 0) return 0;
  const values = toSigunguAvgPriceInserts(rows, now);
  await db
    .insert(sigunguAvgPrice)
    .values(values)
    .onConflictDoUpdate({
      target: [sigunguAvgPrice.sigunCd, sigunguAvgPrice.prodCd],
      set: {
        avgPrice: sql`excluded.avg_price`,
        syncedAt: sql`excluded.synced_at`,
      },
    });
  return values.length;
}

/** P_ref 시군구 가중평균 폴백 조회 (price-service가 Phase 7에서 사용, §6.1) */
export async function findSigunguAvgPrice(
  sigunCd: string,
  fuel: Fuel,
  db: Db = getDb(),
): Promise<number | null> {
  const prodCd = FUEL_TO_PRODCD[fuel];
  const [row] = await db
    .select({ avgPrice: sigunguAvgPrice.avgPrice })
    .from(sigunguAvgPrice)
    .where(and(eq(sigunguAvgPrice.sigunCd, sigunCd), eq(sigunguAvgPrice.prodCd, prodCd)));
  return row?.avgPrice ?? null;
}

/**
 * P_ref 시도 평균 폴백 조회 — 시군구 평균가가 없을 때의 다음 단계 (PRODUCT.md §8).
 * `sigun_cd`의 앞 2자리(시도코드)가 일치하는 행들을 평균 냅니다.
 */
export async function findSidoAvgPrice(
  sidoPrefix2: string,
  fuel: Fuel,
  db: Db = getDb(),
): Promise<number | null> {
  const prodCd = FUEL_TO_PRODCD[fuel];
  const [row] = await db
    .select({ avgPrice: avg(sigunguAvgPrice.avgPrice) })
    .from(sigunguAvgPrice)
    .where(and(like(sigunguAvgPrice.sigunCd, `${sidoPrefix2}%`), eq(sigunguAvgPrice.prodCd, prodCd)));
  return row?.avgPrice != null ? Math.round(Number(row.avgPrice)) : null;
}

/**
 * P_ref 전국 평균 폴백 조회 — 시군구·시도 평균가가 모두 없을 때의 마지막 단계 (PRODUCT.md §8).
 */
export async function findNationalAvgPrice(fuel: Fuel, db: Db = getDb()): Promise<number | null> {
  const prodCd = FUEL_TO_PRODCD[fuel];
  const [row] = await db
    .select({ avgPrice: avg(sigunguAvgPrice.avgPrice) })
    .from(sigunguAvgPrice)
    .where(eq(sigunguAvgPrice.prodCd, prodCd));
  return row?.avgPrice != null ? Math.round(Number(row.avgPrice)) : null;
}
