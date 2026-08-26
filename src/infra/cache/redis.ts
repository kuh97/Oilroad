/**
 * Upstash Redis REST 클라이언트 팩토리.
 * ARCHITECTURE.md §8
 */

import { Redis } from "@upstash/redis";

export function createRedis(): Redis {
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
}

let _redis: Redis | undefined;

/** 앱 런타임에서 사용하는 싱글턴 Redis 클라이언트 */
export function getRedis(): Redis {
  if (!_redis) _redis = createRedis();
  return _redis;
}
