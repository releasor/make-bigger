import { describe, expect, it } from "vitest";
import type { MarketBar } from "@itrade/domain";
import type { MarketDataSnapshot } from "./realMarketData";
import { buildShortTermIntelligenceReport } from "./shortTermIntelligence";

describe("short-term intelligence report", () => {
  it("builds a Chinese research report from K-line trend, sentiment, sectors, abnormal moves, and source status", () => {
    const report = buildShortTermIntelligenceReport({
      snapshot: marketSnapshot(),
      sectorMap: {
        "000001.SZ": "银行",
        "600000.SH": "银行",
        "300750.SZ": "新能源"
      },
      now: "2026-06-08T15:30:00.000+08:00"
    });

    expect(report.title).toBe("短线情报与决策中枢");
    expect(report.outlook).toContain("短期");
    expect(report.actionPlan.mode).toBe("进攻观察");
    expect(report.actionPlan.positionTone).toContain("虚拟");
    expect(report.sentiment.temperatureScore).toBeGreaterThanOrEqual(70);
    expect(report.sentiment.trendLabel).toBe("偏强");
    expect(report.sectorRotation[0]).toMatchObject({
      sector: "银行",
      sampleQuality: "样本充足"
    });
    expect(report.watchlist.map((item) => item.symbol)).toContain("000001.SZ");
    expect(report.watchlist[0]?.labels).toContain("接近异动");
    expect(report.riskSignals.map((item) => item.level)).toContain("high");
    expect(report.externalIntelStatuses).toContainEqual(
      expect.objectContaining({ source: "dragon_tiger", status: "not_configured" })
    );
    expect(report.conclusion).toContain("核心结论");
    expect(report.generatedAt).toBe("2026-06-08T15:30:00.000+08:00");
  });
});

function marketSnapshot(): MarketDataSnapshot {
  const daily = [
    bar("000001.SZ", "2026-06-06T15:00:00.000+08:00", 10, 10.2, 9.8, 10, 1000, 9.8, 1000, 52),
    bar("000001.SZ", "2026-06-07T15:00:00.000+08:00", 10, 10.6, 9.9, 10.4, 1300, 9.9, 1050, 58),
    bar("000001.SZ", "2026-06-08T15:00:00.000+08:00", 10.5, 11.35, 10.4, 11.2, 2600, 10, 1200, 68),
    bar("600000.SH", "2026-06-06T15:00:00.000+08:00", 8.1, 8.3, 8, 8.2, 800, 8, 800, 50),
    bar("600000.SH", "2026-06-07T15:00:00.000+08:00", 8.2, 8.5, 8.1, 8.45, 1100, 8.1, 850, 54),
    bar("600000.SH", "2026-06-08T15:00:00.000+08:00", 8.48, 8.95, 8.45, 8.9, 1800, 8.2, 900, 62),
    bar("300750.SZ", "2026-06-06T15:00:00.000+08:00", 180, 185, 178, 182, 1200, 170, 1000, 65),
    bar("300750.SZ", "2026-06-07T15:00:00.000+08:00", 182, 192, 181, 190, 1700, 172, 1100, 72),
    bar("300750.SZ", "2026-06-08T15:00:00.000+08:00", 191, 210, 190, 207, 3600, 175, 1200, 82)
  ];

  const minute = [
    bar("000001.SZ", "2026-06-08T14:58:00.000+08:00", 11, 11.28, 10.98, 11.24, 900, 10.9, 500, 66),
    bar("000001.SZ", "2026-06-08T14:59:00.000+08:00", 11.24, 11.34, 11.2, 11.32, 1100, 10.95, 520, 70),
    bar("600000.SH", "2026-06-08T14:59:00.000+08:00", 8.88, 8.96, 8.86, 8.94, 900, 8.5, 500, 63),
    bar("300750.SZ", "2026-06-08T14:59:00.000+08:00", 205, 210, 203, 208, 1800, 180, 900, 84)
  ];

  return {
    daily,
    minute,
    source: {
      provider: "eastmoney",
      isReal: true,
      updatedAt: "2026-06-08T15:30:00.000+08:00",
      symbols: ["000001.SZ", "600000.SH", "300750.SZ"],
      warnings: [],
      cacheHit: false
    },
    quality: { ok: true, issues: [] }
  };
}

function bar(
  symbol: string,
  timestamp: string,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
  ma20: number,
  avgVolume20: number,
  rsi14: number
): MarketBar {
  return {
    symbol,
    timestamp,
    open,
    high,
    low,
    close,
    volume,
    fields: { ma20, avgVolume20, rsi14 }
  };
}
