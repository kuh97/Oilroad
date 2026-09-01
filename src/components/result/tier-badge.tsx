/** 탐색 티어 배지 — PRODUCT.md §6.4 */
import { Badge, type badgeVariants } from "@/components/ui/badge";
import type { VariantProps } from "class-variance-authority";
import type { Tier } from "@/app/api/_lib/types";

const TIER_META: Record<Tier, { variant: VariantProps<typeof badgeVariants>["variant"]; label: string }> = {
  T1: { variant: "success", label: "경로상" },
  T2: { variant: "info", label: "근처" },
  T3: { variant: "warning", label: "우회" },
};

export function TierBadge({ tier }: { tier: Tier }) {
  const { variant, label } = TIER_META[tier];
  return <Badge variant={variant}>{label}</Badge>;
}
