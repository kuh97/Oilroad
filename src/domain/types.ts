/**
 * 도메인 핵심 타입 — 좌표 3종은 서로 대입 불가한 브랜드 타입
 * AGENTS.md §7.3: 좌표계 혼동이 이 프로젝트의 1순위 버그 원천
 */

// ─── 좌표 브랜드 타입 (§7.3) ─────────────────────────────────────────────────

/** WGS84 십진수 위경도 — 카카오 API 입출력, Neon DB 저장 */
export type WGS84Point = {
  readonly _brand: "WGS84";
  lat: number;  // 위도 (°)
  lng: number;  // 경도 (°)
};

/** 오피넷 KATEC(TM128) 투영좌표 — 오피넷 반경검색 입력 */
export type KatecPoint = {
  readonly _brand: "Katec";
  x: number;  // m
  y: number;  // m
};

/** EPSG:5179 투영좌표 — 거리 계산 전용 */
export type ProjectedPoint = {
  readonly _brand: "Projected";
  x: number;  // m
  y: number;  // m
};

export function wgs84(lat: number, lng: number): WGS84Point {
  return { _brand: "WGS84", lat, lng };
}
export function katec(x: number, y: number): KatecPoint {
  return { _brand: "Katec", x, y };
}
export function projected(x: number, y: number): ProjectedPoint {
  return { _brand: "Projected", x, y };
}

// ─── 연료 · 티어 (§6.3) ──────────────────────────────────────────────────────

export type Fuel = "GASOLINE" | "DIESEL" | "LPG";
export type Tier = "T1" | "T2" | "T3";
export type Facility = "CAR_WASH" | "MAINTENANCE" | "CVS";
export type Mode = "balanced" | "minCost" | "minDistance";
export type RefPriceSource = "MEDIAN_T1T2" | "SIGUNGU_AVG";

// ─── 주유소 마스터 (§7.1) ────────────────────────────────────────────────────

export type EnergyType = "OIL" | "LPG" | "BOTH";
export type BrandCode = string;  // POLL_DIV_CD

export interface RefuelPoint {
  id: string;               // 오피넷 UNI_ID
  name: string;
  brandCode: BrandCode;
  energyType: EnergyType;
  location: WGS84Point;
  katecLocation?: KatecPoint;
  addressRoad?: string;
  addressJibun?: string;
  tel?: string;
  sigunCd?: string;
  facilities: {
    carWash: boolean;
    maintenance: boolean;
    cvs: boolean;
  };
  isKpetro: boolean;
}

// ─── 후보 (검색 결과 계산 중간) ──────────────────────────────────────────────

export interface Candidate {
  station: RefuelPoint;
  price: number;           // 원/L (정수)
  dPerp: number;           // m — 경로 폴리라인 최단거리
  tier: Tier;
  detour: DetourInfo;
  netSaving: number;       // 원 (정수, 음수 가능)
  totalCost: number;       // 원 (정수)
  scores: Scores;
  reason: string;          // domain/reason.ts 생성 문구
  priceUpdatedAt?: Date;   // 오피넷 갱신 스케줄 기반 근사
}

export interface DetourInfo {
  precise: boolean;
  distanceM: number;  // ΔD (m, 정수, ≥0 clamp 후)
  durationS: number;  // ΔT (s, 정수, ≥0 clamp 후)
}

export interface Scores {
  minCost: number;       // 순위 점수
  minDistance: number;   // 순위 점수
  balanced: number;      // 순위 점수 (시간 가치 포함)
}

// ─── 검색 결과 ───────────────────────────────────────────────────────────────

export interface BaseRoute {
  distanceM: number;   // D_base (m)
  durationS: number;   // T_base (s)
  polyline: WGS84Point[];
}

export interface SearchResult {
  baseRoute: BaseRoute;
  candidates: Candidate[];
  referencePrice: number;
  refPriceSource: RefPriceSource;
  expansionTriggered: boolean;
  finalRadiusM: number;  // 최종 T3 최대 d_perp (없으면 T2_MAX)
  warnings: string[];
}

// ─── 입력 ────────────────────────────────────────────────────────────────────

export interface Vehicle {
  fuel: Fuel;
  efficiencyKmPerL: number;  // km/L
  refuelAmountL: number;     // L
  timeValuePerMin: number;   // 원/분
}

export interface SearchInput {
  origin: WGS84Point;
  destination: WGS84Point;
  vehicle: Vehicle;
  filters: {
    facilities: Facility[];
    brands: BrandCode[];
  };
  mode: Mode;
}
