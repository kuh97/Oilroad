"use client";

/** 연료 3택 — PRODUCT.md §5.1 (필수, 기본값은 마지막 선택값) */

import { cn } from "@/lib/utils";
import type { Fuel } from "@/app/api/_lib/types";

const FUEL_LABEL: Record<Fuel, string> = {
  GASOLINE: "휘발유",
  DIESEL: "경유",
  LPG: "LPG",
};

const FUELS: Fuel[] = ["GASOLINE", "DIESEL", "LPG"];

export function FuelSelect({ value, onChange }: { value: Fuel; onChange: (fuel: Fuel) => void }) {
  return (
    <div className="flex gap-2" role="radiogroup" aria-label="연료 종류">
      {FUELS.map((fuel) => (
        <button
          key={fuel}
          type="button"
          role="radio"
          aria-checked={value === fuel}
          onClick={() => onChange(fuel)}
          className={cn(
            "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
            value === fuel
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background text-foreground hover:bg-muted",
          )}
        >
          {FUEL_LABEL[fuel]}
        </button>
      ))}
    </div>
  );
}
