/**
 * Upstash Redis REST 클라이언트 팩토리.
 * ARCHITECTURE.md §8
 */

import { Redis } from "@upstash/redis";

export function createRedis(): Redis {
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    // 기본값(true)이면 get()이 JSON처럼 보이는 문자열을 자동으로 파싱해 객체로 돌려준다.
    // route-service·station-service가 저장한 JSON 문자열을 직접 JSON.parse하므로,
    // 자동 역직렬화가 켜져 있으면 이미 객체인 값을 다시 파싱하려다 실패한다
    // (실측: "[object Object]" is not valid JSON). 항상 원본 문자열을 받도록 끈다.
    automaticDeserialization: false,
  });
}

let _redis: Redis | undefined;

/** 앱 런타임에서 사용하는 싱글턴 Redis 클라이언트 */
export function getRedis(): Redis {
  if (!_redis) _redis = createRedis();
  return _redis;
}
