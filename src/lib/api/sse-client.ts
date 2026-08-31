/**
 * SSE 프레임 파서 — 클라이언트 쪽. 서버의 lib/api/sse.ts(sseEvent)가 만드는
 * `event: X\ndata: Y\n\n` 포맷을 역으로 읽습니다.
 */

export interface SseFrame {
  event: string;
  data: unknown;
}

/**
 * 버퍼에서 완결된 프레임들을 파싱하고, 아직 `\n\n`으로 끝나지 않은 나머지는
 * `rest`로 돌려줍니다 — 다음 청크와 이어붙여 계속 파싱합니다.
 */
export function parseSseFrames(buffer: string): { frames: SseFrame[]; rest: string } {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  const frames: SseFrame[] = [];

  for (const part of parts) {
    if (!part.trim()) continue;
    const eventMatch = part.match(/^event: (.*)$/m);
    const dataMatch = part.match(/^data: (.*)$/m);
    if (!eventMatch || !dataMatch) continue;
    try {
      frames.push({ event: eventMatch[1], data: JSON.parse(dataMatch[1]) });
    } catch {
      // 깨진 프레임은 건너뜁니다 — 다음 프레임 파싱에 영향 주지 않음
    }
  }

  return { frames, rest };
}
