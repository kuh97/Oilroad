/**
 * 오케스트레이터 — STEP 1~11 전체.
 * ARCHITECTURE.md §9.1(파이프라인 다이어그램), §3.3(SSE와 폴백 — 한 서비스, 두 출구).
 *
 * `onProgress`는 옵셔널 콜백일 뿐입니다 — SSE 프레이밍은 Phase 8의 몫입니다.
 * 콜백 유무가 로직을 분기하지 않으므로, 둘 다 같은 SearchResult를 반환합니다.
 */

import { getRoute } from "./route-service";
import { collectStations, isOpinetBudgetAvailable } from "./station-service";
import { computeReferencePrice } from "./price-service";
import { logSearch } from "./event-service";
import { getRedis } from "@/infra/cache/redis";
import { getDb } from "@/infra/db/client";
import { env } from "@/infra/env";
import {
  samplePolyline,
  normalOffsets,
  wgs84ToProjected,
  pointToPolylineDistanceM,
} from "@/domain/geo";
import { classifyTier, needsExpansion } from "@/domain/tier";
import {
  estimateDetourDistanceM,
  estimateDetourDurationS,
  netSaving,
  totalCost,
  computeScores,
  passesT3Gate,
  exceedsDetourCap,
  scoreByMode,
} from "@/domain/pricing";
import { buildReason } from "@/domain/reason";
import { approximateLastUpdateTime } from "@/domain/cache-ttl";
import {
  MIN_CANDIDATES,
  T2_MAX,
  T3_MAX,
  OFFSET,
  MAX_PRECISE,
  MAX_RESULTS,
  MIN_ROUTE_DISTANCE,
} from "@/domain/params";
import type {
  SearchInput,
  SearchResult,
  Candidate,
  BaseRoute,
  RefuelPoint,
  Tier,
  Mode,
  Vehicle,
  Warning,
  RefPriceSource,
} from "@/domain/types";
import type { RedisLike } from "./route-service";
import type { Db } from "@/infra/db/client";

/** STEP1 전(§5.3.2) 예산이 이미 소진됐을 때 — SSE조차 열지 않고 즉시 안내하는 신호 */
export class QuotaExhaustedError extends Error {
  constructor() {
    super("오늘의 검색 제공량을 모두 사용했습니다.");
    this.name = "QuotaExhaustedError";
  }
}

export type ProgressStep = "ROUTE" | "COLLECT" | "EXPAND" | "PRECISE";

export type ProgressEvent =
  | { type: "progress"; step: ProgressStep; radiusM?: number }
  | { type: "base_route"; data: BaseRoute }
  | {
      type: "partial";
      data: {
        candidates: Candidate[];
        referencePrice: number | null;
        refPriceSource: RefPriceSource | null;
        expansion: SearchResult["expansion"];
      };
    }
  | { type: "warning"; data: Warning };

export type OnProgress = (event: ProgressEvent) => void;

export interface SearchDeps {
  redis?: RedisLike;
  db?: Db;
  prefix?: string;
  now?: Date;
  budgetLimit?: number;
  /** FEATURE_EXPANSION_ENABLED */
  expansionEnabled?: boolean;
}

interface InternalCandidate {
  station: RefuelPoint;
  price: number;
  dPerp: number;
  tier: Tier;
  detourDistanceM: number;
  detourDurationS: number;
  precise: boolean;
}

const MODES: readonly Mode[] = ["balanced", "minCost", "minDistance"];

function toInternalCandidates(
  stations: Array<{ station: RefuelPoint; price: number }>,
  projectedPolyline: ReturnType<typeof wgs84ToProjected>[],
): InternalCandidate[] {
  const result: InternalCandidate[] = [];
  for (const { station, price } of stations) {
    const stationProjected = wgs84ToProjected(station.location);
    const dPerp = pointToPolylineDistanceM(stationProjected, projectedPolyline);
    const tier = classifyTier(dPerp);
    if (!tier) continue; // A13 — T3_MAX 초과
    const detourDistanceM = estimateDetourDistanceM(dPerp);
    result.push({
      station,
      price,
      dPerp,
      tier,
      detourDistanceM,
      detourDurationS: estimateDetourDurationS(detourDistanceM),
      precise: false,
    });
  }
  return result;
}

function finalizeCandidates(
  internal: InternalCandidate[],
  priceRefWon: number | null,
  vehicle: Vehicle,
  mode: Mode,
  hasFacilityFilter: boolean,
  now: Date,
): Candidate[] {
  const priceUpdatedAt = approximateLastUpdateTime(now);
  const withScores = internal.map((ic) => {
    const tc = totalCost({
      priceStationWon: ic.price,
      refuelAmountL: vehicle.refuelAmountL,
      detourDistanceM: ic.detourDistanceM,
      efficiencyKmPerL: vehicle.efficiencyKmPerL,
    });
    const scores = computeScores({
      priceStationWon: ic.price,
      refuelAmountL: vehicle.refuelAmountL,
      detourDistanceM: ic.detourDistanceM,
      detourDurationS: ic.detourDurationS,
      efficiencyKmPerL: vehicle.efficiencyKmPerL,
      timeValuePerMin: vehicle.timeValuePerMin,
    });
    const netSavingWon =
      priceRefWon != null
        ? netSaving({
            priceRefWon,
            priceStationWon: ic.price,
            refuelAmountL: vehicle.refuelAmountL,
            detourDistanceM: ic.detourDistanceM,
            efficiencyKmPerL: vehicle.efficiencyKmPerL,
          })
        : 0;
    return { ic, totalCostWon: tc, scores, netSavingWon };
  });

  const byPrice = [...withScores].sort((a, b) => a.ic.price - b.ic.price);
  const priceRank = new Map<string, number>();
  byPrice.forEach((w, i) => priceRank.set(w.ic.station.id, i + 1));

  const sorted = [...withScores].sort((a, b) => {
    if (priceRefWon == null) return a.ic.price - b.ic.price;
    return scoreByMode(a.scores, mode) - scoreByMode(b.scores, mode);
  });

  return sorted.map((w, i) => {
    const rank = i + 1;
    const reason = buildReason({
      rank,
      tier: w.ic.tier,
      priceRefWon: priceRefWon ?? w.ic.price,
      priceStationWon: w.ic.price,
      priceRankAmongAll: priceRank.get(w.ic.station.id)!,
      totalCandidates: withScores.length,
      detourDistanceM: w.ic.detourDistanceM,
      detourDurationS: w.ic.detourDurationS,
      hasFacilityMatch: hasFacilityFilter,
      mode,
    });
    return {
      station: w.ic.station,
      price: w.ic.price,
      dPerp: w.ic.dPerp,
      tier: w.ic.tier,
      detour: { precise: w.ic.precise, distanceM: w.ic.detourDistanceM, durationS: w.ic.detourDurationS },
      netSaving: w.netSavingWon,
      totalCost: w.totalCostWon,
      scores: w.scores,
      reason,
      priceUpdatedAt,
    };
  });
}

function selectPreciseTargets(internal: InternalCandidate[], mode: Mode): InternalCandidate[] {
  const withScores = internal.map((ic) => ({
    ic,
    scores: computeScores({
      priceStationWon: ic.price,
      refuelAmountL: 0, // 선정에는 minDistance/minCost/balanced 상대 순위만 필요 — 절대값은 finalize에서 다시 계산
      detourDistanceM: ic.detourDistanceM,
      detourDurationS: ic.detourDurationS,
      efficiencyKmPerL: 1,
      timeValuePerMin: 0,
    }),
  }));

  const selected = new Set<string>();
  for (const m of MODES) {
    const top3 = [...withScores]
      .sort((a, b) => scoreByMode(a.scores, m) - scoreByMode(b.scores, m))
      .slice(0, 3);
    for (const w of top3) selected.add(w.ic.station.id);
  }

  const currentModeScore = new Map(withScores.map((w) => [w.ic.station.id, w.scores]));
  const chosen = internal.filter((ic) => selected.has(ic.station.id));
  chosen.sort((a, b) => {
    const sa = currentModeScore.get(a.station.id)!;
    const sb = currentModeScore.get(b.station.id)!;
    const byMode = scoreByMode(sa, mode) - scoreByMode(sb, mode);
    if (byMode !== 0) return byMode;
    const byBalanced = sa.balanced - sb.balanced;
    if (byBalanced !== 0) return byBalanced;
    return a.station.id.localeCompare(b.station.id);
  });
  return chosen.slice(0, MAX_PRECISE);
}

/** 오케스트레이터 본체. */
export async function search(
  input: SearchInput,
  onProgress?: OnProgress,
  deps: SearchDeps = {},
): Promise<SearchResult> {
  const redis: RedisLike = deps.redis ?? getRedis();
  const db = deps.db ?? getDb();
  const prefix = deps.prefix ?? env.REDIS_KEY_PREFIX;
  const now = deps.now ?? new Date();
  const budgetLimit = deps.budgetLimit ?? env.OPINET_DAILY_BUDGET;
  const expansionEnabled = deps.expansionEnabled ?? env.FEATURE_EXPANSION_ENABLED;
  const startedAt = now.getTime();

  // STEP0 — 예산 소진 감지(§5.3.2). SSE조차 열지 않고 즉시 안내해야 하므로 아무 것도 하지 않고 throw.
  if (!(await isOpinetBudgetAvailable(redis, prefix, budgetLimit, now))) {
    throw new QuotaExhaustedError();
  }

  const warnings: Warning[] = [];

  // STEP1 — 기본 경로
  onProgress?.({ type: "progress", step: "ROUTE" });
  const baseRoute = await getRoute({
    origin: input.origin,
    destination: input.destination,
    fuel: input.vehicle.fuel,
    redis,
    prefix,
  });
  onProgress?.({ type: "base_route", data: baseRoute });

  if (baseRoute.distanceM < MIN_ROUTE_DISTANCE) {
    const warning: Warning = { code: "SHORT_ROUTE", message: "경로가 짧아 절감 효과가 크지 않을 수 있습니다." };
    warnings.push(warning);
    onProgress?.({ type: "warning", data: warning });
  }

  // STEP2 — 샘플링
  onProgress?.({ type: "progress", step: "COLLECT" });
  const samples = samplePolyline(baseRoute.polyline);
  const projectedPolyline = baseRoute.polyline.map(wgs84ToProjected);

  const filters = {
    facilities: input.filters.facilities,
    brands: input.filters.brands,
    kpetroOnly: input.filters.kpetroOnly,
  };

  // STEP3 — 기본 수집
  const baseCollected = await collectStations({
    points: samples,
    fuel: input.vehicle.fuel,
    filters,
    retries: 1,
    redis,
    prefix,
    now,
    budgetLimit,
  });
  for (const w of baseCollected.warnings) {
    warnings.push(w);
    onProgress?.({ type: "warning", data: w });
  }

  // STEP4 — d_perp · tier 분류 (T3_MAX 초과는 A13으로 제외됨)
  let internal = toInternalCandidates(baseCollected.stations, projectedPolyline);
  const seenIds = new Set(internal.map((ic) => ic.station.id));

  let t1Count = internal.filter((ic) => ic.tier === "T1").length;
  let t2Count = internal.filter((ic) => ic.tier === "T2").length;

  // STEP5 — 확장 게이트
  let expansionTriggered = false;
  let skippedReason: "QUOTA" | "DISABLED" | undefined;

  if (!needsExpansion(t1Count, t2Count, MIN_CANDIDATES)) {
    // 확장 불필요 — 그대로 STEP7
  } else if (!expansionEnabled) {
    skippedReason = "DISABLED";
  } else if (!(await isOpinetBudgetAvailable(redis, prefix, budgetLimit, now))) {
    skippedReason = "QUOTA";
    const warning: Warning = { code: "QUOTA_EXCEEDED", message: "오피넷 일일 예산이 소진돼 확장 수집을 건너뛰었습니다." };
    warnings.push(warning);
    onProgress?.({ type: "warning", data: warning });
  } else {
    // STEP6 — 확장 수집
    expansionTriggered = true;
    onProgress?.({ type: "progress", step: "EXPAND", radiusM: T3_MAX });

    const offsetPoints = [
      ...normalOffsets(projectedPolyline, OFFSET),
      ...normalOffsets(projectedPolyline, -OFFSET),
    ];
    const expanded = await collectStations({
      points: offsetPoints,
      fuel: input.vehicle.fuel,
      filters,
      retries: 0,
      redis,
      prefix,
      now,
      budgetLimit,
    });
    for (const w of expanded.warnings) {
      warnings.push(w);
      onProgress?.({ type: "warning", data: w });
    }

    const newStations = expanded.stations.filter((s) => !seenIds.has(s.station.id));
    const newInternal = toInternalCandidates(newStations, projectedPolyline);
    for (const ic of newInternal) seenIds.add(ic.station.id);
    internal = [...internal, ...newInternal];
    t1Count = internal.filter((ic) => ic.tier === "T1").length;
    t2Count = internal.filter((ic) => ic.tier === "T2").length;
  }

  // STEP7 — P_ref
  const t1t2 = internal.filter((ic) => ic.tier === "T1" || ic.tier === "T2");
  const priceResult = await computeReferencePrice({
    t1t2Prices: t1t2.map((ic) => ic.price),
    pool: internal.map((ic) => ({ sigunCd: ic.station.sigunCd })),
    fuel: input.vehicle.fuel,
    db,
  });

  let referencePrice: number | null = null;
  let refPriceSource: RefPriceSource | null = null;
  if (priceResult) {
    referencePrice = priceResult.price;
    refPriceSource = priceResult.source;
  } else {
    const warning: Warning = {
      code: "NO_REFERENCE_PRICE",
      message: "기준가를 계산할 수 없어 절감액 대신 가격순으로 정렬합니다.",
    };
    warnings.push(warning);
    onProgress?.({ type: "warning", data: warning });
    // T3는 순절감액 게이트를 판정할 수 없으므로 제외합니다.
    internal = internal.filter((ic) => ic.tier !== "T3");
  }

  // STEP8 — T3 게이트 (referencePrice가 있을 때만 의미가 있음)
  if (referencePrice != null) {
    internal = internal.filter((ic) => {
      if (ic.tier !== "T3") return true;
      return passesT3Gate({
        priceRefWon: referencePrice!,
        priceStationWon: ic.price,
        refuelAmountL: input.vehicle.refuelAmountL,
        dPerpM: ic.dPerp,
        efficiencyKmPerL: input.vehicle.efficiencyKmPerL,
      });
    });
  }

  const hasFacilityFilter = filters.facilities.length > 0;

  function computeFinalRadiusM(list: InternalCandidate[]): number {
    const t3 = list.filter((ic) => ic.tier === "T3");
    if (t3.length === 0) return T2_MAX;
    return Math.max(...t3.map((ic) => ic.dPerp));
  }

  // STEP9 — 1차 스코어링(추정치) + partial 이벤트
  const partialCandidates = finalizeCandidates(
    internal,
    referencePrice,
    input.vehicle,
    input.mode,
    hasFacilityFilter,
    now,
  );
  onProgress?.({
    type: "partial",
    data: {
      candidates: partialCandidates,
      referencePrice,
      refPriceSource,
      expansion: { triggered: expansionTriggered, finalRadiusM: computeFinalRadiusM(internal), skippedReason },
    },
  });

  // STEP10 — 정밀 계산
  onProgress?.({ type: "progress", step: "PRECISE" });
  const preciseTargets = selectPreciseTargets(internal, input.mode);
  const preciseIds = new Set(preciseTargets.map((ic) => ic.station.id));

  const preciseResults = await Promise.allSettled(
    preciseTargets.map((ic) =>
      getRoute({
        origin: input.origin,
        destination: input.destination,
        waypoint: ic.station.location,
        fuel: input.vehicle.fuel,
        retries: 0,
        redis,
        prefix,
      }),
    ),
  );

  internal = internal.map((ic) => {
    if (!preciseIds.has(ic.station.id)) return ic;
    const idx = preciseTargets.findIndex((t) => t.station.id === ic.station.id);
    const result = preciseResults[idx];
    if (result.status !== "fulfilled") return ic; // A8 — 추정치 유지
    const preciseRoute = result.value;
    return {
      ...ic,
      detourDistanceM: Math.max(0, preciseRoute.distanceM - baseRoute.distanceM),
      detourDurationS: Math.max(0, preciseRoute.durationS - baseRoute.durationS),
      precise: true,
    };
  });

  // STEP11 — 최종 정리
  internal = internal.filter((ic) => !exceedsDetourCap(ic.detourDistanceM, baseRoute.distanceM)); // A6

  const finalRadiusM = computeFinalRadiusM(internal);
  let finalCandidates = finalizeCandidates(
    internal,
    referencePrice,
    input.vehicle,
    input.mode,
    hasFacilityFilter,
    now,
  );
  finalCandidates = finalCandidates.slice(0, MAX_RESULTS);

  const result: SearchResult = {
    searchId: crypto.randomUUID(),
    baseRoute,
    candidates: finalCandidates,
    referencePrice,
    refPriceSource,
    expansion: { triggered: expansionTriggered, finalRadiusM, skippedReason },
    warnings,
  };

  void logSearch(result, { durationMs: now.getTime() - startedAt }).catch(() => {});

  return result;
}
