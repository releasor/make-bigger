import { createStrategyVersion } from "@itrade/domain";
import { describe, expect, it } from "vitest";
import { evaluateSignals } from "./signalEngine";

describe("signal engine", () => {
  it("emits buy signals when all entry rules pass", () => {
    const strategy = createStrategyVersion({
      id: "ma-volume",
      name: "双均线成交量策略",
      version: 1,
      universe: ["000001.SZ"],
      parameters: { maxPositionPct: 0.1, stopLossPct: 0.08, buyThreshold: 1 }
    });

    const signals = evaluateSignals(strategy, [
      {
        symbol: "000001.SZ",
        timestamp: "2026-06-08T09:32:00.000+08:00",
        open: 10.15,
        high: 10.35,
        low: 10.14,
        close: 10.34,
        volume: 26000,
        fields: { ma20: 10.06, avgVolume20: 15000, rsi14: 43 }
      }
    ]);

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      strategyId: "ma-volume",
      symbol: "000001.SZ",
      side: "buy",
      confidence: 1
    });
  });

  it("emits sell signals when exit rules pass", () => {
    const strategy = createStrategyVersion({
      id: "ma-volume",
      name: "双均线成交量策略",
      version: 1,
      universe: ["600000.SH"],
      parameters: { maxPositionPct: 0.1, stopLossPct: 0.08, buyThreshold: 1 }
    });

    const signals = evaluateSignals(strategy, [
      {
        symbol: "600000.SH",
        timestamp: "2026-06-08T09:32:00.000+08:00",
        open: 8.18,
        high: 8.19,
        low: 8.1,
        close: 8.11,
        volume: 11000,
        fields: { ma20: 8.13, avgVolume20: 12000, rsi14: 32 }
      }
    ]);

    expect(signals).toHaveLength(1);
    expect(signals[0]?.side).toBe("sell");
  });
});
