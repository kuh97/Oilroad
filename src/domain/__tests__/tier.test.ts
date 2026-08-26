import { describe, expect, it } from "vitest";
import { classifyTier, isOutOfRange, needsExpansion } from "../tier";
import { T1_MAX, T2_MAX, T3_MAX } from "../params";

describe("classifyTier", () => {
  it("d_perp=0 → T1", () => expect(classifyTier(0)).toBe("T1"));
  it(`경계값 T1_MAX(${T1_MAX}) → T1`, () => expect(classifyTier(T1_MAX)).toBe("T1"));
  it(`T1_MAX+1 → T2`, () => expect(classifyTier(T1_MAX + 1)).toBe("T2"));
  it(`T2_MAX(${T2_MAX}) → T2`, () => expect(classifyTier(T2_MAX)).toBe("T2"));
  it(`T2_MAX+1 → T3`, () => expect(classifyTier(T2_MAX + 1)).toBe("T3"));
  it(`T3_MAX(${T3_MAX}) → T3`, () => expect(classifyTier(T3_MAX)).toBe("T3"));
  it(`T3_MAX+1 → null (제거)`, () => expect(classifyTier(T3_MAX + 1)).toBeNull());
  it("매우 먼 거리 → null", () => expect(classifyTier(100_000)).toBeNull());
});

describe("isOutOfRange", () => {
  it("T3_MAX 이하 → false", () => expect(isOutOfRange(T3_MAX)).toBe(false));
  it("T3_MAX 초과 → true", () => expect(isOutOfRange(T3_MAX + 0.001)).toBe(true));
});

describe("needsExpansion", () => {
  it("T1+T2 합계가 minCandidates 미만 → true", () => {
    expect(needsExpansion(1, 1, 3)).toBe(true);
  });
  it("T1+T2 합계가 minCandidates 이상 → false", () => {
    expect(needsExpansion(2, 1, 3)).toBe(false);
    expect(needsExpansion(0, 3, 3)).toBe(false);
  });
  it("둘 다 0 → true", () => expect(needsExpansion(0, 0, 1)).toBe(true));
});
