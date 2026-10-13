import cors from "@fastify/cors";
import {
  createStrategyVersion,
  getAShareMarketSession,
  type AuditEvent,
  type ManualPosition,
  type PortfolioSnapshot,
  type SellSignalAlert,
  type ShortTermIntelligenceReport,
  type ShortTermBuySignal,
  type StrategyDefinition,
  type VirtualTradingConfig,
  type AiTradingAdvice,
  type StrongStockCandidate,
  type RiskSignal,
  type AiApiConfig,
  type AiApiConfigPatch,
  type AiApiConfigEntry,
  type AiApiConfigInput,
  type AiApiTestResult,
  type AiApiProvider,
  type AiRuntimeStatus,
  type StockAnalysisIndicator,
  type StockAnalysisReport
} from "@itrade/domain";
import {
  buildShortTermIntelligenceReport,
  buildDailyReport,
  createDataSourceRegistry,
  createManualPositionFromSignal,
  findShortTermBuySignals,
  fetchMarketScreeningSnapshot,
  errorMessage,
  formatPct,
  formatPrice,
  numberField,
  round2,
  type ExternalIntelProvider,
  type ExternalIntelSnapshot,
  type MarketDataProvider,
  type MarketDataSnapshot,
  monitorSellSignals,
  runVirtualTradingSession,
  type DailyReport,
  type VirtualTradingResult,
  readJsonCache,
  writeJsonCache,
  createStartingPortfolio,
  toIso,
} from "@itrade/engine";
import Fastify from "fastify";
import { join } from "node:path";
import { z } from "zod";

// ── Request validation schemas ──

const VirtualTradingConfigPatchSchema = z.object({
  startingCash: z.number().positive().optional(),
  maxSymbolExposurePct: z.number().positive().max(1).optional(),
  defaultOrderQuantity: z.number().positive().int().optional(),
  autoTradingIntervalMs: z.number().min(5000).optional(),
  killSwitch: z.boolean().optional()
}).strict();

const AiApiConfigInputSchema = z.object({
  name: z.string().min(1).max(100),
  enabled: z.boolean(),
  provider: z.enum(["openai-compatible", "deepseek", "qwen", "custom"]),
  baseUrl: z.string().url(),
  model: z.string().min(1),
  apiKey: z.string().optional(),
  timeoutMs: z.number().int().min(1000).max(120000).optional(),
  temperature: z.number().min(0).max(2).optional()
});

const AiApiConfigPatchSchema = z.object({
  enabled: z.boolean().optional(),
  provider: z.enum(["openai-compatible", "deepseek", "qwen", "custom"]).optional(),
  baseUrl: z.string().url().optional(),
  model: z.string().min(1).optional(),
  apiKey: z.string().optional(),
  timeoutMs: z.number().int().min(1000).max(120000).optional(),
  temperature: z.number().min(0).max(2).optional()
}).strict();

const StrategyParametersPatchSchema = z.object({
  maxPositionPct: z.number().positive().max(1).optional(),
  stopLossPct: z.number().positive().max(1).optional(),
  buyThreshold: z.number().optional()
}).strict();

const ManualBuySchema = z.object({
  quantity: z.number().positive().int()
});

function validateOrReject<T>(schema: z.ZodSchema<T>, data: unknown, reply: { status: (code: number) => { send: (body: unknown) => unknown } }): T | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    reply.status(400).send({ error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
    return null;
  }
  return result.data;
}

// ── Simple in-memory rate limiter (token bucket) ──
interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
}

function createRateLimiter(opts: RateLimitOptions) {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return function isAllowed(key: string): boolean {
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || now > bucket.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
      return true;
    }

    if (bucket.count >= opts.maxRequests) {
      return false;
    }

    bucket.count++;
    return true;
  };
}

// Rate limiters for expensive endpoints
const analysisRateLimit = createRateLimiter({ maxRequests: 10, windowMs: 60_000 }); // 10/min
const simulationRateLimit = createRateLimiter({ maxRequests: 5, windowMs: 60_000 }); // 5/min
const aiTestRateLimit = createRateLimiter({ maxRequests: 5, windowMs: 60_000 }); // 5/min

interface AppState {
  strategies: StrategyDefinition[];
  lastRun: VirtualTradingResult | null;
  report: DailyReport | null;
  auditEvents: AuditEvent[];
  shortTermSignals: ShortTermBuySignal[];
  shortTermIntelligenceReport: ShortTermIntelligenceReport | null;
  manualPositions: ManualPosition[];
  sellAlerts: SellSignalAlert[];
  marketDataSnapshot: MarketDataSnapshot | null;
  externalIntelSnapshot: ExternalIntelSnapshot | null;
  portfolio: PortfolioSnapshot;
  processedSignalIds: Set<string>;
  autoTrading: AutoTradingState;
  virtualTradingConfig: VirtualTradingConfig;
  aiAdvice: AiTradingAdvice[];
  aiApiConfig: AiApiConfig;
  aiApiConfigs: AiApiConfigEntry[];
  activeAiConfigId: string | null;
}

interface BuildServerOptions {
  marketDataProvider?: MarketDataProvider;
  externalIntelProvider?: ExternalIntelProvider;
  autoTradingEnabled?: boolean;
  autoTradingIntervalMs?: number;
  startAutoTradingLoop?: boolean;
  now?: () => Date;
}

type AutoTradingPhase = "paused" | "armed" | "running" | "error";
type AutoTradingDecision = "waiting" | "disabled" | "market_closed" | "already_running" | "auto_virtual_trade_run" | "error";

const defaultAiApiConfig: AiApiConfig = {
  enabled: false,
  provider: "openai-compatible",
  baseUrl: "",
  model: "",
  apiKeyConfigured: false,
  timeoutMs: 30000,
  temperature: 0.2
};

const defaultVirtualTradingConfig: VirtualTradingConfig = {
  market: "A股",
  mode: "virtual_with_ai_advice",
  primaryHorizon: "intraday_short",
  startingCash: 100000,
  maxSymbolExposurePct: 0.2,
  defaultOrderQuantity: 1000,
  autoTradingIntervalMs: 30000,
  killSwitch: false,
  realBrokerReserved: true
};

interface AutoTradingState {
  enabled: boolean;
  phase: AutoTradingPhase;
  intervalMs: number;
  runCount: number;
  lastDecision: AutoTradingDecision;
  lastCheckAt?: string;
  lastRunAt?: string;
  lastError?: string;
}

export function buildServer(options: BuildServerOptions = {}) {
  const server = Fastify({ logger: false });

  // Global error handler — catch unhandled async errors and return structured JSON
  server.setErrorHandler((error, _request, reply) => {
    const statusCode = error.statusCode ?? 500;
    const message = error.message || "Internal server error";
    reply.status(statusCode).send({ error: message });
  });

  const MAX_AUDIT_EVENTS = 5000;
  const MAX_PROCESSED_SIGNAL_IDS = 10000;

  function trimAuditEvents() {
    if (state.auditEvents.length > MAX_AUDIT_EVENTS) {
      state.auditEvents = state.auditEvents.slice(-MAX_AUDIT_EVENTS);
    }
  }

  // ── State persistence ──
  const stateFile = join(defaultDataCacheDir(), "..", "itrade-state.json");

  interface PersistedState {
    aiApiConfigs: AiApiConfigEntry[];
    activeAiConfigId: string | null;
    virtualTradingConfig: VirtualTradingConfig;
    manualPositions: ManualPosition[];
    sellAlerts: SellSignalAlert[];
  }

  async function loadPersistedState(): Promise<Partial<PersistedState>> {
    return (await readJsonCache<PersistedState>(stateFile)) ?? {};
  }

  async function savePersistedState(): Promise<void> {
    await writeJsonCache<PersistedState>(stateFile, {
      aiApiConfigs: state.aiApiConfigs,
      activeAiConfigId: state.activeAiConfigId,
      virtualTradingConfig: state.virtualTradingConfig,
      manualPositions: state.manualPositions,
      sellAlerts: state.sellAlerts
    });
  }

  const now = options.now ?? (() => new Date());
  const initialVirtualTradingConfig = { ...defaultVirtualTradingConfig };
  const autoTradingIntervalMs = options.autoTradingIntervalMs ?? initialVirtualTradingConfig.autoTradingIntervalMs;
  initialVirtualTradingConfig.autoTradingIntervalMs = autoTradingIntervalMs;
  const dataSourceRegistry = createDataSourceRegistry({
    cacheDir: defaultDataCacheDir(),
    ...(options.marketDataProvider ? { marketDataProvider: options.marketDataProvider } : {}),
    ...(options.externalIntelProvider ? { externalIntelProvider: options.externalIntelProvider } : {})
  });

  // Load persisted state from disk (async, but we initialize with defaults first)
  const persistedState: Partial<PersistedState> = {};
  void loadPersistedState().then((loaded) => {
    Object.assign(persistedState, loaded);
    if (loaded.aiApiConfigs) state.aiApiConfigs = loaded.aiApiConfigs;
    if (loaded.activeAiConfigId !== undefined) state.activeAiConfigId = loaded.activeAiConfigId;
    if (loaded.virtualTradingConfig) state.virtualTradingConfig = { ...defaultVirtualTradingConfig, ...loaded.virtualTradingConfig };
    if (loaded.manualPositions) state.manualPositions = loaded.manualPositions;
    if (loaded.sellAlerts) state.sellAlerts = loaded.sellAlerts;
  });

  const state: AppState = {
    strategies: [
      createStrategyVersion({
        id: "ma-volume",
        name: "双均线成交量策略",
        version: 1,
        universe: "*",
        parameters: { maxPositionPct: 0.1, stopLossPct: 0.08, buyThreshold: 1 }
      })
    ],
    lastRun: null,
    report: null,
    auditEvents: [],
    shortTermSignals: [],
    shortTermIntelligenceReport: null,
    manualPositions: [],
    sellAlerts: [],
    marketDataSnapshot: null,
    externalIntelSnapshot: null,
    portfolio: createStartingPortfolio(initialVirtualTradingConfig.startingCash),
    processedSignalIds: new Set(),
    virtualTradingConfig: initialVirtualTradingConfig,
    aiAdvice: [],
    aiApiConfig: { ...defaultAiApiConfig },
    aiApiConfigs: [],
    activeAiConfigId: null,
    autoTrading: {
      enabled: options.autoTradingEnabled ?? false,
      phase: options.autoTradingEnabled ? "armed" : "paused",
      intervalMs: autoTradingIntervalMs,
      runCount: 0,
      lastDecision: "waiting"
    }
  };

  server.register(cors, { origin: true });

  server.get("/api/health", async () => {
    const dataAge = state.marketDataSnapshot?.source?.updatedAt;
    const dataFresh = dataAge ? (Date.now() - new Date(dataAge).getTime()) < 600_000 : false; // 10 min
    return {
      ok: true,
      uptime: process.uptime(),
      memory: { rss: process.memoryUsage().rss },
      data: {
        hasMarketData: state.marketDataSnapshot !== null,
        dataFresh,
        lastUpdate: dataAge ?? null
      },
      state: {
        auditEventCount: state.auditEvents.length,
        processedSignalCount: state.processedSignalIds.size,
        positionCount: state.portfolio.positions.length
      }
    };
  });

  server.get("/api/strategies", async () => ({ strategies: state.strategies }));

  server.get("/api/market-data/status", async (_request, reply) => {
    try {
      const snapshot = await refreshMarketData();
      return {
        source: snapshot.source,
        quality: snapshot.quality,
        dailyBars: snapshot.daily.length,
        minuteBars: snapshot.minute.length
      };
    } catch (error) {
      return reply.status(500).send({ error: error instanceof Error ? error.message : "market data unavailable" });
    }
  });

  server.get("/api/intelligence/short-term", async (_request, reply) => {
    try {
      const report = await refreshShortTermIntelligenceReport();
      return {
        report,
        source: state.marketDataSnapshot?.source,
        externalIntel: state.externalIntelSnapshot
      };
    } catch (error) {
      return reply.status(500).send({ error: error instanceof Error ? error.message : "intelligence report unavailable" });
    }
  });

  server.get("/api/data-sources/status", async (_request, reply) => {
    try {
      const [marketData, externalIntel] = await Promise.all([refreshMarketData(), refreshExternalIntel()]);

      return {
        marketData: {
          source: marketData.source,
          quality: marketData.quality,
          dailyBars: marketData.daily.length,
          minuteBars: marketData.minute.length
        },
        externalIntel
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch data source status";
      return reply.status(500).send({ error: message });
    }
  });

  server.get("/api/auto-trading/status", async () => ({
    autoTrading: state.autoTrading,
    marketSession: getAShareMarketSession(now())
  }));

  server.get("/api/virtual-trading/config", async () => ({ config: state.virtualTradingConfig }));

  server.post("/api/virtual-trading/config", async (request, reply) => {
    const body = validateOrReject(VirtualTradingConfigPatchSchema, request.body, reply);
    if (body === null) return;
    const nextConfig = normalizeVirtualTradingConfig(state.virtualTradingConfig, body);

    if (!nextConfig) return reply.status(400).send({ error: "invalid virtual trading config" });

    const startingCashChanged = nextConfig.startingCash !== state.virtualTradingConfig.startingCash;
    state.virtualTradingConfig = nextConfig;
    state.autoTrading = { ...state.autoTrading, intervalMs: nextConfig.autoTradingIntervalMs };
    if (startingCashChanged && state.portfolio.positions.length === 0 && state.processedSignalIds.size === 0) {
      state.portfolio = createStartingPortfolio(nextConfig.startingCash);
    }
    state.auditEvents.push(audit("user", "virtual_trading_config_updated", "virtual-trading-config", {
      startingCash: nextConfig.startingCash,
      maxSymbolExposurePct: nextConfig.maxSymbolExposurePct,
      killSwitch: nextConfig.killSwitch
    }));
    void savePersistedState();

    return { config: state.virtualTradingConfig };
  });


  server.get("/api/ai/config", async () => ({ config: publicAiApiConfig(state.aiApiConfig) }));

  server.post("/api/ai/config", async (request, reply) => {
    const body = validateOrReject(AiApiConfigPatchSchema, request.body, reply);
    if (body === null) return;
    const nextConfig = normalizeAiApiConfig(state.aiApiConfig, body);

    if (!nextConfig) return reply.status(400).send({ error: "invalid ai api config" });

    state.aiApiConfig = nextConfig;
    state.auditEvents.push(audit("user", "ai_api_config_updated", "ai-api-config", {
      enabled: nextConfig.enabled,
      provider: nextConfig.provider,
      model: nextConfig.model,
      apiKeyConfigured: nextConfig.apiKeyConfigured
    }));

    return { config: publicAiApiConfig(state.aiApiConfig) };
  });

  // ── 多 AI API 配置 CRUD ──

  server.get("/api/ai/configs", async () => ({
    configs: state.aiApiConfigs.map(publicConfigEntry),
    activeId: state.activeAiConfigId
  }));

  server.post("/api/ai/configs", async (request, reply) => {
    const body = validateOrReject(AiApiConfigInputSchema, request.body, reply);
    if (body === null) return;

    const entry = buildConfigEntry(body, state.aiApiConfigs.length === 0);
    state.aiApiConfigs.push(entry);
    if (entry.isDefault) state.activeAiConfigId = entry.id;

    state.auditEvents.push(audit("user", "ai_config_created", entry.id, { name: entry.name, provider: entry.provider }));
    void savePersistedState();
    return { config: publicConfigEntry(entry) };
  });

  server.put("/api/ai/configs/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const idx = state.aiApiConfigs.findIndex((c) => c.id === id);
    if (idx < 0) return reply.status(404).send({ error: "config not found" });

    const body = validateOrReject(AiApiConfigInputSchema, request.body, reply);
    if (body === null) return;
    const existing = state.aiApiConfigs[idx]!;
    const updated = mergeConfigEntry(existing, body);
    state.aiApiConfigs[idx] = updated;

    state.auditEvents.push(audit("user", "ai_config_updated", id, { name: updated.name, provider: updated.provider }));
    void savePersistedState();
    return { config: publicConfigEntry(updated) };
  });

  server.delete("/api/ai/configs/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const idx = state.aiApiConfigs.findIndex((c) => c.id === id);
    if (idx < 0) return reply.status(404).send({ error: "config not found" });

    state.aiApiConfigs.splice(idx, 1);
    if (state.activeAiConfigId === id) {
      state.activeAiConfigId = state.aiApiConfigs.find((c) => c.enabled)?.id ?? state.aiApiConfigs[0]?.id ?? null;
    }

    state.auditEvents.push(audit("user", "ai_config_deleted", id, {}));
    void savePersistedState();
    return { ok: true, activeId: state.activeAiConfigId };
  });

  server.post("/api/ai/configs/:id/activate", async (request, reply) => {
    const { id } = request.params as { id: string };
    const entry = state.aiApiConfigs.find((c) => c.id === id);
    if (!entry) return reply.status(404).send({ error: "config not found" });

    for (const c of state.aiApiConfigs) c.isDefault = c.id === id;
    state.activeAiConfigId = id;

    state.auditEvents.push(audit("user", "ai_config_activated", id, { name: entry.name }));
    void savePersistedState();
    return { config: publicConfigEntry(entry), activeId: id };
  });

  server.post("/api/ai/configs/:id/test", async (request, reply) => {
    if (!aiTestRateLimit("ai-test")) return reply.status(429).send({ error: "请求过于频繁，请稍后再试" });
    const { id } = request.params as { id: string };
    const entry = state.aiApiConfigs.find((c) => c.id === id);
    if (!entry) return reply.status(404).send({ error: "config not found" });

    const result = await testAiApiConnection(entry);
    state.auditEvents.push(audit("user", "ai_config_tested", id, { ok: result.ok, latencyMs: result.latencyMs ?? 0 }));
    return { result };
  });


  server.get("/api/stock-analysis", async (request, reply) => {
    if (!analysisRateLimit("stock-analysis")) return reply.status(429).send({ error: "请求过于频繁，请稍后再试" });
    try {
      const query = String((request.query as { query?: string }).query ?? "").trim();
      if (!query) return reply.status(400).send({ error: "query is required" });
      if (query.length > 100) return reply.status(400).send({ error: "query too long (max 100 characters)" });

      const symbol = normalizeStockQuery(query);
      const strategyUniverse = state.strategies[0]?.universe;
      const fetchSymbols = strategyUniverse === "*" ? [symbol] : [...new Set([symbol, ...(strategyUniverse ?? [])])];
      const snapshot = await dataSourceRegistry.marketDataProvider.getSnapshot(fetchSymbols);
      state.marketDataSnapshot = snapshot;
      const externalIntel = await refreshExternalIntel();
      const report = buildShortTermIntelligenceReport({
        snapshot,
        sectorMap: defaultSectorMap(),
        externalIntelItems: externalIntel.items,
        externalIntelStatuses: externalIntel.statuses,
        now: toIso(now())
      });
      const analysis = buildStockAnalysis(query, symbol, report, snapshot, externalIntel.items);

      return { analysis, aiRuntime: aiRuntimeStatus(resolveActiveAiConfig(state)) };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Stock analysis failed";
      return reply.status(500).send({ error: message });
    }
  });

  server.get("/api/ai-advice", async (_request, reply) => {
    try {
      const report = state.shortTermIntelligenceReport ?? (await refreshShortTermIntelligenceReport());
      state.aiAdvice = buildAiAdvice(report, state.virtualTradingConfig, state.aiApiConfig);
      return { advice: state.aiAdvice, config: state.virtualTradingConfig, aiRuntime: aiRuntimeStatus(resolveActiveAiConfig(state)) };
    } catch (error) {
      return reply.status(500).send({ error: error instanceof Error ? error.message : "ai advice unavailable" });
    }
  });


  server.post("/api/auto-trading/config", async (request, reply) => {
    const body = validateOrReject(z.object({ enabled: z.boolean() }).strict(), request.body, reply);
    if (body === null) return;
    const enabled = body.enabled;
    const { lastError: _lastError, ...autoTradingWithoutError } = state.autoTrading;
    state.autoTrading = {
      ...autoTradingWithoutError,
      enabled,
      phase: enabled ? "armed" : "paused",
      lastDecision: enabled ? "waiting" : "disabled"
    };

    return {
      autoTrading: state.autoTrading,
      marketSession: getAShareMarketSession(now())
    };
  });

  server.post("/api/auto-trading/check", async () => runAutoTradingCheck());

  server.post("/api/strategies/:id/parameters", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = validateOrReject(StrategyParametersPatchSchema, request.body, reply);
    if (body === null) return;
    const strategy = state.strategies.find((item) => item.id === id);

    if (!strategy) return reply.status(404).send({ error: "strategy not found" });

    strategy.parameters = { ...strategy.parameters, ...body };
    strategy.updatedAt = toIso(now());
    state.auditEvents.push(audit("user", "strategy_parameters_hot_updated", id, body));

    return { strategy };
  });

  server.post("/api/simulation/run", async (_request, reply) => {
    if (!simulationRateLimit("simulation")) return reply.status(429).send({ error: "请求过于频繁，请稍后再试" });
    const { result, report } = await runVirtualTradingCycle();

    return { result, report };
  });

  server.get("/api/short-term/signals", async (_request, reply) => {
    try {
      state.shortTermSignals = await refreshShortTermSignals();
      return { signals: state.shortTermSignals };
    } catch (error) {
      return reply.status(500).send({ error: error instanceof Error ? error.message : "signals unavailable" });
    }
  });

  server.post("/api/short-term/signals/:id/manual-buy", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = validateOrReject(ManualBuySchema, request.body, reply);
    if (body === null) return;
    const signals = state.shortTermSignals.length > 0 ? state.shortTermSignals : await refreshShortTermSignals();
    const signal = signals.find((item) => item.id === id);

    if (!signal) return reply.status(404).send({ error: "short-term signal not found" });

    const position = createManualPositionFromSignal(signal, body.quantity);
    state.manualPositions = [...state.manualPositions.filter((item) => item.signalId !== signal.id), position];
    state.sellAlerts = monitorSellSignals(state.manualPositions, (await refreshMarketData()).minute);
    state.auditEvents.push(
      audit("user", "manual_buy_marked", signal.id, {
        symbol: signal.symbol,
        quantity: position.quantity,
        entryPrice: position.entryPrice
      })
    );
    void savePersistedState();

    return { position, sellAlerts: state.sellAlerts };
  });

  server.get("/api/manual-positions", async (_request, reply) => {
    try {
      state.sellAlerts = monitorSellSignals(state.manualPositions, (await refreshMarketData()).minute);
      return { positions: state.manualPositions, sellAlerts: state.sellAlerts };
    } catch (error) {
      return reply.status(500).send({ error: error instanceof Error ? error.message : "positions unavailable" });
    }
  });

  server.get("/api/virtual-trading/latest", async () => ({
    result: state.lastRun,
    portfolio: state.portfolio,
    processedSignalIds: Array.from(state.processedSignalIds)
  }));

  server.get("/api/monitoring", async () => ({
    status: state.lastRun ? "running" : "idle",
    strategies: state.strategies.length,
    signals: state.lastRun?.signals.length ?? 0,
    orders: state.lastRun?.orders.length ?? 0,
    fills: state.lastRun?.fills.length ?? 0,
    positions: state.portfolio.positions.length,
    totalEquity: state.portfolio.totalEquity,
    auditEvents: state.auditEvents.length,
    shortTermSignals: state.shortTermSignals.length,
    intelligenceGenerated: state.shortTermIntelligenceReport ? 1 : 0,
    manualPositions: state.manualPositions.length,
    sellAlerts: state.sellAlerts.length,
    dataProvider: state.marketDataSnapshot?.source.provider ?? "loading",
    dataIsReal: state.marketDataSnapshot?.source.isReal ?? false,
    dataWarnings: state.marketDataSnapshot?.source.warnings.length ?? 0,
    autoTrading: state.autoTrading
  }));

  server.get("/api/report/daily", async () => ({ report: state.report }));

  server.get("/api/audit", async (request) => {
    const query = request.query as { limit?: string; offset?: string } | null;
    const limit = Math.min(Math.max(Number(query?.limit ?? 50), 1), 200);
    const offset = Math.max(Number(query?.offset ?? 0), 0);
    const events = state.auditEvents.slice(offset, offset + limit);
    return { events, total: state.auditEvents.length, hasMore: offset + limit < state.auditEvents.length };
  });

  if (options.startAutoTradingLoop) {
    const timer = setInterval(() => {
      void runAutoTradingCheck();
    }, autoTradingIntervalMs);
    void runAutoTradingCheck();
    server.addHook("onClose", (_instance, done) => {
      clearInterval(timer);
      done();
    });
  }

  return server;

  async function runAutoTradingCheck() {
    const checkedAt = toIso(now());
    state.autoTrading = { ...state.autoTrading, lastCheckAt: checkedAt };

    if (!state.autoTrading.enabled) {
      state.autoTrading = { ...state.autoTrading, phase: "paused", lastDecision: "disabled" };
      return { autoTrading: state.autoTrading, marketSession: getAShareMarketSession(now()), result: null, report: state.report };
    }

    const marketSession = getAShareMarketSession(now());
    if (!marketSession.isOpen) {
      const shouldStopForClosedMarket = marketSession.code === "after_market" || marketSession.code === "closed_day";
      state.autoTrading = {
        ...state.autoTrading,
        enabled: shouldStopForClosedMarket ? false : state.autoTrading.enabled,
        phase: shouldStopForClosedMarket ? "paused" : "armed",
        lastDecision: "market_closed"
      };
      return { autoTrading: state.autoTrading, marketSession, result: null, report: state.report };
    }

    if (state.autoTrading.phase === "running") {
      state.autoTrading = { ...state.autoTrading, lastDecision: "already_running" };
      return { autoTrading: state.autoTrading, marketSession, result: null, report: state.report };
    }

    state.autoTrading = { ...state.autoTrading, phase: "running" };

    try {
      const { result, report } = await runVirtualTradingCycle();
      const runAt = toIso(now());
      const { lastError: _lastError, ...autoTradingWithoutError } = state.autoTrading;
      state.autoTrading = {
        ...autoTradingWithoutError,
        phase: "armed",
        runCount: state.autoTrading.runCount + 1,
        lastDecision: "auto_virtual_trade_run",
        lastRunAt: runAt
      };
      state.auditEvents.push(
        audit("system", "auto_virtual_trade_run", `auto-${Date.now()}`, {
          signals: result.signals.length,
          fills: result.fills.length,
          session: marketSession.code
        })
      );

      return { autoTrading: state.autoTrading, marketSession, result, report };
    } catch (error) {
      state.autoTrading = {
        ...state.autoTrading,
        phase: "error",
        lastDecision: "error",
        lastError: errorMessage(error)
      };
      return { autoTrading: state.autoTrading, marketSession, result: null, report: state.report };
    }
  }

  async function runVirtualTradingCycle(): Promise<{ result: VirtualTradingResult; report: DailyReport }> {
    const bars = await refreshMarketData();
    const externalIntel = await refreshExternalIntel();
    state.shortTermIntelligenceReport = buildShortTermIntelligenceReport({
      snapshot: bars,
      sectorMap: defaultSectorMap(),
      externalIntelItems: externalIntel.items,
      externalIntelStatuses: externalIntel.statuses
    });
    const result = runVirtualTradingSession({
      strategies: state.strategies,
      bars: bars.minute,
      startingCash: state.virtualTradingConfig.startingCash,
      initialPortfolio: state.portfolio,
      ignoredSignalIds: Array.from(state.processedSignalIds),
      maxSymbolExposurePct: state.virtualTradingConfig.maxSymbolExposurePct,
      killSwitch: state.virtualTradingConfig.killSwitch
    });

    const startingEquity = state.portfolio.totalEquity;
    state.portfolio = result.portfolio;
    state.processedSignalIds = new Set([
      ...state.processedSignalIds,
      ...result.signals.map((signal) => signal.id)
    ]);
    // Cap processedSignalIds to prevent unbounded growth
    if (state.processedSignalIds.size > MAX_PROCESSED_SIGNAL_IDS) {
      const ids = [...state.processedSignalIds];
      state.processedSignalIds = new Set(ids.slice(-MAX_PROCESSED_SIGNAL_IDS));
    }
    state.lastRun = result;
    state.auditEvents.push(...result.auditEvents);
    trimAuditEvents();
    state.report = buildDailyReport({
      date: shanghaiDate(now()),
      startingEquity,
      endingEquity: result.portfolio.totalEquity,
      maxDrawdownPct: 0.01,
      fills: result.fills,
      signals: result.signals,
      hitSignalIds: result.signals.slice(0, Math.max(1, result.signals.length - 1)).map((signal) => signal.id),
      target: { minReturnPct: 0, maxDrawdownPct: 0.03 }
    });

    return { result, report: state.report };
  }

  async function refreshMarketData(): Promise<MarketDataSnapshot> {
    if (isFullMarketMode() && !options.marketDataProvider) {
      // 全市场模式且未注入自定义 provider：使用两轮筛选获取数据
      try {
        state.marketDataSnapshot = await fetchMarketScreeningSnapshot();
      } catch (error) {
        // 全市场扫描失败时降级到数据源注册表（含缓存和 fallback 链路）
        const warning = `全市场扫描失败，降级到备用数据源：${error instanceof Error ? error.message : "未知错误"}`;
        state.marketDataSnapshot = await dataSourceRegistry.marketDataProvider.getSnapshot(["000001.SZ", "600000.SH"]);
        state.marketDataSnapshot.source.warnings.unshift(warning);
      }
    } else {
      state.marketDataSnapshot = await dataSourceRegistry.marketDataProvider.getSnapshot(strategySymbols());
    }

    return state.marketDataSnapshot;
  }

  async function refreshExternalIntel(): Promise<ExternalIntelSnapshot> {
    const symbols = isFullMarketMode()
      ? (state.marketDataSnapshot?.source.symbols ?? [])
      : strategySymbols();
    try {
      state.externalIntelSnapshot = await dataSourceRegistry.externalIntelProvider.getSnapshot(symbols);
    } catch (error) {
      // 外部情报获取失败时使用空结果
      state.externalIntelSnapshot = {
        items: [],
        statuses: [],
        warnings: [`外部情报获取失败：${error instanceof Error ? error.message : "未知错误"}`]
      };
    }

    return state.externalIntelSnapshot;
  }

  async function refreshShortTermSignals(): Promise<ShortTermBuySignal[]> {
    state.shortTermSignals = findShortTermBuySignals((await refreshMarketData()).minute);

    return state.shortTermSignals;
  }

  async function refreshShortTermIntelligenceReport(): Promise<ShortTermIntelligenceReport> {
    const [snapshot, externalIntel] = await Promise.all([refreshMarketData(), refreshExternalIntel()]);

    state.shortTermIntelligenceReport = buildShortTermIntelligenceReport({
      snapshot,
      sectorMap: defaultSectorMap(),
      externalIntelItems: externalIntel.items,
      externalIntelStatuses: externalIntel.statuses
    });

    return state.shortTermIntelligenceReport;
  }

  function strategySymbols(): string[] {
    return Array.from(
      new Set(
        state.strategies.flatMap((strategy) => (strategy.universe === "*" ? [] : strategy.universe))
      )
    );
  }

  function isFullMarketMode(): boolean {
    return state.strategies.some((strategy) => strategy.universe === "*");
  }
}



function normalizeAiApiConfig(current: AiApiConfig, patch: AiApiConfigPatch): AiApiConfig | null {
  const provider = patch.provider ?? current.provider;
  if (!["openai-compatible", "deepseek", "qwen", "custom"].includes(provider)) return null;
  const baseUrl = patch.baseUrl ?? current.baseUrl;
  const model = patch.model ?? current.model;
  const timeoutMs = patch.timeoutMs ?? current.timeoutMs;
  const temperature = patch.temperature ?? current.temperature;
  if (timeoutMs < 5000 || timeoutMs > 120000) return null;
  if (temperature < 0 || temperature > 2) return null;

  const apiKeyMasked = patch.apiKey ? maskApiKey(patch.apiKey) : current.apiKeyMasked;

  return {
    enabled: patch.enabled ?? current.enabled,
    provider: provider as AiApiProvider,
    baseUrl,
    model,
    apiKeyConfigured: Boolean(apiKeyMasked || current.apiKeyConfigured),
    ...(apiKeyMasked ? { apiKeyMasked } : {}),
    timeoutMs,
    temperature
  };
}

function publicAiApiConfig(config: AiApiConfig): AiApiConfig {
  return { ...config };
}

function resolveActiveAiConfig(state: AppState): AiApiConfig {
  if (state.activeAiConfigId) {
    const active = state.aiApiConfigs.find((c) => c.id === state.activeAiConfigId && c.enabled);
    if (active) {
      return {
        enabled: active.enabled,
        provider: active.provider,
        baseUrl: active.baseUrl,
        model: active.model,
        apiKeyConfigured: active.apiKeyConfigured,
        apiKeyMasked: active.apiKeyMasked,
        timeoutMs: active.timeoutMs,
        temperature: active.temperature
      };
    }
  }
  return state.aiApiConfig;
}

function aiRuntimeStatus(config: AiApiConfig): AiRuntimeStatus {
  const usable = config.enabled && config.apiKeyConfigured && Boolean(config.baseUrl.trim()) && Boolean(config.model.trim());
  return {
    enabled: config.enabled,
    mode: usable ? "ai_api" : "rule_fallback",
    provider: config.provider,
    model: config.model,
    apiKeyConfigured: config.apiKeyConfigured
  };
}

function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) return "***";
  return `${apiKey.slice(0, 4)}***${apiKey.slice(-4)}`;
}

// ── 多 AI 配置 helpers ──

function buildConfigEntry(input: AiApiConfigInput, isDefault: boolean): AiApiConfigEntry {
  const id = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const provider = input.provider ?? "openai-compatible";
  const masked = input.apiKey ? maskApiKey(input.apiKey) : undefined;

  return {
    id,
    name: input.name?.trim() || `配置 ${id.slice(3, 9)}`,
    enabled: input.enabled ?? false,
    provider: ["openai-compatible", "deepseek", "qwen", "custom"].includes(provider) ? provider : "openai-compatible",
    baseUrl: input.baseUrl ?? "",
    model: input.model ?? "",
    apiKeyConfigured: Boolean(input.apiKey),
    apiKeyMasked: masked,
    apiKey: input.apiKey,
    timeoutMs: clampNumber(input.timeoutMs ?? 30000, 5000, 120000),
    temperature: clampNumber(input.temperature ?? 0.2, 0, 2),
    isDefault
  };
}

function mergeConfigEntry(existing: AiApiConfigEntry, input: AiApiConfigInput): AiApiConfigEntry {
  const provider = input.provider ?? existing.provider;
  const masked = input.apiKey ? maskApiKey(input.apiKey) : existing.apiKeyMasked;

  return {
    ...existing,
    name: input.name?.trim() ?? existing.name,
    enabled: input.enabled ?? existing.enabled,
    provider: ["openai-compatible", "deepseek", "qwen", "custom"].includes(provider) ? provider : existing.provider,
    baseUrl: input.baseUrl ?? existing.baseUrl,
    model: input.model ?? existing.model,
    apiKeyConfigured: input.apiKey ? true : existing.apiKeyConfigured,
    apiKeyMasked: masked,
    apiKey: input.apiKey ?? existing.apiKey,
    timeoutMs: input.timeoutMs !== undefined ? clampNumber(input.timeoutMs, 5000, 120000) : existing.timeoutMs,
    temperature: input.temperature !== undefined ? clampNumber(input.temperature, 0, 2) : existing.temperature
  };
}

function publicConfigEntry(entry: AiApiConfigEntry): Omit<AiApiConfigEntry, "apiKey"> {
  const { apiKey: _apiKey, ...publicEntry } = entry;
  return publicEntry;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

async function testAiApiConnection(entry: AiApiConfigEntry): Promise<AiApiTestResult> {
  if (!entry.baseUrl.trim() || !entry.model.trim()) {
    return { ok: false, error: "baseUrl 或 model 未配置" };
  }

  // 智能拼接 URL：兼容各种 baseUrl 格式
  let baseUrl = entry.baseUrl.replace(/\/+$/, "");
  if (!baseUrl.endsWith("/chat/completions") && !baseUrl.endsWith("/v1") && !baseUrl.endsWith("/v1/")) {
    // baseUrl 可能是 https://api.deepseek.com 或 https://api.deepseek.com/v1
    if (!baseUrl.includes("/v1")) {
      baseUrl = `${baseUrl}/v1`;
    }
  }
  const url = baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl}/chat/completions`;

  const body = JSON.stringify({
    model: entry.model,
    messages: [{ role: "user", content: "ping" }],
    max_tokens: 5,
    stream: false
  });

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), entry.timeoutMs);

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (entry.apiKey) {
      headers.Authorization = `Bearer ${entry.apiKey}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal
    });
    clearTimeout(timeout);

    const latencyMs = Date.now() - start;

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      return { ok: false, error: `HTTP ${response.status}: ${errorBody.slice(0, 200)}`, latencyMs };
    }

    return { ok: true, model: entry.model, latencyMs };
  } catch (error) {
    const latencyMs = Date.now() - start;
    const message = error instanceof Error ? error.message : "未知错误";
    return { ok: false, error: message, latencyMs };
  }
}

function normalizeVirtualTradingConfig(
  current: VirtualTradingConfig,
  patch: Partial<VirtualTradingConfig>
): VirtualTradingConfig | null {
  const next: VirtualTradingConfig = {
    ...current,
    ...patch,
    market: "A股",
    mode: "virtual_with_ai_advice",
    primaryHorizon: "intraday_short",
    realBrokerReserved: true
  };

  if (next.startingCash <= 0) return null;
  if (next.maxSymbolExposurePct <= 0 || next.maxSymbolExposurePct > 1) return null;
  if (next.defaultOrderQuantity <= 0) return null;
  if (next.autoTradingIntervalMs < 5000) return null;

  return next;
}

function buildAiAdvice(
  report: ShortTermIntelligenceReport,
  config: VirtualTradingConfig,
  aiConfig: AiApiConfig = defaultAiApiConfig
): AiTradingAdvice[] {
  const lead = report.watchlist[0];
  const sector = report.sectorRotation[0];
  const risk = report.riskSignals[0];

  const shortTermAdvice: AiTradingAdvice = {
    id: `ai-short-${lead?.symbol ?? "market"}`,
    horizon: "intraday_short",
    horizonLabel: "日内短线主策略",
    priority: "primary",
    action: lead ? "buy_watch" : "wait",
    title: lead ? `短线主策略：${lead.symbol} 高置信度虚拟交易观察` : "短线主策略：等待高置信度盘中机会",
    summary: lead
      ? `${aiConfig.enabled ? "AI API实时判断" : "规则引擎兜底"}：主要围绕 ${lead.symbol} 的放量、趋势和风险边界做日内虚拟交易，系统只做虚拟成交。`
      : `${aiConfig.enabled ? "AI API实时判断" : "规则引擎兜底"}：当前未出现足够清晰的短线候选，保持虚拟盘观察。`,
    confidence: lead ? Math.min(0.95, lead.totalScore / 100) : 0.35,
    positionHintPct: Math.min(config.maxSymbolExposurePct, 0.1),
    riskBoundary: risk?.suggestion ?? `单票虚拟暴露不超过 ${(config.maxSymbolExposurePct * 100).toFixed(0)}%，触发止损即退出观察`,
    reasons: lead ? lead.basis.slice(0, 3) : report.reasons.slice(0, 3),
    evaluatedStocks: buildEvaluatedStocks(report.watchlist, report.riskSignals)
  };
  if (lead) shortTermAdvice.symbol = lead.symbol;

  return [
    shortTermAdvice,
    {
      id: `ai-swing-${sector?.sector ?? "market"}`,
      horizon: "swing",
      horizonLabel: "波段参考策略",
      priority: "reference",
      action: sector ? "hold_watch" : "wait",
      title: sector ? `波段参考：观察${sector.sector}板块持续性` : "波段参考：等待板块持续性",
      summary: "用于数日到数周的辅助观察，不覆盖日内短线主策略，也不触发自动虚拟成交。",
      confidence: sector ? Math.min(0.85, sector.persistenceScore / 100) : 0.4,
      positionHintPct: Math.min(config.maxSymbolExposurePct / 2, 0.08),
      riskBoundary: "跌破20日均线或板块强度退潮时降低关注。",
      reasons: sector ? sector.reasons.slice(0, 3) : ["暂无持续性足够强的板块样本"]
    },
    {
      id: "ai-long-term-reference",
      horizon: "long_term",
      horizonLabel: "长线参考策略",
      priority: "reference",
      action: "wait",
      title: "长线参考：等待基本面与真实外部数据验证",
      summary: "仅作为长期观察清单和研究提示，不参与日内虚拟交易决策。",
      confidence: 0.45,
      positionHintPct: Math.min(config.maxSymbolExposurePct / 3, 0.05),
      riskBoundary: "真实公告、财报和行业数据未接入前，不生成长期买入结论。",
      reasons: ["项目当前以A股日内短线虚拟交易为主", "真实券商接口仅预留且禁用", "长期策略需要补充基本面数据源"]
    }
  ];
}



function buildStockAnalysis(
  query: string,
  symbol: string,
  report: ShortTermIntelligenceReport,
  snapshot: MarketDataSnapshot,
  externalIntelItems: ExternalIntelSnapshot["items"]
): StockAnalysisReport {
  const candidate = report.watchlist.find((item) => item.symbol === symbol) ?? report.watchlist[0] ?? fallbackCandidate(symbol);
  const evaluated = buildEvaluatedStocks([candidate], report.riskSignals)[0];
  if (!evaluated) throw new Error(`failed to evaluate ${symbol}`);
  const relatedIntel = externalIntelItems
    .filter((item) => item.relatedSymbols.includes(symbol))
    .map((item) => ({
      source: item.source,
      title: item.title,
      summary: item.summary,
      relatedSymbols: item.relatedSymbols,
      credibility: item.credibility
    }));
  const indicators = buildStockAnalysisIndicators(symbol, snapshot, candidate);
  const positiveCount = indicators.filter((item) => item.status === "positive").length;
  const negativeCount = indicators.filter((item) => item.status === "negative").length;
  const confidence = round2(Math.min(0.95, Math.max(0.25, candidate.totalScore / 100 - negativeCount * 0.05 + positiveCount * 0.02)));

  return {
    query,
    symbol,
    name: stockDisplayName(symbol),
    market: "A股",
    horizon: "日内短线为主，波段/长线参考",
    decision: evaluated.decision,
    confidence,
    summary: `${stockDisplayName(symbol)} ${evaluated.decision}：综合 MA20、VWAP、RSI14、ATR14、成交量、板块轮动和外部信息判断；仅用于虚拟交易研究。`,
    indicators,
    reasons: [...candidate.labels, ...candidate.basis].slice(0, 8),
    risks: [...candidate.riskNotes, ...report.riskSignals.filter((risk) => !risk.symbol || risk.symbol === symbol).map((risk) => risk.suggestion)].slice(0, 6),
    tradePlan: evaluated.tradePlan,
    externalIntel: relatedIntel,
    source: {
      provider: snapshot.source.provider,
      isReal: snapshot.source.isReal,
      cacheHit: snapshot.source.cacheHit,
      updatedAt: snapshot.source.updatedAt
    },
    disclaimer: "仅用于虚拟交易和研究，不构成投资建议。"
  };
}

function buildStockAnalysisIndicators(
  symbol: string,
  snapshot: MarketDataSnapshot,
  candidate: StrongStockCandidate
): StockAnalysisIndicator[] {
  const dailyBars = snapshot.daily.filter((bar) => bar.symbol === symbol).sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  const minuteBars = snapshot.minute.filter((bar) => bar.symbol === symbol).sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  const latestDaily = dailyBars.at(-1);
  const latestLive = minuteBars.at(-1) ?? latestDaily;
  if (!latestDaily || !latestLive) {
    return [{ name: "数据完整性", status: "negative", value: "缺失", explanation: "未获取到该股票的行情数据" }];
  }

  const ma20 = numberField(latestDaily.fields, "ma20");
  const vwap = numberField(latestLive.fields, "vwap") || numberField(latestDaily.fields, "vwap");
  const rsi14 = numberField(latestDaily.fields, "rsi14");
  const atr14 = numberField(latestDaily.fields, "atr14");
  const avgVolume20 = numberField(latestDaily.fields, "avgVolume20");
  const volumeRatio = avgVolume20 > 0 ? latestDaily.volume / avgVolume20 : 0;
  const atrPct = atr14 > 0 ? atr14 / latestDaily.close : 0;

  return [
    {
      name: "MA20趋势",
      status: latestDaily.close > ma20 ? "positive" : "negative",
      value: `${formatPrice(latestDaily.close)} ${latestDaily.close > ma20 ? ">" : "<="} ${formatPrice(ma20)}`,
      explanation: latestDaily.close > ma20 ? "价格站上20日均线，趋势结构偏强" : "价格未站上20日均线，趋势仍需确认"
    },
    {
      name: "VWAP盘中承接",
      status: vwap <= 0 ? "neutral" : latestLive.close > vwap ? "positive" : "negative",
      value: vwap > 0 ? `${formatPrice(latestLive.close)} ${latestLive.close > vwap ? ">" : "<="} ${formatPrice(vwap)}` : "暂无VWAP",
      explanation: vwap > 0 && latestLive.close > vwap ? "现价高于VWAP，盘中承接偏强" : "现价未明显高于VWAP，承接力度需观察"
    },
    {
      name: "RSI14动量",
      status: rsi14 >= 50 && rsi14 <= 70 ? "positive" : rsi14 > 75 || rsi14 < 45 ? "negative" : "neutral",
      value: rsi14 > 0 ? rsi14.toFixed(0) : "暂无RSI",
      explanation: rsi14 >= 50 && rsi14 <= 70 ? "RSI处于健康动量区间" : rsi14 > 75 ? "RSI短线过热，追高风险上升" : "RSI动量不足或仍需确认"
    },
    {
      name: "ATR14波动",
      status: atr14 <= 0 ? "neutral" : atrPct <= 0.06 ? "neutral" : "negative",
      value: atr14 > 0 ? `${formatPrice(atr14)} / ${formatPct(atrPct)}` : "暂无ATR",
      explanation: atr14 > 0 && atrPct <= 0.06 ? "波动处于可控范围" : atr14 > 0 ? "波动偏大，应降低仓位" : "ATR数据缺失，按固定止损控制风险"
    },
    {
      name: "成交量",
      status: volumeRatio >= 1.5 ? "positive" : volumeRatio >= 1.2 ? "neutral" : "negative",
      value: volumeRatio > 0 ? `${volumeRatio.toFixed(2)}x` : "暂无均量",
      explanation: candidate.volumeScore >= 22 ? "量能明显放大，短线资金活跃" : candidate.volumeScore >= 10 ? "量能温和放大" : "量能不足，暂不追高"
    },
    {
      name: "板块与情绪",
      status: candidate.totalScore >= 70 ? "positive" : candidate.totalScore >= 45 ? "neutral" : "negative",
      value: `${candidate.sector} / ${candidate.totalScore}`,
      explanation: "结合板块轮动、短线异动和风险信号后的综合评分"
    }
  ];
}

function fallbackCandidate(symbol: string): StrongStockCandidate {
  return {
    symbol,
    sector: defaultSectorMap()[symbol] ?? "未分类",
    latestPrice: 0,
    trendScore: 0,
    volumeScore: 0,
    abnormalScore: 0,
    totalScore: 0,
    turnoverRate: 0,
    labels: ["数据不足"],
    basis: ["未获取到足够行情数据"],
    riskNotes: ["数据不足，不能生成有效交易计划"]
  };
}

function normalizeStockQuery(query: string): string {
  const trimmed = query.trim().toUpperCase();
  const byName = stockNameToSymbol(trimmed);
  if (byName) return byName;
  if (/^\d{6}\.(SZ|SH)$/.test(trimmed)) return trimmed;
  if (/^\d{6}$/.test(trimmed)) return `${trimmed}.${trimmed.startsWith("6") ? "SH" : "SZ"}`;
  return trimmed;
}

function stockNameToSymbol(query: string): string | undefined {
  const entries = Object.entries(stockNameMap());
  return entries.find(([, name]) => name === query)?.[0];
}

function stockDisplayName(symbol: string): string {
  return stockNameMap()[symbol] ?? symbol;
}

function stockNameMap(): Record<string, string> {
  return {
    "000001.SZ": "平安银行",
    "600000.SH": "浦发银行",
    "300750.SZ": "宁德时代",
    "002594.SZ": "比亚迪",
    "601318.SH": "中国平安",
    "600519.SH": "贵州茅台"
  };
}

function buildEvaluatedStocks(candidates: StrongStockCandidate[], risks: RiskSignal[]) {
  const riskBySymbol = new Map(risks.filter((risk) => risk.symbol).map((risk) => [risk.symbol as string, risk]));

  return candidates.map((candidate, index) => {
    const risk = riskBySymbol.get(candidate.symbol);
    const riskScore = risk?.level === "high" ? 45 : risk?.level === "medium" ? 25 : risk?.level === "low" ? 10 : 0;
      const decision: "重点关注" | "观察等待" | "暂不纳入" =
      candidate.totalScore >= 75 && riskScore < 40 ? "重点关注" : candidate.totalScore >= 45 ? "观察等待" : "暂不纳入";

    return {
      symbol: candidate.symbol,
      sector: candidate.sector,
      rank: index + 1,
      decision,
      latestPrice: candidate.latestPrice,
      scores: {
        trend: candidate.trendScore,
        volume: candidate.volumeScore,
        abnormal: candidate.abnormalScore,
        risk: riskScore,
        total: candidate.totalScore
      },
      screeningEvidence: buildScreeningEvidence(candidate, risk),
      tradePlan: buildVirtualTradePlan(candidate, riskScore)
    };
  });
}

function buildScreeningEvidence(candidate: StrongStockCandidate, risk: RiskSignal | undefined): string[] {
  const evidence = [
    `趋势：${candidate.trendScore >= 50 ? "趋势强，站上关键均线并延续" : candidate.trendScore >= 25 ? "趋势一般，等待二次确认" : "趋势偏弱，暂不追高"}`,
    `成交量：${candidate.volumeScore >= 22 ? "明显放量，短线资金活跃" : candidate.volumeScore >= 10 ? "温和放量" : "未明显放大"}`,
    `异动：${candidate.abnormalScore >= 20 ? "接近异动阈值" : candidate.abnormalScore >= 10 ? "有异动预备信号" : "暂无明显异动"}`,
    `风险：${risk ? risk.suggestion : candidate.riskNotes[0] ?? "按虚拟盘纪律设置止损"}`
  ];

  return [...evidence, ...candidate.basis.slice(0, 2)];
}


function buildVirtualTradePlan(candidate: StrongStockCandidate, riskScore: number) {
  const basePrice = candidate.latestPrice;
  const entryZoneLow = round2(basePrice * 0.99);
  const entryZoneHigh = round2(basePrice * 1.008);
  const stopLossPct = riskScore >= 40 ? 0.035 : riskScore >= 25 ? 0.045 : 0.05;
  const stopLossPrice = round2(entryZoneLow * (1 - stopLossPct));
  const targetPct = candidate.totalScore >= 80 ? 0.075 : candidate.totalScore >= 55 ? 0.055 : 0.04;
  const takeProfitPrice = round2(entryZoneHigh * (1 + targetPct));
  const riskPerShare = Math.max(entryZoneHigh - stopLossPrice, 0.01);
  const rewardPerShare = Math.max(takeProfitPrice - entryZoneHigh, 0.01);
  const riskRewardRatio = round2(rewardPerShare / riskPerShare);
  const positionPct = Math.min(0.1, Math.max(0.03, candidate.totalScore / 1000));
  const maxLossPctOfPortfolio = round2(positionPct * stopLossPct);

  return {
    entryZoneLow,
    entryZoneHigh,
    stopLossPrice,
    takeProfitPrice,
    riskRewardRatio,
    positionPct: round2(positionPct),
    maxLossPctOfPortfolio,
    checklist: [
      `入场：${formatPrice(entryZoneLow)}-${formatPrice(entryZoneHigh)} 区间内企稳，且量能不低于均量`,
      `止损：跌破 ${formatPrice(stopLossPrice)} 或短线趋势转弱立即退出虚拟观察`,
      `止盈：接近 ${formatPrice(takeProfitPrice)} 分批止盈，盈亏比 ${riskRewardRatio.toFixed(2)}`
    ]
  };
}

function shanghaiDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function defaultDataCacheDir(): string {
  return join(process.cwd(), "tmp", "market-data-cache");
}

function defaultSectorMap(): Record<string, string> {
  return {
    "000001.SZ": "银行",
    "600000.SH": "银行",
    "300750.SZ": "新能源",
    "002594.SZ": "新能源",
    "601318.SH": "保险",
    "600519.SH": "白酒"
  };
}

function audit(
  actor: AuditEvent["actor"],
  action: string,
  entityId: string,
  details: AuditEvent["details"]
): AuditEvent {
  return {
    id: `audit-${action}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    actor,
    action,
    entityId,
    details
  };
}
