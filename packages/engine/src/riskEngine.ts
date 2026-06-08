import type { Order, PortfolioSnapshot } from "@itrade/domain";

export interface RiskLimits {
  maxSymbolExposurePct: number;
  killSwitch: boolean;
}

export interface RiskDecision {
  approved: boolean;
  reason: string;
}

export function checkOrderRisk(order: Order, portfolio: PortfolioSnapshot, limits: RiskLimits): RiskDecision {
  if (limits.killSwitch) {
    return { approved: false, reason: "portfolio kill switch is enabled" };
  }

  if (order.side === "sell") {
    return { approved: true, reason: "approved" };
  }

  const requestedExposure = order.quantity * order.requestedPrice;
  const exposureLimit = portfolio.totalEquity * limits.maxSymbolExposurePct;

  if (requestedExposure > exposureLimit) {
    return {
      approved: false,
      reason: `symbol exposure ${requestedExposure} exceeds limit ${exposureLimit}`
    };
  }

  if (requestedExposure > portfolio.cash) {
    return {
      approved: false,
      reason: `cash ${portfolio.cash} is below requested exposure ${requestedExposure}`
    };
  }

  return { approved: true, reason: "approved" };
}
