/**
 * 카카오 로컬 — 키워드 장소 검색 (F1 자동완성).
 * 타임아웃·재시도 — ARCHITECTURE.md §5.4 (timeout 3s, retry 1회)
 */

import { env } from "@/infra/env";
import {
  KakaoLocalSearchResponseSchema,
  KakaoCoord2AddressResponseSchema,
  KakaoAddressSearchResponseSchema,
} from "./schema";
import { mapPlaceDocument, mapCoord2AddressDocument, mapAddressSearchDocument } from "./mapper";
import { fetchWithRetry } from "./http";
import type { PlaceResult, WGS84Point } from "@/domain/types";

const TIMEOUT_MS = 3_000;

export interface FetchPlacesOptions {
  query: string;
  /** 근접 정렬 기준점. 없으면 정확도순(accuracy) */
  near?: WGS84Point;
  size?: number; // 카카오 최대 15
  restApiKey?: string;
  retries?: number; // 기본 1
}

export async function fetchPlaces(opts: FetchPlacesOptions): Promise<PlaceResult[]> {
  const restApiKey = opts.restApiKey ?? env.KAKAO_REST_API_KEY;
  const retries = opts.retries ?? 1;

  const params = new URLSearchParams({ query: opts.query });
  if (opts.near) {
    params.set("x", String(opts.near.lng));
    params.set("y", String(opts.near.lat));
    params.set("sort", "distance");
  }
  if (opts.size) params.set("size", String(opts.size));

  const url = `${env.KAKAO_LOCAL_BASE_URL}/v2/local/search/keyword.json?${params}`;
  const res = await fetchWithRetry(
    url,
    { Authorization: `KakaoAK ${restApiKey}` },
    TIMEOUT_MS,
    retries,
  );

  const json = await res.json();
  const parsed = KakaoLocalSearchResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`카카오 로컬 검색 응답 파싱 실패: ${parsed.error.message}`);
  }

  return parsed.data.documents.map(mapPlaceDocument);
}

export interface FetchAddressOptions {
  point: WGS84Point;
  restApiKey?: string;
  retries?: number; // 기본 1
}

/** 좌표 → 주소 (역지오코딩). 홈 화면 지도 탭·드래그·"현재 위치" 버튼에서 쓴다. */
export async function fetchAddress(opts: FetchAddressOptions): Promise<PlaceResult> {
  const restApiKey = opts.restApiKey ?? env.KAKAO_REST_API_KEY;
  const retries = opts.retries ?? 1;

  const params = new URLSearchParams({
    x: String(opts.point.lng),
    y: String(opts.point.lat),
  });

  const url = `${env.KAKAO_LOCAL_BASE_URL}/v2/local/geo/coord2address.json?${params}`;
  const res = await fetchWithRetry(
    url,
    { Authorization: `KakaoAK ${restApiKey}` },
    TIMEOUT_MS,
    retries,
  );

  const json = await res.json();
  const parsed = KakaoCoord2AddressResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`카카오 역지오코딩 응답 파싱 실패: ${parsed.error.message}`);
  }
  const doc = parsed.data.documents[0];
  if (!doc) {
    throw new Error("좌표에 해당하는 주소를 찾을 수 없습니다.");
  }

  return mapCoord2AddressDocument(doc, opts.point);
}

export interface GeocodeAddressOptions {
  query: string;
  restApiKey?: string;
  retries?: number; // 기본 1
}

/**
 * 주소 → 좌표 (정방향 지오코딩).
 * docs/MIGRATION-DB.md §4 — 오피넷 유가 CSV 마스터 임포트 전용.
 * 실측 정확도(2026-09-04자, 오피넷 실좌표 대비): 중앙값 오차 15m, p90 37m.
 * 검색 실패 시 null — 호출부가 키워드검색으로 폴백하거나 좌표 없이 남깁니다.
 */
export async function geocodeAddress(opts: GeocodeAddressOptions): Promise<WGS84Point | null> {
  const restApiKey = opts.restApiKey ?? env.KAKAO_REST_API_KEY;
  const retries = opts.retries ?? 1;

  const params = new URLSearchParams({ query: opts.query });
  const url = `${env.KAKAO_LOCAL_BASE_URL}/v2/local/search/address.json?${params}`;
  const res = await fetchWithRetry(
    url,
    { Authorization: `KakaoAK ${restApiKey}` },
    TIMEOUT_MS,
    retries,
  );

  const json = await res.json();
  const parsed = KakaoAddressSearchResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`카카오 주소검색 응답 파싱 실패: ${parsed.error.message}`);
  }
  const doc = parsed.data.documents[0];
  return doc ? mapAddressSearchDocument(doc) : null;
}
