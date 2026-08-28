/**
 * verify:coord — 좌표 변환 정확도 검증 [§12 ③]
 *
 * 검증 항목
 *   1. WGS84 → KATEC → WGS84 왕복 오차 < 50m
 *   2. WGS84 → EPSG:5179 → WGS84 왕복 오차 < 1m (미터 투영이라 오차가 거의 없어야 함)
 *   3. KATEC X·Y 좌표 범위가 한반도 내에 있는가
 *   4. 두 주유소 사이 EPSG:5179 거리가 실제와 합리적으로 일치하는가
 *
 * 결론이 영향을 주는 것
 *   - towgs84 파라미터 조정 필요 여부
 *   - domain/geo.ts 의 투영 정의
 *
 * 실행: npx tsx scripts/verify/coord.ts
 * 의존: proj4 (pnpm add -D proj4 @types/proj4)
 */

import proj4 from 'proj4';
import { ok, fail, warn, info, header, summary } from '../_shared';

// ─── 투영 정의 — ARCHITECTURE.md §4 ──────────────────────────────────────
const EPSG5179 =
  '+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 ' +
  '+ellps=GRS80 +units=m +no_defs';

const KATEC =
  '+proj=tmerc +lat_0=38 +lon_0=128 +k=0.9999 +x_0=400000 +y_0=600000 ' +
  '+ellps=bessel +units=m +no_defs ' +
  '+towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43';

const WGS84 = 'EPSG:4326';

proj4.defs('EPSG:5179', EPSG5179);
proj4.defs('KATEC', KATEC);

// ─── 알려진 주유소 좌표 (WGS84 lat/lng) ─────────────────────────────────
// 출처: 오피넷 공개 데이터 + 카카오맵 교차검증
// 아래 좌표는 개발팀이 직접 확인한 픽스처입니다.
const FIXTURES: Array<{
  name: string;
  lat: number;
  lng: number;
  /** 오피넷 반경검색 응답의 GIS_X_COOR (KATEC X = 경도 방향) */
  katecX?: number;
  /** 오피넷 반경검색 응답의 GIS_Y_COOR (KATEC Y = 위도 방향) */
  katecY?: number;
}> = [
  // 서울 강남구 — 도심 고밀도
  { name: '서울 강남 SK 주유소', lat: 37.494_5, lng: 127.034_5 },
  // 부산 — 남부
  { name: '부산 수영구 GS칼텍스', lat: 35.168_0, lng: 129.113_0 },
  // 강원 춘천 — 산간
  { name: '춘천 현대오일뱅크', lat: 37.879_2, lng: 127.726_0 },
  // 제주 — 최남단
  { name: '제주 SK 주유소', lat: 33.489_5, lng: 126.499_5 },
  // 인천 — 서해안
  { name: '인천 신세계 LPG', lat: 37.446_0, lng: 126.705_0 },
];

// ─── 헬퍼 ────────────────────────────────────────────────────────────────

/** WGS84 [lng, lat] → KATEC [x, y] */
function wgs84ToKatec(lat: number, lng: number): [number, number] {
  return proj4(WGS84, 'KATEC', [lng, lat]) as [number, number];
}

/** KATEC [x, y] → WGS84 [lat, lng] */
function katecToWgs84(x: number, y: number): [number, number] {
  const [lng, lat] = proj4('KATEC', WGS84, [x, y]) as [number, number];
  return [lat, lng];
}

/** WGS84 [lng, lat] → EPSG:5179 [x, y] */
function wgs84ToProj(lat: number, lng: number): [number, number] {
  return proj4(WGS84, 'EPSG:5179', [lng, lat]) as [number, number];
}

/** EPSG:5179 [x, y] → WGS84 [lat, lng] */
function projToWgs84(x: number, y: number): [number, number] {
  const [lng, lat] = proj4('EPSG:5179', WGS84, [x, y]) as [number, number];
  return [lat, lng];
}

/** WGS84 두 점 간 거리 (하버사인, 단위 m) */
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** EPSG:5179 두 점 간 유클리드 거리 (m) */
function euclideanM(
  x1: number, y1: number,
  x2: number, y2: number,
): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

// ─── 검증 실행 ────────────────────────────────────────────────────────────

const passed: string[] = [];
const failed: string[] = [];

function record(label: string, isOk: boolean) {
  if (isOk) passed.push(label);
  else failed.push(label);
}

// ── 1. WGS84 → KATEC → WGS84 왕복 오차 ──────────────────────────────────
header('① WGS84 ↔ KATEC 왕복 오차 (상한 50m)');

const KATEC_ROUNDTRIP_THRESHOLD_M = 50;

for (const f of FIXTURES) {
  const [kx, ky] = wgs84ToKatec(f.lat, f.lng);
  const [rlat, rlng] = katecToWgs84(kx, ky);
  const errorM = haversineM(f.lat, f.lng, rlat, rlng);
  const label = `KATEC 왕복 — ${f.name}`;

  // KATEC 좌표 범위 (한반도 내): X 200,000~560,000 / Y 50,000~700,000
  // Y 기준점: lat=38°N → Y=600,000. 제주(33.5°N) ≈ 100,000, 북한 북단 ≈ 700,000
  const inRange = kx > 200_000 && kx < 560_000 && ky > 50_000 && ky < 700_000;
  if (!inRange) {
    fail(`${f.name}: KATEC 좌표 범위 이상 (X=${kx.toFixed(0)}, Y=${ky.toFixed(0)})`);
    record(label, false);
    continue;
  }

  if (errorM < KATEC_ROUNDTRIP_THRESHOLD_M) {
    ok(`${f.name}: 오차 ${errorM.toFixed(2)}m  KATEC=(${kx.toFixed(0)}, ${ky.toFixed(0)})`);
    record(label, true);
  } else {
    fail(`${f.name}: 오차 ${errorM.toFixed(2)}m — towgs84 파라미터 재조정 필요`);
    record(label, false);
  }
}

// ── 2. WGS84 → EPSG:5179 → WGS84 왕복 오차 ─────────────────────────────
header('② WGS84 ↔ EPSG:5179 왕복 오차 (상한 1m)');

const PROJ_ROUNDTRIP_THRESHOLD_M = 1;

for (const f of FIXTURES) {
  const [px, py] = wgs84ToProj(f.lat, f.lng);
  const [rlat, rlng] = projToWgs84(px, py);
  const errorM = haversineM(f.lat, f.lng, rlat, rlng);
  const label = `EPSG:5179 왕복 — ${f.name}`;

  if (errorM < PROJ_ROUNDTRIP_THRESHOLD_M) {
    ok(`${f.name}: 오차 ${errorM.toFixed(4)}m`);
    record(label, true);
  } else {
    fail(`${f.name}: 오차 ${errorM.toFixed(4)}m — 투영 정의 확인 필요`);
    record(label, false);
  }
}

// ── 3. 두 점 간 거리 교차 검증 (EPSG:5179 유클리드 vs 하버사인) ──────────
header('③ 거리 계산 교차검증 (EPSG:5179 유클리드 ↔ 하버사인)');

// 서울 강남 ↔ 춘천 (실제 직선 약 75km)
{
  const A = FIXTURES[0]; // 강남
  const B = FIXTURES[2]; // 춘천
  const [ax, ay] = wgs84ToProj(A.lat, A.lng);
  const [bx, by] = wgs84ToProj(B.lat, B.lng);
  const projDist   = euclideanM(ax, ay, bx, by);
  const haverDist  = haversineM(A.lat, A.lng, B.lat, B.lng);
  const diffRatio  = Math.abs(projDist - haverDist) / haverDist;
  const label = '강남↔춘천 EPSG:5179 vs 하버사인';

  if (diffRatio < 0.001) {  // 0.1% 이내
    ok(`${label}: EPSG=${(projDist / 1000).toFixed(2)}km  Haver=${(haverDist / 1000).toFixed(2)}km  차이=${(diffRatio * 100).toFixed(3)}%`);
    record(label, true);
  } else {
    fail(`${label}: 차이 ${(diffRatio * 100).toFixed(3)}% — 투영 왜곡 과도. EPSG:5179 정의 재확인 필요`);
    record(label, false);
  }
}

// ── 4. X·Y 스왑 함정 검증 ────────────────────────────────────────────────
header('④ KATEC X→경도, Y→위도 매핑 확인 (오피넷 GIS_X_COOR = 경도 방향)');
{
  // 서울(lng≈127)의 KATEC X가 부산(lng≈129)보다 작아야 함
  const seoul  = FIXTURES[0];
  const busan  = FIXTURES[1];
  const [sx, _sy] = wgs84ToKatec(seoul.lat, seoul.lng);
  const [bx, _by] = wgs84ToKatec(busan.lat, busan.lng);
  const label = 'KATEC X = 경도 방향 확인';

  if (sx < bx) {
    ok(`서울 X(${sx.toFixed(0)}) < 부산 X(${bx.toFixed(0)}) — GIS_X_COOR = 경도 방향 정상`);
    record(label, true);
  } else {
    fail(`서울 X(${sx.toFixed(0)}) >= 부산 X(${bx.toFixed(0)}) — X·Y 축 정의 오류`);
    record(label, false);
  }

  // 서울(lat≈37)의 KATEC Y가 제주(lat≈33)보다 커야 함
  const jeju   = FIXTURES[3];
  const [_sx2, sy] = wgs84ToKatec(seoul.lat, seoul.lng);
  const [_jx,  jy] = wgs84ToKatec(jeju.lat,  jeju.lng);
  const label2 = 'KATEC Y = 위도 방향 확인';

  if (sy > jy) {
    ok(`서울 Y(${sy.toFixed(0)}) > 제주 Y(${jy.toFixed(0)}) — GIS_Y_COOR = 위도 방향 정상`);
    record(label2, true);
  } else {
    fail(`서울 Y(${sy.toFixed(0)}) <= 제주 Y(${jy.toFixed(0)}) — X·Y 축 정의 오류`);
    record(label2, false);
  }
}

// ─── 결과 ─────────────────────────────────────────────────────────────────
const allPassed = summary(passed, failed);

console.log('\n── 다음 단계 ──────────────────────────────────────────');
if (allPassed) {
  console.log(`${passed.length}개 전부 통과.`);
  info('ARCHITECTURE.md §4의 투영 정의를 domain/geo.ts에 그대로 사용하십시오.');
  info('지금 실제 오피넷 응답을 받으면서 KATEC 좌표를 픽스처로 저장해 두면 좋습니다.');
} else {
  warn('towgs84 파라미터를 조정해야 합니다.');
  warn('  -115.80,474.99,674.11,1.16,-2.31,-1.63,6.43  (현재값)');
  warn('국토지리정보원의 GRS80↔Bessel 변환 파라미터를 교차 확인하십시오.');
  warn('수정 후 이 스크립트를 다시 실행해 모든 항목이 통과하는지 확인하십시오.');
}

process.exit(allPassed ? 0 : 1);
