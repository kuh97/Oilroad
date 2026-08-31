import { describe, expect, it } from "vitest";
import { parseSseFrames } from "../sse-client";

describe("parseSseFrames", () => {
  it("완결된 프레임을 파싱하고 이벤트/데이터를 분리한다", () => {
    const { frames, rest } = parseSseFrames('event: progress\ndata: {"step":"ROUTE"}\n\n');
    expect(frames).toEqual([{ event: "progress", data: { step: "ROUTE" } }]);
    expect(rest).toBe("");
  });

  it("완결되지 않은 마지막 조각은 rest로 돌려준다", () => {
    const { frames, rest } = parseSseFrames(
      'event: progress\ndata: {"step":"ROUTE"}\n\nevent: base_ro',
    );
    expect(frames).toHaveLength(1);
    expect(rest).toBe("event: base_ro");
  });

  it("여러 프레임을 순서대로 파싱한다", () => {
    const buffer =
      'event: progress\ndata: {"step":"ROUTE"}\n\nevent: progress\ndata: {"step":"COLLECT"}\n\n';
    const { frames } = parseSseFrames(buffer);
    expect(frames.map((f) => (f.data as { step: string }).step)).toEqual(["ROUTE", "COLLECT"]);
  });

  it("data가 깨진 JSON이면 그 프레임만 건너뛴다", () => {
    const buffer = "event: progress\ndata: {broken\n\n" + 'event: progress\ndata: {"step":"COLLECT"}\n\n';
    const { frames } = parseSseFrames(buffer);
    expect(frames).toHaveLength(1);
    expect(frames[0].data).toEqual({ step: "COLLECT" });
  });

  it("이어붙인 rest로 다음 호출을 계속하면 프레임이 이어서 파싱된다", () => {
    const first = parseSseFrames("event: result\ndata: {\"sear");
    expect(first.frames).toHaveLength(0);
    const second = parseSseFrames(first.rest + 'chId":"s-1"}\n\n');
    expect(second.frames).toEqual([{ event: "result", data: { searchId: "s-1" } }]);
  });
});
