// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ResultCard } from "../result-card";
import { PRICE_STALE_HOURS } from "@/domain/params";
import type { WireCandidate } from "@/app/api/_lib/types";

const NOW = new Date("2026-08-31T12:00:00.000Z");

function candidate(overrides: Partial<WireCandidate> = {}): WireCandidate {
  return {
    id: "A1",
    name: "E1 홍천충전소",
    brand: "E1G",
    lat: 37.5,
    lng: 127.0,
    address: "강원 홍천군",
    tel: "033-000-0000",
    price: 1102,
    priceUpdatedAt: NOW.toISOString(),
    facilities: { carWash: true, maintenance: false, cvs: true },
    kpetro: false,
    tier: "T3",
    perpDistanceM: 6200,
    detour: { precise: true, distanceM: 12400, durationS: 1080 },
    netSaving: 3252,
    estimatedCost: 49590,
    scores: { balanced: 1, minCost: 1, minDistance: 1 },
    reason: "12.4km 우회하지만 리터당 108원 저렴합니다.",
    ...overrides,
  };
}

describe("ResultCard", () => {
  it("T3 배지·정밀 우회 정보·이득 문구를 보여준다", () => {
    render(<ResultCard rank={1} candidate={candidate()} hasReferencePrice now={NOW} />);
    expect(screen.getByText("🟡", { exact: false })).toBeTruthy();
    expect(screen.getByText("우회")).toBeTruthy();
    expect(screen.getByText(/\+18분/)).toBeTruthy();
    expect(screen.getByText(/\+12\.4km 우회/)).toBeTruthy();
    expect(screen.getByText(/3,252원 이득/)).toBeTruthy();
  });

  it("미계산(precise:false) 후보는 '약 N km ▸'로 표시하고 분·우회 문구를 쓰지 않는다", () => {
    render(
      <ResultCard
        rank={3}
        candidate={candidate({ tier: "T2", detour: { precise: false, distanceM: 0, durationS: 0 }, perpDistanceM: 2100 })}
        hasReferencePrice
        now={NOW}
      />,
    );
    expect(screen.getByText(/경로에서 약 2\.1km ▸/)).toBeTruthy();
    expect(screen.queryByText(/우회$/)).toBeNull();
  });

  it("referencePrice가 없으면(A14) 이득/비쌈 문구를 아예 표시하지 않는다", () => {
    render(<ResultCard rank={1} candidate={candidate()} hasReferencePrice={false} now={NOW} />);
    expect(screen.queryByText(/이득/)).toBeNull();
    expect(screen.queryByText(/비쌈/)).toBeNull();
  });

  it("PRICE_STALE_HOURS를 초과하면 '오래된 정보' 배지를 붙인다", () => {
    const staleTime = new Date(NOW.getTime() - (PRICE_STALE_HOURS + 1) * 60 * 60 * 1000);
    render(<ResultCard rank={1} candidate={candidate({ priceUpdatedAt: staleTime.toISOString() })} hasReferencePrice now={NOW} />);
    expect(screen.getByText(/오래된 정보/)).toBeTruthy();
  });

  it("PRICE_STALE_HOURS 이내면 '오래된 정보' 배지가 없다", () => {
    render(<ResultCard rank={1} candidate={candidate()} hasReferencePrice now={NOW} />);
    expect(screen.queryByText(/오래된 정보/)).toBeNull();
  });

  it("활성화된 시설만 배지로 보여준다", () => {
    render(<ResultCard rank={1} candidate={candidate()} hasReferencePrice now={NOW} />);
    expect(screen.getByText(/세차/)).toBeTruthy();
    expect(screen.getByText(/편의점/)).toBeTruthy();
    expect(screen.queryByText(/경정비/)).toBeNull();
  });
});
