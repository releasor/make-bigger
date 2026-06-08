import type { ManualPosition, MarketBar } from "@itrade/domain";
import { describe, expect, it } from "vitest";
import { findShortTermBuySignals, monitorSellSignals } from "./shortTermSignals";

describe("short-term signal engine", () => {
  it("emits only high-conviction short-term buy signals with basis and risk notes", () => {
    const signals = findShortTermBuySignals([
      bar("000001.SZ", 10.1, 10.38, 10.34, 26000, 10.06, 15000, 43),
      bar("600000.SH", 8.18, 8.2, 8.11, 11000, 8.13, 12000, 32)
    ]);

    expect(signals).toHaveLength(1);
    const [signal] = signals;
    expect(signal).toBeDefined();
    if (!signal) throw new Error("expected one short-term signal");
    expect(signal).toMatchObject({
      symbol: "000001.SZ",
      side: "buy",
      recommendation: "特别值得关注",
      suggestedPositionPct: 0.1
    });
    expect(signal.confidenceScore).toBeGreaterThanOrEqual(85);
    expect(signal.basis.join(" ")).toContain("放量");
    expect(signal.basis.join(" ")).toContain("突破 MA20");
    expect(signal.riskNotes.join(" ")).toContain("止损");
  });

  it("does not emit ordinary short-term signals below the high-conviction threshold", () => {
    const signals = findShortTermBuySignals([bar("600000.SH", 8.18, 8.2, 8.11, 11000, 8.13, 12000, 32)]);

    expect(signals).toHaveLength(0);
  });

  it("emits a sell alert when a manually marked position breaks its stop loss", () => {
    const position: ManualPosition = {
      id: "manual-000001",
      signalId: "short-000001",
      symbol: "000001.SZ",
      quantity: 1000,
      entryPrice: 10.34,
      stopLossPrice: 9.51,
      entryTimestamp: "2026-06-08T09:32:00.000+08:00",
      status: "monitoring"
    };

    const alerts = monitorSellSignals([position], [bar("000001.SZ", 9.6, 9.7, 9.48, 32000, 10.05, 15000, 31)]);

    expect(alerts).toHaveLength(1);
    const [alert] = alerts;
    expect(alert).toBeDefined();
    if (!alert) throw new Error("expected one sell alert");
    expect(alert).toMatchObject({
      symbol: "000001.SZ",
      action: "清仓观察",
      reason: "跌破止损价"
    });
  });
});

function bar(
  symbol: string,
  open: number,
  high: number,
  close: number,
  volume: number,
  ma20: number,
  avgVolume20: number,
  rsi14: number
): MarketBar {
  return {
    symbol,
    timestamp: "2026-06-08T09:32:00.000+08:00",
    open,
    high,
    low: Math.min(open, close),
    close,
    volume,
    fields: { ma20, avgVolume20, rsi14 }
  };
}
