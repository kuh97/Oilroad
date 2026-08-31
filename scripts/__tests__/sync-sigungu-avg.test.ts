import { describe, expect, it, vi } from "vitest";

vi.stubEnv("OPINET_CERT_KEY", "test-cert-key");
vi.stubEnv("OPINET_BASE_URL", "https://www.opinet.co.kr/api");
vi.stubEnv("OPINET_CONCURRENCY", "4");

const bulkUpsertSigunguAvgPrices = vi.fn().mockResolvedValue(999);
vi.mock("@/infra/db/repositories", () => ({
  bulkUpsertSigunguAvgPrices: (...args: unknown[]) => bulkUpsertSigunguAvgPrices(...args),
}));

// MSW 핸들러가 tests/setup.ts에서 이미 설정됨 (areaCode.do·avgSigunPrice.do)
import { syncSigunguAvgPrices } from "../sync-sigungu-avg";
import areaCodeFixture from "../../tests/fixtures/opinet-area-code.json";
import avgSigunPriceFixture from "../../tests/fixtures/opinet-avg-sigun-price.json";

describe("syncSigunguAvgPrices", () => {
  it("시도 수만큼 avgSigunPrice를 호출하고 알려진 prodcd만 upsert 대상에 넣는다", async () => {
    const result = await syncSigunguAvgPrices();

    expect(result.sidoCount).toBe(areaCodeFixture.RESULT.OIL.length);
    expect(bulkUpsertSigunguAvgPrices).toHaveBeenCalledTimes(1);

    const [rows] = bulkUpsertSigunguAvgPrices.mock.calls[0];
    // 픽스처는 시도 하나(예: 서울)의 시군구 목록이지만, MSW가 모든 sido 요청에
    // 동일 픽스처로 응답하므로 시도 수 × (알려진 prodcd 항목 수)만큼 쌓입니다.
    const knownPerSido = avgSigunPriceFixture.RESULT.OIL.filter((i) =>
      ["B027", "D047", "K015"].includes(i.PRODCD),
    ).length;
    expect(rows.length).toBe(areaCodeFixture.RESULT.OIL.length * knownPerSido);

    // B034(고급휘발유)·C004(실내등유)는 걸러졌는지 확인
    expect(rows.every((r: { fuel: string }) => ["GASOLINE", "DIESEL", "LPG"].includes(r.fuel))).toBe(
      true,
    );
  });

  it("bulkUpsertSigunguAvgPrices의 반환값을 그대로 updated로 반환한다", async () => {
    const result = await syncSigunguAvgPrices();
    expect(result.updated).toBe(999);
  });
});
