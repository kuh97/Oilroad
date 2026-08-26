import { describe, expect, it } from "vitest";
import { priceTtlSeconds, isPriceStale, approximateLastUpdateTime, OPINET_UPDATE_HOURS } from "../cache-ttl";

// UTC를 받아 KST 시각을 지정하는 헬퍼
// e.g. makeKst(0, 30) → KST 00:30 = UTC 전날 15:30
function makeUtcForKst(kstHour: number, kstMinute = 0, kstSecond = 0): Date {
  // KST = UTC+9, so UTC = KST - 9h
  const utcHour = kstHour - 9;
  const base = new Date("2026-01-01T00:00:00Z"); // 기준일
  base.setUTCHours(utcHour, kstMinute, kstSecond, 0);
  return base;
}

describe("OPINET_UPDATE_HOURS", () => {
  it("하루 6회 갱신", () => {
    expect(OPINET_UPDATE_HOURS).toHaveLength(6);
  });
  it("정렬되어 있음", () => {
    const sorted = [...OPINET_UPDATE_HOURS].sort((a, b) => a - b);
    expect([...OPINET_UPDATE_HOURS]).toEqual(sorted);
  });
});

describe("priceTtlSeconds", () => {
  it("KST 00:30 → 다음 갱신 1시+5분 = 1:05. TTL = 35분 = 2100s", () => {
    const now = makeUtcForKst(0, 30, 0);
    // next: 1*3600 + 5*60 = 3900. nowTotal = 30*60 = 1800. diff = 2100
    expect(priceTtlSeconds(now)).toBe(2100);
  });

  it("KST 01:30 → 다음 갱신 2시+5분. TTL = 35분 = 2100s", () => {
    const now = makeUtcForKst(1, 30, 0);
    // next: 2*3600+5*60=7500. nowTotal=1*3600+30*60=5400. diff=2100
    expect(priceTtlSeconds(now)).toBe(2100);
  });

  it("KST 18:50 → 다음 갱신 19시+5분. TTL = 15분 = 900s", () => {
    const now = makeUtcForKst(18, 50, 0);
    // next: 19*3600+5*60=68700. nowTotal=18*3600+50*60=67800. diff=900
    expect(priceTtlSeconds(now)).toBe(900);
  });

  it("KST 19:10 → 오늘 마지막 갱신 이후, 다음 날 1시+5분. TTL = 21300s", () => {
    const now = makeUtcForKst(19, 10, 0);
    // nowTotal=19*3600+10*60=69000. next=24*3600+1*3600+5*60=90300. diff=21300
    expect(priceTtlSeconds(now)).toBe(21300);
  });

  it("최솟값 60초 보장 (갱신 직후)", () => {
    // KST 01:05:01 → 갱신(1시+5분) 직후 1초
    const now = makeUtcForKst(1, 5, 1);
    const ttl = priceTtlSeconds(now);
    expect(ttl).toBeGreaterThanOrEqual(60);
  });

  it("각 갱신 시각 직전 60초 이상 반환", () => {
    for (const hour of OPINET_UPDATE_HOURS) {
      const now = makeUtcForKst(hour, 4, 0); // 갱신 1분 전
      const ttl = priceTtlSeconds(now);
      expect(ttl).toBeGreaterThanOrEqual(60);
    }
  });
});

describe("isPriceStale", () => {
  it("staleHours 초과 → true", () => {
    const base = new Date("2026-01-01T00:00:00Z");
    const old = new Date(base.getTime() - 7 * 3600 * 1000);
    expect(isPriceStale(old, base, 6)).toBe(true);
  });

  it("staleHours 이하 → false", () => {
    const base = new Date("2026-01-01T00:00:00Z");
    const recent = new Date(base.getTime() - 5 * 3600 * 1000);
    expect(isPriceStale(recent, base, 6)).toBe(false);
  });

  it("exactly staleHours → false (경계 초과 아님)", () => {
    const base = new Date("2026-01-01T00:00:00Z");
    const exact = new Date(base.getTime() - 6 * 3600 * 1000);
    expect(isPriceStale(exact, base, 6)).toBe(false);
  });
});

describe("approximateLastUpdateTime", () => {
  it("KST 10:00 → 가장 최근 갱신 9시", () => {
    const now = makeUtcForKst(10, 0);
    const last = approximateLastUpdateTime(now);
    // KST 기준 9:00 = UTC 0:00
    expect(last.getUTCHours()).toBe(0); // 9-9=0
  });

  it("KST 00:30 → 어제 19시", () => {
    const now = makeUtcForKst(0, 30);
    const last = approximateLastUpdateTime(now);
    // KST 전날 19:00 = UTC 전날 10:00
    expect(last.getUTCHours()).toBe(10); // 19-9=10
  });

  it("KST 01:30 → 1시", () => {
    const now = makeUtcForKst(1, 30);
    const last = approximateLastUpdateTime(now);
    // KST 1:00 = UTC 16:00 전날...
    // 실제로는 같은 날이라 UTC = 1-9 = -8 → 전날 16시
    expect(last.getUTCHours()).toBe(16);
  });
});
