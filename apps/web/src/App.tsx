import { getAShareMarketSession, type AShareMarketSession } from "@itrade/domain";
import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import "./styles.css";

// ── Error Boundary ──

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <main className="shell">
          <div style={{ padding: "40px", textAlign: "center" }}>
            <h1>页面加载出错</h1>
            <p style={{ color: "var(--color-text-secondary)", marginTop: "12px" }}>
              {this.state.error?.message ?? "未知错误"}
            </p>
            <button
              className="primary"
              style={{ marginTop: "24px" }}
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
            >
              刷新页面
            </button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}

type Mode = "rules" | "canvas" | "ai";

// Fetch with timeout helper
function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = 30_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

interface MonitoringState {
  status: string;
  strategies: number;
  signals: number;
  orders: number;
  fills: number;
  positions: number;
  totalEquity: number;
  auditEvents: number;
  shortTermSignals?: number;
  manualPositions?: number;
  sellAlerts?: number;
  autoTrading?: AutoTradingState;
}

interface DailyReportState {
  tradingWinRate: number;
  signalHitRate: number;
  strategyTargetAchieved: boolean;
  dailyReturnPct: number;
}

interface AuditEventState {
  id: string;
  timestamp: string;
  actor: "system" | "user" | "ai";
  action: string;
  entityId: string;
  details: Record<string, string | number | boolean>;
}

interface StrategySignalState {
  id: string;
  strategyId: string;
  strategyVersion: number;
  symbol: string;
  side: "buy" | "sell";
  timestamp: string;
  confidence: number;
  reason: string;
}

interface VirtualOrderState {
  id: string;
  strategyId: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  requestedPrice: number;
  timestamp: string;
}

interface VirtualFillState {
  orderId: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  commission: number;
  tax: number;
  timestamp: string;
}

interface PortfolioPositionState {
  symbol: string;
  quantity: number;
  averageCost: number;
  marketPrice: number;
}

interface PortfolioSnapshotState {
  cash: number;
  positions: PortfolioPositionState[];
  totalEquity: number;
  realizedPnl: number;
  unrealizedPnl: number;
}

interface VirtualTradingLatestState {
  result: {
    signals: StrategySignalState[];
    orders: VirtualOrderState[];
    fills: VirtualFillState[];
    portfolio: PortfolioSnapshotState;
  } | null;
  portfolio: PortfolioSnapshotState;
  processedSignalIds: string[];
}

interface ShortTermBuySignalState {
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

interface ManualPositionState {
  id: string;
  signalId: string;
  symbol: string;
  quantity: number;
  entryPrice: number;
  stopLossPrice: number;
  entryTimestamp: string;
  status: "monitoring" | "sell_alerted" | "closed";
}

interface SellSignalAlertState {
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

interface MarketDataStatusState {
  source: {
    provider: string;
    isReal: boolean;
    updatedAt: string;
    symbols: string[];
    warnings: string[];
    cacheHit: boolean;
  };
  quality: {
    ok: boolean;
    issues: string[];
  };
  dailyBars: number;
  minuteBars: number;
}

interface VirtualTradingConfigState {
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

interface AiApiConfigState {
  enabled: boolean;
  provider: "openai-compatible" | "deepseek" | "qwen" | "custom";
  baseUrl: string;
  model: string;
  apiKeyConfigured: boolean;
  apiKeyMasked?: string;
  timeoutMs: number;
  temperature: number;
}

interface AiApiConfigEntryState {
  id: string;
  name: string;
  enabled: boolean;
  provider: "openai-compatible" | "deepseek" | "qwen" | "custom";
  baseUrl: string;
  model: string;
  apiKeyConfigured: boolean;
  apiKeyMasked?: string;
  timeoutMs: number;
  temperature: number;
  isDefault: boolean;
}

interface AiApiTestResultState {
  ok: boolean;
  model?: string;
  latencyMs?: number;
  error?: string;
}

interface AiApiDraftState {
  name?: string;
  enabled: boolean;
  provider: "openai-compatible" | "deepseek" | "qwen" | "custom";
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs: string;
  temperature: string;
}

interface VirtualTradePlanState {
  entryZoneLow: number;
  entryZoneHigh: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  riskRewardRatio: number;
  positionPct: number;
  maxLossPctOfPortfolio: number;
  checklist: string[];
}

interface EvaluatedStockState {
  symbol: string;
  sector: string;
  rank: number;
  decision: "重点关注" | "观察等待" | "暂不纳入";
  latestPrice: number;
  scores: { trend: number; volume: number; abnormal: number; risk: number; total: number };
  screeningEvidence: string[];
  tradePlan?: VirtualTradePlanState;
}

interface AiTradingAdviceState {
  id: string;
  horizon: "intraday_short" | "swing" | "long_term";
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
  evaluatedStocks?: EvaluatedStockState[];
}

interface AutoTradingState {
  enabled: boolean;
  phase: "paused" | "armed" | "running" | "error";
  intervalMs: number;
  runCount: number;
  lastDecision: "waiting" | "disabled" | "market_closed" | "already_running" | "auto_virtual_trade_run" | "error";
  lastCheckAt?: string;
  lastRunAt?: string;
  lastError?: string;
}

type ExternalIntelAvailabilityState = "available" | "empty" | "unavailable" | "not_configured";

interface ExternalIntelStatusState {
  source: "dragon_tiger" | "news" | "theme" | "announcement";
  label: string;
  status: ExternalIntelAvailabilityState;
  provider: string;
  message: string;
  updatedAt?: string;
  itemCount: number;
}

interface MarketSentimentSnapshotState {
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

interface SectorRotationItemState {
  sector: string;
  sampleSize: number;
  strengthScore: number;
  persistenceScore: number;
  sampleQuality: "样本充足" | "样本不足";
  direction: "领涨" | "轮动" | "退潮";
  representativeSymbols: string[];
  reasons: string[];
}

interface StrongStockCandidateState {
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

interface RiskSignalState {
  id: string;
  level: "low" | "medium" | "high";
  title: string;
  reason: string;
  suggestion: string;
  symbol?: string;
}

interface ShortTermIntelligenceReportState {
  title: "短线情报与决策中枢";
  generatedAt: string;
  outlook: string;
  actionPlan: {
    mode: "进攻观察" | "精选跟踪" | "防守观望";
    positionTone: string;
    operationAdvice: string[];
    followUp: string[];
  };
  sentiment: MarketSentimentSnapshotState;
  sectorRotation: SectorRotationItemState[];
  watchlist: StrongStockCandidateState[];
  nearAbnormal: StrongStockCandidateState[];
  riskSignals: RiskSignalState[];
  externalIntelStatuses: ExternalIntelStatusState[];
  externalIntelItems: unknown[];
  conclusion: string;
  reasons: string[];
}

interface StockAnalysisIndicatorState {
  name: string;
  status: "positive" | "neutral" | "negative";
  value: string;
  explanation: string;
}

interface StockAnalysisState {
  query: string;
  symbol: string;
  name: string;
  market: "A股";
  horizon: "日内短线为主，波段/长线参考";
  decision: "重点关注" | "观察等待" | "暂不纳入";
  confidence: number;
  summary: string;
  indicators: StockAnalysisIndicatorState[];
  reasons: string[];
  risks: string[];
  tradePlan: VirtualTradePlanState;
  externalIntel: Array<{ source: string; title: string; summary: string; relatedSymbols: string[]; credibility: string }>;
  source: { provider: string; isReal: boolean; cacheHit: boolean; updatedAt: string };
  disclaimer: string;
}

interface AppProps {
  now?: Date;
}

const initialTradeMessage = "等待短线信号扫描。";

export function App({ now = new Date() }: AppProps = {}) {
  const marketSession = getAShareMarketSession(now);
  const runCopy = getRunCopy(marketSession);
  const [mode, setMode] = useState<Mode>("rules");
  const [monitoring, setMonitoring] = useState<MonitoringState | null>(null);
  const [report, setReport] = useState<DailyReportState | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEventState[]>([]);
  const [shortTermSignals, setShortTermSignals] = useState<ShortTermBuySignalState[]>([]);
  const [manualPositions, setManualPositions] = useState<ManualPositionState[]>([]);
  const [sellAlerts, setSellAlerts] = useState<SellSignalAlertState[]>([]);
  const [marketData, setMarketData] = useState<MarketDataStatusState | null>(null);
  const [autoTrading, setAutoTrading] = useState<AutoTradingState | null>(null);
  const [virtualTradingLatest, setVirtualTradingLatest] = useState<VirtualTradingLatestState | null>(null);
  const [intelligenceReport, setIntelligenceReport] = useState<ShortTermIntelligenceReportState | null>(null);
  const [virtualTradingConfig, setVirtualTradingConfig] = useState<VirtualTradingConfigState | null>(null);
  const [configDraft, setConfigDraft] = useState({ startingCash: "100000", maxSymbolExposurePct: "0.2", defaultOrderQuantity: "1000", killSwitch: false });
  const [aiAdvice, setAiAdvice] = useState<AiTradingAdviceState[]>([]);
  const [configMessage, setConfigMessage] = useState("配置可调整，真实接口仅预留不启用。");
  const [aiApiConfig, setAiApiConfig] = useState<AiApiConfigState | null>(null);
  const [aiApiDraft, setAiApiDraft] = useState<AiApiDraftState>({ enabled: false, provider: "openai-compatible", baseUrl: "", model: "", apiKey: "", timeoutMs: "30000", temperature: "0.2" });
  const [aiApiMessage, setAiApiMessage] = useState("AI 未启用时使用规则引擎兜底。");
  const [aiConfigs, setAiConfigs] = useState<AiApiConfigEntryState[]>([]);
  const [activeAiConfigId, setActiveAiConfigId] = useState<string | null>(null);
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, AiApiTestResultState>>({});
  const [testingIds, setTestingIds] = useState<Set<string>>(new Set());
  const [stockQuery, setStockQuery] = useState("");
  const [stockAnalysis, setStockAnalysis] = useState<StockAnalysisState | null>(null);
  const [stockAnalysisMessage, setStockAnalysisMessage] = useState("输入股票名称或代码，系统会结合指标、短线情报、外部信息和虚拟交易计划分析。")
  const [isRunning, setIsRunning] = useState(false);
  const [markingSignalId, setMarkingSignalId] = useState<string | null>(null);
  const [runMessage, setRunMessage] = useState(runCopy.idle);
  const [tradeMessage, setTradeMessage] = useState(initialTradeMessage);

  // Volatile data: changes frequently, fetched on every poll interval
  async function refreshVolatileData() {
    const [
      monitoringRes,
      reportRes,
      auditRes,
      virtualTradingRes,
      adviceRes,
      autoTradingRes,
      intelligenceRes,
      shortTermRes,
      manualRes
    ] = await Promise.allSettled([
      fetch("/api/monitoring"),
      fetch("/api/report/daily"),
      fetch("/api/audit?limit=20"),
      fetch("/api/virtual-trading/latest"),
      fetch("/api/ai-advice"),
      fetch("/api/auto-trading/status"),
      fetch("/api/intelligence/short-term"),
      fetch("/api/short-term/signals"),
      fetch("/api/manual-positions")
    ]);

    let monitoringBody: MonitoringState | undefined;
    if (monitoringRes.status === "fulfilled" && monitoringRes.value.ok) {
      monitoringBody = (await monitoringRes.value.json()) as MonitoringState;
      setMonitoring(monitoringBody);
    }

    if (reportRes.status === "fulfilled" && reportRes.value.ok) {
      const body = await reportRes.value.json();
      setReport(body.report);
    }

    if (auditRes.status === "fulfilled" && auditRes.value.ok) {
      const body = (await auditRes.value.json()) as { events?: AuditEventState[] };
      setAuditEvents(body.events ?? []);
    }

    if (virtualTradingRes.status === "fulfilled" && virtualTradingRes.value.ok) {
      const body = (await virtualTradingRes.value.json()) as VirtualTradingLatestState;
      setVirtualTradingLatest(body);
    }

    if (adviceRes.status === "fulfilled" && adviceRes.value.ok) {
      const body = (await adviceRes.value.json()) as { advice?: AiTradingAdviceState[] };
      setAiAdvice(body.advice ?? []);
    }

    if (autoTradingRes.status === "fulfilled" && autoTradingRes.value.ok) {
      const body = (await autoTradingRes.value.json()) as { autoTrading?: AutoTradingState };
      setAutoTrading(body.autoTrading ?? monitoringBody?.autoTrading ?? null);
    }

    if (intelligenceRes.status === "fulfilled" && intelligenceRes.value.ok) {
      const body = (await intelligenceRes.value.json()) as { report?: ShortTermIntelligenceReportState };
      setIntelligenceReport(body.report ?? null);
    }

    if (shortTermRes.status === "fulfilled" && shortTermRes.value.ok) {
      const body = (await shortTermRes.value.json()) as { signals?: ShortTermBuySignalState[] };
      const latestSignals = body.signals ?? [];
      setShortTermSignals(latestSignals);
      setTradeMessage((message) => {
        if (message !== initialTradeMessage) return message;
        return latestSignals.length > 0 ? "发现特别值得关注的短线买入信号，等待人工确认。" : "暂无特别值得关注的短线买入信号。";
      });
    }

    if (manualRes.status === "fulfilled" && manualRes.value.ok) {
      const body = (await manualRes.value.json()) as {
        positions?: ManualPositionState[];
        sellAlerts?: SellSignalAlertState[];
      };
      setManualPositions(body.positions ?? []);
      setSellAlerts(body.sellAlerts ?? []);
    }

    return monitoringBody;
  }

  // Static data: rarely changes, fetched only on mount and after config mutations
  async function refreshStaticData() {
    const [marketDataRes, configRes, aiConfigRes, configsRes] = await Promise.allSettled([
      fetch("/api/market-data/status"),
      fetch("/api/virtual-trading/config"),
      fetch("/api/ai/config"),
      fetch("/api/ai/configs")
    ]);

    if (marketDataRes.status === "fulfilled" && marketDataRes.value.ok) {
      const body = (await marketDataRes.value.json()) as MarketDataStatusState;
      setMarketData(body);
    }

    if (configRes.status === "fulfilled" && configRes.value.ok) {
      const body = (await configRes.value.json()) as { config?: VirtualTradingConfigState };
      if (body.config) {
        setVirtualTradingConfig(body.config);
        setConfigDraft({
          startingCash: String(body.config.startingCash),
          maxSymbolExposurePct: String(body.config.maxSymbolExposurePct),
          defaultOrderQuantity: String(body.config.defaultOrderQuantity),
          killSwitch: body.config.killSwitch
        });
      }
    }

    if (aiConfigRes.status === "fulfilled" && aiConfigRes.value.ok) {
      const body = (await aiConfigRes.value.json()) as { config?: AiApiConfigState };
      if (body.config) {
        setAiApiConfig(body.config);
        setAiApiDraft((draft) => ({
          ...draft,
          enabled: body.config?.enabled ?? false,
          provider: body.config?.provider ?? "openai-compatible",
          baseUrl: body.config?.baseUrl ?? "",
          model: body.config?.model ?? "",
          timeoutMs: String(body.config?.timeoutMs ?? 30000),
          temperature: String(body.config?.temperature ?? 0.2)
        }));
      }
    }

    if (configsRes.status === "fulfilled" && configsRes.value.ok) {
      const body = (await configsRes.value.json()) as { configs?: AiApiConfigEntryState[]; activeId?: string | null };
      setAiConfigs(body.configs ?? []);
      setActiveAiConfigId(body.activeId ?? null);
    }
  }

  // Full refresh: both volatile and static data
  async function refresh() {
    const [monitoringBody] = await Promise.all([refreshVolatileData(), refreshStaticData()]);
    return monitoringBody;
  }

  async function runSimulation() {
    setIsRunning(true);

    try {
      if (marketSession.isOpen) {
        setRunMessage("正在启动自动虚拟盘...");

        const configResponse = await fetchWithTimeout("/api/auto-trading/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: true })
        });
        if (!configResponse.ok) throw new Error("auto trading config failed");

        const configBody = (await configResponse.json()) as { autoTrading?: AutoTradingState };
        setAutoTrading(configBody.autoTrading ?? null);

        const checkResponse = await fetchWithTimeout("/api/auto-trading/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}"
        });
        if (!checkResponse.ok) throw new Error("auto trading check failed");

        const checkBody = (await checkResponse.json()) as {
          autoTrading?: AutoTradingState;
          report?: DailyReportState;
        };
        setAutoTrading(checkBody.autoTrading ?? configBody.autoTrading ?? null);
        if (checkBody.report) setReport(checkBody.report);

        await refresh();
        setRunMessage("自动虚拟盘已启动，将持续运行到休盘");
        return;
      }

      setRunMessage(runCopy.running);
      const simulationResponse = await fetchWithTimeout("/api/simulation/run", { method: "POST" });
      if (!simulationResponse.ok) throw new Error("simulation failed");

      const latestMonitoring = await refresh();
      setRunMessage(`${runCopy.done}。审计事件：${latestMonitoring.auditEvents}`);
    } catch (error) {
      console.error("runSimulation failed:", error);
      setRunMessage("虚拟盘运行失败，请检查 API 服务。");
    } finally {
      setIsRunning(false);
    }
  }

  async function analyzeStock() {
    const query = stockQuery.trim();
    if (!query) {
      setStockAnalysisMessage("请输入股票名称或代码。")
      return;
    }

    try {
      setStockAnalysisMessage("正在分析股票...");
      const response = await fetchWithTimeout(`/api/stock-analysis?query=${encodeURIComponent(query)}`);
      if (!response.ok) {
        setStockAnalysisMessage("股票分析失败，请检查代码或数据源。")
        return;
      }

      const body = (await response.json()) as { analysis?: StockAnalysisState };
      setStockAnalysis(body.analysis ?? null);
      setStockAnalysisMessage("分析完成。结果仅用于虚拟交易和研究参考。")
    } catch (error) {
      console.error("analyzeStock failed:", error);
      setStockAnalysisMessage("网络错误，请检查 API 服务连接。");
    }
  }

  async function saveAiApiConfig() {
    try {
      const response = await fetchWithTimeout("/api/ai/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: aiApiDraft.enabled,
          provider: aiApiDraft.provider,
          baseUrl: aiApiDraft.baseUrl,
          model: aiApiDraft.model,
          apiKey: aiApiDraft.apiKey || undefined,
          timeoutMs: Number(aiApiDraft.timeoutMs),
          temperature: Number(aiApiDraft.temperature)
        })
      });

      if (!response.ok) {
        setAiApiMessage("AI API 配置保存失败，请检查地址、模型、超时和温度范围。")
        return;
      }

      const body = (await response.json()) as { config?: AiApiConfigState };
      if (body.config) setAiApiConfig(body.config);
      setAiApiDraft((draft) => ({ ...draft, apiKey: "" }));
      setAiApiMessage("AI API 配置已保存，密钥仅后端保存并脱敏显示。")
    } catch (error) {
      console.error("saveAiApiConfig failed:", error);
      setAiApiMessage("网络错误，请检查 API 服务连接。");
    }
  }

  // ── 多 AI 配置 CRUD ──

  async function addAiConfig() {
    try {
      const response = await fetchWithTimeout("/api/ai/configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: aiApiDraft.name || `配置 ${aiConfigs.length + 1}`,
          enabled: aiApiDraft.enabled,
          provider: aiApiDraft.provider,
          baseUrl: aiApiDraft.baseUrl,
          model: aiApiDraft.model,
          apiKey: aiApiDraft.apiKey || undefined,
          timeoutMs: Number(aiApiDraft.timeoutMs),
          temperature: Number(aiApiDraft.temperature)
        })
      });

      if (!response.ok) {
        setAiApiMessage("新增 AI 配置失败，请检查参数。");
        return;
      }

      const body = (await response.json()) as { config?: AiApiConfigEntryState };
      if (body.config) {
        setAiConfigs((prev) => [...prev, body.config!]);
        setShowAddForm(false);
        setAiApiDraft({ enabled: false, provider: "openai-compatible", baseUrl: "", model: "", apiKey: "", timeoutMs: "30000", temperature: "0.2" });
        setAiApiMessage(`配置 "${body.config.name}" 已添加。`);
      }
    } catch (error) {
      console.error("addAiConfig failed:", error);
      setAiApiMessage("网络错误，请检查 API 服务连接。");
    }
  }

  async function updateAiConfig(id: string) {
    try {
      const response = await fetchWithTimeout(`/api/ai/configs/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: aiApiDraft.enabled,
          provider: aiApiDraft.provider,
          baseUrl: aiApiDraft.baseUrl,
          model: aiApiDraft.model,
          apiKey: aiApiDraft.apiKey || undefined,
          timeoutMs: Number(aiApiDraft.timeoutMs),
          temperature: Number(aiApiDraft.temperature)
        })
      });

      if (!response.ok) {
        setAiApiMessage("更新配置失败。");
        return;
      }

      const body = (await response.json()) as { config?: AiApiConfigEntryState };
      if (body.config) {
        setAiConfigs((prev) => prev.map((c) => (c.id === id ? body.config! : c)));
        setEditingConfigId(null);
        setAiApiMessage(`配置 "${body.config.name}" 已更新。`);
      }
    } catch (error) {
      console.error("updateAiConfig failed:", error);
      setAiApiMessage("网络错误，请检查 API 服务连接。");
    }
  }

  async function deleteAiConfig(id: string) {
    try {
      const response = await fetchWithTimeout(`/api/ai/configs/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) {
        setAiApiMessage("删除配置失败。");
        return;
      }

      const body = (await response.json()) as { activeId?: string | null };
      setAiConfigs((prev) => prev.filter((c) => c.id !== id));
      setActiveAiConfigId(body.activeId ?? null);
      if (editingConfigId === id) setEditingConfigId(null);
      setAiApiMessage("配置已删除。");
    } catch (error) {
      console.error("deleteAiConfig failed:", error);
      setAiApiMessage("网络错误，请检查 API 服务连接。");
    }
  }

  async function activateAiConfig(id: string) {
    try {
      const response = await fetchWithTimeout(`/api/ai/configs/${encodeURIComponent(id)}/activate`, { method: "POST" });
      if (!response.ok) {
        setAiApiMessage("激活配置失败。");
        return;
      }

      const body = (await response.json()) as { config?: AiApiConfigEntryState; activeId?: string };
      setAiConfigs((prev) => prev.map((c) => ({ ...c, isDefault: c.id === id })));
      setActiveAiConfigId(body.activeId ?? id);
      setAiApiMessage(`配置 "${body.config?.name ?? id}" 已激活。`);
    } catch (error) {
      console.error("activateAiConfig failed:", error);
      setAiApiMessage("网络错误，请检查 API 服务连接。");
    }
  }

  async function testAiConfig(id: string) {
    setTestingIds((prev) => new Set(prev).add(id));
    setTestResults((prev) => ({ ...prev, [id]: undefined as unknown as AiApiTestResultState }));

    try {
      const response = await fetchWithTimeout(`/api/ai/configs/${encodeURIComponent(id)}/test`, { method: "POST" });
      const body = (await response.json()) as { result?: AiApiTestResultState };
      setTestResults((prev) => ({ ...prev, [id]: body.result ?? { ok: false, error: "无响应" } }));
    } catch (error) {
      console.error("testAiConfig failed:", error);
      setTestResults((prev) => ({ ...prev, [id]: { ok: false, error: "请求失败" } }));
    } finally {
      setTestingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  function startEditConfig(entry: AiApiConfigEntryState) {
    setEditingConfigId(entry.id);
    setShowAddForm(false);
    setAiApiDraft({
      enabled: entry.enabled,
      provider: entry.provider,
      baseUrl: entry.baseUrl,
      model: entry.model,
      apiKey: "",
      timeoutMs: String(entry.timeoutMs),
      temperature: String(entry.temperature)
    });
  }

  async function saveVirtualTradingConfig() {
    try {
      const response = await fetchWithTimeout("/api/virtual-trading/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startingCash: Number(configDraft.startingCash),
          maxSymbolExposurePct: Number(configDraft.maxSymbolExposurePct),
          defaultOrderQuantity: Number(configDraft.defaultOrderQuantity),
          killSwitch: configDraft.killSwitch
        })
      });

      if (!response.ok) {
        setConfigMessage("配置保存失败，请检查数值范围。");
        return;
      }

      const body = (await response.json()) as { config?: VirtualTradingConfigState };
      if (body.config) setVirtualTradingConfig(body.config);
      setConfigMessage("虚拟交易配置已保存。真实接口仍保持禁用。")
    } catch (error) {
      console.error("saveVirtualTradingConfig failed:", error);
      setConfigMessage("网络错误，请检查 API 服务连接。");
    }
  }

  async function markManualBuy(signal: ShortTermBuySignalState) {
    setMarkingSignalId(signal.id);
    setTradeMessage(`正在标记 ${signal.symbol} 买入，卖出监控即将启动。`);

    try {
      const response = await fetchWithTimeout(`/api/short-term/signals/${encodeURIComponent(signal.id)}/manual-buy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: 1000 })
      });
      if (!response.ok) throw new Error("manual buy failed");

      const body = (await response.json()) as {
        position: ManualPositionState;
        sellAlerts?: SellSignalAlertState[];
      };
      setManualPositions((positions) => [
        body.position,
        ...positions.filter((position) => position.signalId !== body.position.signalId)
      ]);
      setSellAlerts(body.sellAlerts ?? []);
      setTradeMessage("已标记买入，开始监测卖出信号。");
    } catch (error) {
      console.error("markManualBuy failed:", error);
      setTradeMessage("标记买入失败，请检查 API 服务。");
    } finally {
      setMarkingSignalId(null);
    }
  }

  async function setAutoTradingEnabled(enabled: boolean) {
    try {
      const response = await fetchWithTimeout("/api/auto-trading/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled })
      });
      if (!response.ok) return;

      const body = (await response.json()) as { autoTrading?: AutoTradingState };
      setAutoTrading(body.autoTrading ?? null);

      if (enabled) {
        const checkResponse = await fetchWithTimeout("/api/auto-trading/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}"
        });
        if (checkResponse.ok) {
          const checkBody = (await checkResponse.json()) as { autoTrading?: AutoTradingState };
          setAutoTrading(checkBody.autoTrading ?? body.autoTrading ?? null);
        }
        await refresh();
      }
    } catch (error) {
      console.error("setAutoTradingEnabled failed:", error);
    }
  }

  useEffect(() => {
    void fetch("/api/strategies");
    void refresh();
  }, []);

  useEffect(() => {
    if (!autoTrading?.enabled) return;

    const timer = window.setInterval(() => {
      void refreshVolatileData();
    }, autoTrading.intervalMs);

    return () => window.clearInterval(timer);
  }, [autoTrading?.enabled, autoTrading?.intervalMs]);

  const recentAuditEvents = [...auditEvents].slice(-6).reverse();
  const latestAuditEvent = recentAuditEvents[0];
  const runtimePhase = getRuntimePhase(isRunning, report);
  const latestOperation = isRunning ? "执行请求中" : latestAuditEvent ? auditActionLabel(latestAuditEvent.action) : "等待指令";
  const displayStatus = getDisplayStatus(monitoring?.status, isRunning, report);
  const timeline = buildRunTimeline(isRunning, monitoring, report, auditEvents);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">iTrade Virtual Desk</p>
          <h1>虚拟交易工作台</h1>
        </div>
        <div className="runControls">
          <button className="primary" onClick={runSimulation} disabled={isRunning}>
            {isRunning ? runCopy.activeButton : runCopy.button}
          </button>
          <p className="runStatus" role="status" aria-live="polite">
            {runMessage}
          </p>
        </div>
      </header>

      <section className="topGrid">
        <div className="mainColumn">
        <section className="panel workspace">
          <div className="panelHeader">
            <div>
              <h2>策略：双均线成交量策略</h2>
              <p>同一份策略定义，可在三种模式间切换。</p>
            </div>
            <div className="tabs" role="tablist" aria-label="策略搭建模式">
              <button role="tab" aria-selected={mode === "rules"} className={mode === "rules" ? "active" : ""} onClick={() => setMode("rules")}>
                结构化规则
              </button>
              <button role="tab" aria-selected={mode === "canvas"} className={mode === "canvas" ? "active" : ""} onClick={() => setMode("canvas")}>
                画布模块
              </button>
              <button role="tab" aria-selected={mode === "ai"} className={mode === "ai" ? "active" : ""} onClick={() => setMode("ai")}>
                AI 助手
              </button>
            </div>
          </div>
          {mode === "rules" && <div role="tabpanel"><RulesMode /></div>}
          {mode === "canvas" && <div role="tabpanel"><CanvasMode /></div>}
          {mode === "ai" && <div role="tabpanel"><AiMode /></div>}
        </section>

        <ShortTermIntelligencePanel
          auditEvents={recentAuditEvents}
          autoTrading={autoTrading}
          marketData={marketData}
          report={intelligenceReport}
        />

        <StockAnalysisPanel
          analysis={stockAnalysis}
          message={stockAnalysisMessage}
          query={stockQuery}
          onAnalyze={analyzeStock}
          onQueryChange={setStockQuery}
        />

        <TradingConfigurationPanel
          config={virtualTradingConfig}
          draft={configDraft}
          message={configMessage}
          onDraftChange={setConfigDraft}
          onSave={saveVirtualTradingConfig}
        />

        <AiApiConfigPanel
          config={aiApiConfig}
          configs={aiConfigs}
          activeId={activeAiConfigId}
          draft={aiApiDraft}
          message={aiApiMessage}
          editingId={editingConfigId}
          showAddForm={showAddForm}
          testResults={testResults}
          testingIds={testingIds}
          onDraftChange={setAiApiDraft}
          onSave={saveAiApiConfig}
          onAdd={addAiConfig}
          onUpdate={updateAiConfig}
          onDelete={deleteAiConfig}
          onActivate={activateAiConfig}
          onTest={testAiConfig}
          onStartEdit={startEditConfig}
          onCancelEdit={() => { setEditingConfigId(null); setAiApiDraft({ enabled: false, provider: "openai-compatible", baseUrl: "", model: "", apiKey: "", timeoutMs: "30000", temperature: "0.2" }); }}
          onToggleAddForm={() => { setShowAddForm(!showAddForm); setEditingConfigId(null); setAiApiDraft({ enabled: false, provider: "openai-compatible", baseUrl: "", model: "", apiKey: "", timeoutMs: "30000", temperature: "0.2" }); }}
        />

        <AiAdvicePanel advice={aiAdvice} />
        </div>

        <aside className="panel monitorPanel">
          <div className="monitorHeader">
            <h2>实时监控</h2>
            <span className={autoTrading?.enabled ? "monitorBadge live" : "monitorBadge idle"}>
              {autoTrading?.enabled ? "自动监控中" : "手动观察"}
            </span>
          </div>
          <div className={`marketStatus ${marketSession.isOpen ? "open" : "closed"}`} aria-label="A股市场状态">
            <strong>市场状态：{marketSession.label}</strong>
            <span>当前时段：{marketSession.sessionName}</span>
            <small>{marketSession.nextAction}</small>
          </div>
          <div className={`dataStatus ${marketData?.source.isReal ? "real" : "sample"}`} aria-label="行情数据状态">
            <div>
              <strong>行情数据</strong>
              <span>{marketData ? dataRealityLabel(marketData) : "加载中"}</span>
            </div>
            <p>数据源：{marketData?.source.provider ?? "加载中"}</p>
            <p>数据质量：{marketData?.quality.ok ? "正常" : "需检查"}</p>
            <p>日线/分钟：{marketData ? `${marketData.dailyBars}/${marketData.minuteBars}` : "0/0"}</p>
            {marketData && marketData.source.warnings.length > 0 && (
              <small>{marketData.source.warnings.slice(0, 2).join("；")}</small>
            )}
          </div>
          <div className={`autoTradingStatus ${autoTrading?.enabled ? "enabled" : "paused"}`}>
            <div>
              <strong>自动虚拟交易</strong>
              <span>{autoTrading?.enabled ? "已启用" : "已暂停"}</span>
            </div>
            <p>状态：{autoTrading ? autoTradingPhaseLabel(autoTrading.phase) : "加载中"}</p>
            <p>自动运行次数：{autoTrading?.runCount ?? 0}</p>
            <p>最近决策：{autoTrading ? autoTradingDecisionLabel(autoTrading.lastDecision) : "加载中"}</p>
            {autoTrading?.lastRunAt && <small>最近运行：{formatAuditTime(autoTrading.lastRunAt)}</small>}
            {autoTrading?.lastError && <small>{autoTrading.lastError}</small>}
            <button className="secondary" onClick={() => void setAutoTradingEnabled(!(autoTrading?.enabled ?? false))}>
              {autoTrading?.enabled ? "暂停自动交易" : "启用自动交易"}
            </button>
          </div>
          <dl className="metrics">
            <div>
              <dt>虚拟盘</dt>
              <dd>{displayStatus}</dd>
            </div>
            <div>
              <dt>策略数</dt>
              <dd>{monitoring?.strategies ?? 0}</dd>
            </div>
            <div>
              <dt>信号/订单/成交</dt>
              <dd>{monitoring ? `${monitoring.signals}/${monitoring.orders}/${monitoring.fills}` : "0/0/0"}</dd>
            </div>
            <div>
              <dt>短线/人工/卖出提醒</dt>
              <dd>{`${shortTermSignals.length}/${manualPositions.length}/${sellAlerts.length}`}</dd>
            </div>
            <div>
              <dt>组合权益</dt>
              <dd>{money(monitoring?.totalEquity ?? 100000)}</dd>
            </div>
            <div>
              <dt>风险</dt>
              <dd className="ok">正常</dd>
            </div>
          </dl>

          <div className="runtimePanel" aria-label="虚拟盘当前执行">
            <h3>当前执行</h3>
            <p>运行阶段：{runtimePhase}</p>
            <p>最新操作：{latestOperation}</p>
            <p>最后更新时间：{latestAuditEvent ? formatAuditTime(latestAuditEvent.timestamp) : "暂无"}</p>
            <ol className="timeline" aria-label="虚拟盘执行阶段">
              {timeline.map((step) => (
                <li className={`timelineStep ${step.state}`} key={step.label}>
                  <span>{step.label}</span>
                  <strong>{step.detail}</strong>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </section>

      <VirtualTradingDetailPanel latest={virtualTradingLatest} />

      <section className="signalGrid">
        <section className="panel signalPanel">
          <div className="panelHeader signalHeader">
            <div>
              <h2>短线信号中心</h2>
              <p>AI 虚拟交易提示</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="signalCounter">{shortTermSignals.length} 条</span>
              {shortTermSignals.length > 0 && (
                <button className="ghost" onClick={() => exportSignalsCsv(shortTermSignals)} title="导出信号 CSV">导出</button>
              )}
            </div>
          </div>
          <p className="tradeMessage" aria-live="polite">
            {tradeMessage}
          </p>
          {shortTermSignals.length > 0 ? (
            <div className="signalList">
              {shortTermSignals.map((signal) => (
                <ShortTermSignalItem
                  isMarked={manualPositions.some((position) => position.signalId === signal.id)}
                  isMarking={markingSignalId === signal.id}
                  key={signal.id}
                  onManualBuy={markManualBuy}
                  signal={signal}
                />
              ))}
            </div>
          ) : (
            <p className="emptyState">暂无达到阈值的短线买入信号。</p>
          )}
        </section>

        <section className="panel holdingPanel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2>人工持仓监控</h2>
            {manualPositions.length > 0 && (
              <button className="ghost" onClick={() => exportPositionsCsv(manualPositions)} title="导出持仓 CSV">导出</button>
            )}
          </div>
          {manualPositions.length > 0 ? (
            <ul className="positionList">
              {manualPositions.map((position) => (
                <li key={position.id}>
                  <strong>
                    {position.symbol} {position.quantity} 股，成本 {price(position.entryPrice)}
                  </strong>
                  <span>止损观察 {price(position.stopLossPrice)}，状态：{positionStatusLabel(position.status)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="emptyState">尚未标记买入，等待短线信号确认。</p>
          )}
          <div className="sellAlertBox">
            <h3>卖出提醒</h3>
            {sellAlerts.length > 0 ? (
              <ul className="positionList">
                {sellAlerts.map((alert) => (
                  <li className="sellAlert" key={alert.id}>
                    <strong>
                      {alert.symbol}：{alert.action}
                    </strong>
                    <span>
                      {alert.reason}，现价 {price(alert.currentPrice)}
                    </span>
                    <small>{alert.basis.join("；")}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="emptyState">{manualPositions.length > 0 ? "暂无卖出提醒，继续监测。" : "等待手动买入后开始监测。"}</p>
            )}
          </div>
        </section>
      </section>

      <section className="grid three">
        <section className="panel">
          <h2>日报指标</h2>
          {report ? (
            <>
              <p>交易胜率：{percent(report.tradingWinRate)}</p>
              <p>信号命中率：{percent(report.signalHitRate)}</p>
              <p>策略达标：{report.strategyTargetAchieved ? "是" : "否"}</p>
              <p>当日收益：{percent(report.dailyReturnPct)}</p>
            </>
          ) : (
            <p>胜率、命中率、达标率将在虚拟盘运行后生成。</p>
          )}
        </section>
        {marketSession.showAfterMarketAnalysis && (
          <section className="panel afterMarketPanel">
            <h2>盘后分析</h2>
            {report ? (
              <>
                <p>今日虚拟盘收益：{percent(report.dailyReturnPct)}</p>
                <p>复盘结论：策略今日{report.strategyTargetAchieved ? "达标" : "未达标"}</p>
                <p>
                  成交复盘：
                  {monitoring ? `${monitoring.fills} 笔成交，${monitoring.positions} 个持仓` : "等待监控数据"}
                </p>
                <p>次日观察：继续跟踪高置信度信号、未命中信号和风控拒单原因。</p>
              </>
            ) : (
              <p>盘后分析将在虚拟盘运行后生成。</p>
            )}
          </section>
        )}
        <section className="panel">
          <h2>审计日志</h2>
          <p>已记录事件：{monitoring?.auditEvents ?? 0}</p>
          <ul className="auditList" aria-label="最近审计事件">
            {recentAuditEvents.length > 0 ? (
              recentAuditEvents.map((event, index) => (
                <li key={`${event.id}-${index}`}>
                  <div>
                    <strong>{auditActionLabel(event.action)}</strong>
                    <time>{formatAuditTime(event.timestamp)}</time>
                  </div>
                  <p>{auditEventSummary(event)}</p>
                </li>
              ))
            ) : (
              <li className="emptyAudit">暂无审计事件。运行虚拟盘后会显示风控、下单和成交记录。</li>
            )}
          </ul>
        </section>
        <section className="panel">
          <h2>告警中心</h2>
          <p>第一版提供平台内状态灯、日志和通知。</p>
        </section>
      </section>
    </main>
  );
}

function VirtualTradingDetailPanel({ latest }: { latest: VirtualTradingLatestState | null }) {
  const result = latest?.result;
  const signals = result?.signals ?? [];
  const orders = result?.orders ?? [];
  const fills = result?.fills ?? [];
  const ordersBySignalId = new Map(orders.map((order) => [order.id.replace(/^order-/, ""), order]));
  const fillsByOrderId = new Map(fills.map((fill) => [fill.orderId, fill]));

  return (
    <section className="panel virtualDetailPanel" aria-label="虚拟盘信号与交易明细">
      <div className="panelHeader signalHeader">
        <div>
          <h2>虚拟盘信号与交易明细</h2>
          <p>展示策略生成的信号、模拟委托和实际虚拟成交。</p>
        </div>
        <div className="detailCounters" aria-label="虚拟盘明细统计">
          <span>{signals.length} 信号</span>
          <span>{orders.length} 委托</span>
          <span>{fills.length} 成交</span>
        </div>
      </div>

      {signals.length > 0 ? (
        <div className="virtualDetailGrid">
          <section>
            <h3>生成的策略信号</h3>
            <ul className="detailList">
              {signals.slice(0, 8).map((signal) => {
                const order = ordersBySignalId.get(signal.id);
                const fill = order ? fillsByOrderId.get(order.id) : undefined;

                return (
                  <li key={signal.id}>
                    <div className="detailTopline">
                      <strong>
                        {signal.symbol} {sideLabel(signal.side)}
                      </strong>
                      <span className={fill ? "detailStatus filled" : order ? "detailStatus ordered" : "detailStatus signalOnly"}>
                        {fill ? "已成交" : order ? "已委托" : "仅信号"}
                      </span>
                    </div>
                    <p>
                      触发时间：{formatAuditTime(signal.timestamp)}；策略：{signal.strategyId} v{signal.strategyVersion}
                    </p>
                    <p>信号原因：{signalReasonLabel(signal.reason)}</p>
                    <small>置信度：{percent(signal.confidence)}</small>
                  </li>
                );
              })}
            </ul>
          </section>

          <section>
            <h3>具体虚拟交易</h3>
            {fills.length > 0 ? (
              <ul className="detailList">
                {fills.slice(0, 8).map((fill) => {
                  const order = orders.find((item) => item.id === fill.orderId);
                  const amount = fill.price * fill.quantity;

                  return (
                    <li key={`${fill.orderId}-${fill.timestamp}`}>
                      <div className="detailTopline">
                        <strong>
                          {fill.symbol} {sideLabel(fill.side)} {fill.quantity} 股
                        </strong>
                        <span className="detailStatus filled">虚拟成交</span>
                      </div>
                      <p>
                        委托价：{order ? price(order.requestedPrice) : "-"}；成交价：{price(fill.price)}；成交额：
                        {money(amount)}
                      </p>
                      <p>
                        佣金：{money(fill.commission)}；印花税：{money(fill.tax)}；时间：{formatAuditTime(fill.timestamp)}
                      </p>
                      <small>订单：{fill.orderId}</small>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="emptyState">本轮暂无虚拟成交。可能是没有信号、已有持仓、数量不足或风控未通过。</p>
            )}
          </section>

          <section className="portfolioSummary">
            <h3>当前虚拟持仓</h3>
            <p>总权益：{money(latest?.portfolio.totalEquity ?? 100000)}</p>
            <p>现金：{money(latest?.portfolio.cash ?? 100000)}</p>
            {latest?.portfolio.positions.length ? (
              <ul className="detailList compact">
                {latest.portfolio.positions.map((position) => (
                  <li key={position.symbol}>
                    <strong>
                      {position.symbol} {position.quantity} 股
                    </strong>
                    <span>
                      成本 {price(position.averageCost)}；现价 {price(position.marketPrice)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="emptyState">暂无虚拟持仓。</p>
            )}
          </section>
        </div>
      ) : (
        <p className="emptyState">还没有生成策略信号。运行虚拟盘后，这里会显示每条信号和对应的虚拟交易。</p>
      )}
    </section>
  );
}



function StockAnalysisPanel({
  analysis,
  message,
  query,
  onAnalyze,
  onQueryChange
}: {
  analysis: StockAnalysisState | null;
  message: string;
  query: string;
  onAnalyze: () => Promise<void>;
  onQueryChange: (query: string) => void;
}) {
  return (
    <section className="panel stockAnalysisPanel">
      <div className="panelHeader">
        <div>
          <h2>单股综合分析</h2>
          <p>输入股票名称或代码，结合 MA20、VWAP、RSI14、ATR14、成交量、板块和外部信息分析。</p>
        </div>
      </div>
      <div className="stockAnalysisSearch">
        <label>
          股票名称或代码
          <input
            aria-label="股票名称或代码"
            placeholder="例如：000001.SZ / 000001 / 平安银行"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void onAnalyze();
              }
            }}
          />
        </label>
        <button className="primary" onClick={() => void onAnalyze()}>分析股票</button>
      </div>
      <p className="stockAnalysisMessage">{message}</p>
      {analysis && (
        <article className="stockAnalysisResult">
          <div className="stockAnalysisTopline">
            <div>
              <h3>{analysis.symbol} · {analysis.name}</h3>
              <p>{analysis.market}｜{analysis.horizon}｜数据源：{analysis.source.provider}{analysis.source.cacheHit ? "缓存" : ""}</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className={`decisionBadge ${decisionClass(analysis.decision)}`}>{analysis.decision}</span>
              <button
                className="ghost"
                onClick={() => {
                  const text = [
                    `${analysis.symbol} · ${analysis.name}`,
                    `${analysis.decision} | 置信度 ${analysis.confidence}%`,
                    analysis.summary,
                    "",
                    "指标：",
                    ...analysis.indicators.map((i) => `  ${i.name}: ${i.value} → ${i.status}`),
                    "",
                    "交易计划：",
                    `  入场区间: ${analysis.tradePlan.entryZoneLow} - ${analysis.tradePlan.entryZoneHigh}`,
                    `  止损: ${analysis.tradePlan.stopLossPrice}`,
                    `  止盈: ${analysis.tradePlan.takeProfitPrice}`,
                    `  盈亏比: ${analysis.tradePlan.riskRewardRatio.toFixed(2)}`,
                    "",
                    "依据：",
                    ...analysis.basis.map((b) => `  · ${b}`)
                  ].join("\n");
                  void navigator.clipboard.writeText(text);
                }}
                title="复制分析结果"
              >
                复制
              </button>
            </div>
          </div>
          <p>{analysis.summary}</p>
          <div className="adviceMetrics">
            <span>置信度：{percent(analysis.confidence)}</span>
            <span>更新时间：{formatAuditTime(analysis.source.updatedAt)}</span>
          </div>
          <div className="indicatorGrid">
            {analysis.indicators.map((indicator) => (
              <div className={`indicatorCard ${indicator.status}`} key={indicator.name}>
                <strong>{indicator.name}</strong>
                <span>{indicator.value}</span>
                <p>{indicator.explanation}</p>
              </div>
            ))}
          </div>
          <div className="tradePlanBox">
            <h4>交易计划</h4>
            <div className="tradePlanMetrics">
              <span>入场区间：{price(analysis.tradePlan.entryZoneLow)} - {price(analysis.tradePlan.entryZoneHigh)}</span>
              <span>止损：{price(analysis.tradePlan.stopLossPrice)}</span>
              <span>止盈：{price(analysis.tradePlan.takeProfitPrice)}</span>
              <span>盈亏比：{analysis.tradePlan.riskRewardRatio.toFixed(2)}</span>
              <span>仓位：{percent(analysis.tradePlan.positionPct)}</span>
            </div>
            <ul>{analysis.tradePlan.checklist.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
          <div className="stockAnalysisColumns">
            <section>
              <h4>判断依据</h4>
              <ul>{analysis.reasons.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
            <section>
              <h4>风险提示</h4>
              <ul>{analysis.risks.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
            <section>
              <h4>外部信息</h4>
              {analysis.externalIntel.length > 0 ? (
                <ul>{analysis.externalIntel.map((item) => <li key={item.title}><strong>{item.title}</strong><span>{item.summary}</span></li>)}</ul>
              ) : <p className="emptyState">暂无匹配外部信息。</p>}
            </section>
          </div>
          <p className="riskBoundary">{analysis.disclaimer}</p>
        </article>
      )}
    </section>
  );
}

function TradingConfigurationPanel({
  config,
  draft,
  message,
  onDraftChange,
  onSave
}: {
  config: VirtualTradingConfigState | null;
  draft: { startingCash: string; maxSymbolExposurePct: string; defaultOrderQuantity: string; killSwitch: boolean };
  message: string;
  onDraftChange: (draft: { startingCash: string; maxSymbolExposurePct: string; defaultOrderQuantity: string; killSwitch: boolean }) => void;
  onSave: () => Promise<void>;
}) {
  return (
    <section className="panel tradingConfigPanel">
      <div className="panelHeader">
        <div>
          <h2>虚拟交易配置</h2>
          <p>面向 A 股日内短线虚拟交易，可调整资金、仓位、下单数量和熔断。</p>
        </div>
        <span className="reservedBroker">真实接口：已预留，当前禁用</span>
      </div>
      <div className="configFacts">
        <span>市场：{config?.market ?? "A股"}</span>
        <span>模式：虚拟交易 + AI建议</span>
        <span>主策略：日内短线</span>
      </div>
      <div className="configForm">
        <label>
          初始资金
          <input
            aria-label="初始资金"
            inputMode="numeric"
            value={draft.startingCash}
            onChange={(event) => onDraftChange({ ...draft, startingCash: event.target.value })}
          />
        </label>
        <label>
          单票暴露上限
          <input
            aria-label="单票暴露上限"
            inputMode="decimal"
            value={draft.maxSymbolExposurePct}
            onChange={(event) => onDraftChange({ ...draft, maxSymbolExposurePct: event.target.value })}
          />
        </label>
        <label>
          默认虚拟下单股数
          <input
            aria-label="默认虚拟下单股数"
            inputMode="numeric"
            value={draft.defaultOrderQuantity}
            onChange={(event) => onDraftChange({ ...draft, defaultOrderQuantity: event.target.value })}
          />
        </label>
        <label className="checkboxLabel">
          <input
            aria-label="启用熔断"
            checked={draft.killSwitch}
            type="checkbox"
            onChange={(event) => onDraftChange({ ...draft, killSwitch: event.target.checked })}
          />
          启用虚拟盘熔断
        </label>
      </div>
      <div className="configFooter">
        <button className="secondary" onClick={() => void onSave()}>保存虚拟交易配置</button>
        <p>{message}</p>
      </div>
    </section>
  );
}


function AiApiConfigPanel({
  config,
  configs,
  activeId,
  draft,
  message,
  editingId,
  showAddForm,
  testResults,
  testingIds,
  onDraftChange,
  onSave,
  onAdd,
  onUpdate,
  onDelete,
  onActivate,
  onTest,
  onStartEdit,
  onCancelEdit,
  onToggleAddForm
}: {
  config: AiApiConfigState | null;
  configs: AiApiConfigEntryState[];
  activeId: string | null;
  draft: AiApiDraftState;
  message: string;
  editingId: string | null;
  showAddForm: boolean;
  testResults: Record<string, AiApiTestResultState>;
  testingIds: Set<string>;
  onDraftChange: (draft: AiApiDraftState) => void;
  onSave: () => Promise<void>;
  onAdd: () => Promise<void>;
  onUpdate: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onActivate: (id: string) => Promise<void>;
  onTest: (id: string) => Promise<void>;
  onStartEdit: (entry: AiApiConfigEntryState) => void;
  onCancelEdit: () => void;
  onToggleAddForm: () => void;
}) {
  const enabledAndReady = Boolean(config?.enabled && config.apiKeyConfigured && config.baseUrl && config.model);

  function renderConfigForm(onSubmit: () => Promise<void>, submitLabel: string) {
    return (
      <div className="aiApiForm">
        <label>
          配置名称
          <input aria-label="配置名称" value={draft.name ?? ""} onChange={(event) => onDraftChange({ ...draft, name: event.target.value })} placeholder="如：DeepSeek 主力" />
        </label>
        <label className="checkboxLabel">
          <input
            aria-label="启用此配置"
            checked={draft.enabled}
            type="checkbox"
            onChange={(event) => onDraftChange({ ...draft, enabled: event.target.checked })}
          />
          启用此配置
        </label>
        <label>
          服务商
          <select value={draft.provider} onChange={(event) => onDraftChange({ ...draft, provider: event.target.value as AiApiDraftState["provider"] })}>
            <option value="openai-compatible">OpenAI 兼容</option>
            <option value="deepseek">DeepSeek</option>
            <option value="qwen">Qwen</option>
            <option value="custom">自定义</option>
          </select>
        </label>
        <label>
          Base URL
          <input aria-label="AI Base URL" value={draft.baseUrl} onChange={(event) => onDraftChange({ ...draft, baseUrl: event.target.value })} placeholder="https://api.deepseek.com/v1" />
        </label>
        <label>
          模型
          <input aria-label="AI 模型" value={draft.model} onChange={(event) => onDraftChange({ ...draft, model: event.target.value })} placeholder="deepseek-chat" />
        </label>
        <label>
          API Key
          <input aria-label="AI API Key" type="password" value={draft.apiKey} onChange={(event) => onDraftChange({ ...draft, apiKey: event.target.value })} placeholder="留空则不更新密钥" />
        </label>
        <label>
          超时 ms
          <input aria-label="AI 超时" inputMode="numeric" value={draft.timeoutMs} onChange={(event) => onDraftChange({ ...draft, timeoutMs: event.target.value })} />
        </label>
        <label>
          温度
          <input aria-label="AI 温度" inputMode="decimal" value={draft.temperature} onChange={(event) => onDraftChange({ ...draft, temperature: event.target.value })} />
        </label>
        <div className="configFormActions">
          <button className="secondary" onClick={() => void onSubmit()}>{submitLabel}</button>
          <button className="ghost" onClick={onCancelEdit}>取消</button>
        </div>
      </div>
    );
  }

  return (
    <section className="panel aiApiConfigPanel">
      <div className="panelHeader">
        <div>
          <h2>AI API 接入配置</h2>
          <p>支持保存多个 AI 服务配置，可切换默认启用的配置。</p>
        </div>
        <span className={enabledAndReady ? "aiApiStatus ready" : "aiApiStatus fallback"}>
          {enabledAndReady ? "AI API 已启用" : "规则兜底"}
        </span>
      </div>

      {/* 已保存配置列表 */}
      {configs.length > 0 && (
        <div className="aiConfigList">
          {configs.map((entry) => {
            const isActive = entry.id === activeId;
            const isEditing = entry.id === editingId;
            const testResult = testResults[entry.id];
            const isTesting = testingIds.has(entry.id);

            return (
              <div key={entry.id} className={`aiConfigCard ${isActive ? "active" : ""}`}>
                <div className="aiConfigCardHeader">
                  <div className="aiConfigCardInfo">
                    <strong>{entry.name}</strong>
                    <span className="aiConfigProvider">{entry.provider} / {entry.model}</span>
                    {entry.apiKeyMasked && <span className="aiConfigKey">密钥：{entry.apiKeyMasked}</span>}
                  </div>
                  <div className="aiConfigCardBadges">
                    {isActive && <span className="aiConfigBadge active">当前启用</span>}
                    {entry.enabled && !isActive && <span className="aiConfigBadge enabled">已启用</span>}
                    {!entry.enabled && <span className="aiConfigBadge disabled">已禁用</span>}
                  </div>
                </div>
                <div className="aiConfigCardActions">
                  {!isActive && (
                    <button className="ghost" onClick={() => void onActivate(entry.id)}>设为默认</button>
                  )}
                  <button className="ghost" onClick={() => onStartEdit(entry)}>编辑</button>
                  <button
                    className="ghost"
                    onClick={() => void onTest(entry.id)}
                    disabled={isTesting}
                  >
                    {isTesting ? "测试中..." : "测试连接"}
                  </button>
                  <button className="ghost danger" onClick={() => void onDelete(entry.id)}>删除</button>
                </div>
                {testResult && (
                  <div className={`aiTestResult ${testResult.ok ? "success" : "error"}`}>
                    {testResult.ok
                      ? `✓ 连接成功，模型 ${testResult.model}，延迟 ${testResult.latencyMs}ms`
                      : `✗ 连接失败：${testResult.error}`}
                  </div>
                )}
                {isEditing && renderConfigForm(() => onUpdate(entry.id), "更新配置")}
              </div>
            );
          })}
        </div>
      )}

      {/* 添加新配置 */}
      {showAddForm && renderConfigForm(onAdd, "添加配置")}

      {!showAddForm && !editingId && (
        <div className="configFooter">
          <button className="secondary" onClick={onToggleAddForm}>添加新配置</button>
          <button className="secondary" onClick={() => void onSave()}>保存到旧版配置</button>
          <p>{message}</p>
        </div>
      )}

      {!showAddForm && editingId && <p className="aiApiMessage">{message}</p>}

      {/* 旧版单配置状态（兼容） */}
      {configs.length === 0 && !showAddForm && (
        <>
          <p className="aiApiRuntime">
            状态：{enabledAndReady ? `已启用 ${config?.provider} / ${config?.model}` : "未启用，当前使用规则引擎兜底"}
          </p>
          {config?.apiKeyMasked && <p className="aiApiRuntime">密钥：{config.apiKeyMasked}</p>}
          {renderConfigForm(onSave, "保存 AI API 配置")}
        </>
      )}
    </section>
  );
}

function AiAdvicePanel({ advice }: { advice: AiTradingAdviceState[] }) {
  return (
    <section className="panel aiAdvicePanel">
      <div className="panelHeader">
        <div>
          <h2>AI 多周期建议</h2>
          <p>短线为主，波段和长线只作参考，三类建议有明显区分。</p>
        </div>
      </div>
      <div className="adviceGrid">
        {advice.map((item) => (
          <article className={`adviceCard ${item.horizon} ${item.priority}`} key={item.id}>
            <div className="adviceTopline">
              <strong>{item.horizonLabel}</strong>
              <span>{item.priority === "primary" ? "主策略" : "参考"}</span>
            </div>
            <h3>{item.title}</h3>
            <p>{item.summary}</p>
            <div className="adviceMetrics">
              <span>AI置信度：{percent(item.confidence)}</span>
              <span>AI仓位提示：{percent(item.positionHintPct)}</span>
            </div>
            <p className="riskBoundary">风险边界：{item.riskBoundary}</p>
            <ul>
              {item.reasons.slice(0, 3).map((reason) => <li key={reason}>{reason}</li>)}
            </ul>
          </article>
        ))}
      </div>
      <EvaluatedStockList stocks={advice.find((item) => item.horizon === "intraday_short")?.evaluatedStocks ?? []} />
    </section>
  );
}


function EvaluatedStockList({ stocks }: { stocks: EvaluatedStockState[] }) {
  if (stocks.length === 0) return null;

  return (
    <section className="evaluatedStockPanel" aria-label="判断股票列表">
      <div className="evaluatedHeader">
        <h3>判断股票列表</h3>
        <span>{stocks.length} 只已评估</span>
      </div>
      <div className="evaluatedStockList">
        {stocks.map((stock) => (
          <article className="evaluatedStockCard" key={stock.symbol}>
            <div className="stockTopline">
              <strong>{stock.symbol} · {stock.sector}</strong>
              <span className={`decisionBadge ${decisionClass(stock.decision)}`}>{stock.decision}</span>
            </div>
            <div className="stockScores">
              <span>排名 #{stock.rank}</span>
              <span>总分 {stock.scores.total}</span>
              <span>趋势 {stock.scores.trend}</span>
              <span>量能 {stock.scores.volume}</span>
              <span>异动 {stock.scores.abnormal}</span>
              <span>风险 {stock.scores.risk}</span>
            </div>
            <p>现价：{price(stock.latestPrice)}</p>
            {stock.tradePlan && (
              <div className="tradePlanBox">
                <h4>交易计划</h4>
                <div className="tradePlanMetrics">
                  <span>入场区间：{price(stock.tradePlan.entryZoneLow)} - {price(stock.tradePlan.entryZoneHigh)}</span>
                  <span>止损：{price(stock.tradePlan.stopLossPrice)}</span>
                  <span>止盈：{price(stock.tradePlan.takeProfitPrice)}</span>
                  <span>盈亏比：{stock.tradePlan.riskRewardRatio.toFixed(2)}</span>
                  <span>仓位：{percent(stock.tradePlan.positionPct)}</span>
                </div>
                <ul>
                  {stock.tradePlan.checklist.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            )}
            <ul>
              {stock.screeningEvidence.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

function decisionClass(decision: EvaluatedStockState["decision"]): string {
  if (decision === "重点关注") return "focus";
  if (decision === "观察等待") return "watch";
  return "skip";
}

function ShortTermIntelligencePanel({
  auditEvents,
  autoTrading,
  marketData,
  report
}: {
  auditEvents: AuditEventState[];
  autoTrading: AutoTradingState | null;
  marketData: MarketDataStatusState | null;
  report: ShortTermIntelligenceReportState | null;
}) {
  const operationEvents = auditEvents.filter((event) =>
    ["auto_virtual_trade_run", "risk_checked", "virtual_fill_created"].includes(event.action)
  );
  const monitoredSectors = new Set(report?.watchlist.map((candidate) => candidate.sector) ?? []);

  if (!report) {
    return (
      <section className="panel intelligencePanel" aria-label="短线情报中枢">
        <div className="panelHeader">
          <div>
            <h2>短线情报中枢</h2>
            <p>正在等待行情和外部情报状态。</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="panel intelligencePanel" aria-label="短线情报中枢">
      <div className="panelHeader intelligenceHeader">
        <div>
          <h2>短线情报中枢</h2>
          <p>{report.outlook}</p>
        </div>
        <div className="temperatureDial">
          <span>情绪温度</span>
          <strong>{report.sentiment.temperatureScore}</strong>
          <small>{report.sentiment.trendLabel}</small>
        </div>
      </div>

      <div className="intelRealityStrip" aria-label="短线情报数据与执行属性">
        <span>行情来源：{marketData ? dataRealityLabel(marketData) : "加载中"}</span>
        <span>行情供应商：{marketData?.source.provider ?? "加载中"}</span>
        <span>执行属性：虚拟盘模拟成交</span>
        <span>自动轮询：{autoTrading ? `${autoTrading.runCount} 次` : "加载中"}</span>
      </div>

      <div className="sentimentStrip">
        <p>操作建议：{report.actionPlan.mode}</p>
        <p>{report.actionPlan.positionTone}</p>
        <p>
          上涨/下跌：{report.sentiment.risingCount}/{report.sentiment.fallingCount}，放量：
          {report.sentiment.volumeActiveCount}
        </p>
      </div>

      <div className="intelGrid">
        <section className="intelSection intelSectionWide">
          <h3>板块轮动</h3>
          <ul className="sectorList">
            {report.sectorRotation.length > 0 ? (
              report.sectorRotation.slice(0, 4).map((sector) => (
                <li key={sector.sector}>
                  <div>
                    <strong>{sector.sector}</strong>
                    <span>{sector.direction}</span>
                    <span className={monitoredSectors.has(sector.sector) ? "sectorStatus monitoring" : "sectorStatus idle"}>
                      {monitoredSectors.has(sector.sector) ? "监控中" : "观察中"}
                    </span>
                  </div>
                  <p>
                    强度 {sector.strengthScore}，持续性 {sector.persistenceScore}，{sector.sampleQuality}
                  </p>
                  <small>{sector.representativeSymbols.slice(0, 3).join("、") || "暂无代表股"}</small>
                </li>
              ))
            ) : (
              <li className="emptyState">暂无可计算板块。</li>
            )}
          </ul>
        </section>

        <section className="intelSection intelSectionWide">
          <h3>重点跟踪对象</h3>
          <ul className="watchList">
            {report.watchlist.length > 0 ? (
              report.watchlist.slice(0, 4).map((candidate) => (
                <li key={candidate.symbol}>
                  <div>
                    <strong>{candidate.symbol}</strong>
                    <span>{candidate.totalScore}</span>
                  </div>
                  <p>
                    {candidate.sector}，现价 {price(candidate.latestPrice)}
                    {candidate.turnoverRate > 0 ? `，换手率 ${(candidate.turnoverRate * 100).toFixed(1)}%` : ""}
                  </p>
                  <small>{candidate.labels.join("、") || "观察"}</small>
                </li>
              ))
            ) : (
              <li className="emptyState">暂无重点跟踪对象。</li>
            )}
          </ul>
        </section>

        <section className="intelSection intelSectionSource">
          <h3>外部情报状态</h3>
          <ul className="sourceStatusList">
            {report.externalIntelStatuses.map((status) => (
              <li className={status.status} key={status.source}>
                <strong>
                  {status.label}：{externalStatusLabel(status.status)}
                </strong>
                <span>{status.message}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="intelSection intelSectionOps">
          <h3>虚拟盘实时操作</h3>
          <ul className="operationList">
            {operationEvents.length > 0 ? (
              operationEvents.slice(0, 4).map((event, index) => (
                <li key={`${event.id}-${index}`}>
                  <strong>{formatAuditTime(event.timestamp)}</strong>
                  <span>{virtualOperationSummary(event)}</span>
                </li>
              ))
            ) : (
              <li className="emptyState">暂无虚拟盘操作，启动自动虚拟盘后会实时显示。</li>
            )}
          </ul>
        </section>

        <section className="intelSection intelSectionRisk">
          <h3>风险信号</h3>
          <ul className="riskList">
            {report.riskSignals.length > 0 ? (
              report.riskSignals.slice(0, 4).map((risk) => (
                <li className={risk.level} key={risk.id}>
                  <strong>
                    {risk.symbol ? `${risk.symbol}：` : ""}
                    {risk.title}
                  </strong>
                  <span>{risk.suggestion}</span>
                </li>
              ))
            ) : (
              <li className="emptyState">暂无高优先级风险。</li>
            )}
          </ul>
        </section>
      </div>

      <div className="intelConclusion">
        <strong>{report.conclusion}</strong>
        <p>{report.reasons.slice(0, 2).join("；")}</p>
      </div>
    </section>
  );
}

function virtualOperationSummary(event: AuditEventState): string {
  if (event.action === "virtual_fill_created") {
    return `虚拟成交：${event.details.symbol ?? event.entityId} ${event.details.quantity ?? 0} 股`;
  }

  if (event.action === "risk_checked") {
    return `风控校验：${event.details.approved ? "通过" : "拒绝"}`;
  }

  if (event.action === "auto_virtual_trade_run") {
    return `自动轮询：信号 ${event.details.signals ?? 0}，成交 ${event.details.fills ?? 0}`;
  }

  return auditActionLabel(event.action);
}

function ShortTermSignalItem({
  isMarked,
  isMarking,
  onManualBuy,
  signal
}: {
  isMarked: boolean;
  isMarking: boolean;
  onManualBuy: (signal: ShortTermBuySignalState) => Promise<void>;
  signal: ShortTermBuySignalState;
}) {
  const buttonText = isMarked ? "已标记买入" : isMarking ? "标记中..." : "标记已买入";

  return (
    <article className="signalItem">
      <div className="signalTop">
        <div>
          <strong>{signal.symbol}</strong>
          <time>{formatAuditTime(signal.timestamp)}</time>
        </div>
        <span className="signalBadge">{signal.recommendation}</span>
      </div>
      <div className="signalFacts">
        <p>现价：{price(signal.currentPrice)}</p>
        <p>置信度：{signal.confidenceScore}</p>
        <p>建议仓位：{percent(signal.suggestedPositionPct)}</p>
        <p>止损观察：{price(signal.stopLossPrice)}</p>
      </div>
      <div className="signalColumns">
        <div>
          <h3>购买依据</h3>
          <ul>
            {signal.basis.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3>风险边界</h3>
          <ul>
            {signal.riskNotes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
      <button className="secondary" onClick={() => void onManualBuy(signal)} disabled={isMarked || isMarking}>
        {buttonText}
      </button>
    </article>
  );
}

function RulesMode() {
  return (
    <div className="modeBody">
      <h3>结构化规则编辑器</h3>
      <div className="rule">收盘价 &gt; MA20 AND 成交量 &gt; 20 日均量 → 买入</div>
      <div className="rule">RSI14 &lt; 35 OR 最大回撤 &gt; 8% → 卖出</div>
      <div className="rule">单票仓位 ≤ 10%，组合单票暴露 ≤ 20%</div>
    </div>
  );
}

function CanvasMode() {
  return (
    <div className="modeBody canvas">
      <h3>画布模块</h3>
      <p>股票池 → 买入规则 → 仓位控制 → 风控规则</p>
      <p>卖出规则与风控模块共享同一份策略定义。</p>
    </div>
  );
}

function AiMode() {
  return (
    <div className="modeBody">
      <h3>AI 助手</h3>
      <p>AI 只生成草案，用户确认后进入发布流程。</p>
      <textarea aria-label="AI 策略修改请求" placeholder="例如：把买入条件改成趋势突破，并降低单票仓位。" />
    </div>
  );
}

function getRunCopy(marketSession: AShareMarketSession) {
  if (marketSession.isOpen) {
    return {
      button: "运行虚拟盘",
      activeButton: "运行中...",
      idle: "交易时间：可运行虚拟盘。",
      running: "正在运行虚拟盘...",
      done: "虚拟盘已完成，监控数据已刷新"
    };
  }

  if (marketSession.code === "after_market") {
    return {
      button: "生成盘后复盘",
      activeButton: "生成中...",
      idle: "休盘时间：可生成盘后复盘，不触发实时交易。",
      running: "正在生成盘后复盘...",
      done: "盘后复盘已生成，监控数据已刷新"
    };
  }

  return {
    button: "运行历史回放",
    activeButton: "回放中...",
    idle: "休盘时间：可运行历史回放，不触发实时交易。",
    running: "正在运行历史回放...",
    done: "历史回放已完成，监控数据已刷新"
  };
}

function getRuntimePhase(isRunning: boolean, report: DailyReportState | null): string {
  if (isRunning) return "执行中";
  if (report) return "运行完成";
  return "待运行";
}

function getDisplayStatus(status: string | undefined, isRunning: boolean, report: DailyReportState | null): string {
  if (isRunning) return "执行中";
  if (report) return "运行完成";
  if (status === "idle") return "待运行";
  if (status === "running") return "运行中";
  return "加载中";
}

function auditActionLabel(action: string): string {
  if (action === "risk_checked") return "风控校验";
  if (action === "virtual_fill_created") return "虚拟成交";
  if (action === "strategy_parameters_hot_updated") return "策略热更新";
  if (action === "manual_buy_marked") return "手动标记买入";
  return action;
}

function auditEventSummary(event: AuditEventState): string {
  if (event.action === "risk_checked") {
    const approved = event.details.approved ? "通过" : "拒绝";
    return `风控校验${approved}：${event.details.reason ?? "未给出原因"}`;
  }

  if (event.action === "virtual_fill_created") {
    return `买入/卖出成交：${event.details.symbol ?? event.entityId}，${event.details.quantity ?? 0} 股`;
  }

  if (event.action === "strategy_parameters_hot_updated") {
    return `策略参数已修改：${event.entityId}`;
  }

  if (event.action === "manual_buy_marked") {
    return `已标记买入：${event.details.symbol ?? event.entityId}，${event.details.quantity ?? 0} 股`;
  }

  return `${auditActionLabel(event.action)}：${event.entityId}`;
}

function positionStatusLabel(status: ManualPositionState["status"]): string {
  if (status === "monitoring") return "监测中";
  if (status === "sell_alerted") return "已触发卖出提醒";
  return "已关闭";
}

function formatAuditTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;

  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function buildRunTimeline(
  isRunning: boolean,
  monitoring: MonitoringState | null,
  report: DailyReportState | null,
  auditEvents: AuditEventState[]
) {
  const riskChecks = monitoring?.orders ?? auditEvents.filter((event) => event.action === "risk_checked").length;
  const fills = monitoring?.fills ?? 0;
  const signals = monitoring?.signals ?? 0;
  const hasRun = Boolean(report || monitoring?.auditEvents);

  return [
    {
      label: "准备行情",
      detail: hasRun ? "行情数据已载入" : "等待启动",
      state: stepState(hasRun || isRunning, isRunning && !hasRun)
    },
    {
      label: "生成信号",
      detail: `${signals} 条`,
      state: stepState(signals > 0, isRunning && signals === 0)
    },
    {
      label: "风控校验",
      detail: `${riskChecks} 次`,
      state: stepState(riskChecks > 0, isRunning && riskChecks === 0)
    },
    {
      label: "撮合成交",
      detail: `${fills} 笔`,
      state: stepState(fills > 0, isRunning && fills === 0)
    },
    {
      label: "生成日报",
      detail: report ? "已生成" : "等待运行",
      state: stepState(Boolean(report), isRunning && !report)
    }
  ];
}

function stepState(done: boolean, active: boolean): "done" | "active" | "pending" {
  if (done) return "done";
  if (active) return "active";
  return "pending";
}

function sideLabel(side: "buy" | "sell"): string {
  return side === "buy" ? "买入" : "卖出";
}

function signalReasonLabel(reason: string): string {
  if (reason === "entry rules matched") return "买入规则命中：收盘价高于 MA20 且成交量高于 20 日均量";
  if (reason === "exit rules matched") return "卖出规则命中：RSI14 低于阈值或触发退出规则";
  return reason;
}

function dataRealityLabel(marketData: MarketDataStatusState): string {
  if (!marketData.source.isReal) return "样例数据";
  if (marketData.source.cacheHit) return "真实缓存";
  return "真实数据";
}

function externalStatusLabel(status: ExternalIntelAvailabilityState): string {
  if (status === "available") return "已接入";
  if (status === "empty") return "暂无事件";
  if (status === "unavailable") return "不可用";
  return "未配置";
}

function autoTradingPhaseLabel(phase: AutoTradingState["phase"]): string {
  if (phase === "armed") return "等待开盘/轮询中";
  if (phase === "running") return "正在运行";
  if (phase === "error") return "异常";
  return "已暂停";
}

function autoTradingDecisionLabel(decision: AutoTradingState["lastDecision"]): string {
  if (decision === "auto_virtual_trade_run") return "已自动运行虚拟盘";
  if (decision === "market_closed") return "非交易时段";
  if (decision === "disabled") return "已关闭";
  if (decision === "already_running") return "已有任务运行中";
  if (decision === "error") return "运行异常";
  return "等待检查";
}

function money(value: number): string {
  return value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function price(value: number): string {
  return value.toFixed(2);
}

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

// ── CSV Export ──

function downloadCsv(filename: string, rows: Record<string, unknown>[]): void {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]!);
  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const val = row[h];
          const str = val === null || val === undefined ? "" : String(val);
          return str.includes(",") || str.includes('"') || str.includes("\n") ? `"${str.replace(/"/g, '""')}"` : str;
        })
        .join(",")
    )
  ].join("\n");

  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportSignalsCsv(signals: ShortTermBuySignalState[]): void {
  const rows = signals.map((s) => ({
    标的: s.symbol,
    时间: s.timestamp,
    置信度: s.confidenceScore,
    当前价: s.currentPrice,
    止损价: s.stopLossPrice,
    建议仓位: s.suggestedPositionPct,
    依据: s.basis.join("; "),
    风险: s.riskNotes.join("; ")
  }));
  downloadCsv(`短线信号_${new Date().toISOString().slice(0, 10)}.csv`, rows);
}

function exportPositionsCsv(positions: ManualPositionState[]): void {
  const rows = positions.map((p) => ({
    标的: p.symbol,
    买入时间: p.entryTimestamp,
    买入价: p.entryPrice,
    数量: p.quantity,
    止损价: p.stopLossPrice,
    状态: p.status
  }));
  downloadCsv(`持仓_${new Date().toISOString().slice(0, 10)}.csv`, rows);
}
