/**
 * verify:t3-rate — T3 발동률 · 게이트 통과율, MIN_CANDIDATES 확정
 *
 * 노선 × 연료 조합별로 STEP 1~9(경유 정밀계산 제외) 상당을 실행해
 * T1/T2/T3 분류, 확장 발동 여부, T3 게이트 통과 결과를 집계합니다.
 *
 * ★ LPG T3 발동률이 20% 미만이면 개발을 멈추고 기획 재검토 대상입니다
 *   (PRODUCT.md §11.3, ARCHITECTURE.md §10 Phase 5 완료 기준).
 *
 * P_ref는 T1+T2 중앙값만 씁니다. 시군구 평균가(SIGUNGU_AVG) 폴백은
 * Phase 6(DB)에서 만들어지므로 아직 쓸 수 없습니다 — T1+T2 <
 * P_REF_MIN_BASE인 조합은 "P_ref 없음"으로 정직하게 보고합니다.
 *
 * 실행: pnpm verify:t3-rate [--route=0,1,2,3|all] [--fuel=LPG|GASOLINE|DIESEL|all] [--yes]
 * 기본: 노선 전체 × LPG만 (1순위 타깃, 가장 저렴한 조합).
 */

import { header, info, ok, warn, fail, requireEnv } from "../_shared";
import { ROUTES } from "./_routes";
import { confirmBudget, estimateSampleCount, fetchStationsAtKatecPoint, parseFuelArg, parseRouteIndexArg } from "./_measure-shared";
import { fetchDirections } from "@/infra/kakao/mobility";
import {
  samplePolyline,
  normalOffsets,
  wgs84ToKatec,
  wgs84ToProjected,
  projectedToWgs84,
  pointToPolylineDistanceM,
} from "@/domain/geo";
import { classifyTier, needsExpansion } from "@/domain/tier";
import { computeReferencePrice, passesT3Gate } from "@/domain/pricing";
import { SAMPLE_INTERVAL, OFFSET, MIN_CANDIDATES, DEFAULT_EFFICIENCY, DEFAULT_REFUEL_AMOUNT } from "@/domain/params";
import type { Fuel, ProjectedPoint, Tier } from "@/domain/types";
import type { MappedRadiusStation } from "@/infra/opinet/mapper";

requireEnv(["OPINET_CERT_KEY", "KAKAO_REST_API_KEY"]);

const routeIndexes = parseRouteIndexArg(ROUTES.length);
const fuels = parseFuelArg();

header("verify:t3-rate — 계획");
info(`대상: ${routeIndexes.map((i) => ROUTES[i].label).join(", ")} × ${fuels.join(", ")}`);

// 사전 추정 (거리 100km 가정) — 기본 수집 + 확장(양쪽) 최악치
const roughSamples = estimateSampleCount(100_000, SAMPLE_INTERVAL);
const roughWorstCasePerCombo = roughSamples + roughSamples * 2;
const combos = routeIndexes.length * fuels.length;
confirmBudget({
  planLines: [
    `조합 수: ${combos}개 (노선 ${routeIndexes.length} × 연료 ${fuels.length})`,
    `조합당 최대 약 ${roughWorstCasePerCombo}회 (거리 100km 가정, 확장 발동 시)`,
  ],
  opinetCalls: combos * roughWorstCasePerCombo,
  kakaoCalls: combos,
});

interface Classified {
  id: string;
  priceWon: number;
  dPerpM: number;
  tier: Tier | null;
}

function classify(stations: MappedRadiusStation[], routeProjected: ProjectedPoint[]): Map<string, Classified> {
  const map = new Map<string, Classified>();
  for (const st of stations) {
    if (map.has(st.id)) continue;
    const dPerpM = pointToPolylineDistanceM(wgs84ToProjected(st.location), routeProjected);
    map.set(st.id, { id: st.id, priceWon: st.priceWon, dPerpM, tier: classifyTier(dPerpM) });
  }
  return map;
}

async function collectAt(points: ProjectedPoint[], fuel: Fuel): Promise<MappedRadiusStation[]> {
  const out: MappedRadiusStation[] = [];
  for (const p of points) {
    const stations = await fetchStationsAtKatecPoint(wgs84ToKatec(projectedToWgs84(p)), fuel);
    out.push(...stations);
  }
  return out;
}

interface RunResult {
  route: string;
  fuel: Fuel;
  expansionTriggered: boolean;
  t1: number;
  t2: number;
  t3Candidates: number;
  t3AfterGate: number;
  refPrice: number | "없음";
}

const results: RunResult[] = [];

for (const idx of routeIndexes) {
  const route = ROUTES[idx];
  for (const fuel of fuels) {
    header(`[${idx}] ${route.label} × ${fuel}`);

    const baseRoute = await fetchDirections({ origin: route.origin, destination: route.destination, fuel, retries: 1 });
    const routeProjected = baseRoute.polyline.map(wgs84ToProjected);
    const prodSamples = samplePolyline(baseRoute.polyline, SAMPLE_INTERVAL);
    info(`실측 거리 ${(baseRoute.distanceM / 1000).toFixed(1)}km, 샘플 ${prodSamples.length}개`);

    const stations = classify(await collectAt(prodSamples, fuel), routeProjected);
    let t1 = [...stations.values()].filter((s) => s.tier === "T1").length;
    let t2 = [...stations.values()].filter((s) => s.tier === "T2").length;

    let expansionTriggered = false;
    if (needsExpansion(t1, t2, MIN_CANDIDATES)) {
      expansionTriggered = true;
      info(`T1+T2=${t1 + t2} < MIN_CANDIDATES(${MIN_CANDIDATES}) → 확장 수집`);
      const offsetPoints = [...normalOffsets(prodSamples, OFFSET), ...normalOffsets(prodSamples, -OFFSET)];
      const expanded = classify(await collectAt(offsetPoints, fuel), routeProjected);
      for (const [id, row] of expanded) {
        if (!stations.has(id)) stations.set(id, row);
      }
      t1 = [...stations.values()].filter((s) => s.tier === "T1").length;
      t2 = [...stations.values()].filter((s) => s.tier === "T2").length;
    }

    const t1t2Prices = [...stations.values()].filter((s) => s.tier === "T1" || s.tier === "T2").map((s) => s.priceWon);
    const refResult = computeReferencePrice(t1t2Prices); // sigunguAvg 없음 — Phase 6 이전
    const t3Candidates = [...stations.values()].filter((s) => s.tier === "T3");

    let t3AfterGate = 0;
    if (refResult) {
      const efficiency = DEFAULT_EFFICIENCY[fuel];
      for (const c of t3Candidates) {
        const passes = passesT3Gate({
          priceRefWon: refResult.price,
          priceStationWon: c.priceWon,
          refuelAmountL: DEFAULT_REFUEL_AMOUNT,
          dPerpM: c.dPerpM,
          efficiencyKmPerL: efficiency,
        });
        if (passes) t3AfterGate++;
      }
    } else {
      warn("T1+T2 < P_REF_MIN_BASE, 시군구 폴백 없음(Phase 6 이전) → P_ref 산출 불가, T3 게이트 판정 불가");
    }

    info(`T1=${t1} T2=${t2} T3후보=${t3Candidates.length} T3(게이트 통과)=${t3AfterGate} P_ref=${refResult?.price ?? "없음"}`);
    results.push({
      route: route.label,
      fuel,
      expansionTriggered,
      t1,
      t2,
      t3Candidates: t3Candidates.length,
      t3AfterGate,
      refPrice: refResult?.price ?? "없음",
    });
  }
}

// ─── 집계 ────────────────────────────────────────────────────────────────────
header("집계");
console.table(results);

const lpgResults = results.filter((r) => r.fuel === "LPG");
if (lpgResults.length > 0) {
  const triggeredCount = lpgResults.filter((r) => r.t3AfterGate > 0).length;
  const triggerRate = triggeredCount / lpgResults.length;
  info(`LPG T3 발동률: ${(triggerRate * 100).toFixed(0)}% (${triggeredCount}/${lpgResults.length})`);

  if (triggerRate < 0.2) {
    fail("LPG T3 발동률이 20% 미만입니다 — PRODUCT.md §11.3에 따라 개발을 멈추고 기획을 재검토해야 합니다.");
    process.exit(1);
  }
  ok("LPG T3 발동률이 20% 이상입니다. 이 결과를 근거로 MIN_CANDIDATES 등을 확정하십시오.");
} else {
  warn("LPG 조합이 선택되지 않아 발동률 게이트를 평가할 수 없습니다. --fuel=LPG 또는 --fuel=all로 다시 실행하십시오.");
}

console.log("\n── 다음 단계 ──────────────────────────────────────────");
info("확정된 파라미터는 params.ts에 반영하고 PRODUCT.md §9.1을 같은 커밋에서 갱신하십시오 (AGENTS.md §7.2).");
process.exit(0);
