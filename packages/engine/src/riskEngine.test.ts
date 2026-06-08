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
    expect(result.reason).toBe("symbol exposure 30000 exceeds limit 20000");
  });

  it("rejects all orders when kill switch is enabled", () => {
    const order = orderFor(100, 10);

    const result = checkOrderRisk(order, portfolio, { maxSymbolExposurePct: 0.2, killSwitch: true });

    expect(result.approved).toBe(false);
    expect(result.reason).toBe("portfolio kill switch is enabled");
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
