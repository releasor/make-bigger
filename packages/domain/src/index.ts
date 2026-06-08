export type StrategyStatus = "draft" | "published" | "paused" | "running";
export type RuleOperator = "gt" | "gte" | "lt" | "lte" | "eq";
export type SignalSide = "buy" | "sell";
export type OrderSide = "buy" | "sell";

export interface RuntimeParameters {
  maxPositionPct: number;
  stopLossPct: number;
  buyThreshold: number;
}

export interface RuleValue {
  kind: "field" | "number";
  value: string | number;
}

export interface RuleCondition {
  left: string;
  operator: RuleOperator;
  right: RuleValue;
}

export interface StrategyRules {
  entry: RuleCondition[];
  exit: RuleCondition[];
}

export interface StrategyDefinition {
  id: string;
  name: string;
  version: number;
  status: StrategyStatus;
  universe: string[];
  dataFrequency: "daily" | "minute" | "daily-and-minute";
  parameters: RuntimeParameters;
  rules: StrategyRules;
  createdAt: string;
  updatedAt: string;
}

export interface StrategySeed {
  id: string;
  name: string;
  version: number;
  universe: string[];
  parameters: RuntimeParameters;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export interface MarketBar {
  symbol: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  fields: Record<string, number>;
}

export interface Signal {
  id: string;
  strategyId: string;
  strategyVersion: number;
  symbol: string;
  side: SignalSide;
  timestamp: string;
  confidence: number;
  reason: string;
}

export interface Order {
  id: string;
  strategyId: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  requestedPrice: number;
  timestamp: string;
}

export interface Fill {
  orderId: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  price: number;
  commission: number;
  tax: number;
  timestamp: string;
}

export interface Position {
  symbol: string;
  quantity: number;
  averageCost: number;
  marketPrice: number;
}

export interface PortfolioSnapshot {
  cash: number;
  positions: Position[];
  totalEquity: number;
  realizedPnl: number;
  unrealizedPnl: number;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  actor: "system" | "user" | "ai";
  action: string;
  entityId: string;
  details: Record<string, string | number | boolean>;
}

export function createStrategyVersion(seed: StrategySeed): StrategyDefinition {
  const now = "2026-06-08T09:30:00.000+08:00";

  return {
    id: seed.id,
    name: seed.name,
    version: seed.version,
    status: "draft",
    universe: seed.universe,
    dataFrequency: "daily-and-minute",
    parameters: seed.parameters,
    rules: {
      entry: [
        { left: "close", operator: "gt", right: { kind: "field", value: "ma20" } },
        { left: "volume", operator: "gt", right: { kind: "field", value: "avgVolume20" } }
      ],
      exit: [{ left: "rsi14", operator: "lt", right: { kind: "number", value: 35 } }]
    },
    createdAt: now,
    updatedAt: now
  };
}

export function validateStrategyDefinition(strategy: StrategyDefinition): ValidationResult {
  const errors: string[] = [];

  if (!strategy.id.trim()) errors.push("id is required");
  if (!strategy.name.trim()) errors.push("name is required");
  if (strategy.version < 1) errors.push("version must be positive");
  if (strategy.universe.length === 0) errors.push("universe must include at least one symbol");
  if (strategy.parameters.maxPositionPct <= 0 || strategy.parameters.maxPositionPct > 1) {
    errors.push("parameters.maxPositionPct must be between 0 and 1");
  }
  if (strategy.parameters.stopLossPct <= 0 || strategy.parameters.stopLossPct > 1) {
    errors.push("parameters.stopLossPct must be between 0 and 1");
  }
  if (strategy.rules.entry.length === 0) errors.push("entry rules must include at least one condition");
  if (strategy.rules.exit.length === 0) errors.push("exit rules must include at least one condition");

  return { ok: errors.length === 0, errors };
}
