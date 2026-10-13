import type { Order, PortfolioSnapshot } from "@itrade/domain";
import { round2 } from "./utils";

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
    const position = portfolio.positions.find((p) => p.symbol === order.symbol);
    if (!position || position.quantity < order.quantity) {
      return {
        approved: false,
        reason: `insufficient position: have ${position?.quantity ?? 0}, selling ${order.quantity}`
      };
    }
    return { approved: true, reason: "approved" };
  }

  const requestedExposure = order.quantity * order.requestedPrice;
  const existingPosition = portfolio.positions.find((p) => p.symbol === order.symbol);
  const existingExposure = existingPosition ? existingPosition.quantity * existingPosition.marketPrice : 0;
  const totalSymbolExposure = existingExposure + requestedExposure;
  const exposureLimit = portfolio.totalEquity * limits.maxSymbolExposurePct;

  if (totalSymbolExposure > exposureLimit) {
    return {
      approved: false,
      reason: `total symbol exposure ${round2(totalSymbolExposure)} (existing ${round2(existingExposure)} + new ${round2(requestedExposure)}) exceeds limit ${round2(exposureLimit)}`
    };
  }

  if (requestedExposure > portfolio.cash) {
    return {
      approved: false,
      reason: `cash ${round2(portfolio.cash)} is below requested exposure ${round2(requestedExposure)}`
    };
  }

  return { approved: true, reason: "approved" };
}
