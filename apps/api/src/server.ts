import cors from "@fastify/cors";
import { createStrategyVersion, type AuditEvent, type StrategyDefinition } from "@itrade/domain";
import {
  buildDailyReport,
  getSampleBars,
  runVirtualTradingSession,
  type DailyReport,
  type VirtualTradingResult
} from "@itrade/engine";
import Fastify from "fastify";

interface AppState {
  strategies: StrategyDefinition[];
  lastRun: VirtualTradingResult | null;
  report: DailyReport | null;
  auditEvents: AuditEvent[];
}

export function buildServer() {
  const server = Fastify({ logger: false });
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
    auditEvents: []
  };

  server.register(cors, { origin: true });

  server.get("/api/health", async () => ({ ok: true }));

  server.get("/api/strategies", async () => ({ strategies: state.strategies }));

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
    const bars = getSampleBars();
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

  server.get("/api/monitoring", async () => ({
    status: state.lastRun ? "running" : "idle",
    strategies: state.strategies.length,
    signals: state.lastRun?.signals.length ?? 0,
    orders: state.lastRun?.orders.length ?? 0,
    fills: state.lastRun?.fills.length ?? 0,
    positions: state.lastRun?.portfolio.positions.length ?? 0,
    totalEquity: state.lastRun?.portfolio.totalEquity ?? 100000,
    auditEvents: state.auditEvents.length
  }));

  server.get("/api/report/daily", async () => ({ report: state.report }));

  server.get("/api/audit", async () => ({ events: state.auditEvents }));

  return server;
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
