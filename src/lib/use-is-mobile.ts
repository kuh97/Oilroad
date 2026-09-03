import { useSyncExternalStore } from "react";

/** 값이 마운트 후로도 바뀌지 않으므로 실제 구독은 필요 없다 — 리렌더를 유발하지 않는 no-op. */
function subscribeNever() {
  return () => {};
}
function getIsMobileSnapshot(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}
function getIsMobileServerSnapshot(): boolean {
  return false;
}

/**
 * 모바일 여부 — 티맵처럼 모바일에서만 되는 기능을 조건부로 보여줄 때 쓴다.
 * useSyncExternalStore로 읽어야 SSR 스냅샷(false)과 클라 스냅샷이 갈려도
 * 하이드레이션 경고 없이 마운트 직후 실제 값으로 갱신된다 — useEffect+setState는
 * react-hooks/set-state-in-effect에 걸린다.
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribeNever, getIsMobileSnapshot, getIsMobileServerSnapshot);
}
