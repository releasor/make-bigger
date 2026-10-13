export type StrategyStatus = "draft" | "published" | "paused" | "running";
export type RuleOperator = "gt" | "gte" | "lt" | "lte" | "eq";
export type SignalSide = "buy" | "sell";
export type OrderSide = "buy" | "sell";

export interface RuntimeParameters {
  maxPositionPct: number;
  stopLossPct: number;
  buyThreshold: number;
}

export interface VirtualTradingConfig {
  market: "A股";
  mode: "virtual_with_ai_advice";
  primaryHorizon: "intraday_short";
  startingCash: number;
  maxSymbolExposurePct: number;
  defaultOrderQuantity: number;
  autoTradingIntervalMs: number;
  killSwitch: boolean;
  realBrokerReserved: boolean;
}

export type StrategyHorizon = "intraday_short" | "swing" | "long_term";

export type AiApiProvider = "openai-compatible" | "deepseek" | "qwen" | "custom";

export interface AiApiConfig {
  enabled: boolean;
  provider: AiApiProvider;
  baseUrl: string;
  model: string;
  apiKeyConfigured: boolean;
  apiKeyMasked?: string;
  timeoutMs: number;
  temperature: number;
}

export interface AiApiConfigPatch {
  enabled?: boolean;
  provider?: AiApiProvider;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  timeoutMs?: number;
  temperature?: number;
}

export interface AiRuntimeStatus {
  enabled: boolean;
  mode: "ai_api" | "rule_fallback";
  provider: AiApiProvider;
  model: string;
  apiKeyConfigured: boolean;
}

/** 单个 AI API 配置条目（支持多配置） */
export interface AiApiConfigEntry {
  id: string;
  name: string;
  enabled: boolean;
  provider: AiApiProvider;
  baseUrl: string;
  model: string;
  apiKeyConfigured: boolean;
  apiKeyMasked?: string;
  /** 原始密钥（仅内部使用，不返回前端） */
  apiKey?: string;
  timeoutMs: number;
  temperature: number;
  isDefault: boolean;
}

/** 创建/更新 AI 配置时的输入 */
export interface AiApiConfigInput {
  name?: string;
  enabled?: boolean;
  provider?: AiApiProvider;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  timeoutMs?: number;
  temperature?: number;
}

/** AI 配置测试连接结果 */
export interface AiApiTestResult {
  ok: boolean;
  model?: string;
  latencyMs?: number;
  error?: string;
}

export interface VirtualTradePlan {
  entryZoneLow: number;
  entryZoneHigh: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  riskRewardRatio: number;
  positionPct: number;
  maxLossPctOfPortfolio: number;
  checklist: string[];
}

export interface EvaluatedStock {
  symbol: string;
  sector: string;
  rank: number;
  decision: "重点关注" | "观察等待" | "暂不纳入";
  latestPrice: number;
  scores: {
    trend: number;
    volume: number;
    abnormal: number;
    risk: number;
    total: number;
  };
  screeningEvidence: string[];
  tradePlan: VirtualTradePlan;
}


export interface StockAnalysisIndicator {
  name: string;
  status: "positive" | "neutral" | "negative";
  value: string;
  explanation: string;
}

export interface StockAnalysisExternalIntel {
  source: ExternalIntelSource;
  title: string;
  summary: string;
  relatedSymbols: string[];
  credibility: "verified" | "reported" | "unverified";
}

export interface StockAnalysisReport {
  query: string;
  symbol: string;
  name: string;
  market: "A股";
  horizon: "日内短线为主，波段/长线参考";
  decision: "重点关注" | "观察等待" | "暂不纳入";
  confidence: number;
  summary: string;
  indicators: StockAnalysisIndicator[];
  reasons: string[];
  risks: string[];
  tradePlan: VirtualTradePlan;
  externalIntel: StockAnalysisExternalIntel[];
  source: {
    provider: string;
    isReal: boolean;
    cacheHit: boolean;
    updatedAt: string;
  };
  disclaimer: string;
}

export interface AiTradingAdvice {
  id: string;
  horizon: StrategyHorizon;
  horizonLabel: string;
  priority: "primary" | "reference";
  symbol?: string;
  action: "buy_watch" | "hold_watch" | "risk_reduce" | "wait";
  title: string;
  summary: string;
  confidence: number;
  positionHintPct: number;
  riskBoundary: string;
  reasons: string[];
  evaluatedStocks?: EvaluatedStock[];
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
  universe: string[] | "*";
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
  universe: string[] | "*";
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

export type ExternalIntelSource = "dragon_tiger" | "news" | "theme" | "announcement";
export type ExternalIntelAvailability = "available" | "empty" | "unavailable" | "not_configured";

export interface ExternalIntelStatus {
  source: ExternalIntelSource;
  label: string;
  status: ExternalIntelAvailability;
  provider: string;
  message: string;
  updatedAt?: string;
  itemCount: number;
}

export interface MarketSentimentSnapshot {
  temperatureScore: number;
  trendLabel: "偏强" | "中性" | "偏弱";
  risingCount: number;
  fallingCount: number;
  trendUpCount: number;
  strongCount: number;
  volumeActiveCount: number;
  averageVolumeRatio: number;
  reasons: string[];
}

export interface SectorRotationItem {
  sector: string;
  sampleSize: number;
  strengthScore: number;
  persistenceScore: number;
  sampleQuality: "样本充足" | "样本不足";
  direction: "领涨" | "轮动" | "退潮";
  representativeSymbols: string[];
  reasons: string[];
}

export interface StrongStockCandidate {
  symbol: string;
  sector: string;
  latestPrice: number;
  trendScore: number;
  volumeScore: number;
  abnormalScore: number;
  totalScore: number;
  turnoverRate: number;
  labels: string[];
  basis: string[];
  riskNotes: string[];
}

export interface RiskSignal {
  id: string;
  level: "low" | "medium" | "high";
  title: string;
  reason: string;
  suggestion: string;
  symbol?: string;
}

export interface ExternalIntelItem {
  id: string;
  source: ExternalIntelSource;
  title: string;
  timestamp: string;
  provider: string;
  credibility: "verified" | "reported" | "unverified";
  relatedSymbols: string[];
  summary: string;
  url?: string;
}

export interface ShortTermActionPlan {
  mode: "进攻观察" | "精选跟踪" | "防守观望";
  positionTone: string;
  operationAdvice: string[];
  followUp: string[];
}

export interface ShortTermIntelligenceReport {
  title: "短线情报与决策中枢";
  generatedAt: string;
  outlook: string;
  actionPlan: ShortTermActionPlan;
  sentiment: MarketSentimentSnapshot;
  sectorRotation: SectorRotationItem[];
  watchlist: StrongStockCandidate[];
  nearAbnormal: StrongStockCandidate[];
  riskSignals: RiskSignal[];
  externalIntelStatuses: ExternalIntelStatus[];
  externalIntelItems: ExternalIntelItem[];
  conclusion: string;
  reasons: string[];
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

// 2026 年 A 股法定休市日（元旦、春节、清明、劳动节、端午、中秋、国庆）
const A_SHARE_HOLIDAYS_2026: Set<string> = new Set([
  // 元旦
  "2026-01-01", "2026-01-02", "2026-01-03",
  // 春节
  "2026-02-14", "2026-02-15", "2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19", "2026-02-20",
  // 清明节
  "2026-04-04", "2026-04-05", "2026-04-06",
  // 劳动节
  "2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04", "2026-05-05",
  // 端午节
  "2026-06-19", "2026-06-20", "2026-06-21",
  // 中秋节
  "2026-09-25", "2026-09-26", "2026-09-27",
  // 国庆节
  "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07"
]);

export function getAShareMarketSession(now: Date = new Date()): AShareMarketSession {
  const { weekday, minutes } = getShanghaiMarketTime(now);

  // Check holidays
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (A_SHARE_HOLIDAYS_2026.has(dateStr)) {
    return closedSession("closed_day", "法定节假日", "等待下一个交易日");
  }

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
  const now = new Date().toISOString();

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
  if (strategy.universe !== "*" && strategy.universe.length === 0) errors.push("universe must include at least one symbol");
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
