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
import { round2 } from "./utils";
import { checkOrderRisk } from "./riskEngine";
import { evaluateSignals } from "./signalEngine";

export interface VirtualTradingInput {
  strategies: StrategyDefinition[];
  bars: MarketBar[];
  startingCash: number;
  initialPortfolio?: PortfolioSnapshot;
  ignoredSignalIds?: string[];
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
  let portfolio = input.initialPortfolio
    ? clonePortfolio(input.initialPortfolio)
    : createStartingPortfolio(input.startingCash);
  const ignoredSignalIds = new Set(input.ignoredSignalIds ?? []);
  const signals: Signal[] = [];
  const orders: Order[] = [];
  const fills: Fill[] = [];
  const auditEvents: AuditEvent[] = [];

  // Pre-index bars by symbol+timestamp for O(1) lookup
  const barIndex = new Map<string, MarketBar>();
  for (const bar of input.bars) {
    barIndex.set(`${bar.symbol}|${bar.timestamp}`, bar);
  }

  for (const strategy of input.strategies) {
    const strategySignals = evaluateSignals(strategy, input.bars).filter((signal) => !ignoredSignalIds.has(signal.id));
    signals.push(...strategySignals);

    for (const signal of strategySignals) {
      const bar = barIndex.get(`${signal.symbol}|${signal.timestamp}`);
      if (!bar) continue;
      const position = findOpenPosition(portfolio, signal.symbol);
      if (signal.side === "buy" && position) continue;
      if (signal.side === "sell" && !position) continue;

      const order = createOrder(signal, bar, portfolio, strategy.parameters.maxPositionPct, position);
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

export function createStartingPortfolio(startingCash: number): PortfolioSnapshot {
  return {
    cash: startingCash,
    positions: [],
    totalEquity: startingCash,
    realizedPnl: 0,
    unrealizedPnl: 0
  };
}

function clonePortfolio(portfolio: PortfolioSnapshot): PortfolioSnapshot {
  return {
    ...portfolio,
    positions: portfolio.positions.map((position) => ({ ...position }))
  };
}

function createOrder(
  signal: Signal,
  bar: MarketBar,
  portfolio: PortfolioSnapshot,
  maxPositionPct: number,
  position?: Position
): Order {
  const quantity =
    signal.side === "sell"
      ? Math.floor((position?.quantity ?? 0) / 100) * 100
      : Math.floor(Math.floor((portfolio.totalEquity * maxPositionPct) / bar.close) / 100) * 100;

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

function findOpenPosition(portfolio: PortfolioSnapshot, symbol: string): Position | undefined {
  return portfolio.positions.find((position) => position.symbol === symbol && position.quantity > 0);
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

  const existing = portfolio.positions.find((position) => position.symbol === fill.symbol);
  if (!existing) return portfolio;

  const quantity = Math.min(fill.quantity, existing.quantity);
  const proceeds = fill.price * quantity - fill.commission - fill.tax;
  const realizedPnl = round2((fill.price - existing.averageCost) * quantity - fill.commission - fill.tax);
  const positions = portfolio.positions
    .map((position) =>
      position.symbol === fill.symbol
        ? { ...position, quantity: position.quantity - quantity, marketPrice: fill.price }
        : position
    )
    .filter((position) => position.quantity > 0);
  const marketValue = positions.reduce((sum, position) => sum + position.quantity * position.marketPrice, 0);

  return {
    ...portfolio,
    cash: round2(portfolio.cash + proceeds),
    positions,
    totalEquity: round2(portfolio.cash + proceeds + marketValue),
    realizedPnl: round2(portfolio.realizedPnl + realizedPnl)
  };
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
    timestamp: new Date().toISOString(),
    actor: "system",
    action,
    entityId,
    details
  };
}
