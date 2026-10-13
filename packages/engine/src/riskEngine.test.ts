import type { Order, PortfolioSnapshot } from "@itrade/domain";
import { describe, expect, it } from "vitest";
import { checkOrderRisk } from "./riskEngine";

const portfolio: PortfolioSnapshot = {
  cash: 100000,
  positions: [],
  totalEquity: 100000,
  realizedPnl: 0,
  unrealizedPnl: 0
};

describe("risk engine", () => {
  it("approves an order inside per-symbol exposure", () => {
    const order = orderFor(100, 10);

    const result = checkOrderRisk(order, portfolio, { maxSymbolExposurePct: 0.2, killSwitch: false });

    expect(result.approved).toBe(true);
    expect(result.reason).toBe("approved");
  });

  it("rejects an order above per-symbol exposure", () => {
    const order = orderFor(3000, 10);

    const result = checkOrderRisk(order, portfolio, { maxSymbolExposurePct: 0.2, killSwitch: false });

    expect(result.approved).toBe(false);
    expect(result.reason).toBe("total symbol exposure 30000 (existing 0 + new 30000) exceeds limit 20000");
  });

  it("rejects all orders when kill switch is enabled", () => {
    const order = orderFor(100, 10);

    const result = checkOrderRisk(order, portfolio, { maxSymbolExposurePct: 0.2, killSwitch: true });

    expect(result.approved).toBe(false);
    expect(result.reason).toBe("portfolio kill switch is enabled");
  });

  it("rejects sell order when position is insufficient", () => {
    const portfolioWithPosition: PortfolioSnapshot = {
      ...portfolio,
      positions: [{ symbol: "000001.SZ", quantity: 100, marketPrice: 10, averageCost: 9.5 }]
    };
    const order: Order = {
      id: "order-sell",
      strategyId: "ma-volume",
      symbol: "000001.SZ",
      side: "sell",
      quantity: 200,
      requestedPrice: 10,
      timestamp: "2026-06-08T09:32:00.000+08:00"
    };

    const result = checkOrderRisk(order, portfolioWithPosition, { maxSymbolExposurePct: 0.2, killSwitch: false });

    expect(result.approved).toBe(false);
    expect(result.reason).toContain("insufficient position");
  });

  it("approves sell order when position is sufficient", () => {
    const portfolioWithPosition: PortfolioSnapshot = {
      ...portfolio,
      positions: [{ symbol: "000001.SZ", quantity: 200, marketPrice: 10, averageCost: 9.5 }]
    };
    const order: Order = {
      id: "order-sell",
      strategyId: "ma-volume",
      symbol: "000001.SZ",
      side: "sell",
      quantity: 100,
      requestedPrice: 10,
      timestamp: "2026-06-08T09:32:00.000+08:00"
    };

    const result = checkOrderRisk(order, portfolioWithPosition, { maxSymbolExposurePct: 0.2, killSwitch: false });

    expect(result.approved).toBe(true);
  });

  it("rejects buy order when cash is insufficient", () => {
    const poorPortfolio: PortfolioSnapshot = {
      cash: 500,
      positions: [],
      totalEquity: 50000,
      realizedPnl: 0,
      unrealizedPnl: 0
    };
    const order = orderFor(100, 10); // 100 * 10 = 1000 > 500 cash, but within 50000 * 0.2 = 10000 exposure

    const result = checkOrderRisk(order, poorPortfolio, { maxSymbolExposurePct: 0.2, killSwitch: false });

    expect(result.approved).toBe(false);
    expect(result.reason).toContain("cash");
  });

  it("includes existing position exposure in total symbol exposure check", () => {
    const portfolioWithPosition: PortfolioSnapshot = {
      ...portfolio,
      positions: [{ symbol: "000001.SZ", quantity: 1500, marketPrice: 10, averageCost: 9.5 }]
    };
    // Existing: 1500 * 10 = 15000. New: 1000 * 10 = 10000. Total: 25000 > 20000 limit
    const order = orderFor(1000, 10);

    const result = checkOrderRisk(order, portfolioWithPosition, { maxSymbolExposurePct: 0.2, killSwitch: false });

    expect(result.approved).toBe(false);
    expect(result.reason).toContain("existing 15000");
    expect(result.reason).toContain("new 10000");
  });
});

function orderFor(quantity: number, price: number): Order {
  return {
    id: `order-${quantity}`,
    strategyId: "ma-volume",
    symbol: "000001.SZ",
    side: "buy",
    quantity,
    requestedPrice: price,
    timestamp: "2026-06-08T09:32:00.000+08:00"
  };
}
