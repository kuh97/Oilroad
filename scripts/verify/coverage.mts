/**
 * verify:coverage — 샘플링 커버리지 · T2 후보 누락률 [§12 ⑫]
 *
 * 현재 SAMPLE_INTERVAL(params.ts)로 반경검색을 돌렸을 때,
 * 훨씬 촘촘한 간격(DENSE_INTERVAL_M)으로 잡아내는 T1·T2 후보를
 * 얼마나 놓치는지 측정합니다. 촘촘 샘플을 "정답"으로 취급합니다.
 *
 * 결정할 것: SAMPLE_INTERVAL·OFFSET·T2_MAX·T3_MAX (ARCHITECTURE.md §10 Phase 5)
 *
 * 실행: pnpm verify:coverage [--route=0,1,2,3|all] [--yes]
 * 기본 --route: 전체 노선(_routes.ts 참고). --yes 없으면 계획만 출력하고 종료합니다.
 */

import { header, info, ok, warn, summary, requireEnv } from "../_shared";
import { ROUTES } from "./_routes";
import { confirmBudget, estimateSampleCount, fetchStationsAtKatecPoint, parseRouteIndexArg } from "./_measure-shared";
import { fetchDirections } from "@/infra/kakao/mobility";
import { samplePolyline, wgs84ToKatec, wgs84ToProjected, projectedToWgs84, pointToPolylineDistanceM } from "@/domain/geo";
import { classifyTier } from "@/domain/tier";
import { SAMPLE_INTERVAL } from "@/domain/params";
import type { ProjectedPoint } from "@/domain/types";

requireEnv(["OPINET_CERT_KEY", "KAKAO_REST_API_KEY"]);

const DENSE_INTERVAL_M = 2_000; // "정답"으로 취급할 촘촘한 간격
const FUEL = "LPG" as const; // 1순위 타깃 (PRODUCT.md §1.5)

const routeIndexes = parseRouteIndexArg(ROUTES.length);

// ─── 1. 호출 계획 산출 (아직 네트워크 호출 없음) ────────────────────────────

header("verify:coverage — 계획");
info(`대상 노선: ${routeIndexes.map((i) => ROUTES[i].label).join(", ")}`);
info(`촘촘 간격 ${DENSE_INTERVAL_M}m vs 현재 SAMPLE_INTERVAL ${SAMPLE_INTERVAL}m`);
info("정확한 호출 수는 실제 경로 거리를 알아야 계산되므로, 기본 경로(카카오) 조회 후 추정합니다.");

// 대략적 사전 추정 — 각 노선 평균 100km 가정
const roughEstimatePerRoute = estimateSampleCount(100_000, DENSE_INTERVAL_M) + estimateSampleCount(100_000, SAMPLE_INTERVAL);
confirmBudget({
  planLines: [`노선당 약 ${roughEstimatePerRoute}회 (거리 100km 가정 — 실제로는 노선마다 다름)`],
  opinetCalls: roughEstimatePerRoute * routeIndexes.length,
  kakaoCalls: routeIndexes.length,
});

// ─── 2. 측정 실행 ────────────────────────────────────────────────────────────

interface StationRow {
  id: string;
  dPerpM: number;
  tier: "T1" | "T2" | "T3" | null;
}

function toRows(
  stations: Awaited<ReturnType<typeof fetchStationsAtKatecPoint>>,
  routeProjected: ProjectedPoint[],
): Map<string, StationRow> {
  const rows = new Map<string, StationRow>();
  for (const st of stations) {
    if (rows.has(st.id)) continue;
    const projected = wgs84ToProjected(st.location);
    const dPerpM = pointToPolylineDistanceM(projected, routeProjected);
    rows.set(st.id, { id: st.id, dPerpM, tier: classifyTier(dPerpM) });
  }
  return rows;
}

async function collect(samples: ProjectedPoint[], fuel: typeof FUEL) {
  const merged: Awaited<ReturnType<typeof fetchStationsAtKatecPoint>> = [];
  for (const s of samples) {
    const wgs = projectedToWgs84(s);
    const katec = wgs84ToKatec(wgs);
    const stations = await fetchStationsAtKatecPoint(katec, fuel);
    merged.push(...stations);
  }
  return merged;
}

const passed: string[] = [];
const failed: string[] = [];

for (const idx of routeIndexes) {
  const route = ROUTES[idx];
  header(`[${idx}] ${route.label}`);
  info(route.note);

  const baseRoute = await fetchDirections({ origin: route.origin, destination: route.destination, fuel: FUEL, retries: 1 });
  info(`실측 거리 ${(baseRoute.distanceM / 1000).toFixed(1)}km`);

  const routeProjected = baseRoute.polyline.map(wgs84ToProjected);
  const denseSamples = samplePolyline(baseRoute.polyline, DENSE_INTERVAL_M);
  const prodSamples = samplePolyline(baseRoute.polyline, SAMPLE_INTERVAL);
  info(`샘플 지점 — 촘촘 ${denseSamples.length}개 / 현재(SAMPLE_INTERVAL) ${prodSamples.length}개`);

  const [denseStations, prodStations] = await Promise.all([
    collect(denseSamples, FUEL),
    collect(prodSamples, FUEL),
  ]);

  const denseRows = toRows(denseStations, routeProjected);
  const prodRows = toRows(prodStations, routeProjected);

  const denseT1T2 = [...denseRows.values()].filter((r) => r.tier === "T1" || r.tier === "T2");
  const missing = denseT1T2.filter((r) => !prodRows.has(r.id));
  const missRate = denseT1T2.length === 0 ? 0 : missing.length / denseT1T2.length;

  info(`촘촘 샘플 T1+T2 후보: ${denseT1T2.length}곳 / 현재 간격에서 발견: ${denseT1T2.length - missing.length}곳`);

  const label = `${route.label} — T2 후보 누락률`;
  if (denseT1T2.length === 0) {
    warn(`${route.label}: T1+T2 후보 자체가 없습니다 (저밀도 구간 — 정상일 수 있음)`);
    passed.push(label);
  } else if (missRate <= 0.1) {
    ok(`${route.label}: 누락률 ${(missRate * 100).toFixed(1)}% — SAMPLE_INTERVAL(${SAMPLE_INTERVAL}m) 유지 가능`);
    passed.push(label);
  } else {
    warn(`${route.label}: 누락률 ${(missRate * 100).toFixed(1)}% — SAMPLE_INTERVAL을 줄이는 것을 검토하십시오`);
    failed.push(label);
  }
}

const allPassed = summary(passed, failed);
console.log("\n── 다음 단계 ──────────────────────────────────────────");
if (allPassed) {
  info("SAMPLE_INTERVAL을 그대로 params.ts에 유지하십시오.");
} else {
  warn("누락률이 높은 노선이 있습니다. SAMPLE_INTERVAL을 줄이거나 OFFSET 재검토가 필요합니다.");
  warn("params.ts 값을 바꾸기 전에 PRODUCT.md §9.1을 먼저 갱신하십시오 (AGENTS.md §7.2).");
}
process.exit(allPassed ? 0 : 1);
