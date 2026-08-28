/**
 * Phase 5 측정 스크립트(coverage·t3-rate·uturn) 공용 유틸.
 *
 * 이 스크립트들은 실제 오피넷·카카오를 호출합니다.
 * README.md 지침: "실행 전 예상 호출 수를 출력하고 확인을 받는다."
 * → 이 파일의 confirmBudget()이 그 확인 절차입니다. --yes 없이는 계획만 출력하고 종료합니다.
 */

import { header, info, warn } from "../_shared";
import { fetchRadius } from "@/infra/opinet/client";
import { mapRadiusItem } from "@/infra/opinet/mapper";
import type { Fuel, KatecPoint } from "@/domain/types";

export const ALL_FUELS: Fuel[] = ["GASOLINE", "DIESEL", "LPG"];

/** dev 예산 기본값(README.md) — 이 자체가 상한선은 아니고 경고 기준선입니다 */
const DEV_BUDGET_HINT = 100;

function argv(): string[] {
  return process.argv.slice(2);
}

export function parseYesFlag(): boolean {
  return argv().includes("--yes") || argv().includes("-y");
}

/** --fuel=LPG | --fuel=all. 기본값은 LPG (1순위 타깃, PRODUCT.md §1.5) */
export function parseFuelArg(): Fuel[] {
  const arg = argv().find((a) => a.startsWith("--fuel="));
  if (!arg) return ["LPG"];
  const value = arg.split("=")[1]?.toUpperCase();
  if (value === "ALL") return ALL_FUELS;
  if (value && (ALL_FUELS as string[]).includes(value)) return [value as Fuel];
  throw new Error(`알 수 없는 --fuel 값: ${arg}. LPG|GASOLINE|DIESEL|all 중 하나를 쓰십시오.`);
}

/** --route=0,2 | --route=all. 기본값은 all (ROUTES 배열 전체) */
export function parseRouteIndexArg(routeCount: number): number[] {
  const arg = argv().find((a) => a.startsWith("--route="));
  if (!arg) return Array.from({ length: routeCount }, (_, i) => i);
  const value = arg.split("=")[1];
  if (value === "all") return Array.from({ length: routeCount }, (_, i) => i);
  return value.split(",").map((v) => Number(v.trim()));
}

/**
 * 예상 호출 수를 출력하고, --yes 플래그 없이는 실제 호출 없이 종료합니다.
 */
export function confirmBudget(opts: { planLines: string[]; opinetCalls: number; kakaoCalls: number }): void {
  header("예상 API 호출량");
  opts.planLines.forEach((l) => info(l));
  info(`오피넷 반경검색 합계: 약 ${opts.opinetCalls}회`);
  info(`카카오 길찾기 합계: 약 ${opts.kakaoCalls}회 (일 10,000건 — 사실상 제약 없음)`);

  if (opts.opinetCalls > DEV_BUDGET_HINT) {
    warn(`오피넷 예상 호출(${opts.opinetCalls}회)이 dev 예산 기준선(${DEV_BUDGET_HINT}회)을 초과합니다.`);
    warn("OPINET_DAILY_BUDGET 여유를 확인한 뒤 진행하십시오.");
  }

  if (!parseYesFlag()) {
    warn("실제 호출 없이 계획만 출력했습니다. 실행하려면 명령 끝에 --yes를 붙이십시오.");
    process.exit(0);
  }
}

export function estimateSampleCount(distanceM: number, intervalM: number): number {
  return Math.ceil(distanceM / intervalM) + 1;
}

/** 오피넷 반경검색 → 도메인 중간 구조체(MappedRadiusStation) 배열 */
export async function fetchStationsAtKatecPoint(center: KatecPoint, fuel: Fuel) {
  const items = await fetchRadius({ center, fuel });
  return items.map(mapRadiusItem);
}
