// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExpansionBanner } from "../expansion-banner";

describe("ExpansionBanner — AGENTS.md §6 제거 금지", () => {
  it("triggered면 확장 고지를 보여준다", () => {
    render(<ExpansionBanner expansion={{ triggered: true, finalRadiusM: 7000 }} />);
    expect(screen.getByText(/7km까지 넓혀 찾았습니다/)).toBeTruthy();
  });

  it("QUOTA로 건너뛰었으면 예산 한도 안내를 보여준다", () => {
    render(<ExpansionBanner expansion={{ triggered: false, finalRadiusM: 3000, skippedReason: "QUOTA" }} />);
    expect(screen.getByText(/호출 한도로 더 넓게 찾지 못했습니다/)).toBeTruthy();
  });

  it("확장이 필요 없었으면(후보 충분) 아무 배너도 렌더링하지 않는다", () => {
    const { container } = render(<ExpansionBanner expansion={{ triggered: false, finalRadiusM: 3000 }} />);
    expect(container.innerHTML).toBe("");
  });

  it("DISABLED(플래그로 꺼짐)는 사용자에게 노출하지 않는다 — 내부 상태이므로", () => {
    const { container } = render(
      <ExpansionBanner expansion={{ triggered: false, finalRadiusM: 3000, skippedReason: "DISABLED" }} />,
    );
    expect(container.innerHTML).toBe("");
  });
});
