/** 탐색 티어 배지 — PRODUCT.md §6.4 */
import type { Tier } from "@/app/api/_lib/types";

const TIER_META: Record<Tier, { emoji: string; label: string }> = {
  T1: { emoji: "🟢", label: "경로상" },
  T2: { emoji: "🔵", label: "근처" },
  T3: { emoji: "🟡", label: "우회" },
};

export function TierBadge({ tier }: { tier: Tier }) {
  const { emoji, label } = TIER_META[tier];
  return (
    <span className="inline-flex items-center gap-1 text-sm font-medium">
      <span aria-hidden>{emoji}</span>
      {label}
    </span>
  );
}
