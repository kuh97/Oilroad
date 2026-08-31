"use client";

/**
 * 상세 (F8·F9) — PRODUCT.md §5.4·§5.5, ARCHITECTURE.md §10 Phase 9.
 *
 * 검색 컨텍스트(스토어의 result)에서 후보를 찾아 보여준다. 딥링크 미설치
 * 폴백(폴백 타이머·스토어 이동)은 Phase 10 범위라 여기서는 스킴 링크만 연결한다.
 */

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { TierBadge } from "@/components/result/tier-badge";
import { RouteMap } from "@/components/route-map";
import { useSearchStore } from "@/store/search-store";
import { useDetour, type DetourResult } from "@/lib/api/useDetour";
import { recomputeAndSort, recomputeCandidate } from "@/lib/recompute-candidates";
import { distanceMToKm, durationSToMin } from "@/domain/pricing";
import { isPriceStale } from "@/domain/cache-ttl";
import { PRICE_STALE_HOURS } from "@/domain/params";
import { wgs84 } from "@/domain/types";
import { buildDeeplink, type NaviApp } from "@/domain/deeplink";
import type { NaviEvent } from "@/app/api/_lib/schema";

const NAVI_APPS: { app: NaviApp; label: string; appName?: string }[] = [
  { app: "KAKAO", label: "카카오맵" },
  { app: "NAVER", label: "네이버지도", appName: "oilroad" },
  { app: "TMAP", label: "티맵" },
];

function reportNaviClick(event: NaviEvent) {
  void fetch("/api/events/navi", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  }).catch(() => {});
}

export default function StationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <StationDetailView id={id} />;
}

/** 라우트 파라미터 언래핑과 실제 화면 로직을 분리 — 후자만 별도로 렌더 테스트한다. */
export function StationDetailView({ id }: { id: string }) {
  const origin = useSearchStore((s) => s.origin);
  const destination = useSearchStore((s) => s.destination);
  const result = useSearchStore((s) => s.result);
  const vehicle = useSearchStore((s) => s.vehicle);
  const mode = useSearchStore((s) => s.mode);

  const { fetchDetour } = useDetour();
  const [detour, setDetour] = useState<DetourResult | null>(null);

  const rawCandidate = result?.candidates.find((c) => c.id === id) ?? null;
  const candidate = rawCandidate
    ? recomputeCandidate(rawCandidate, vehicle, result?.referencePrice ?? null)
    : null;

  useEffect(() => {
    if (!candidate || !origin || !destination) return;
    let cancelled = false;

    async function run() {
      setDetour(null);
      const res = await fetchDetour({
        origin: origin!,
        destination: destination!,
        stationId: candidate!.id,
        vehicle,
        priceStation: candidate!.price,
        referencePrice: result?.referencePrice ?? candidate!.price,
      });
      if (!cancelled && res) setDetour(res);
    }

    void run();
    return () => {
      cancelled = true;
    };
    // candidate.id가 바뀔 때만 재요청 — vehicle 변경은 화면에서 이미 recompute로 반영됨
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate?.id, origin, destination]);

  if (!origin || !destination || !result || !candidate) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">검색 컨텍스트가 없습니다. 홈에서 먼저 검색해주세요.</p>
        <Button render={<Link href="/" />} nativeButton={false}>홈으로</Button>
      </main>
    );
  }

  const distanceM = detour?.distanceM ?? candidate.detour.distanceM;
  const durationS = detour?.durationS ?? candidate.detour.durationS;
  const netSavingValue = detour?.netSaving ?? candidate.netSaving;
  const precise = detour != null;
  const now = new Date();
  const isStale = candidate.priceUpdatedAt != null && isPriceStale(new Date(candidate.priceUpdatedAt), now, PRICE_STALE_HOURS);

  const rank = recomputeAndSort(result.candidates, vehicle, result.referencePrice, mode).findIndex((c) => c.id === id) + 1;
  const priceRankAmongAll =
    [...result.candidates].sort((a, b) => a.price - b.price).findIndex((c) => c.id === id) + 1;

  function handleNaviClick(app: NaviApp, appName?: string) {
    const href = buildDeeplink({
      app,
      origin: wgs84(origin!.lat, origin!.lng),
      destination: wgs84(destination!.lat, destination!.lng),
      waypoint: wgs84(candidate!.lat, candidate!.lng),
      originName: origin!.name,
      destinationName: destination!.name,
      waypointName: candidate!.name,
      appName,
    });
    reportNaviClick({
      searchId: result!.searchId,
      app,
      rank,
      tier: candidate!.tier,
      netSaving: netSavingValue,
      detourDistanceM: distanceM,
    });
    window.location.assign(href);
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-6">
      <header className="flex items-center justify-between">
        <Link href="/result" className="text-sm text-muted-foreground">
          ← {candidate.name}
        </Link>
        <TierBadge tier={candidate.tier} />
      </header>

      <RouteMap
        baseRoutePolyline={result.baseRoute.polyline}
        viaRoutePolyline={detour?.polyline}
        station={{ lat: candidate.lat, lng: candidate.lng }}
        origin={origin}
        destination={destination}
      />

      <section className="flex flex-col gap-1 rounded-lg border border-border p-3">
        <h2 className="text-sm font-semibold">💡 추천 이유</h2>
        <p className="text-sm">{candidate.reason}</p>
        <ul className="mt-1 flex flex-col gap-0.5 text-sm text-muted-foreground">
          <li>가격 — 이 경로 {result.candidates.length}곳 중 {priceRankAmongAll}번째로 저렴</li>
          <li>
            우회 — {!precise && "약 "}
            {distanceMToKm(distanceM)}km / {durationSToMin(durationS)}분
          </li>
          <li>순이득 — {netSavingValue > 0 ? `+${netSavingValue.toLocaleString()}원` : `${netSavingValue.toLocaleString()}원`}</li>
        </ul>
      </section>

      <section className="rounded-lg border border-border p-3">
        <h2 className="mb-1 text-sm font-semibold">가격</h2>
        <p className="text-base font-semibold">{candidate.price.toLocaleString()}원/L</p>
        <p className="text-sm text-muted-foreground">
          {vehicle.refuelAmount}L 주유 시 예상 {candidate.estimatedCost.toLocaleString()}원
        </p>
      </section>

      <section className="flex flex-col gap-1 rounded-lg border border-border p-3 text-sm">
        <div className="flex gap-2">
          {candidate.facilities.carWash && <span>🚿 세차</span>}
          {candidate.facilities.maintenance && <span>🔧 경정비</span>}
          {candidate.facilities.cvs && <span>🏪 편의점</span>}
        </div>
        <p className="text-muted-foreground">{candidate.brand}</p>
        <p className="text-muted-foreground">{candidate.address}</p>
        {candidate.tel && (
          <a href={`tel:${candidate.tel}`} className="text-primary underline">
            {candidate.tel} — 전화걸기
          </a>
        )}
      </section>

      <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
        ⚠️ 가격은 실제와 다를 수 있습니다.
        {candidate.tier === "T3" && " 먼 거리를 우회하므로 전화 확인을 권합니다."}
        {isStale && ` 가격 정보가 ${PRICE_STALE_HOURS}시간 이상 전 기준입니다.`}
      </p>

      <div className="flex flex-col gap-2">
        {NAVI_APPS.map(({ app, label, appName }) => (
          <Button key={app} variant="outline" onClick={() => handleNaviClick(app, appName)}>
            {label}
          </Button>
        ))}
        <p className="text-xs text-muted-foreground">티맵은 주유소까지만 안내됩니다. 주유 후 최종 목적지를 다시 입력해주세요.</p>
      </div>
    </main>
  );
}
