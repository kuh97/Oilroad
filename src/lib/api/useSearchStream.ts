"use client";

/**
 * POST /api/search 소비 — ARCHITECTURE.md §6.2·§6.2.1, PRODUCT.md §10.2·§10.3.
 *
 * SSE 첫 프레임이 SSE_FIRST_EVENT_TIMEOUT_MS 안에 안 오면(인앱 브라우저 버퍼링)
 * 스트림을 끊고 JSON 폴백으로 1회 재시도합니다. 폴백 중에는 진행 문구를 시간 기반으로
 * 순환시키되 `EXPAND`(범위를 넓히는 중)는 절대 보여주지 않습니다 — 확장 여부를 모르는
 * 채로 그 문구를 띄우면 "근거 없는 표시"가 됩니다.
 *
 * `EventSource`를 쓰지 않습니다 — 자동 재연결이 곧 파이프라인 재실행이라
 * 오피넷 예산을 조용히 잠식하기 때문입니다(§6.2). fetch + ReadableStream을 직접 읽습니다.
 */

import { useCallback, useEffect, useRef } from "react";
import { useSearchStore, type ProgressStep } from "@/store/search-store";
import { parseSseFrames } from "./sse-client";
import type {
  Fuel,
  Mode,
  WireFilters,
  WireVehicle,
  WirePoint,
  WireBaseRoute,
  WireSearchResult,
  WirePartial,
  WireWarning,
} from "@/app/api/_lib/types";

const SSE_FIRST_EVENT_TIMEOUT_MS = 3_000;
/** JSON 폴백일 때 시간 기반으로 순환시키는 문구 — EXPAND 제외 (§6.2.1) */
const FALLBACK_STEP_CYCLE: ProgressStep[] = ["ROUTE", "COLLECT", "PRECISE"];
const FALLBACK_STEP_INTERVAL_MS = 2_500;

export interface SearchStreamInput {
  origin: WirePoint;
  destination: WirePoint;
  fuel: Fuel;
  filters: WireFilters;
  vehicle: WireVehicle;
  mode: Mode;
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

async function readErrorBody(res: Response): Promise<{ code: string; message: string }> {
  try {
    const body = (await res.json()) as { code?: string; message?: string };
    return { code: body.code ?? "INTERNAL_ERROR", message: body.message ?? "검색 중 오류가 발생했습니다." };
  } catch {
    return { code: "INTERNAL_ERROR", message: "검색 중 오류가 발생했습니다." };
  }
}

/** 같은 서비스, 다른 출구(§6.2.1) — 서버 로직과 대칭되는 클라이언트 쪽 두 경로. */
export function useSearchStream() {
  const startSearch = useSearchStore((s) => s.startSearch);
  const setProgressStep = useSearchStore((s) => s.setProgressStep);
  const setBaseRoute = useSearchStore((s) => s.setBaseRoute);
  const setPartial = useSearchStore((s) => s.setPartial);
  const pushWarning = useSearchStore((s) => s.pushWarning);
  const setResult = useSearchStore((s) => s.setResult);
  const setError = useSearchStore((s) => s.setError);

  const abortRef = useRef<AbortController | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopFallbackCycle = useCallback(() => {
    if (fallbackTimerRef.current != null) {
      clearInterval(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  }, []);

  useEffect(() => stopFallbackCycle, [stopFallbackCycle]);

  const runJsonFallback = useCallback(
    async (body: SearchStreamInput, signal: AbortSignal) => {
      let i = 0;
      setProgressStep(FALLBACK_STEP_CYCLE[0]);
      fallbackTimerRef.current = setInterval(() => {
        i = (i + 1) % FALLBACK_STEP_CYCLE.length;
        setProgressStep(FALLBACK_STEP_CYCLE[i]);
      }, FALLBACK_STEP_INTERVAL_MS);

      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(body),
          signal,
        });
        if (!res.ok) {
          setError(await readErrorBody(res));
          return;
        }
        const result = (await res.json()) as WireSearchResult;
        setResult(result);
      } catch (err) {
        if (isAbortError(err)) return;
        setError({ code: "NETWORK_ERROR", message: "검색 중 문제가 발생했습니다." });
      } finally {
        stopFallbackCycle();
      }
    },
    [setProgressStep, setResult, setError, stopFallbackCycle],
  );

  const search = useCallback(
    async (body: SearchStreamInput) => {
      abortRef.current?.abort();
      stopFallbackCycle();
      const controller = new AbortController();
      abortRef.current = controller;

      startSearch();

      let gotFirstByte = false;
      let lastBaseRoute: WireBaseRoute | null = null;
      let lastPartial: WirePartial | null = null;
      let finished = false;

      const firstByteTimeout = setTimeout(() => {
        if (!gotFirstByte) controller.abort();
      }, SSE_FIRST_EVENT_TIMEOUT_MS);

      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok) {
          gotFirstByte = true;
          setError(await readErrorBody(res));
          return;
        }
        if (!res.body) throw new Error("스트림 응답에 body가 없습니다.");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          gotFirstByte = true;
          clearTimeout(firstByteTimeout);

          buffer += decoder.decode(value, { stream: true });
          const { frames, rest } = parseSseFrames(buffer);
          buffer = rest;

          for (const frame of frames) {
            switch (frame.event) {
              case "progress":
                setProgressStep((frame.data as { step: ProgressStep }).step);
                break;
              case "base_route":
                lastBaseRoute = frame.data as WireBaseRoute;
                setBaseRoute(lastBaseRoute);
                break;
              case "partial":
                lastPartial = frame.data as WirePartial;
                setPartial(lastPartial);
                break;
              case "warning":
                pushWarning(frame.data as WireWarning);
                break;
              case "result":
                setResult(frame.data as WireSearchResult);
                finished = true;
                break;
              case "error":
                setError(frame.data as { code: string; message: string });
                finished = true;
                break;
            }
          }
        }

        // 스트림이 result/error 없이 끊김 — 마지막 partial로 마무리 (§10.2)
        if (!finished) {
          if (lastPartial && lastBaseRoute) {
            setResult({
              searchId: crypto.randomUUID(),
              baseRoute: lastBaseRoute,
              candidates: lastPartial.candidates,
              referencePrice: lastPartial.referencePrice,
              refPriceSource: lastPartial.refPriceSource,
              expansion: lastPartial.expansion,
              warnings: [{ code: "TIMEOUT", message: "일부 계산이 완료되지 않았습니다." }],
            });
          } else {
            setError({ code: "TIMEOUT", message: "일부 계산이 완료되지 않았습니다." });
          }
        }
      } catch (err) {
        if (controller.signal.aborted && !gotFirstByte) {
          await runJsonFallback(body, controller.signal);
        } else if (!isAbortError(err)) {
          setError({ code: "NETWORK_ERROR", message: "검색 중 문제가 발생했습니다." });
        }
      } finally {
        clearTimeout(firstByteTimeout);
      }
    },
    [
      startSearch,
      setProgressStep,
      setBaseRoute,
      setPartial,
      pushWarning,
      setResult,
      setError,
      runJsonFallback,
      stopFallbackCycle,
    ],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    stopFallbackCycle();
  }, [stopFallbackCycle]);

  return { search, cancel };
}
