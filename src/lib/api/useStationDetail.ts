"use client";

/**
 * GET /api/stations/:id 소비 — F8 상세 보강. ARCHITECTURE.md §6.4.
 */

import { useEffect, useState } from "react";
import type { WireStationSummary } from "@/app/api/_lib/types";

export interface ApiError {
  code: string;
  message: string;
}

export function useStationDetail(stationId: string | null) {
  const [station, setStation] = useState<WireStationSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (!stationId) return;
    const controller = new AbortController();

    async function run() {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/stations/${stationId}`, { signal: controller.signal });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as Partial<ApiError>;
          setError({ code: body.code ?? "NOT_FOUND", message: body.message ?? "주유소를 찾을 수 없습니다." });
          return;
        }
        setStation((await res.json()) as WireStationSummary);
        setError(null);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError({ code: "NETWORK_ERROR", message: "상세 정보를 불러오지 못했습니다." });
      } finally {
        setIsLoading(false);
      }
    }

    void run();
    return () => controller.abort();
  }, [stationId]);

  return { station, isLoading, error };
}
