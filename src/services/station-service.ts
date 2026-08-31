/**
 * 반경 내 주유소 수집 — STEP 3(기본 수집)·STEP 6(확장 수집) 공용.
 * ARCHITECTURE.md §5.1·§5.3·§5.4, §9.1.
 */

import { fetchRadius, fetchDetail } from "@/infra/opinet/client";
import { mapRadiusItem, FUEL_TO_PRODCD } from "@/infra/opinet/mapper";
import {
  incrementBudget,
  checkBudget,
  getBudgetKey,
  type BudgetStore,
} from "@/infra/opinet/budget";
import { findRefuelPointsByIds, upsertRefuelPointFromDetail } from "@/infra/db/repositories";
import { getRedis } from "@/infra/cache/redis";
import { stationKey } from "@/infra/cache/keys";
import { env } from "@/infra/env";
import { priceTtlSeconds } from "@/domain/cache-ttl";
import { wgs84ToKatec, projectedToWgs84 } from "@/domain/geo";
import type { RefuelPoint, Fuel, Facility, BrandCode, ProjectedPoint, Warning } from "@/domain/types";
import type { RedisLike } from "./route-service";

export type { RedisLike };

/** KST(UTC+9) 기준 "YYYY-MM-DD" — 오피넷 일일 예산 키에 씀 */
function kstDateString(now: Date): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 오피넷 일일 예산이 남아있는지 빠르게 확인(카운터 증가 없음).
 * recommendation-service가 STEP2 진입 전(§5.3.2)과 STEP5→6 확장 게이트에서 호출합니다.
 */
export async function isOpinetBudgetAvailable(
  redis: RedisLike,
  prefix: string,
  limit: number,
  now: Date,
): Promise<boolean> {
  const key = getBudgetKey(prefix, kstDateString(now));
  return checkBudget(redis as BudgetStore & { get(k: string): Promise<string | null> }, key, limit);
}

export interface CollectStationsFilters {
  facilities: Facility[];
  brands: BrandCode[];
  kpetroOnly: boolean;
}

export interface CollectedStation {
  station: RefuelPoint;
  price: number;
}

export interface CollectStationsResult {
  stations: CollectedStation[];
  warnings: Warning[];
}

export interface CollectStationsOptions {
  /** 샘플 지점(STEP2) 또는 법선 오프셋 지점(STEP6), EPSG:5179 */
  points: ProjectedPoint[];
  fuel: Fuel;
  filters: CollectStationsFilters;
  /** 기본 1. 확장 수집은 0(best-effort, §5.4) */
  retries?: number;
  redis?: RedisLike;
  prefix?: string;
  now?: Date;
  budgetLimit?: number;
  findRefuelPointsByIds?: typeof findRefuelPointsByIds;
  upsertRefuelPointFromDetail?: typeof upsertRefuelPointFromDetail;
}

interface RawStation {
  id: string;
  name: string;
  brandCode: string;
  price: number;
}

/** 지점 하나에 대한 반경검색 — 캐시 확인 → 예산 확인 → 오피넷 호출 → 캐시 저장 */
async function fetchOnePoint(
  point: ProjectedPoint,
  fuel: Fuel,
  retries: number,
  redis: RedisLike,
  prefix: string,
  now: Date,
  budgetLimit: number,
): Promise<{ items: RawStation[]; warning?: Warning }> {
  const katecPoint = wgs84ToKatec(projectedToWgs84(point));
  const prodcd = FUEL_TO_PRODCD[fuel];
  const key = stationKey(prefix, katecPoint, prodcd);

  const cached = await redis.get(key);
  if (cached) {
    return { items: JSON.parse(cached) as RawStation[] };
  }

  const budgetKey = getBudgetKey(prefix, kstDateString(now));
  const budgetResult = await incrementBudget(redis, budgetKey, budgetLimit);
  if (!budgetResult.allowed) {
    return {
      items: [],
      warning: { code: "QUOTA_EXCEEDED", message: "오피넷 일일 호출 예산을 초과해 일부 지점을 건너뛰었습니다." },
    };
  }

  try {
    const radiusItems = await fetchRadius({ center: katecPoint, fuel, retries });
    const items: RawStation[] = radiusItems.map((item) => {
      const mapped = mapRadiusItem(item);
      return { id: mapped.id, name: mapped.name, brandCode: mapped.brandCode, price: mapped.priceWon };
    });
    await redis.set(key, JSON.stringify(items), { ex: priceTtlSeconds(now) });
    return { items };
  } catch {
    return {
      items: [],
      warning: { code: "PARTIAL_STATION_FETCH_FAILED", message: "일부 지점의 주유소 조회에 실패했습니다." },
    };
  }
}

function matchesFilters(station: RefuelPoint, filters: CollectStationsFilters): boolean {
  if (filters.kpetroOnly && !station.isKpetro) return false;
  if (filters.brands.length > 0 && !filters.brands.includes(station.brandCode)) return false;
  for (const facility of filters.facilities) {
    if (facility === "CAR_WASH" && !station.facilities.carWash) return false;
    if (facility === "MAINTENANCE" && !station.facilities.maintenance) return false;
    if (facility === "CVS" && !station.facilities.cvs) return false;
  }
  return true;
}

/**
 * 지점 목록에 대해 반경검색을 수행하고 dedupe → 마스터 DB 조인(폴백 C 보강) →
 * 필터 적용 → 가격 없는 후보 제외(A3)까지 처리합니다.
 */
export async function collectStations(opts: CollectStationsOptions): Promise<CollectStationsResult> {
  const redis: RedisLike = opts.redis ?? getRedis();
  const prefix = opts.prefix ?? env.REDIS_KEY_PREFIX;
  const now = opts.now ?? new Date();
  const retries = opts.retries ?? 1;
  const budgetLimit = opts.budgetLimit ?? env.OPINET_DAILY_BUDGET;
  const findByIds = opts.findRefuelPointsByIds ?? findRefuelPointsByIds;
  const upsertFromDetail = opts.upsertRefuelPointFromDetail ?? upsertRefuelPointFromDetail;

  const warnings: Warning[] = [];

  const results = await Promise.all(
    opts.points.map((p) => fetchOnePoint(p, opts.fuel, retries, redis, prefix, now, budgetLimit)),
  );

  const priceById = new Map<string, number>();
  for (const result of results) {
    if (result.warning) warnings.push(result.warning);
    for (const item of result.items) {
      if (!priceById.has(item.id)) priceById.set(item.id, item.price);
    }
  }

  const ids = [...priceById.keys()];
  if (ids.length === 0) return { stations: [], warnings };

  const known = await findByIds(ids);
  const knownIds = new Set(known.map((s) => s.id));
  const missingIds = ids.filter((id) => !knownIds.has(id));

  const backfilled: RefuelPoint[] = [];
  for (const uniId of missingIds) {
    try {
      const detail = await fetchDetail({ uniId });
      if (!detail) continue;
      await upsertFromDetail(detail, { searchedFuel: opts.fuel, now });
      const [refreshed] = await findByIds([uniId]);
      if (refreshed) backfilled.push(refreshed);
    } catch {
      // 상세 조회 실패 — 시설 정보 없이는 필터를 판정할 수 없으므로 이 후보는 건너뜁니다.
    }
  }

  const stationsById = new Map<string, RefuelPoint>();
  for (const s of [...known, ...backfilled]) stationsById.set(s.id, s);

  const collected: CollectedStation[] = [];
  for (const [id, price] of priceById) {
    if (price <= 0) continue; // A3 — 가격 0/null 제외
    const station = stationsById.get(id);
    if (!station) continue; // 상세 보강도 실패한 경우
    if (!matchesFilters(station, opts.filters)) continue;
    collected.push({ station, price });
  }

  return { stations: collected, warnings };
}
