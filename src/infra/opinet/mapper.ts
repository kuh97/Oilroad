/**
 * 오피넷 원본 필드 → 도메인 타입 변환.
 * UNI_ID·OS_NM 등 원본 필드명이 이 파일 밖으로 나가면 안 됩니다.
 * ARCHITECTURE.md §3.3
 */

import { katecToWgs84 } from "@/domain/geo";
import { katec } from "@/domain/types";
import type { RefuelPoint, KatecPoint, WGS84Point, Fuel, EnergyType } from "@/domain/types";
import type { OpinetRadiusItem, OpinetDetailItem } from "./schema";

// ─── 연료 코드 매핑 ───────────────────────────────────────────────────────────

/** 오피넷 prodcd → Fuel */
export const PRODCD_TO_FUEL: Record<string, Fuel> = {
  B027: "GASOLINE",
  D047: "DIESEL",
  K015: "LPG",
} as const;

/** Fuel → 오피넷 prodcd */
export const FUEL_TO_PRODCD: Record<Fuel, string> = {
  GASOLINE: "B027",
  DIESEL: "D047",
  LPG: "K015",
} as const;

// ─── 반경검색 결과 ────────────────────────────────────────────────────────────

/** 반경검색 API 결과를 도메인 타입으로 변환한 중간 구조체 */
export interface MappedRadiusStation {
  id: string;
  name: string;
  brandCode: string;
  priceWon: number;
  distanceM: number;
  location: WGS84Point;
  katecLocation: KatecPoint;
}

/**
 * 반경검색 API 항목 → 도메인 중간 구조체.
 * GIS_X_COOR(KATEC easting) / GIS_Y_COOR(KATEC northing) →
 * katecToWgs84 → WGS84(lat, lng)
 *
 * ★ X↔Y를 뒤집으면 전국 좌표가 틀립니다 — ARCHITECTURE.md §5.1
 */
export function mapRadiusItem(item: OpinetRadiusItem): MappedRadiusStation {
  const katecPt = katec(item.GIS_X_COOR, item.GIS_Y_COOR);
  return {
    id: item.UNI_ID,
    name: item.OS_NM,
    brandCode: item.POLL_DIV_CD,
    priceWon: item.PRICE,
    distanceM: item.DISTANCE,
    katecLocation: katecPt,
    location: katecToWgs84(katecPt),
  };
}

// ─── 상세정보 (Fallback C) ────────────────────────────────────────────────────

/**
 * LPG_YN → EnergyType.
 * Y=LPG 전용, C=겸업(주유+LPG 모두 취급), N/미상=일반 주유소.
 * CSV 실측(2026-09-04자) 대조 결과 Y는 겸업이 아니라 LPG 전용이었음 —
 * energy_type='BOTH'인 328건 중 주유소 CSV에 있는 건 0건, 충전소 CSV에 251건.
 * docs/MIGRATION-DB.md §13.1.
 */
function resolveEnergyType(lpgYn: "Y" | "N" | "C" | undefined): EnergyType {
  if (lpgYn === "Y") return "LPG";
  if (lpgYn === "C") return "BOTH";
  return "OIL";
}

/**
 * 상세정보 API 항목 → RefuelPoint.
 * Fallback C에서 UNI_ID를 DB에서 찾지 못할 때 사용합니다.
 */
export function mapDetailItem(item: OpinetDetailItem): RefuelPoint {
  const katecPt = katec(item.GIS_X_COOR, item.GIS_Y_COOR);
  return {
    id: item.UNI_ID,
    name: item.OS_NM,
    brandCode: item.POLL_DIV_CO,
    energyType: resolveEnergyType(item.LPG_YN),
    location: katecToWgs84(katecPt),
    katecLocation: katecPt,
    addressRoad: item.NEW_ADR ?? undefined,
    addressJibun: item.VAN_ADR ?? undefined,
    tel: item.TEL ?? undefined,
    sigunCd: item.SIGUNCD ?? undefined,
    facilities: {
      carWash: item.CAR_WASH_YN === "Y",
      maintenance: item.MAINT_YN === "Y",
      cvs: item.CVS_YN === "Y",
    },
    isKpetro: item.KPETRO_YN === "Y",
  };
}
