"use client";

/**
 * 홈 (F1) — 경로 입력. PRODUCT.md §5.1, ARCHITECTURE.md §10 Phase 9.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PlaceAutocompleteInput } from "@/components/place-autocomplete";
import { FuelSelect } from "@/components/fuel-select";
import { useSearchStore } from "@/store/search-store";
import { wgs84 } from "@/domain/types";
import { wgs84ToProjected, distanceM } from "@/domain/geo";
import { MIN_OD_GAP } from "@/domain/params";
import type { WirePoint } from "@/app/api/_lib/types";

function gapMeters(a: WirePoint, b: WirePoint): number {
  return distanceM(wgs84ToProjected(wgs84(a.lat, a.lng)), wgs84ToProjected(wgs84(b.lat, b.lng)));
}

export default function HomePage() {
  const router = useRouter();
  const origin = useSearchStore((s) => s.origin);
  const destination = useSearchStore((s) => s.destination);
  const fuel = useSearchStore((s) => s.fuel);
  const recentSearches = useSearchStore((s) => s.recentSearches);
  const setOrigin = useSearchStore((s) => s.setOrigin);
  const setDestination = useSearchStore((s) => s.setDestination);
  const setFuel = useSearchStore((s) => s.setFuel);

  const [isLocating, setIsLocating] = useState(false);
  const [geoUnavailable, setGeoUnavailable] = useState(false);

  const tooClose = useMemo(
    () => (origin && destination ? gapMeters(origin, destination) < MIN_OD_GAP : false),
    [origin, destination],
  );
  const canSearch = origin != null && destination != null && !tooClose;

  function useCurrentLocation() {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setGeoUnavailable(true); // 조용히 무시 — 에러 모달 없이 텍스트 입력 유도 (§5.1)
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude, name: "현재 위치" });
        setIsLocating(false);
      },
      () => {
        setGeoUnavailable(true);
        setIsLocating(false);
      },
      { timeout: 5_000 },
    );
  }

  function handleSearch() {
    if (!canSearch || !origin || !destination) return;
    useSearchStore.getState().addRecentSearch({ origin, destination, fuel });
    router.push("/result");
  }

  function applyRecent(entry: (typeof recentSearches)[number]) {
    setOrigin(entry.origin);
    setDestination(entry.destination);
    setFuel(entry.fuel);
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-8">
      <h1 className="text-xl font-semibold">오일로드</h1>
      <p className="text-sm text-muted-foreground">
        출발지부터 목적지까지의 경로를 고려해 가장 합리적인 주유소를 찾아드립니다.
      </p>

      <div className="flex flex-col gap-3">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <PlaceAutocompleteInput label="출발지" placeholder="출발지를 입력하세요" value={origin} onChange={setOrigin} />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isLocating}
            onClick={useCurrentLocation}
          >
            현재 위치
          </Button>
        </div>
        {geoUnavailable && (
          <p className="text-xs text-muted-foreground">위치 정보를 가져올 수 없어요. 출발지를 직접 입력해주세요.</p>
        )}

        <PlaceAutocompleteInput
          label="목적지"
          placeholder="목적지를 입력하세요"
          value={destination}
          onChange={setDestination}
        />

        {tooClose && (
          <p className="text-xs text-destructive">출발지와 목적지가 너무 가깝습니다. 다른 장소를 선택해주세요.</p>
        )}

        <FuelSelect value={fuel} onChange={setFuel} />
      </div>

      <Button type="button" size="lg" disabled={!canSearch} onClick={handleSearch}>
        찾기
      </Button>

      {recentSearches.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">최근 검색</h2>
          <ul className="flex flex-col gap-1">
            {recentSearches.map((entry, i) => (
              <li key={`${entry.origin.lat}-${entry.destination.lat}-${i}`}>
                <button
                  type="button"
                  className="w-full rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => applyRecent(entry)}
                >
                  {entry.origin.name ?? "출발지"} → {entry.destination.name ?? "목적지"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
