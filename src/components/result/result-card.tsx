"use client";

/**
 * 결과 카드 — PRODUCT.md §5.3 ④.
 * 가격 기준시각·오래된 정보 배지는 AGENTS.md §6 UI 불변식(제거 금지).
 */
import Link from "next/link";
import { TierBadge } from "./tier-badge";
import { distanceMToKm, durationSToMin } from "@/domain/pricing";
import { isPriceStale } from "@/domain/cache-ttl";
import { PRICE_STALE_HOURS } from "@/domain/params";
import type { WireCandidate } from "@/app/api/_lib/types";

const FACILITY_ICON: { key: keyof WireCandidate["facilities"]; icon: string; label: string }[] = [
  { key: "carWash", icon: "🚿", label: "세차" },
  { key: "maintenance", icon: "🔧", label: "경정비" },
  { key: "cvs", icon: "🏪", label: "편의점" },
];

function formatPriceTime(iso: string | null, now: Date): string {
  if (!iso) return "기준시각 정보 없음";
  const date = new Date(iso);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const stale = isPriceStale(date, now, PRICE_STALE_HOURS);
  return stale ? `${hh}:${mm} 기준 (오래된 정보)` : `${hh}:${mm} 기준`;
}

export function ResultCard({
  rank,
  candidate,
  hasReferencePrice,
  now,
}: {
  rank: number;
  candidate: WireCandidate;
  hasReferencePrice: boolean;
  now: Date;
}) {
  const priceTimeText = formatPriceTime(candidate.priceUpdatedAt, now);
  const isStale = candidate.priceUpdatedAt != null && isPriceStale(new Date(candidate.priceUpdatedAt), now, PRICE_STALE_HOURS);
  const activeFacilities = FACILITY_ICON.filter((f) => candidate.facilities[f.key]);

  return (
    <Link
      href={`/station/${candidate.id}`}
      className="block rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-muted-foreground">{rank}</span>
          <TierBadge tier={candidate.tier} />
          <span className="text-sm font-medium">{candidate.name}</span>
        </div>
      </div>

      <p className="mt-1 text-base font-semibold">{candidate.price.toLocaleString()}원/L</p>

      <p className="mt-1 text-sm text-muted-foreground">
        {candidate.detour.precise ? (
          <>
            +{durationSToMin(candidate.detour.durationS)}분 · +{distanceMToKm(candidate.detour.distanceM)}km 우회
          </>
        ) : (
          <>경로에서 약 {distanceMToKm(candidate.perpDistanceM)}km ▸</>
        )}
      </p>

      {hasReferencePrice && (
        <p className="mt-1 text-sm">
          {candidate.netSaving > 0 ? (
            <span className="text-primary">💡 {candidate.netSaving.toLocaleString()}원 이득</span>
          ) : (
            <span className="text-muted-foreground">지역 평균보다 {Math.abs(candidate.netSaving).toLocaleString()}원 비쌈</span>
          )}
        </p>
      )}

      {activeFacilities.length > 0 && (
        <p className="mt-1 flex gap-2 text-sm">
          {activeFacilities.map((f) => (
            <span key={f.key}>
              {f.icon} {f.label}
            </span>
          ))}
        </p>
      )}

      <div className="mt-2 flex items-center justify-between">
        <span className={`text-xs ${isStale ? "text-destructive" : "text-muted-foreground"}`}>{priceTimeText}</span>
        <span className="text-sm font-medium text-primary">상세 &gt;</span>
      </div>
    </Link>
  );
}
