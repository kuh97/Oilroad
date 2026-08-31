// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PlaceAutocompleteInput } from "../place-autocomplete";
import type { WirePoint } from "@/app/api/_lib/types";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PlaceAutocompleteInput — 외부에서 value가 바뀌는 경우", () => {
  it("현재 위치 버튼·최근 검색처럼 부모가 value를 채우면 입력창 텍스트도 갱신된다", () => {
    vi.stubGlobal("fetch", vi.fn());

    const { rerender } = render(
      <PlaceAutocompleteInput label="출발지" placeholder="출발지를 입력하세요" value={null} onChange={() => {}} />,
    );
    expect(screen.getByPlaceholderText("출발지를 입력하세요")).toHaveProperty("value", "");

    const point: WirePoint = { lat: 37.42, lng: 127.12, name: "현재 위치" };
    rerender(
      <PlaceAutocompleteInput label="출발지" placeholder="출발지를 입력하세요" value={point} onChange={() => {}} />,
    );

    expect(screen.getByPlaceholderText("출발지를 입력하세요")).toHaveProperty("value", "현재 위치");
  });

  it("사용자가 직접 타이핑 중일 때는(value가 null로 무효화된 상태) 외부 동기화가 텍스트를 덮어쓰지 않는다", () => {
    vi.stubGlobal("fetch", vi.fn());
    const onChange = vi.fn();

    const point: WirePoint = { lat: 37.42, lng: 127.12, name: "성남시청" };
    const { rerender } = render(
      <PlaceAutocompleteInput label="출발지" placeholder="출발지를 입력하세요" value={point} onChange={onChange} />,
    );

    const input = screen.getByPlaceholderText("출발지를 입력하세요") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "성남시청 다시 입력중" } });

    // 같은 value(point)로 다시 렌더링해도(부모가 아직 onChange(null)을 반영 안 했을 수 있는 타이밍)
    // 이미 사용자가 고친 텍스트를 되돌리지 않는다 — value 참조가 그대로면 동기화 로직 자체가 안 걸림
    rerender(
      <PlaceAutocompleteInput label="출발지" placeholder="출발지를 입력하세요" value={point} onChange={onChange} />,
    );
    expect(input.value).toBe("성남시청 다시 입력중");
  });
});
