import { describe, expect, it } from "vitest";
import { recomputeCandidate, recomputeAndSort } from "../recompute-candidates";
import type { WireCandidate } from "@/app/api/_lib/types";

function candidate(overrides: Partial<WireCandidate> = {}): WireCandidate {
  return {
    id: "A1",
    name: "테스트주유소",
    brand: "SKE",
    lat: 37.5,
    lng: 127.0,
    address: "",
    tel: null,
    price: 1700,
    priceUpdatedAt: null,
    facilities: { carWash: false, maintenance: false, cvs: false },
    kpetro: false,
    tier: "T1",
    perpDistanceM: 100,
    detour: { precise: false, distanceM: 1000, durationS: 120 },
    netSaving: 999,
    estimatedCost: 99999,
    scores: { balanced: 1, minCost: 1, minDistance: 1 },
    reason: "원래 이유",
    ...overrides,
  };
}

describe("recomputeCandidate", () => {
  it("efficiency·refuelAmount가 바뀌면 estimatedCost·netSaving이 새 값으로 재계산된다", () => {
    const original = candidate();
    const cheaperCar = recomputeCandidate(original, { efficiency: 20, refuelAmount: 30, timeValue: 200 }, 1800);
    const thirstyCar = recomputeCandidate(original, { efficiency: 5, refuelAmount: 60, timeValue: 200 }, 1800);

    expect(cheaperCar.estimatedCost).not.toBe(thirstyCar.estimatedCost);
    expect(cheaperCar.netSaving).not.toBe(thirstyCar.netSaving);
  });

  it("reason 문구는 재생성하지 않고 그대로 유지한다", () => {
    const result = recomputeCandidate(candidate(), { efficiency: 20, refuelAmount: 30, timeValue: 200 }, 1800);
    expect(result.reason).toBe("원래 이유");
  });

  it("referencePrice가 null(A14)이면 netSaving을 건드리지 않는다", () => {
    const original = candidate({ netSaving: 777 });
    const result = recomputeCandidate(original, { efficiency: 10, refuelAmount: 45, timeValue: 200 }, null);
    expect(result.netSaving).toBe(777);
  });
});

describe("recomputeAndSort", () => {
  it("referencePrice가 있으면 balanced 모드 점수로 정렬한다", () => {
    const cheap = candidate({ id: "cheap", price: 1500, detour: { precise: true, distanceM: 0, durationS: 0 } });
    const farButCheaper = candidate({ id: "far", price: 1400, detour: { precise: true, distanceM: 20000, durationS: 1800 } });

    const sorted = recomputeAndSort([farButCheaper, cheap], { efficiency: 10, refuelAmount: 45, timeValue: 200 }, 1800, "minDistance");
    expect(sorted.map((c) => c.id)).toEqual(["cheap", "far"]); // minDistance 모드 — 우회 0인 쪽이 먼저
  });

  it("referencePrice가 null이면 가격순으로 정렬한다(모드 무관)", () => {
    const expensive = candidate({ id: "expensive", price: 2000 });
    const cheap = candidate({ id: "cheap", price: 1500 });

    const sorted = recomputeAndSort([expensive, cheap], { efficiency: 10, refuelAmount: 45, timeValue: 200 }, null, "balanced");
    expect(sorted.map((c) => c.id)).toEqual(["cheap", "expensive"]);
  });
});
