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

export interface ShortTermBuySignal {
  id: string;
  symbol: string;
  side: "buy";
  timestamp: string;
  currentPrice: number;
  confidenceScore: number;
  recommendation: "特别值得关注";
  suggestedPositionPct: number;
  stopLossPct: number;
  stopLossPrice: number;
  basis: string[];
  riskNotes: string[];
}

export interface ManualPosition {
  id: string;
  signalId: string;
  symbol: string;
  quantity: number;
  entryPrice: number;
  stopLossPrice: number;
  entryTimestamp: string;
  status: "monitoring" | "sell_alerted" | "closed";
}

export interface SellSignalAlert {
  id: string;
  positionId: string;
  symbol: string;
  timestamp: string;
  currentPrice: number;
  triggerPrice: number;
  reason: string;
  action: "减仓观察" | "清仓观察";
  basis: string[];
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

export type AShareMarketSessionCode =
  | "closed_day"
  | "pre_market"
  | "opening_auction"
  | "auction_pause"
  | "continuous_trading"
  | "midday_break"
  | "closing_auction"
  | "after_market";

export interface AShareMarketSession {
  code: AShareMarketSessionCode;
  label: "交易时间" | "休盘时间";
  sessionName: string;
  isOpen: boolean;
  showAfterMarketAnalysis: boolean;
  nextAction: string;
}

export function getAShareMarketSession(now: Date = new Date()): AShareMarketSession {
  const { weekday, minutes } = getShanghaiMarketTime(now);

  if (weekday === "Sat" || weekday === "Sun") {
    return closedSession("closed_day", "休盘日", "等待下一个交易日");
  }

  if (minutes < toMinutes(9, 15)) {
    return closedSession("pre_market", "盘前休盘", "等待 09:15 开盘集合竞价");
  }

  if (minutes < toMinutes(9, 25)) {
    return openSession("opening_auction", "开盘集合竞价", "等待 09:30 连续竞价");
  }

  if (minutes < toMinutes(9, 30)) {
    return closedSession("auction_pause", "集合竞价暂停", "等待 09:30 连续竞价");
  }

  if (minutes < toMinutes(11, 30)) {
    return openSession("continuous_trading", "连续竞价", "跟踪实时信号和风控");
  }

  if (minutes < toMinutes(13, 0)) {
    return closedSession("midday_break", "午间休市", "等待 13:00 下午连续竞价");
  }

  if (minutes < toMinutes(14, 57)) {
    return openSession("continuous_trading", "连续竞价", "跟踪实时信号和风控");
  }

  if (minutes < toMinutes(15, 0)) {
    return openSession("closing_auction", "收盘集合竞价", "等待 15:00 收盘");
  }

  return {
    code: "after_market",
    label: "休盘时间",
    sessionName: "盘后休市",
    isOpen: false,
    showAfterMarketAnalysis: true,
    nextAction: "生成盘后分析和次日观察清单"
  };
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

function openSession(code: AShareMarketSessionCode, sessionName: string, nextAction: string): AShareMarketSession {
  return { code, label: "交易时间", sessionName, isOpen: true, showAfterMarketAnalysis: false, nextAction };
}

function closedSession(code: AShareMarketSessionCode, sessionName: string, nextAction: string): AShareMarketSession {
  return { code, label: "休盘时间", sessionName, isOpen: false, showAfterMarketAnalysis: false, nextAction };
}

function getShanghaiMarketTime(date: Date): { weekday: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "0";

  return {
    weekday: value("weekday"),
    minutes: toMinutes(Number(value("hour")), Number(value("minute")))
  };
}

function toMinutes(hour: number, minute: number): number {
  return hour * 60 + minute;
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
