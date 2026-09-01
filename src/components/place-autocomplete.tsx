"use client";

/**
 * F1 장소 자동완성 입력 — PRODUCT.md §5.1.
 * "장소명 + 주소" 2줄로 최대 5건 표시. 실패 시 안내 + 재시도(검색 자체는 계속 가능).
 */

import { useState } from "react";
import { usePlacesSearch } from "@/lib/api/usePlacesSearch";
import type { WirePoint } from "@/app/api/_lib/types";

export interface PlaceAutocompleteInputProps {
  label: string;
  placeholder: string;
  value: WirePoint | null;
  onChange: (point: WirePoint | null) => void;
  onFocus?: () => void;
}

export function PlaceAutocompleteInput({ label, placeholder, value, onChange, onFocus }: PlaceAutocompleteInputProps) {
  const [query, setQuery] = useState(value?.name ?? "");
  const [isOpen, setIsOpen] = useState(false);
  const { places, error, retry } = usePlacesSearch(isOpen ? query : "");

  // 현재 위치 버튼·최근 검색 클릭처럼 부모가 value를 바깥에서 바꾸는 걸 반영해야 한다.
  // useEffect 대신 "렌더링 중 상태 조정" 패턴(React 공식 권장)을 쓴다 — 사용자가 직접
  // 타이핑할 때는 onChange(null)만 호출되므로(아래) prevValue와 다시 같아지지 않아
  // 타이핑 중인 텍스트를 덮어쓰지 않는다.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (value?.name) setQuery(value.name);
  }

  return (
    <div className="relative">
      <label className="mb-1 block text-sm font-medium text-foreground">{label}</label>
      <input
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
          if (value) onChange(null); // 텍스트를 다시 편집하면 확정된 좌표는 무효화
        }}
        onFocus={() => {
          setIsOpen(true);
          onFocus?.();
        }}
        onBlur={() => setTimeout(() => setIsOpen(false), 150)} // 클릭 이벤트가 먼저 처리되도록 지연
      />
      {isOpen && (places.length > 0 || error) && (
        <ul className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-popover shadow-md">
          {places.map((p) => (
            <li key={`${p.lat}-${p.lng}-${p.name}`}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left hover:bg-muted"
                onMouseDown={(e) => e.preventDefault()} // blur보다 먼저 click이 먹도록
                onClick={() => {
                  onChange({ lat: p.lat, lng: p.lng, name: p.name });
                  setQuery(p.name);
                  setIsOpen(false);
                }}
              >
                <div className="text-sm font-medium">{p.name}</div>
                <div className="text-xs text-muted-foreground">{p.address}</div>
              </button>
            </li>
          ))}
          {error && (
            <li className="flex items-center justify-between px-3 py-2 text-sm text-muted-foreground">
              <span>{error}</span>
              <button type="button" className="text-primary underline" onMouseDown={(e) => e.preventDefault()} onClick={retry}>
                재시도
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
