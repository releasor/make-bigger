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
});
