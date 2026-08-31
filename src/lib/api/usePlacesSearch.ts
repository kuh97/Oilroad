"use client";

/**
 * GET /api/places/search 소비 — F1 자동완성. PRODUCT.md §5.1.
 * 최소 길이·디바운스는 서버도 가드하지만(§4.1), 타이핑마다 요청이 나가는 걸
 * 막으려면 클라이언트에서도 같은 기준으로 걸러야 한다.
 */

import { useEffect, useState } from "react";
import { PLACE_DEBOUNCE_MS, PLACE_QUERY_MIN_LEN } from "@/domain/params";
import type { WirePlace } from "@/app/api/_lib/types";

export function usePlacesSearch(query: string) {
  const [places, setPlaces] = useState<WirePlace[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isTooShort = query.trim().length < PLACE_QUERY_MIN_LEN;

  useEffect(() => {
    if (isTooShort) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/places/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("장소를 찾을 수 없습니다.");
        const body = (await res.json()) as { places: WirePlace[] };
        setPlaces(body.places);
        setError(null);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("장소를 찾을 수 없습니다.");
      } finally {
        setIsLoading(false);
      }
    }, PLACE_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, isTooShort]);

  return { places: isTooShort ? [] : places, isLoading, error: isTooShort ? null : error };
}
