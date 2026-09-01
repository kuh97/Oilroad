"use client";

/**
 * 결과 카드 — PRODUCT.md §5.3 ④.
 * 가격 기준시각·오래된 정보 배지는 AGENTS.md §6 UI 불변식(제거 금지).
 */
import Link from "next/link";
import { ChevronRight, Droplets, PiggyBank, Store, Wrench } from "lucide-react";
import { TierBadge } from "./tier-badge";
import { distanceMToKm, durationSToMin } from "@/domain/pricing";
import { isPriceStale } from "@/domain/cache-ttl";
import { PRICE_STALE_HOURS } from "@/domain/params";
import type { WireCandidate } from "@/app/api/_lib/types";

const FACILITY_ICON: { key: keyof WireCandidate["facilities"]; Icon: typeof Droplets; label: string }[] = [
  { key: "carWash", Icon: Droplets, label: "세차" },
  { key: "maintenance", Icon: Wrench, label: "경정비" },
  { key: "cvs", Icon: Store, label: "편의점" },
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
      className="block rounded-xl border border-border bg-card p-3.5 shadow-[var(--shadow-sm)] transition-all hover:shadow-[var(--shadow-md)] active:scale-[0.98]"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-muted-foreground">{rank}</span>
          <TierBadge tier={candidate.tier} />
          <span className="text-sm font-medium">{candidate.name}</span>
        </div>
      </div>

      <p className="mt-1.5 text-xl font-bold tracking-tight">{candidate.price.toLocaleString()}원/L</p>

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
        <p className="mt-1 flex items-center gap-1 text-sm">
          {candidate.netSaving > 0 ? (
            <span className="flex items-center gap-1 font-medium text-success-foreground">
              <PiggyBank className="size-3.5" aria-hidden />
              {candidate.netSaving.toLocaleString()}원 이득
            </span>
          ) : (
            <span className="text-muted-foreground">지역 평균보다 {Math.abs(candidate.netSaving).toLocaleString()}원 비쌈</span>
          )}
        </p>
      )}

      {activeFacilities.length > 0 && (
        <p className="mt-1.5 flex gap-3 text-sm text-muted-foreground">
          {activeFacilities.map(({ key, Icon, label }) => (
            <span key={key} className="flex items-center gap-1">
              <Icon className="size-3.5" aria-hidden />
              {label}
            </span>
          ))}
        </p>
      )}

      <div className="mt-2.5 flex items-center justify-between border-t border-border pt-2">
        <span className={`text-xs ${isStale ? "text-destructive" : "text-muted-foreground"}`}>{priceTimeText}</span>
        <span className="flex items-center gap-0.5 text-sm font-medium text-primary">
          상세
          <ChevronRight className="size-3.5" aria-hidden />
        </span>
      </div>
    </Link>
  );
}
