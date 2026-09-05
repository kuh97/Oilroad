/**
 * 오피넷 유가 CSV(과거 판매가격) → refuel_point 임포트.
 * docs/MIGRATION-DB.md §7 Phase A — 1회성 마스터 구축(이후엔 일일 자동화의 기반).
 *
 * 사용법:
 *   pnpm data:import-csv                                    # data/csv/ 밑에서 자동 탐색
 *   pnpm data:import-csv <주유소.csv> <충전소.csv>            # 경로 직접 지정
 *
 * 하는 일 (docs/MIGRATION-DB.md §7 Phase A 순서 그대로):
 *   1. EUC-KR → UTF-8, 2행 메타행 스킵, 기준일자 파싱
 *   2. UNI_ID 기준 주유소·충전소 CSV 병합
 *   3. 상표 → POLL_DIV_CD, 지역 → SIGUNCD 매핑 (오피넷 areaCode.do 17회, §3.3)
 *   4. 좌표 없는 행만 카카오 지오코딩 (주소검색 → 실패 시 키워드검색, §4)
 *   5. bulkUpsertFromCsv — 컬럼 소유권 규칙(§6) 적용, 청크 단위 upsert
 *
 * 지오코딩 양쪽 다 실패한 행은 이번 실행에서 insert하지 않고 로그만 남깁니다
 * (좌표 없이는 티어 분류가 불가능하므로 애초에 검색 후보가 될 수 없음 — insert
 * 자체를 건너뛰는 것으로 §4의 "검색 후보에서 자동 제외"를 만족).
 */

import fs from "node:fs";
import path from "node:path";
import { fetchAreaCodes, fetchAvgSigunPrice, createSemaphore } from "@/infra/opinet/client";
import { geocodeAddress, fetchPlaces } from "@/infra/kakao/local";
import { getDb } from "@/infra/db/client";
import { refuelPoint } from "@/infra/db/schema";
import { bulkUpsertFromCsv, type CsvUpsertRow } from "@/infra/db/repositories";
import { decodeEucKr, parseOilCsv, parseLpgCsv, mergeCsvRows } from "@/infra/csv/parse";
import type { MergedCsvRow } from "@/infra/csv/types";
import { requireEnv, header, info, ok, warn, fail } from "./_shared";

const CHUNK_SIZE = 500;
const GEOCODE_CONCURRENCY = 8;

// ─── CSV 파일 탐색 ────────────────────────────────────────────────────────────

function findDefaultCsv(dir: string, mustContain: string): string {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".csv") && f.includes(mustContain));
  if (files.length === 0) {
    throw new Error(`${dir}에서 "${mustContain}"이 포함된 CSV를 찾을 수 없습니다.`);
  }
  if (files.length > 1) {
    throw new Error(`${dir}에서 "${mustContain}" CSV가 여러 개 발견됐습니다: ${files.join(", ")}`);
  }
  return path.join(dir, files[0]);
}

function resolveCsvPaths(): { oilPath: string; lpgPath: string } {
  const [, , argOil, argLpg] = process.argv;
  if (argOil && argLpg) return { oilPath: argOil, lpgPath: argLpg };
  const dir = path.join(process.cwd(), "data", "csv");
  return {
    oilPath: findDefaultCsv(dir, "주유소"),
    lpgPath: findDefaultCsv(dir, "충전소"),
  };
}

// ─── 기본 검증 (docs/MIGRATION-DB.md §8 G5·G7·G8 — 1회성 구축이라 G3·G4·G6은 생략) ──

function runSanityChecks(rows: MergedCsvRow[]): void {
  header("검증");

  const idOk = rows.filter((r) => /^A\d{7}$/.test(r.uniId));
  if (idOk.length === rows.length) {
    ok(`G5 — UNI_ID 형식 100% (${rows.length}건)`);
  } else {
    fail(`G5 — UNI_ID 형식 이상 ${rows.length - idOk.length}건`);
    throw new Error("G5 검증 실패 — 임포트를 중단합니다.");
  }

  const withGasoline = rows.filter((r) => r.energyType !== "LPG");
  const gasolineValid = withGasoline.filter((r) => r.priceGasoline != null);
  const gasolineRatio = withGasoline.length === 0 ? 1 : gasolineValid.length / withGasoline.length;
  if (gasolineRatio >= 0.95) {
    ok(`G7 — 휘발유 유효행 비율 ${(gasolineRatio * 100).toFixed(1)}%`);
  } else {
    fail(`G7 — 휘발유 유효행 비율 ${(gasolineRatio * 100).toFixed(1)}% (95% 미만)`);
    throw new Error("G7 검증 실패 — 임포트를 중단합니다.");
  }

  const allPrices = rows.flatMap((r) =>
    [r.priceGasoline, r.priceDiesel, r.priceLpg, r.pricePremium, r.priceKerosene].filter(
      (p): p is number => p != null,
    ),
  );
  const outOfRange = allPrices.filter((p) => p < 1000 || p > 4000);
  const outRatio = allPrices.length === 0 ? 0 : outOfRange.length / allPrices.length;
  if (outRatio < 0.005) {
    ok(`G8 — 가격 범위(1,000~4,000원) 이탈 ${(outRatio * 100).toFixed(2)}%`);
  } else {
    fail(`G8 — 가격 범위 이탈 ${(outRatio * 100).toFixed(2)}% (0.5% 초과)`);
    throw new Error("G8 검증 실패 — 임포트를 중단합니다.");
  }
}

// ─── 시군구 코드 매핑 (오피넷 실호출 17회, docs/MIGRATION-DB.md §3.3) ──────────

async function buildSigunMap(): Promise<Map<string, string>> {
  header("시군구 코드 매핑 (오피넷 areaCode.do + avgSigunPrice.do, 예상 호출 17회)");
  const areas = await fetchAreaCodes();
  info(`시도 코드 ${areas.length}개 확보 — avgSigunPrice.do ${areas.length}회 추가 호출`);

  const sigunMap = new Map<string, string>();
  for (const area of areas) {
    const items = await fetchAvgSigunPrice({ sido: area.AREA_CD });
    for (const item of items) sigunMap.set(item.SIGUNNM, item.SIGUNCD);
  }
  ok(`시군구 매핑 ${sigunMap.size}개 확보 (오피넷 호출 총 ${1 + areas.length}회)`);
  return sigunMap;
}

// ─── 지오코딩 ─────────────────────────────────────────────────────────────────

interface GeocodeResult {
  lat: number;
  lng: number;
  coordSource: "OPINET" | "KAKAO_ADDR" | "KAKAO_KEYWORD";
}

async function geocodeOne(row: MergedCsvRow): Promise<GeocodeResult | null> {
  try {
    const viaAddress = await geocodeAddress({ query: row.address });
    if (viaAddress) return { lat: viaAddress.lat, lng: viaAddress.lng, coordSource: "KAKAO_ADDR" };
  } catch {
    // 폴백으로 진행
  }
  try {
    const region = row.address.split(" ")[0] || "";
    const results = await fetchPlaces({ query: `${region} ${row.name}`, size: 1 });
    const viaKeyword = results[0];
    if (viaKeyword) {
      return { lat: viaKeyword.location.lat, lng: viaKeyword.location.lng, coordSource: "KAKAO_KEYWORD" };
    }
  } catch {
    // 둘 다 실패 — null 반환
  }
  return null;
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────

async function main() {
  requireEnv(["DATABASE_URL", "KAKAO_REST_API_KEY", "OPINET_CERT_KEY"]);

  const { oilPath, lpgPath } = resolveCsvPaths();
  header("CSV 파싱");
  info(`주유소: ${oilPath}`);
  info(`충전소: ${lpgPath}`);

  const oilText = decodeEucKr(fs.readFileSync(oilPath));
  const lpgText = decodeEucKr(fs.readFileSync(lpgPath));

  const oilParsed = parseOilCsv(oilText);
  const lpgParsed = parseLpgCsv(lpgText);
  if (oilParsed.pricedOn !== lpgParsed.pricedOn) {
    warn(`두 CSV의 기준일자가 다릅니다: 주유소=${oilParsed.pricedOn}, 충전소=${lpgParsed.pricedOn}`);
  }
  ok(`주유소 ${oilParsed.rows.length}행, 충전소 ${lpgParsed.rows.length}행, 기준일자 ${oilParsed.pricedOn}`);

  const sigunMap = await buildSigunMap();
  const merged = mergeCsvRows(oilParsed.rows, lpgParsed.rows, sigunMap, oilParsed.pricedOn);
  const unmappedSigun = merged.filter((m) => m.sigunCd === null).length;
  if (unmappedSigun > 0) warn(`SIGUNCD 매핑 실패 ${unmappedSigun}건 (P_ref 시군구 집계에서 제외됨)`);

  runSanityChecks(merged);

  // 기존 좌표 재사용 — 오피넷 실좌표가 있으면 지오코딩하지 않음 (§4)
  header("좌표 조달");
  const db = getDb();
  const existingCoords = await db
    .select({ id: refuelPoint.id, lat: refuelPoint.lat, lng: refuelPoint.lng, coordSource: refuelPoint.coordSource })
    .from(refuelPoint);
  const existingMap = new Map(existingCoords.map((r) => [r.id, r]));
  info(`기존 마스터 ${existingMap.size}건 — 좌표 보유분은 지오코딩 스킵`);

  const needsGeocode = merged.filter((m) => existingMap.get(m.uniId)?.lat == null);
  info(`지오코딩 대상: ${needsGeocode.length}건 (카카오 API, 동시성 ${GEOCODE_CONCURRENCY})`);

  const semaphore = createSemaphore(GEOCODE_CONCURRENCY);
  const geocoded = new Map<string, GeocodeResult>();
  let doneCount = 0;
  let viaAddressCount = 0;
  let viaKeywordCount = 0;
  const failed: MergedCsvRow[] = [];

  await Promise.all(
    needsGeocode.map((row) =>
      semaphore.run(async () => {
        const result = await geocodeOne(row);
        doneCount++;
        if (doneCount % 1000 === 0) info(`진행 ${doneCount}/${needsGeocode.length}`);
        if (result) {
          geocoded.set(row.uniId, result);
          if (result.coordSource === "KAKAO_ADDR") viaAddressCount++;
          else viaKeywordCount++;
        } else {
          failed.push(row);
        }
      }),
    ),
  );
  ok(`지오코딩 완료 — 주소검색 ${viaAddressCount}건, 키워드검색 ${viaKeywordCount}건, 실패 ${failed.length}건`);

  if (failed.length > 0) {
    const logPath = path.join(process.cwd(), "data", "csv", "geocode-failures.json");
    fs.writeFileSync(
      logPath,
      JSON.stringify(failed.map((f) => ({ id: f.uniId, name: f.name, address: f.address })), null, 2),
    );
    warn(`좌표를 못 구한 ${failed.length}건은 이번 임포트에서 제외 — ${logPath}에 기록`);
  }

  // upsert 대상 조립
  const upsertRows: CsvUpsertRow[] = [];
  const skippedIds = new Set(failed.map((f) => f.uniId));
  for (const row of merged) {
    if (skippedIds.has(row.uniId)) continue;
    const existing = existingMap.get(row.uniId);
    const coord: GeocodeResult =
      existing?.lat != null && existing?.lng != null
        ? { lat: existing.lat, lng: existing.lng, coordSource: (existing.coordSource as GeocodeResult["coordSource"]) ?? "OPINET" }
        : geocoded.get(row.uniId)!;

    upsertRows.push({
      id: row.uniId,
      name: row.name,
      brandCode: row.brandCode,
      energyType: row.energyType,
      lat: coord.lat,
      lng: coord.lng,
      coordSource: coord.coordSource,
      addressRoad: row.address,
      sigunCd: row.sigunCd,
      isSelf: row.isSelf,
      pricedOn: row.pricedOn,
      lastSeenOn: row.lastSeenOn,
      priceGasoline: row.priceGasoline,
      priceDiesel: row.priceDiesel,
      priceLpg: row.priceLpg,
      pricePremium: row.pricePremium,
      priceKerosene: row.priceKerosene,
    });
  }

  header(`DB 적재 (${upsertRows.length}건, ${CHUNK_SIZE}건씩 청크)`);
  let upserted = 0;
  for (let i = 0; i < upsertRows.length; i += CHUNK_SIZE) {
    const chunk = upsertRows.slice(i, i + CHUNK_SIZE);
    await bulkUpsertFromCsv(chunk, db);
    upserted += chunk.length;
    info(`${upserted}/${upsertRows.length}`);
  }

  header("완료");
  ok(`refuel_point upsert ${upserted}건 (기준일자 ${oilParsed.pricedOn})`);
  if (failed.length > 0) ok(`좌표 미확보 ${failed.length}건은 다음 실행에서 재시도 가능 (제외됨)`);
}

main().catch((err: unknown) => {
  console.error("✖ CSV 임포트 실패:", err);
  process.exitCode = 1;
});
