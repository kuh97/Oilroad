/**
 * 장소 검색 — F1 자동완성. ARCHITECTURE.md §8 캐시 전략 (24시간 TTL).
 */

import { fetchPlaces } from "@/infra/kakao/local";
import { getRedis } from "@/infra/cache/redis";
import { placeKey } from "@/infra/cache/keys";
import { env } from "@/infra/env";
import { wgs84 } from "@/domain/types";
import type { PlaceResult } from "@/domain/types";
import type { RedisLike } from "./route-service";

export type { RedisLike };

const PLACE_TTL_SECONDS = 24 * 60 * 60; // 24시간 — 거의 안 변함 (§8)

interface CachedPlace {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

function serialize(places: PlaceResult[]): string {
  const payload: CachedPlace[] = places.map((p) => ({
    name: p.name,
    address: p.address,
    lat: p.location.lat,
    lng: p.location.lng,
  }));
  return JSON.stringify(payload);
}

function deserialize(raw: string): PlaceResult[] {
  const cached = JSON.parse(raw) as CachedPlace[];
  return cached.map((p) => ({ name: p.name, address: p.address, location: wgs84(p.lat, p.lng) }));
}

export interface SearchPlacesOptions {
  query: string;
  size?: number;
  redis?: RedisLike;
  prefix?: string;
}

/**
 * 장소 키워드 검색. 캐시 히트 시 카카오 호출 없이 반환합니다.
 * 캐시 키는 query만 쓰므로(§8 `place:{query}`), `near`(근접 정렬) 옵션이 필요한
 * 호출부가 생기면 그 값도 키에 반영해야 한다 — 현재는 자동완성(usePlacesSearch)
 * 하나뿐이고 near 없이 호출한다.
 */
export async function searchPlaces(opts: SearchPlacesOptions): Promise<PlaceResult[]> {
  const redis: RedisLike = opts.redis ?? getRedis();
  const prefix = opts.prefix ?? env.REDIS_KEY_PREFIX;

  const key = placeKey(prefix, opts.query);
  const cached = await redis.get(key);
  if (cached) return deserialize(cached);

  const places = await fetchPlaces({ query: opts.query, size: opts.size });
  await redis.set(key, serialize(places), { ex: PLACE_TTL_SECONDS });
  return places;
}
