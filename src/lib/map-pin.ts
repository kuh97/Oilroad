/**
 * 지도 마커 공통 아이콘 — 홈 지도(home-map.tsx)·상세 지도(route-map.tsx)에서
 * 출발/경유/도착을 같은 모양(원래 카카오 기본 핀 느낌의 물방울 모양)과 색으로 표시한다.
 * 라벨은 핀 안에 바로 박아 넣어 화면을 덜 차지한다.
 */

export const PIN_COLOR = {
  origin: "#2563EB", // blue-600 — 출발
  destination: "#DC2626", // red-600 — 도착
  waypoint: "#F59E0B", // amber-500 — 경유
} as const;

export const PIN_SIZE = { width: 32, height: 40 };

export function labelPinImage(text: string, color: string) {
  const { width, height } = PIN_SIZE;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><path d="M16 0C7.163 0 0 7.163 0 16c0 11 16 24 16 24s16-13 16-24C32 7.163 24.837 0 16 0z" fill="${color}"/><text x="16" y="19" text-anchor="middle" font-family="sans-serif" font-size="10" font-weight="700" fill="#fff">${text}</text></svg>`;
  return { src: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, size: PIN_SIZE };
}
