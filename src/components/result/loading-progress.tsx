/**
 * 로딩 진행 표시 — PRODUCT.md §10.3. 실제 SSE progress에 맞춘 것이지
 * 가짜 애니메이션이 아니다. 검색 전체를 이 화면 하나로 통일해서 보여준다 —
 * 도중에 결과 화면(헤더+카드)으로 바뀌었다가 다시 이 화면으로 돌아오는 식의
 * 전환은 하지 않는다("풀스크린 로딩 → 인라인 축소"가 어색하다는 피드백).
 *
 * `EXPAND`는 확장이 발동해야만 오는 단계라, 순서(인덱스)로 "지나갔다"고 판정하면
 * 확장이 없었던 검색에서도 그 점이 채워진 것처럼 보인다 — 실제로 거쳐간 단계
 * 집합(`stepsSeen`)으로만 판정한다.
 *
 * 도로 위를 차가 달려가는 형태 — 위치 이동은 순수 CSS transition이라 별도
 * 애니메이션 라이브러리가 필요 없다. `LoadingCar`는 차 자체에 나중에 Lottie 같은
 * idle 애니메이션을 붙이기 쉽도록 일부러 분리해뒀다(지금은 정적 SVG).
 */
import type { ProgressStep } from "@/store/search-store";

const STEP_LABEL: Record<ProgressStep, string> = {
  ROUTE: "가장 빠른 길을 찾고 있어요",
  COLLECT: "근처 주유소를 살펴보고 있어요",
  EXPAND: "조금 더 넓게 찾아보고 있어요",
  PRECISE: "곧 결과를 보여드릴게요",
};

const STEP_ORDER: ProgressStep[] = ["ROUTE", "COLLECT", "EXPAND", "PRECISE"];

function stepToPercent(step: ProgressStep): number {
  const index = STEP_ORDER.indexOf(step);
  return (index / (STEP_ORDER.length - 1)) * 100;
}

/** EXPAND만 실제 반경(radiusM)이 있으면 구체적인 숫자로 — "조금 더 넓게"보다 훨씬 신뢰감 있다 */
function labelFor(step: ProgressStep, expandRadiusM?: number | null): string {
  if (step === "EXPAND" && expandRadiusM) {
    return `반경 ${Math.round(expandRadiusM / 1000)}km까지 넓혀서 찾아보고 있어요`;
  }
  return STEP_LABEL[step];
}

function LoadingCar() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 fill-primary" aria-hidden>
      <path d="M5 11l1.2-3.6A2 2 0 0 1 8.1 6h7.8a2 2 0 0 1 1.9 1.4L19 11h.5a1.5 1.5 0 0 1 1.5 1.5V16a1 1 0 0 1-1 1h-1a2 2 0 1 1-4 0H9a2 2 0 1 1-4 0H4a1 1 0 0 1-1-1v-3.5A1.5 1.5 0 0 1 4.5 11H5zm2.1-3L6.3 11h11.4l-.8-3a.5.5 0 0 0-.5-.4H8.1a.5.5 0 0 0-.5.4z" />
    </svg>
  );
}

export function LoadingProgress({
  currentStep,
  stepsSeen,
  expandRadiusM,
}: {
  currentStep: ProgressStep | null;
  stepsSeen: ProgressStep[];
  expandRadiusM?: number | null;
}) {
  const active = currentStep ?? "ROUTE";
  const percent = stepToPercent(active);

  return (
    <div className="flex flex-col items-center gap-6 py-16" role="status" aria-live="polite">
      <p className="text-sm font-medium">{labelFor(active, expandRadiusM)}</p>

      <div className="relative h-8 w-full max-w-xs">
        <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-muted" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-primary/40 transition-[width] duration-500 ease-in-out"
          style={{ width: `${percent}%` }}
        />
        {STEP_ORDER.map((step) => (
          <span
            key={step}
            className={`absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ${
              stepsSeen.includes(step) ? "bg-primary" : "bg-muted-foreground/30"
            }`}
            style={{ left: `${stepToPercent(step)}%` }}
            aria-hidden
          />
        ))}
        <div
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-[left] duration-500 ease-in-out"
          style={{ left: `${percent}%` }}
        >
          <LoadingCar />
        </div>
      </div>
    </div>
  );
}
