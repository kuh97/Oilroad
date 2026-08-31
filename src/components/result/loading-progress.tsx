/**
 * 로딩 진행 표시 — PRODUCT.md §10.3. 실제 SSE progress에 맞춘 것이지
 * 가짜 애니메이션이 아니다.
 *
 * `EXPAND`는 확장이 발동해야만 오는 단계라, 순서(인덱스)로 "지나갔다"고 판정하면
 * 확장이 없었던 검색에서도 그 점이 채워진 것처럼 보인다 — 실제로 거쳐간 단계
 * 집합(`stepsSeen`)으로만 판정한다.
 */
import type { ProgressStep } from "@/store/search-store";

const STEPS: { step: ProgressStep; label: string }[] = [
  { step: "ROUTE", label: "경로를 찾고 있어요" },
  { step: "COLLECT", label: "주유소를 찾고 있어요" },
  { step: "EXPAND", label: "범위를 넓히는 중" },
  { step: "PRECISE", label: "우회 경로를 계산하는 중" },
];

export function LoadingProgress({
  currentStep,
  stepsSeen,
}: {
  currentStep: ProgressStep | null;
  stepsSeen: ProgressStep[];
}) {
  const active = STEPS.find((s) => s.step === currentStep) ?? STEPS[0];

  return (
    <div className="flex flex-col items-center gap-3 py-16" role="status" aria-live="polite">
      <p className="text-sm font-medium">{active.label}</p>
      <div className="flex gap-1.5">
        {STEPS.map((s) => (
          <span
            key={s.step}
            className={`size-2 rounded-full ${stepsSeen.includes(s.step) ? "bg-primary" : "bg-muted"}`}
            aria-hidden
          />
        ))}
      </div>
    </div>
  );
}
