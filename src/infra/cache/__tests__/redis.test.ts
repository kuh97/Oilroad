import { describe, expect, it, vi, beforeEach } from "vitest";

const { RedisMock } = vi.hoisted(() => ({ RedisMock: vi.fn() }));
vi.mock("@upstash/redis", () => ({ Redis: RedisMock }));

import { createRedis } from "../redis";

beforeEach(() => {
  RedisMock.mockClear();
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
});

describe("createRedis", () => {
  it("automaticDeserialization을 끈다 — get()이 항상 원본 문자열을 반환해야 함", () => {
    // Upstash 기본값(true)이면 JSON처럼 보이는 문자열을 자동으로 파싱해 객체로 돌려준다.
    // route-service·station-service는 저장한 JSON 문자열을 직접 JSON.parse하므로,
    // 이 옵션이 켜져 있으면 이미 객체인 값을 다시 파싱하려다 실패한다
    // (실측: "[object Object]" is not valid JSON).
    createRedis();
    expect(RedisMock).toHaveBeenCalledWith(
      expect.objectContaining({ automaticDeserialization: false }),
    );
  });
});
