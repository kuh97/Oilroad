// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { StationDetailView } from "../page";
import { useSearchStore } from "@/store/search-store";
import { wgs84 } from "@/domain/types";
import type { WireCandidate, WireSearchResult } from "@/app/api/_lib/types";

vi.mock("react-kakao-maps-sdk", () => ({
  useKakaoLoader: () => [false, undefined],
  Map: ({ children }: { children?: React.ReactNode }) => <div data-testid="map">{children}</div>,
  Polyline: () => null,
  MapMarker: () => null,
}));

const fetchDetourMock = vi.fn().mockResolvedValue(null);
vi.mock("@/lib/api/useDetour", () => ({
  useDetour: () => ({ fetchDetour: fetchDetourMock, isLoading: false, error: null }),
}));

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
    priceUpdatedAt: new Date().toISOString(),
    facilities: { carWash: true, maintenance: false, cvs: false },
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

function result(overrides: Partial<WireSearchResult> = {}): WireSearchResult {
  return {
    searchId: "s-1",
    baseRoute: { distanceM: 92000, durationS: 5640, polyline: [] },
    candidates: [candidate()],
    referencePrice: 1210,
    refPriceSource: "MEDIAN_T1T2",
    expansion: { triggered: true, finalRadiusM: 7000 },
    warnings: [],
    ...overrides,
  };
}

beforeEach(() => {
  fetchDetourMock.mockClear();
  useSearchStore.setState({
    origin: wgs84AsPoint(37.42, 127.12),
    destination: wgs84AsPoint(37.88, 127.73),
    result: null,
  });
});

function wgs84AsPoint(lat: number, lng: number) {
  const p = wgs84(lat, lng);
  return { lat: p.lat, lng: p.lng };
}

function renderPage(id = "A1") {
  return render(<StationDetailView id={id} />);
}

describe("StationDetailView — 검색 컨텍스트 없음", () => {
  it("스토어에 result가 없으면 안내 화면을 보여준다", () => {
    renderPage();
    expect(screen.getByText(/검색 컨텍스트가 없습니다/)).toBeTruthy();
  });

  it("result는 있지만 해당 id의 후보가 없으면 안내 화면을 보여준다", () => {
    useSearchStore.setState({ result: result() });
    renderPage("없는-id");
    expect(screen.getByText(/검색 컨텍스트가 없습니다/)).toBeTruthy();
  });
});

describe("StationDetailView — 정상 흐름 (AGENTS.md §6 불변식)", () => {
  beforeEach(() => {
    useSearchStore.setState({ result: result() });
  });

  it("면책 문구는 항상 노출된다", () => {
    renderPage();
    expect(screen.getByText(/가격은 실제와 다를 수 있습니다/)).toBeTruthy();
  });

  it("T3 후보는 전화 확인 권고 문구와 전화번호를 함께 보여준다", () => {
    renderPage();
    expect(screen.getByText(/전화 확인을 권합니다/)).toBeTruthy();
    expect(screen.getByText("033-000-0000 — 전화걸기")).toBeTruthy();
  });

  it("T1 후보는 전화 확인 권고 문구를 보여주지 않는다", () => {
    useSearchStore.setState({ result: result({ candidates: [candidate({ tier: "T1" })] }) });
    renderPage();
    expect(screen.queryByText(/전화 확인을 권합니다/)).toBeNull();
  });

  it("티맵 안내 문구가 노출된다", () => {
    renderPage();
    expect(screen.getByText(/티맵은 주유소까지만 안내됩니다/)).toBeTruthy();
  });

  it("마운트 시 정밀 재계산(fetchDetour)을 호출한다", () => {
    renderPage();
    expect(fetchDetourMock).toHaveBeenCalledTimes(1);
    expect(fetchDetourMock.mock.calls[0][0]).toMatchObject({ stationId: "A1", priceStation: 1102 });
  });
});
