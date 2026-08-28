/**
 * 카카오 로컬 — 키워드 장소 검색 (F1 자동완성).
 * 타임아웃·재시도 — ARCHITECTURE.md §5.4 (timeout 3s, retry 1회)
 */

import { env } from "@/infra/env";
import { KakaoLocalSearchResponseSchema } from "./schema";
import { mapPlaceDocument } from "./mapper";
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
