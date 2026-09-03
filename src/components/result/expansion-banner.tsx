/**
 * 확장 고지 배너 — PRODUCT.md §5.3 ②, AGENTS.md §6 (제거 금지).
 * "이 문장이 뜨는 순간이 곧 제품의 존재 이유" — 기존 서비스가 검색 결과 없음으로
 * 끝냈을 순간에 우회해서라도 찾아줬다는 걸 알린다.
 *
 * wire SearchResult에는 확장 전 후보 수가 없어 "N곳뿐이어서"의 정확한 개수는
 * 표시하지 못한다 — 있는 정보(도달한 반경)만으로 정직하게 문구를 구성한다.
 */
import { Info, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SEARCH_RADIUS } from "@/domain/params";
import type { Fuel, WireExpansion } from "@/app/api/_lib/types";

export function ExpansionBanner({ expansion, fuel }: { expansion: WireExpansion; fuel: Fuel }) {
  const stationWord = fuel === "LPG" ? "충전소" : "주유소";

  if (expansion.triggered) {
    const km = (expansion.finalRadiusM / 1000).toFixed(1).replace(/\.0$/, "");
    return (
      <Alert variant="info">
        <Info aria-hidden />
        <AlertDescription className="text-info-foreground">
          경로 주변에서 조건에 맞는 {stationWord}를 충분히 찾지 못해 {km}km까지 넓혀 찾았어요.
        </AlertDescription>
      </Alert>
    );
  }

  if (expansion.skippedReason === "QUOTA") {
    return (
      <Alert variant="warning">
        <AlertTriangle aria-hidden />
        <AlertDescription className="text-warning-foreground">
          오늘 조회 한도에 걸려 더 넓게 찾지 못했어요. 경로 주변 {SEARCH_RADIUS / 1000}km 결과예요.
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}
