import { describe, expect, it } from "vitest";
import { estimateLeak, formatDollars } from "./calculator";

describe("estimateLeak", () => {
  it("matches the mock's default ($12,000 MRR at 6%)", () => {
    const r = estimateLeak(12000, 6);
    expect(r.lost).toBe(720);
    expect(r.lostYear).toBe(8640);
    expect(r.failed).toBe(180);
    expect(r.voluntary).toBe(540);
    expect(r.recoverable).toBeCloseTo(216);
    expect(r.recoverableYear).toBeCloseTo(2592);
    expect(r.priceMultiple).toBe(4); // 216 / 49
  });

  it("handles the slider extremes", () => {
    expect(estimateLeak(1000, 1).recoverable).toBeCloseTo(3);
    expect(estimateLeak(1000, 1).priceMultiple).toBe(0);
    expect(estimateLeak(150000, 15).lost).toBe(22500);
  });

  it("handles half-percent churn", () => {
    expect(estimateLeak(10000, 2.5).lost).toBe(250);
  });
});

describe("formatDollars", () => {
  it("rounds and adds commas", () => {
    expect(formatDollars(1240.6)).toBe("$1,241");
    expect(formatDollars(0)).toBe("$0");
  });
});
