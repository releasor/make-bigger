import type { Fill, Signal } from "@itrade/domain";
import { describe, expect, it } from "vitest";
import { buildDailyReport } from "./reporting";

describe("daily report", () => {
  it("calculates win rate, signal hit rate, and target achievement", () => {
    const fills: Fill[] = [
      fill("buy-1", "buy", 10, 100),
      fill("sell-1", "sell", 11, 100),
      fill("buy-2", "buy", 8, 100),
      fill("sell-2", "sell", 7, 100)
    ];
    const signals: Signal[] = [
      signal("s1", "buy"),
      signal("s2", "sell"),
      signal("s3", "buy")
    ];

    const report = buildDailyReport({
      date: "2026-06-08",
      startingEquity: 100000,
      endingEquity: 100600,
      maxDrawdownPct: 0.02,
      fills,
      signals,
      hitSignalIds: ["s1", "s2"],
      target: { minReturnPct: 0.001, maxDrawdownPct: 0.03 }
    });

    expect(report.tradingWinRate).toBe(0.5);
    expect(report.signalHitRate).toBe(0.6667);
    expect(report.strategyTargetAchieved).toBe(true);
    expect(report.dailyReturnPct).toBe(0.006);
  });

  it("handles zero signals and zero fills", () => {
    const report = buildDailyReport({
      date: "2026-06-08",
      startingEquity: 100000,
      endingEquity: 100000,
      maxDrawdownPct: 0,
      fills: [],
      signals: [],
      hitSignalIds: [],
      target: { minReturnPct: 0.001, maxDrawdownPct: 0.03 }
    });

    expect(report.tradingWinRate).toBe(0);
    expect(report.signalHitRate).toBe(0);
    expect(report.strategyTargetAchieved).toBe(false); // 0 < 0.001
    expect(report.dailyReturnPct).toBe(0);
    expect(report.tradeCount).toBe(0);
    expect(report.signalCount).toBe(0);
  });

  it("handles zero starting equity without division error", () => {
    const report = buildDailyReport({
      date: "2026-06-08",
      startingEquity: 0,
      endingEquity: 1000,
      maxDrawdownPct: 0,
      fills: [],
      signals: [],
      hitSignalIds: [],
      target: { minReturnPct: 0, maxDrawdownPct: 1 }
    });

    expect(report.dailyReturnPct).toBe(0); // guarded against division by zero
  });

  it("handles all-winning trades", () => {
    const fills: Fill[] = [
      fill("buy-1", "buy", 10, 100),
      fill("sell-1", "sell", 12, 100),
      fill("buy-2", "buy", 8, 100),
      fill("sell-2", "sell", 10, 100)
    ];

    const report = buildDailyReport({
      date: "2026-06-08",
      startingEquity: 100000,
      endingEquity: 100400,
      maxDrawdownPct: 0,
      fills,
      signals: [],
      hitSignalIds: [],
      target: { minReturnPct: 0.001, maxDrawdownPct: 0.03 }
    });

    expect(report.tradingWinRate).toBe(1);
    expect(report.tradeCount).toBe(2);
  });

  it("handles all-losing trades", () => {
    const fills: Fill[] = [
      fill("buy-1", "buy", 10, 100),
      fill("sell-1", "sell", 9, 100),
      fill("buy-2", "buy", 8, 100),
      fill("sell-2", "sell", 7, 100)
    ];

    const report = buildDailyReport({
      date: "2026-06-08",
      startingEquity: 100000,
      endingEquity: 99600,
      maxDrawdownPct: 0.004,
      fills,
      signals: [],
      hitSignalIds: [],
      target: { minReturnPct: 0.001, maxDrawdownPct: 0.03 }
    });

    expect(report.tradingWinRate).toBe(0);
    expect(report.tradeCount).toBe(2);
    expect(report.strategyTargetAchieved).toBe(false); // negative return
  });
});

function fill(orderId: string, side: "buy" | "sell", price: number, quantity: number): Fill {
  return {
    orderId,
    symbol: "000001.SZ",
    side,
    price,
    quantity,
    commission: 5,
    tax: side === "sell" ? 1 : 0,
    timestamp: "2026-06-08T15:00:00.000+08:00"
  };
}

function signal(id: string, side: "buy" | "sell"): Signal {
  return {
    id,
    strategyId: "ma-volume",
    strategyVersion: 1,
    symbol: "000001.SZ",
    side,
    timestamp: "2026-06-08T09:32:00.000+08:00",
    confidence: 1,
    reason: "test"
  };
}
