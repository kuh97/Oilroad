import { describe, expect, it, vi } from "vitest";

const findRefuelPointRowByIdMock = vi.fn();
vi.mock("@/infra/db/repositories", async () => {
  const actual = await vi.importActual<typeof import("@/infra/db/repositories")>("@/infra/db/repositories");
  return {
    ...actual,
    findRefuelPointRowById: (...args: unknown[]) => findRefuelPointRowByIdMock(...args),
  };
});

import { GET } from "../route";
import type { RefuelPointRow } from "@/infra/db/repositories";

function row(overrides: Partial<RefuelPointRow> = {}): RefuelPointRow {
  return {
    id: "A0012345",
    name: "테스트주유소",
    brandCode: "SKE",
    energyType: "OIL",
    lat: 37.5,
    lng: 127.0,
    katecX: null,
    katecY: null,
    addressRoad: "성남대로 1",
    addressJibun: null,
    tel: null,
    sigunCd: null,
    hasCarWash: true,
    hasMaintenance: false,
    hasCvs: false,
    isKpetro: false,
    isSelf: null,
    coordSource: null,
    lastPrice: 1650,
    lastPriceProd: "B027",
    priceTradedAt: new Date("2026-08-31T00:00:00.000Z"),
    priceGasoline: null,
    priceDiesel: null,
    priceLpg: null,
    pricePremium: null,
    priceKerosene: null,
    pricedOn: null,
    lastSeenOn: null,
    source: "OPINET",
    detailSyncedAt: null,
    updatedAt: new Date("2026-08-31T00:00:00.000Z"),
    ...overrides,
  };
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/stations/:id", () => {
  it("존재하지 않으면 404다", async () => {
    findRefuelPointRowByIdMock.mockResolvedValue(undefined);
    const res = await GET(new Request("https://example.com/api/stations/none"), makeParams("none"));
    expect(res.status).toBe(404);
  });

  it("경로 의존 필드 없이 DB의 lastPrice·priceTradedAt을 그대로 노출한다", async () => {
    findRefuelPointRowByIdMock.mockResolvedValue(row());
    const res = await GET(new Request("https://example.com/api/stations/A0012345"), makeParams("A0012345"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).not.toHaveProperty("tier");
    expect(body).not.toHaveProperty("detour");
    expect(body.price).toBe(1650);
    expect(body.priceUpdatedAt).toBe("2026-08-31T00:00:00.000Z");
    expect(body.facilities.carWash).toBe(true);
  });

  it("lastPrice가 없으면 price는 null이다", async () => {
    findRefuelPointRowByIdMock.mockResolvedValue(row({ lastPrice: null, lastPriceProd: null, priceTradedAt: null }));
    const res = await GET(new Request("https://example.com/api/stations/A0012345"), makeParams("A0012345"));
    const body = await res.json();
    expect(body.price).toBeNull();
    expect(body.priceUpdatedAt).toBeNull();
  });
});
