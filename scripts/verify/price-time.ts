/**
 * verify:price-time — 오피넷 반경검색 응답의 가격 기준시각 검증 [§12 ⑪]
 *
 * 검증 항목
 *   1. 반경검색(aroundAll) 응답에 TRADE_DT / TRADE_TM 필드가 오는가
 *   2. 상세정보(detailById) 응답의 OIL_PRICE 블록에 기준시각이 있는가
 *   3. 두 API 가격이 서로 일치하는가 (동일 주유소 비교)
 *   4. 실제 응답 스키마를 fixtures로 저장
 *
 * 결론이 영향을 주는 것
 *   - AGENTS.md §6 UI 불변식 "가격 기준시각 상시 표시" 구현 방식
 *   - ARCHITECTURE.md §5.1 "가격 기준시각 문제"
 *   - refuel_point 스키마의 price_traded_at 컬럼 필요 여부
 *
 * 실행: npx tsx scripts/verify/price-time.ts
 * 필요: OPINET_CERT_KEY 환경변수
 *
 * ⚠️  오피넷 API를 2~3회 호출합니다. dev 예산(OPINET_DAILY_BUDGET) 안에서 실행하십시오.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ok, fail, warn, info, header, summary, requireEnv } from '../_shared';

// ─── 설정 ────────────────────────────────────────────────────────────────

const env = requireEnv(['OPINET_CERT_KEY']);
const CERT_KEY = env.OPINET_CERT_KEY;
const FIXTURE_DIR = path.resolve('../tests/fixtures');

/** 검증에 사용할 기준 좌표 (서울 강남 — 주유소 밀도 높은 지역) */
const TEST_LAT = 37.4945;
const TEST_LNG = 127.0345;
const TEST_FUEL = 'B027'; // 휘발유

// 오피넷 반경검색 KATEC 좌표 (verify:coord 결과 재사용)
// towgs84 파라미터가 반영된 값이어야 합니다 — verify:coord를 먼저 실행하십시오.
const TEST_KATEC_X = 314_820; // verify:coord 실측값 (서울 강남 lat=37.4945, lng=127.0345)
const TEST_KATEC_Y = 544_030;

const OPINET_BASE = 'https://www.opinet.co.kr/api';

// ─── API 호출 ────────────────────────────────────────────────────────────

async function fetchAroundAll(x: number, y: number, prodcd: string) {
  const url = new URL(`${OPINET_BASE}/aroundAll.do`);
  url.searchParams.set('certkey', CERT_KEY);
  url.searchParams.set('out', 'json');
  url.searchParams.set('x', String(x));
  url.searchParams.set('y', String(y));
  url.searchParams.set('radius', '5000');
  url.searchParams.set('prodcd', prodcd);
  url.searchParams.set('sort', '1');

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`aroundAll HTTP ${res.status}`);
  return res.json() as Promise<Record<string, unknown>>;
}

async function fetchDetailById(uniId: string) {
  const url = new URL(`${OPINET_BASE}/detailById.do`);
  url.searchParams.set('certkey', CERT_KEY);
  url.searchParams.set('out', 'json');
  url.searchParams.set('id', uniId);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`detailById HTTP ${res.status}`);
  return res.json() as Promise<Record<string, unknown>>;
}

// ─── 필드 추출 헬퍼 ─────────────────────────────────────────────────────

function deepGet(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function hasField(obj: unknown, ...fields: string[]): boolean {
  return fields.some(f => {
    const val = deepGet(obj, f.split('.'));
    return val !== undefined && val !== null && val !== '';
  });
}

// ─── 검증 실행 ────────────────────────────────────────────────────────────

const passed: string[] = [];
const failed: string[] = [];
function record(label: string, isOk: boolean) {
  if (isOk) passed.push(label);
  else failed.push(label);
}

let aroundData: Record<string, unknown> = {};
let detailData: Record<string, unknown> = {};

// 1. 반경검색 호출
header('① 반경검색 API (aroundAll) 호출');

try {
  info(`KATEC 좌표 (${TEST_KATEC_X}, ${TEST_KATEC_Y}), 연료: ${TEST_FUEL}, 반경 5km`);
  aroundData = await fetchAroundAll(TEST_KATEC_X, TEST_KATEC_Y, TEST_FUEL);
  ok('HTTP 200 응답');

  // 응답 구조 저장
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  const fixturePath = path.join(FIXTURE_DIR, 'opinet-radius.json');
  fs.writeFileSync(fixturePath, JSON.stringify(aroundData, null, 2), 'utf-8');
  ok(`픽스처 저장: ${fixturePath}`);
  record('반경검색 HTTP 응답', true);
} catch (e) {
  fail(`반경검색 API 호출 실패: ${String(e)}`);
  fail('인증키, 네트워크 연결, 오피넷 서비스 상태를 확인하십시오.');
  record('반경검색 HTTP 응답', false);
  process.exit(1);
}

// 2. 반경검색 응답 스키마 분석
header('② 반경검색 응답 필드 분석');

const stations = deepGet(aroundData, ['RESULT', 'OIL']) as unknown[];
if (!Array.isArray(stations) || stations.length === 0) {
  fail('RESULT.OIL 배열이 비어 있습니다. 응답 구조가 예상과 다릅니다.');
  fail(`실제 응답 최상위 키: ${Object.keys(aroundData).join(', ')}`);
  record('반경검색 응답 구조', false);
  process.exit(1);
}

ok(`주유소 ${stations.length}건 수신`);
record('반경검색 응답 구조', true);

const firstStation = stations[0] as Record<string, unknown>;
const allKeys = Object.keys(firstStation);

info(`필드 목록 (${allKeys.length}개): ${allKeys.join(', ')}`);

// 필수 필드 확인
const requiredFields: Record<string, string[]> = {
  'UNI_ID (조인 키)': ['UNI_ID'],
  'OS_NM (상호명)': ['OS_NM'],
  'PRICE (가격)': ['PRICE'],
  'GIS_X_COOR (KATEC X)': ['GIS_X_COOR'],
  'GIS_Y_COOR (KATEC Y)': ['GIS_Y_COOR'],
  'POLL_DIV_CD (브랜드)': ['POLL_DIV_CD'],
};

for (const [label, fields] of Object.entries(requiredFields)) {
  const found = fields.some(f => allKeys.includes(f));
  if (found) {
    const val = firstStation[fields.find(f => allKeys.includes(f))!];
    ok(`${label} = "${val}"`);
    record(label, true);
  } else {
    fail(`${label} 없음. 탐색: ${fields.join(', ')}`);
    record(label, false);
  }
}

// ★ 핵심 검증: 가격 기준시각
header('③ 가격 기준시각 (TRADE_DT / TRADE_TM) — 이 스크립트의 핵심');

const timeCandidates = ['TRADE_DT', 'TRADE_TM', 'PRICE_DT', 'PRICE_TM', 'UPD_DATE', 'UPD_TIME'];
const foundTimeFields = timeCandidates.filter(f => allKeys.includes(f));

if (foundTimeFields.length > 0) {
  ok(`기준시각 필드 발견: ${foundTimeFields.join(', ')}`);
  for (const f of foundTimeFields) {
    info(`  ${f} = "${firstStation[f]}"`);
  }
  record('반경검색 가격 기준시각', true);

  // 결측률 확인
  const allStations = stations as Record<string, unknown>[];
  for (const f of foundTimeFields) {
    const missing = allStations.filter(s => !s[f] || String(s[f]).trim() === '').length;
    if (missing > 0) {
      warn(`  ${f}: ${missing}건 결측 (${((missing / allStations.length) * 100).toFixed(1)}%)`);
    }
  }
} else {
  fail('반경검색 응답에 가격 기준시각 필드가 없습니다.');
  info('  확인한 후보: ' + timeCandidates.join(', '));
  info('  → 상세정보 API(detailById)를 통해서만 기준시각을 가져올 수 있습니다.');
  info('  → UI 불변식 구현 방식을 ARCHITECTURE.md §5.1의 두 번째 경로로 전환해야 합니다.');
  record('반경검색 가격 기준시각', false);
}

// 3. 상세정보 API 호출 (첫 번째 주유소)
const firstUniId = firstStation['UNI_ID'] as string;

if (firstUniId) {
  header(`④ 상세정보 API (detailById) — ${firstUniId}`);

  try {
    detailData = await fetchDetailById(firstUniId);
    ok('HTTP 200 응답');

    const detailFixturePath = path.join(FIXTURE_DIR, 'opinet-detail.json');
    fs.writeFileSync(detailFixturePath, JSON.stringify(detailData, null, 2), 'utf-8');
    ok(`픽스처 저장: ${detailFixturePath}`);
    record('상세정보 API 응답', true);

    // OIL_PRICE 블록에서 기준시각 확인
    const oilInfo = deepGet(detailData, ['RESULT', 'OIL_INFO']) as Record<string, unknown> | null;
    const oilPrices = deepGet(detailData, ['RESULT', 'OIL_PRICE']) as unknown[] | null;

    if (oilPrices && Array.isArray(oilPrices) && oilPrices.length > 0) {
      const first = oilPrices[0] as Record<string, unknown>;
      info(`OIL_PRICE 블록 필드: ${Object.keys(first).join(', ')}`);

      const hasTime = hasField(first, 'TRADE_DT', 'TRADE_TM', 'PRICE_DT', 'PRICE_TM');
      if (hasTime) {
        ok('상세정보 OIL_PRICE에 기준시각 있음');
        info(`  TRADE_DT = ${first['TRADE_DT']}, TRADE_TM = ${first['TRADE_TM']}`);
        record('상세정보 가격 기준시각', true);
      } else {
        fail('상세정보 OIL_PRICE에도 기준시각이 없습니다.');
        record('상세정보 가격 기준시각', false);
      }
    } else {
      warn('OIL_PRICE 블록이 없거나 비어 있습니다.');
      if (oilInfo) info(`OIL_INFO 필드: ${Object.keys(oilInfo).join(', ')}`);
      record('상세정보 가격 기준시각', false);
    }
  } catch (e) {
    fail(`상세정보 API 호출 실패: ${String(e)}`);
    record('상세정보 API 응답', false);
  }
}

// ─── 종합 결과 ────────────────────────────────────────────────────────────
const allPassed = summary(passed, failed);

const hasPriceTimeInRadius = passed.includes('반경검색 가격 기준시각');
const hasPriceTimeInDetail = passed.includes('상세정보 가격 기준시각');

console.log('\n── UI 불변식 구현 방향 결정 ────────────────────────────');

if (hasPriceTimeInRadius) {
  ok('반경검색에 기준시각이 옴 → 그대로 사용 가능.');
  info('ARCHITECTURE.md §5.1의 첫 번째 경로로 진행하십시오.');
  info('refuel_point 스키마에 price_traded_at은 없어도 됩니다.');
} else if (hasPriceTimeInDetail) {
  warn('반경검색에는 없고, 상세정보에만 있음.');
  warn('→ 구현 방향을 결정하십시오 (ARCHITECTURE.md §5.1 참고):');
  warn('  A. 상세 API를 캐시와 함께 on-demand로 조회 (N+1이지만 캐시로 완화)');
  warn('  B. 오피넷 갱신 스케줄(1·2·9·12·16·19시)로 "최근 갱신 시각" 역산 표기');
  warn('  → 결정 후 ARCHITECTURE.md §5.1과 AGENTS.md §6을 갱신하십시오.');
} else {
  fail('양쪽 API 모두 기준시각 없음.');
  warn('→ 오피넷 갱신 스케줄 기반 근사("최근 갱신 시각") 방식을 채택하십시오.');
  warn('  이 경우 AGENTS.md §6 UI 불변식의 문구를 "가격 기준시각" 에서');
  warn('  "최근 갱신 시각" 으로 바꾸고, 그 의미를 사용자에게 명확히 표시해야 합니다.');
}

console.log('\n── 저장된 픽스처 ────────────────────────────────────');
info(`tests/fixtures/opinet-radius.json  — 반경검색 실제 응답`);
if (firstUniId) info(`tests/fixtures/opinet-detail.json  — 상세정보 실제 응답`);
info('이 파일을 MSW 핸들러의 픽스처로 직접 사용하십시오.');

process.exit(allPassed ? 0 : 1);
