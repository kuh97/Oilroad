// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePlacesSearch } from "../usePlacesSearch";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("usePlacesSearch", () => {
  it("PLACE_QUERY_MIN_LEN 미만이면 fetch하지 않는다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => usePlacesSearch("a"));
    await act(async () => {});

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.places).toEqual([]);
  });

  it("디바운스 후 한 번만 호출하고 결과를 반환한다", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ places: [{ name: "성남시청", address: "...", lat: 37.4, lng: 127.1 }] }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(({ q }) => usePlacesSearch(q), { initialProps: { q: "성" } });
    rerender({ q: "성남" });
    rerender({ q: "성남시" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("q=%EC%84%B1%EB%82%A8%EC%8B%9C");
    expect(result.current.places).toHaveLength(1);
  });

  it("실패하면 error 문구를 반환한다", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));

    const { result } = renderHook(() => usePlacesSearch("성남시청"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.error).toBe("장소를 찾을 수 없습니다.");
  });
});
