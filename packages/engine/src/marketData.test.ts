import { describe, expect, it } from "vitest";
import { getSampleBars, inspectMarketDataQuality } from "./marketData";

describe("market data fixtures", () => {
  it("loads deterministic daily and minute sample bars", () => {
    const bars = getSampleBars();

    expect(bars.daily).toHaveLength(4);
    expect(bars.minute).toHaveLength(4);
    expect(bars.daily[0]?.symbol).toBe("000001.SZ");
    expect(bars.minute[0]?.fields.ma20).toBeGreaterThan(0);
  });

  it("detects abnormal price and missing required fields", () => {
    const bars = getSampleBars();
    const broken = [
      { ...bars.daily[0]!, close: -1 },
      { ...bars.daily[1]!, fields: {} }
    ];

    const result = inspectMarketDataQuality(broken);

    expect(result.ok).toBe(false);
    expect(result.issues).toContain("000001.SZ 2026-06-08T15:00:00.000+08:00 has non-positive close");
    expect(result.issues).toContain("600000.SH 2026-06-08T15:00:00.000+08:00 missing field ma20");
  });
});
