import { createStrategyVersion } from "@itrade/domain";
import { describe, expect, it } from "vitest";
import { getSampleBars } from "./marketData";
import { runVirtualTradingSession } from "./virtualTrading";

describe("virtual trading engine", () => {
  it("turns buy signals into virtual fills and positions", () => {
    const strategy = createStrategyVersion({
      id: "ma-volume",
      name: "双均线成交量策略",
      version: 1,
      universe: ["000001.SZ"],
      parameters: { maxPositionPct: 0.1, stopLossPct: 0.08, buyThreshold: 1 }
    });

    const result = runVirtualTradingSession({
      strategies: [strategy],
      bars: getSampleBars().minute,
      startingCash: 100000,
      maxSymbolExposurePct: 0.2,
      killSwitch: false
    });

    expect(result.signals.some((signal) => signal.side === "buy")).toBe(true);
    expect(result.orders).toHaveLength(1);
    expect(result.fills).toHaveLength(1);
    expect(result.portfolio.positions[0]).toMatchObject({ symbol: "000001.SZ", quantity: 900 });
    expect(result.auditEvents.map((event) => event.action)).toContain("virtual_fill_created");
  });

  it("continues from an existing virtual portfolio and skips duplicate buys", () => {
    const strategy = createStrategyVersion({
      id: "ma-volume",
      name: "双均线成交量策略",
      version: 1,
      universe: ["000001.SZ"],
      parameters: { maxPositionPct: 0.1, stopLossPct: 0.08, buyThreshold: 1 }
    });
    const firstRun = runVirtualTradingSession({
      strategies: [strategy],
      bars: getSampleBars().minute,
      startingCash: 100000,
      maxSymbolExposurePct: 0.2,
      killSwitch: false
    });

    const secondRun = runVirtualTradingSession({
      strategies: [strategy],
      bars: getSampleBars().minute,
      startingCash: 100000,
      initialPortfolio: firstRun.portfolio,
      maxSymbolExposurePct: 0.2,
      killSwitch: false
    });

    expect(secondRun.fills).toHaveLength(0);
    expect(secondRun.portfolio).toEqual(firstRun.portfolio);
  });

  it("ignores signals that were already processed by an earlier automatic check", () => {
    const strategy = createStrategyVersion({
      id: "ma-volume",
      name: "双均线成交量策略",
      version: 1,
      universe: ["000001.SZ"],
      parameters: { maxPositionPct: 0.1, stopLossPct: 0.08, buyThreshold: 1 }
    });
    const firstRun = runVirtualTradingSession({
      strategies: [strategy],
      bars: getSampleBars().minute,
      startingCash: 100000,
      maxSymbolExposurePct: 0.2,
      killSwitch: false
    });

    const secondRun = runVirtualTradingSession({
      strategies: [strategy],
      bars: getSampleBars().minute,
      startingCash: 100000,
      ignoredSignalIds: firstRun.signals.map((signal) => signal.id),
      maxSymbolExposurePct: 0.2,
      killSwitch: false
    });

    expect(secondRun.signals).toHaveLength(0);
    expect(secondRun.fills).toHaveLength(0);
  });

  it("does not create sell orders when there is no open virtual position", () => {
    const strategy = createStrategyVersion({
      id: "ma-volume",
      name: "双均线成交量策略",
      version: 1,
      universe: ["600000.SH"],
      parameters: { maxPositionPct: 0.1, stopLossPct: 0.08, buyThreshold: 1 }
    });
    const result = runVirtualTradingSession({
      strategies: [strategy],
      bars: [
        {
          symbol: "600000.SH",
          timestamp: "2026-06-09T10:00:00.000+08:00",
          open: 9.5,
          high: 9.6,
          low: 9.3,
          close: 9.35,
          volume: 1000,
          fields: { ma20: 9.8, avgVolume20: 1200, rsi14: 25 }
        }
      ],
      startingCash: 100000,
      maxSymbolExposurePct: 0.2,
      killSwitch: false
    });

    expect(result.signals).toEqual([expect.objectContaining({ symbol: "600000.SH", side: "sell" })]);
    expect(result.orders).toHaveLength(0);
    expect(result.fills).toHaveLength(0);
    expect(result.portfolio.positions).toHaveLength(0);
  });
});
