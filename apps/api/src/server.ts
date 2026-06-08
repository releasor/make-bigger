import cors from "@fastify/cors";
import {
  createStrategyVersion,
  type AuditEvent,
  type ManualPosition,
  type SellSignalAlert,
  type ShortTermBuySignal,
  type StrategyDefinition
} from "@itrade/domain";
import {
  buildDailyReport,
  createCachedMarketDataProvider,
  createManualPositionFromSignal,
  EastMoneyMarketDataProvider,
  fetchMarketDataSnapshot,
  findShortTermBuySignals,
  type MarketDataProvider,
  type MarketDataSnapshot,
  monitorSellSignals,
  runVirtualTradingSession,
  type DailyReport,
  type VirtualTradingResult
} from "@itrade/engine";
import Fastify from "fastify";
import { fileURLToPath } from "node:url";

interface AppState {
  strategies: StrategyDefinition[];
  lastRun: VirtualTradingResult | null;
  report: DailyReport | null;
  auditEvents: AuditEvent[];
  shortTermSignals: ShortTermBuySignal[];
  manualPositions: ManualPosition[];
  sellAlerts: SellSignalAlert[];
  marketDataSnapshot: MarketDataSnapshot | null;
}

interface BuildServerOptions {
  marketDataProvider?: MarketDataProvider;
}

export function buildServer(options: BuildServerOptions = {}) {
  const server = Fastify({ logger: false });
  const marketDataProvider =
    options.marketDataProvider ??
    createCachedMarketDataProvider({
      provider: new EastMoneyMarketDataProvider(),
      cacheFile: defaultMarketDataCacheFile()
    });
  const state: AppState = {
    strategies: [
      createStrategyVersion({
        id: "ma-volume",
        name: "双均线成交量策略",
        version: 1,
        universe: ["000001.SZ", "600000.SH"],
        parameters: { maxPositionPct: 0.1, stopLossPct: 0.08, buyThreshold: 1 }
      })
    ],
    lastRun: null,
    report: null,
    auditEvents: [],
    shortTermSignals: [],
    manualPositions: [],
    sellAlerts: [],
    marketDataSnapshot: null
  };

  server.register(cors, { origin: true });

  server.get("/api/health", async () => ({ ok: true }));

  server.get("/api/strategies", async () => ({ strategies: state.strategies }));

  server.get("/api/market-data/status", async () => {
    const snapshot = await refreshMarketData();

    return {
      source: snapshot.source,
      quality: snapshot.quality,
      dailyBars: snapshot.daily.length,
      minuteBars: snapshot.minute.length
    };
  });

  server.post("/api/strategies/:id/parameters", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<StrategyDefinition["parameters"]>;
    const strategy = state.strategies.find((item) => item.id === id);

    if (!strategy) return reply.status(404).send({ error: "strategy not found" });

    strategy.parameters = { ...strategy.parameters, ...body };
    strategy.updatedAt = "2026-06-08T10:00:00.000+08:00";
    state.auditEvents.push(audit("user", "strategy_parameters_hot_updated", id, body));

    return { strategy };
  });

  server.post("/api/simulation/run", async () => {
    const bars = await refreshMarketData();
    const result = runVirtualTradingSession({
      strategies: state.strategies,
      bars: bars.minute,
      startingCash: 100000,
      maxSymbolExposurePct: 0.2,
      killSwitch: false
    });

    state.lastRun = result;
    state.auditEvents.push(...result.auditEvents);
    state.report = buildDailyReport({
      date: "2026-06-08",
      startingEquity: 100000,
      endingEquity: result.portfolio.totalEquity,
      maxDrawdownPct: 0.01,
      fills: result.fills,
      signals: result.signals,
      hitSignalIds: result.signals.slice(0, Math.max(1, result.signals.length - 1)).map((signal) => signal.id),
      target: { minReturnPct: 0, maxDrawdownPct: 0.03 }
    });

    return { result, report: state.report };
  });

  server.get("/api/short-term/signals", async () => {
    state.shortTermSignals = await refreshShortTermSignals();

    return { signals: state.shortTermSignals };
  });

  server.post("/api/short-term/signals/:id/manual-buy", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { quantity?: number } | null;
    const signals = state.shortTermSignals.length > 0 ? state.shortTermSignals : await refreshShortTermSignals();
    const signal = signals.find((item) => item.id === id);

    if (!signal) return reply.status(404).send({ error: "short-term signal not found" });

    const position = createManualPositionFromSignal(signal, body?.quantity ?? 1000);
    state.manualPositions = [...state.manualPositions.filter((item) => item.signalId !== signal.id), position];
    state.sellAlerts = monitorSellSignals(state.manualPositions, (await refreshMarketData()).minute);
    state.auditEvents.push(
      audit("user", "manual_buy_marked", signal.id, {
        symbol: signal.symbol,
        quantity: position.quantity,
        entryPrice: position.entryPrice
      })
    );

    return { position, sellAlerts: state.sellAlerts };
  });

  server.get("/api/manual-positions", async () => {
    state.sellAlerts = monitorSellSignals(state.manualPositions, (await refreshMarketData()).minute);

    return { positions: state.manualPositions, sellAlerts: state.sellAlerts };
  });

  server.get("/api/monitoring", async () => ({
    status: state.lastRun ? "running" : "idle",
    strategies: state.strategies.length,
    signals: state.lastRun?.signals.length ?? 0,
    orders: state.lastRun?.orders.length ?? 0,
    fills: state.lastRun?.fills.length ?? 0,
    positions: state.lastRun?.portfolio.positions.length ?? 0,
    totalEquity: state.lastRun?.portfolio.totalEquity ?? 100000,
    auditEvents: state.auditEvents.length,
    shortTermSignals: state.shortTermSignals.length,
    manualPositions: state.manualPositions.length,
    sellAlerts: state.sellAlerts.length,
    dataProvider: state.marketDataSnapshot?.source.provider ?? "loading",
    dataIsReal: state.marketDataSnapshot?.source.isReal ?? false,
    dataWarnings: state.marketDataSnapshot?.source.warnings.length ?? 0
  }));

  server.get("/api/report/daily", async () => ({ report: state.report }));

  server.get("/api/audit", async () => ({ events: state.auditEvents }));

  return server;

  async function refreshMarketData(): Promise<MarketDataSnapshot> {
    const symbols = Array.from(new Set(state.strategies.flatMap((strategy) => strategy.universe)));
    state.marketDataSnapshot = await fetchMarketDataSnapshot(marketDataProvider, symbols);

    return state.marketDataSnapshot;
  }

  async function refreshShortTermSignals(): Promise<ShortTermBuySignal[]> {
    state.shortTermSignals = findShortTermBuySignals((await refreshMarketData()).minute);

    return state.shortTermSignals;
  }
}

function defaultMarketDataCacheFile(): string {
  return fileURLToPath(new URL("../../../tmp/market-data-cache/eastmoney-snapshot.json", import.meta.url));
}

function audit(
  actor: AuditEvent["actor"],
  action: string,
  entityId: string,
  details: AuditEvent["details"]
): AuditEvent {
  return {
    id: `audit-${action}-${Date.now()}`,
    timestamp: "2026-06-08T10:00:00.000+08:00",
    actor,
    action,
    entityId,
    details
  };
}
