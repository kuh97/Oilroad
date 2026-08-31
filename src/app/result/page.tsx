"use client";

/**
 * 결과 목록 (F3·F4·F7) — PRODUCT.md §5.3, ARCHITECTURE.md §10 Phase 9.
 */

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LoadingProgress } from "@/components/result/loading-progress";
import { ExpansionBanner } from "@/components/result/expansion-banner";
import { ModeTabs } from "@/components/result/mode-tabs";
import { ResultCard } from "@/components/result/result-card";
import { CalcAssumptionsFooter } from "@/components/result/calc-assumptions-footer";
import { FilterSheet } from "@/components/result/filter-sheet";
import { useSearchStore } from "@/store/search-store";
import { useSearchStream, type SearchStreamInput } from "@/lib/api/useSearchStream";
import { recomputeAndSort } from "@/lib/recompute-candidates";
import { distanceMToKm, durationSToMin } from "@/domain/pricing";
import type { WireFilters, WireWarning } from "@/app/api/_lib/types";

function WarningBanner({ warning }: { warning: WireWarning }) {
  return (
    <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
      ⚠️ {warning.message}
    </p>
  );
}

export default function ResultPage() {
  const origin = useSearchStore((s) => s.origin);
  const destination = useSearchStore((s) => s.destination);
  const fuel = useSearchStore((s) => s.fuel);
  const filters = useSearchStore((s) => s.filters);
  const vehicle = useSearchStore((s) => s.vehicle);
  const mode = useSearchStore((s) => s.mode);
  const setFilters = useSearchStore((s) => s.setFilters);
  const setVehicle = useSearchStore((s) => s.setVehicle);
  const setMode = useSearchStore((s) => s.setMode);

  const isLoading = useSearchStore((s) => s.isLoading);
  const progressStep = useSearchStore((s) => s.progressStep);
  const progressStepsSeen = useSearchStore((s) => s.progressStepsSeen);
  const baseRoute = useSearchStore((s) => s.baseRoute);
  const partial = useSearchStore((s) => s.partial);
  const result = useSearchStore((s) => s.result);
  const streamWarnings = useSearchStore((s) => s.streamWarnings);
  const error = useSearchStore((s) => s.error);

  const { search } = useSearchStream();
  const searchKeyRef = useRef<string | null>(null);

  function runSearch(input: { origin: NonNullable<typeof origin>; destination: NonNullable<typeof destination> }) {
    const body: SearchStreamInput = {
      origin: input.origin,
      destination: input.destination,
      fuel,
      filters,
      vehicle: useSearchStore.getState().vehicle,
      mode: useSearchStore.getState().mode,
    };
    void search(body);
  }

  // 출발지·목적지·연료·필터가 바뀌면 다시 검색한다. vehicle·mode는 클라이언트 재계산만
  // 하므로 의도적으로 의존성에서 뺐다(§10 Phase 9 완료 기준 — API 재호출 0회).
  useEffect(() => {
    if (!origin || !destination) return;
    const key = JSON.stringify({ origin, destination, fuel, filters });
    if (searchKeyRef.current === key) return;
    searchKeyRef.current = key;
    runSearch({ origin, destination });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, destination, fuel, filters]);

  const referencePrice = result?.referencePrice ?? partial?.referencePrice ?? null;
  const expansion = result?.expansion ?? partial?.expansion ?? null;
  const now = new Date();

  const displayCandidates = useMemo(() => {
    const rawCandidates = result?.candidates ?? partial?.candidates ?? [];
    return recomputeAndSort(rawCandidates, vehicle, referencePrice, mode);
  }, [result, partial, vehicle, referencePrice, mode]);

  const hasActiveFilters =
    filters.facilities.length > 0 || filters.brands.length > 0 || filters.kpetroOnly;
  const defaultFilters: WireFilters = { facilities: [], brands: [], kpetroOnly: false };

  if (!origin || !destination) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">검색 컨텍스트가 없습니다. 홈에서 먼저 검색해주세요.</p>
        <Button render={<Link href="/" />}>홈으로</Button>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <div className="flex gap-2">
          <Button variant="outline" render={<Link href="/" />}>
            홈으로
          </Button>
          <Button onClick={() => { searchKeyRef.current = null; runSearch({ origin, destination }); }}>다시 시도</Button>
        </div>
      </main>
    );
  }

  const showFullScreenLoading = isLoading && !baseRoute && !partial && !result;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-6">
      <header className="flex flex-col gap-1">
        <Link href="/" className="text-sm text-muted-foreground">
          ← {origin.name ?? "출발지"} → {destination.name ?? "목적지"}
        </Link>
        {(result?.baseRoute ?? baseRoute) && (
          <p className="text-sm text-muted-foreground">
            기본 경로 {distanceMToKm((result?.baseRoute ?? baseRoute)!.distanceM)}km ·{" "}
            {durationSToMin((result?.baseRoute ?? baseRoute)!.durationS)}분
          </p>
        )}
      </header>

      {showFullScreenLoading ? (
        <LoadingProgress currentStep={progressStep} stepsSeen={progressStepsSeen} />
      ) : (
        <>
          {isLoading && <p className="text-xs text-muted-foreground">정밀 계산 중…</p>}
          {expansion && <ExpansionBanner expansion={expansion} />}
          {(result?.warnings ?? streamWarnings).map((w, i) => (
            <WarningBanner key={`${w.code}-${i}`} warning={w} />
          ))}

          <div className="flex items-center justify-between gap-2">
            <ModeTabs value={mode} onChange={setMode} />
            <FilterSheet filters={filters} onApply={setFilters} />
          </div>

          {displayCandidates.length === 0 && !isLoading ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              {hasActiveFilters ? (
                <>
                  <p className="text-sm text-muted-foreground">선택하신 필터 조건에 맞는 주유소가 없습니다.</p>
                  <Button variant="outline" onClick={() => setFilters(defaultFilters)}>
                    필터 초기화하고 다시 찾기
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">이 경로에서는 조건에 맞는 주유소를 찾지 못했습니다.</p>
                  <Button variant="outline" render={<Link href="/" />}>
                    다른 경로로 다시 찾기
                  </Button>
                </>
              )}
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {displayCandidates.map((c, i) => (
                <li key={c.id}>
                  <ResultCard rank={i + 1} candidate={c} hasReferencePrice={referencePrice != null} now={now} />
                </li>
              ))}
            </ul>
          )}

          {result && (
            <CalcAssumptionsFooter
              referencePrice={result.referencePrice}
              refPriceSource={result.refPriceSource}
              vehicle={vehicle}
              onChangeVehicle={setVehicle}
            />
          )}
        </>
      )}
    </main>
  );
}
