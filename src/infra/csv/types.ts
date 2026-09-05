/**
 * 오피넷 유가 CSV(과거 판매가격) 도메인 타입.
 * docs/MIGRATION-DB.md §3 — 원본 CSV는 EUC-KR, 헤더 컬럼명이 이 파일 밖으로
 * 나가지 않도록 parse.ts가 이 타입으로 변환합니다 (opinet/mapper.ts와 같은 원칙).
 */

import type { EnergyType } from "@/domain/types";

/** 주유소 CSV(과거_판매가격(주유소)) 1행 — 헤더: 번호,지역,상호,주소,기간,상표,셀프여부,고급휘발유,휘발유,경유,실내등유 */
export interface RawOilRow {
  uniId: string;
  region: string;      // "강원 강릉시" — 오피넷 SIGUNNM과 동일 형식 (§3.3)
  name: string;
  address: string;
  brandLabel: string;  // CSV 상표 텍스트 (POLL_DIV_CD 아님 — mapBrandLabel로 변환)
  isSelf: boolean;
  pricePremium: number | null;  // 고급휘발유 (B034)
  priceGasoline: number | null; // 휘발유 (B027)
  priceDiesel: number | null;   // 경유 (D047)
  priceKerosene: number | null; // 실내등유 (C004)
}

/** 충전소 CSV(과거_판매가격(충전소)) 1행 — 헤더: 번호,지역,상호,주소,기간,상표,셀프여부,LPG */
export interface RawLpgRow {
  uniId: string;
  region: string;
  name: string;
  address: string;
  brandLabel: string;
  isSelf: boolean;
  priceLpg: number | null; // K015
}

/** 주유소·충전소 CSV를 UNI_ID 기준으로 병합한 행 — bulkUpsertFromCsv 입력. */
export interface MergedCsvRow {
  uniId: string;
  name: string;
  address: string;
  sigunCd: string | null;   // region → SIGUNCD 매핑 실패 시 null (§3.3)
  brandCode: string;
  isSelf: boolean;
  energyType: EnergyType;   // 오일 CSV만 있으면 OIL, LPG CSV만 있으면 LPG, 둘 다면 BOTH
  priceGasoline: number | null;
  priceDiesel: number | null;
  priceLpg: number | null;
  pricePremium: number | null;
  priceKerosene: number | null;
  pricedOn: string;   // ISO "YYYY-MM-DD" — CSV 기준일자
  lastSeenOn: string; // 이번 임포트에서는 pricedOn과 동일
}
