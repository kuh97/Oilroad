import { describe, expect, it, vi } from "vitest";

vi.stubEnv("CRON_SECRET", "test-cron-secret");

const syncSigunguAvgPrices = vi.fn().mockResolvedValue({ updated: 120, sidoCount: 16 });
vi.mock("../../../../../../scripts/sync-sigungu-avg", () => ({
  syncSigunguAvgPrices: (...args: unknown[]) => syncSigunguAvgPrices(...args),
}));

import { POST } from "../route";

function request(auth?: string) {
  return new Request("https://example.com/api/cron/sync-sigungu", {
    method: "POST",
    headers: auth ? { authorization: auth } : {},
  });
}

describe("POST /api/cron/sync-sigungu", () => {
  it("Authorization 헤더가 없으면 401", async () => {
    const res = await POST(request());
    expect(res.status).toBe(401);
    expect(syncSigunguAvgPrices).not.toHaveBeenCalled();
  });

  it("CRON_SECRET이 일치하지 않으면 401", async () => {
    const res = await POST(request("Bearer wrong-secret"));
    expect(res.status).toBe(401);
    expect(syncSigunguAvgPrices).not.toHaveBeenCalled();
  });

  it("CRON_SECRET이 일치하면 동기화를 실행하고 updated를 반환한다", async () => {
    const res = await POST(request("Bearer test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ updated: 120 });
    expect(syncSigunguAvgPrices).toHaveBeenCalledTimes(1);
  });
});
