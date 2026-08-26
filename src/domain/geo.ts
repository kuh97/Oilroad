/**
 * 좌표 변환 · 거리 계산 · 폴리라인 샘플링 · 법선 오프셋
 *
 * 모든 거리 계산은 EPSG:5179 투영좌표(미터)에서 수행합니다.
 * 위경도(도 단위) 거리 계산 금지 — AGENTS.md §5 불변식 3.
 */

import proj4 from "proj4";
import { SAMPLE_INTERVAL } from "./params";
import type { WGS84Point, KatecPoint, ProjectedPoint } from "./types";
import { wgs84, katec, projected } from "./types";

// ─── proj4 CRS 정의 ──────────────────────────────────────────────────────────

const WGS84 = "EPSG:4326";

// 오피넷 KATEC (TM128) — towgs84 포함 (verify:coord 실측 확인)
proj4.defs(
  "KATEC",
  "+proj=tmerc +lat_0=38 +lon_0=128 +k=0.9999 +x_0=400000 +y_0=600000 +ellps=bessel +units=m +no_defs +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43",
);

// EPSG:5179 — 거리 계산 전용
proj4.defs(
  "EPSG:5179",
  "+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs",
);

// ─── 좌표 변환 ───────────────────────────────────────────────────────────────

export function katecToWgs84(p: KatecPoint): WGS84Point {
  const [lng, lat] = proj4("KATEC", WGS84, [p.x, p.y]);
  return wgs84(lat, lng);
}

export function wgs84ToKatec(p: WGS84Point): KatecPoint {
  const [x, y] = proj4(WGS84, "KATEC", [p.lng, p.lat]);
  return katec(x, y);
}

export function wgs84ToProjected(p: WGS84Point): ProjectedPoint {
  const [x, y] = proj4(WGS84, "EPSG:5179", [p.lng, p.lat]);
  return projected(x, y);
}

export function projectedToWgs84(p: ProjectedPoint): WGS84Point {
  const [lng, lat] = proj4("EPSG:5179", WGS84, [p.x, p.y]);
  return wgs84(lat, lng);
}

// ─── 투영 거리 계산 ──────────────────────────────────────────────────────────

/** 두 투영좌표 간 유클리드 거리 (m) */
export function distanceM(a: ProjectedPoint, b: ProjectedPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// ─── 점-선분 최단거리 (d_perp) ───────────────────────────────────────────────

/**
 * 점 p에서 선분 AB까지의 최단거리 (m).
 * 꼭짓점까지의 거리가 아니라 선분(유한 구간) 기준 — AGENTS.md §5 불변식 2.
 */
export function pointToSegmentDistanceM(
  p: ProjectedPoint,
  a: ProjectedPoint,
  b: ProjectedPoint,
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    // 선분이 점인 경우
    return distanceM(p, a);
  }

  // 정사영 t (0~1 클램프 → 선분 위의 가장 가까운 점)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  const closest = projected(a.x + t * dx, a.y + t * dy);
  return distanceM(p, closest);
}

/**
 * 점 p에서 폴리라인(투영좌표 배열)까지의 최단거리 (m).
 * 각 선분에 대한 최단거리의 최솟값 — AGENTS.md §5 불변식 2.
 */
export function pointToPolylineDistanceM(
  p: ProjectedPoint,
  polyline: ProjectedPoint[],
): number {
  if (polyline.length === 0) return Infinity;
  if (polyline.length === 1) return distanceM(p, polyline[0]);

  let minDist = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    const d = pointToSegmentDistanceM(p, polyline[i], polyline[i + 1]);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

// ─── 폴리라인 샘플링 ─────────────────────────────────────────────────────────

/**
 * WGS84 폴리라인을 EPSG:5179로 변환 후 SAMPLE_INTERVAL(m) 간격으로 샘플링.
 * 시작점·끝점은 항상 포함됩니다.
 *
 * @param polyline WGS84 좌표 배열
 * @param intervalM 샘플 간격 (m). 기본값 SAMPLE_INTERVAL
 */
export function samplePolyline(
  polyline: WGS84Point[],
  intervalM: number = SAMPLE_INTERVAL,
): ProjectedPoint[] {
  if (polyline.length === 0) return [];

  const pts = polyline.map(wgs84ToProjected);
  if (pts.length === 1) return [pts[0]];

  const samples: ProjectedPoint[] = [pts[0]];
  let accumulated = 0;

  for (let i = 0; i < pts.length - 1; i++) {
    const segLen = distanceM(pts[i], pts[i + 1]);
    accumulated += segLen;

    while (accumulated >= intervalM) {
      accumulated -= intervalM;
      // 선분 위 보간 위치
      const ratio = (segLen - accumulated) / segLen;
      const sx = pts[i].x + ratio * (pts[i + 1].x - pts[i].x);
      const sy = pts[i].y + ratio * (pts[i + 1].y - pts[i].y);
      samples.push(projected(sx, sy));
    }
  }

  // 끝점 추가 (중복 방지)
  const last = pts[pts.length - 1];
  const prev = samples[samples.length - 1];
  if (distanceM(prev, last) > 1) {
    samples.push(last);
  }

  return samples;
}

// ─── 법선 오프셋 (확장 수집) ─────────────────────────────────────────────────

/**
 * 폴리라인의 각 선분 방향에 수직인 오프셋 지점을 반환합니다.
 * 확장 수집(STEP 6)에서 T3 구간을 덮기 위해 사용합니다.
 *
 * @param polyline 투영좌표 폴리라인
 * @param offsetM 오프셋 거리 (m). 양수=오른쪽, 음수=왼쪽
 */
export function normalOffsets(
  polyline: ProjectedPoint[],
  offsetM: number,
): ProjectedPoint[] {
  if (polyline.length < 2) return [];

  const result: ProjectedPoint[] = [];
  for (let i = 0; i < polyline.length - 1; i++) {
    const dx = polyline[i + 1].x - polyline[i].x;
    const dy = polyline[i + 1].y - polyline[i].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) continue;

    // 법선 벡터 (오른쪽 방향)
    const nx = -dy / len;
    const ny = dx / len;

    // 선분 중점에서 오프셋
    const mx = (polyline[i].x + polyline[i + 1].x) / 2;
    const my = (polyline[i].y + polyline[i + 1].y) / 2;

    result.push(projected(mx + nx * offsetM, my + ny * offsetM));
  }
  return result;
}
