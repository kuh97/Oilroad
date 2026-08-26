/**
 * 오피넷 HTTP 클라이언트.
 * 타임아웃 · 재시도 · 동시성 제한 — ARCHITECTURE.md §5.4
 *
 * 기본 수집: timeout 4s, retry 1회
 * 확장 수집: timeout 4s, retry 0회 (best-effort)
 */

import { env } from "@/infra/env";
import {
  OpinetRadiusResponseSchema,
  OpinetDetailResponseSchema,
  type OpinetRadiusItem,
  type OpinetDetailItem,
} from "./schema";
import type { KatecPoint } from "@/domain/types";
import { FUEL_TO_PRODCD } from "./mapper";
import type { Fuel } from "@/domain/types";

// ─── 동시성 제한 ──────────────────────────────────────────────────────────────

export interface Semaphore {
  run<T>(fn: () => Promise<T>): Promise<T>;
}

export function createSemaphore(limit: number): Semaphore {
  let running = 0;
  const queue: Array<() => void> = [];

  function next() {
    if (queue.length > 0 && running < limit) {
      running++;
      queue.shift()!();
    }
  }

  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      await new Promise<void>((resolve) => {
        if (running < limit) {
          running++;
          resolve();
        } else {
          queue.push(resolve);
        }
      });
      try {
        return await fn();
      } finally {
        running--;
        next();
      }
    },
  };
}

// 모듈 레벨 세마포어 — 기본값은 env에서 읽음. 테스트에서 교체 가능
let _semaphore: Semaphore | undefined;
export function getSemaphore(): Semaphore {
  if (!_semaphore) _semaphore = createSemaphore(env.OPINET_CONCURRENCY);
  return _semaphore;
}
export function setSemaphore(s: Semaphore) { _semaphore = s; }

// ─── fetch 유틸 ───────────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`오피넷 HTTP ${res.status}`);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(
  url: string,
  timeoutMs: number,
  retries: number,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchWithTimeout(url, timeoutMs);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

// ─── 공개 API ────────────────────────────────────────────────────────────────

const TIMEOUT_MS = 4_000;

export interface FetchRadiusOptions {
  center: KatecPoint;
  fuel: Fuel;
  certKey?: string;
  retries?: number;   // 기본 1. 확장 수집 호출 시 0으로 설정
}

/**
 * 반경 내 주유소 검색.
 * 반경은 오피넷 최대치(5000m) 고정.
 */
export async function fetchRadius(opts: FetchRadiusOptions): Promise<OpinetRadiusItem[]> {
  const certKey = opts.certKey ?? env.OPINET_CERT_KEY;
  const retries = opts.retries ?? 1;
  const prodcd = FUEL_TO_PRODCD[opts.fuel];

  const params = new URLSearchParams({
    certkey: certKey,
    out: "json",
    x: String(opts.center.x),
    y: String(opts.center.y),
    radius: "5000",
    prodcd,
    sort: "1",
  });

  const url = `${env.OPINET_BASE_URL}/aroundAll.do?${params}`;

  return getSemaphore().run(async () => {
    const res = await fetchWithRetry(url, TIMEOUT_MS, retries);
    const json = await res.json();
    const parsed = OpinetRadiusResponseSchema.safeParse(json);
    if (!parsed.success) throw new Error(`오피넷 반경검색 응답 파싱 실패: ${parsed.error.message}`);
    return parsed.data.RESULT.OIL;
  });
}

export interface FetchDetailOptions {
  uniId: string;
  certKey?: string;
  retries?: number;
}

/**
 * 주유소 상세정보 (Fallback C).
 * DB 마스터에 없는 신규 주유소 보강용.
 */
export async function fetchDetail(opts: FetchDetailOptions): Promise<OpinetDetailItem | null> {
  const certKey = opts.certKey ?? env.OPINET_CERT_KEY;
  const retries = opts.retries ?? 1;

  const params = new URLSearchParams({
    certkey: certKey,
    out: "json",
    id: opts.uniId,
  });

  const url = `${env.OPINET_BASE_URL}/detailById.do?${params}`;

  return getSemaphore().run(async () => {
    const res = await fetchWithRetry(url, TIMEOUT_MS, retries);
    const json = await res.json();
    const parsed = OpinetDetailResponseSchema.safeParse(json);
    if (!parsed.success) throw new Error(`오피넷 상세 응답 파싱 실패: ${parsed.error.message}`);
    return parsed.data.RESULT.OIL[0] ?? null;
  });
}
