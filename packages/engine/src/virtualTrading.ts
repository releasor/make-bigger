import type {
  AuditEvent,
  Fill,
  MarketBar,
  Order,
  PortfolioSnapshot,
  Position,
  Signal,
  StrategyDefinition
} from "@itrade/domain";
import { checkOrderRisk } from "./riskEngine";
import { evaluateSignals } from "./signalEngine";

export interface VirtualTradingInput {
  strategies: StrategyDefinition[];
  bars: MarketBar[];
  startingCash: number;
  maxSymbolExposurePct: number;
  killSwitch: boolean;
}

export interface VirtualTradingResult {
  signals: Signal[];
  orders: Order[];
  fills: Fill[];
  portfolio: PortfolioSnapshot;
  auditEvents: AuditEvent[];
}

export function runVirtualTradingSession(input: VirtualTradingInput): VirtualTradingResult {
  let portfolio: PortfolioSnapshot = {
    cash: input.startingCash,
    positions: [],
    totalEquity: input.startingCash,
    realizedPnl: 0,
    unrealizedPnl: 0
  };
  const signals: Signal[] = [];
  const orders: Order[] = [];
  const fills: Fill[] = [];
  const auditEvents: AuditEvent[] = [];

  for (const strategy of input.strategies) {
    const strategySignals = evaluateSignals(strategy, input.bars);
    signals.push(...strategySignals);

    for (const signal of strategySignals) {
      const bar = input.bars.find((item) => item.symbol === signal.symbol && item.timestamp === signal.timestamp);
      if (!bar) continue;
      if (signal.side === "buy" && hasOpenPosition(portfolio, signal.symbol)) continue;

      const order = createOrder(signal, bar, portfolio, strategy.parameters.maxPositionPct);
      if (order.quantity <= 0) continue;
      const decision = checkOrderRisk(order, portfolio, {
        maxSymbolExposurePct: input.maxSymbolExposurePct,
        killSwitch: input.killSwitch
      });

      auditEvents.push(audit("risk_checked", order.id, { approved: decision.approved, reason: decision.reason }));

      if (!decision.approved) continue;

      const fill = createFill(order);
      orders.push(order);
      fills.push(fill);
      portfolio = applyFill(portfolio, fill);
      auditEvents.push(audit("virtual_fill_created", fill.orderId, { symbol: fill.symbol, quantity: fill.quantity }));
    }
  }

  return { signals, orders, fills, portfolio, auditEvents };
}

function createOrder(signal: Signal, bar: MarketBar, portfolio: PortfolioSnapshot, maxPositionPct: number): Order {
  const cashBudget = portfolio.totalEquity * maxPositionPct;
  const quantity = Math.floor(Math.floor(cashBudget / bar.close) / 100) * 100;

  return {
    id: `order-${signal.id}`,
    strategyId: signal.strategyId,
    symbol: signal.symbol,
    side: signal.side,
    quantity,
    requestedPrice: bar.close,
    timestamp: signal.timestamp
  };
}

function hasOpenPosition(portfolio: PortfolioSnapshot, symbol: string): boolean {
  return portfolio.positions.some((position) => position.symbol === symbol && position.quantity > 0);
}

function createFill(order: Order): Fill {
  const slippageRate = order.side === "buy" ? 1.001 : 0.999;
  const price = round2(order.requestedPrice * slippageRate);
  const notional = price * order.quantity;
  const commission = round2(Math.max(notional * 0.0003, 5));
  const tax = order.side === "sell" ? round2(notional * 0.001) : 0;

  return {
    orderId: order.id,
    symbol: order.symbol,
    side: order.side,
    quantity: order.quantity,
    price,
    commission,
    tax,
    timestamp: order.timestamp
  };
}

function applyFill(portfolio: PortfolioSnapshot, fill: Fill): PortfolioSnapshot {
  if (fill.side === "buy") {
    const cost = fill.price * fill.quantity + fill.commission + fill.tax;
    const positions = upsertPosition(portfolio.positions, fill);
    const marketValue = positions.reduce((sum, position) => sum + position.quantity * position.marketPrice, 0);

    return {
      ...portfolio,
      cash: round2(portfolio.cash - cost),
      positions,
      totalEquity: round2(portfolio.cash - cost + marketValue)
    };
  }

  return portfolio;
}

function upsertPosition(positions: Position[], fill: Fill): Position[] {
  const existing = positions.find((position) => position.symbol === fill.symbol);
  if (!existing) {
    return [
      ...positions,
      {
        symbol: fill.symbol,
        quantity: fill.quantity,
        averageCost: fill.price,
        marketPrice: fill.price
      }
    ];
  }

  const nextQuantity = existing.quantity + fill.quantity;
  const nextCost = existing.averageCost * existing.quantity + fill.price * fill.quantity;

  return positions.map((position) =>
    position.symbol === fill.symbol
      ? {
          ...position,
          quantity: nextQuantity,
          averageCost: round2(nextCost / nextQuantity),
          marketPrice: fill.price
        }
      : position
  );
}

function audit(action: string, entityId: string, details: AuditEvent["details"]): AuditEvent {
  return {
    id: `audit-${action}-${entityId}`,
    timestamp: "2026-06-08T09:32:30.000+08:00",
    actor: "system",
    action,
    entityId,
    details
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
