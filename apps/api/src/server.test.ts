import { describe, expect, it } from "vitest";
import { buildServer } from "./server";
import {
  getSampleBars,
  type ExternalIntelProvider,
  type ExternalIntelSnapshot,
  type MarketDataProvider,
  type MarketDataSnapshot
} from "@itrade/engine";

describe("api server", () => {
  it("returns monitoring state after running a virtual session", async () => {
    const server = buildServer({ marketDataProvider: fakeMarketDataProvider(), externalIntelProvider: fakeExternalIntelProvider() });

    const run = await server.inject({ method: "POST", url: "/api/simulation/run" });
    expect(run.statusCode).toBe(200);

    const monitoring = await server.inject({ method: "GET", url: "/api/monitoring" });
    const body = monitoring.json();

    expect(monitoring.statusCode).toBe(200);
    expect(body.status).toBe("running");
    expect(body.signals).toBeGreaterThan(0);
    expect(body.auditEvents).toBeGreaterThan(0);
  });

  it("returns latest virtual trading signal and trade details", async () => {
    const server = buildServer({ marketDataProvider: fakeMarketDataProvider(), externalIntelProvider: fakeExternalIntelProvider() });

    await server.inject({ method: "POST", url: "/api/simulation/run" });
    const response = await server.inject({ method: "GET", url: "/api/virtual-trading/latest" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.result.signals[0]).toMatchObject({
      symbol: "000001.SZ",
      side: "buy",
      reason: "entry rules matched"
    });
    expect(body.result.orders[0]).toMatchObject({ symbol: "000001.SZ", side: "buy" });
    expect(body.result.fills[0]).toMatchObject({ symbol: "000001.SZ", side: "buy" });
    expect(body.portfolio.positions.length).toBeGreaterThan(0);
  });

  it("hot updates strategy parameters and records an audit event", async () => {
    const server = buildServer({ marketDataProvider: fakeMarketDataProvider(), externalIntelProvider: fakeExternalIntelProvider() });

    const response = await server.inject({
      method: "POST",
      url: "/api/strategies/ma-volume/parameters",
      payload: { maxPositionPct: 0.05 }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().strategy.parameters.maxPositionPct).toBe(0.05);

    const audit = await server.inject({ method: "GET", url: "/api/audit" });
    expect(audit.json().events.map((event: { action: string }) => event.action)).toContain(
      "strategy_parameters_hot_updated"
    );
  });

  it("returns only high-conviction short-term buy signals", async () => {
    const server = buildServer({ marketDataProvider: fakeMarketDataProvider(), externalIntelProvider: fakeExternalIntelProvider() });

    const response = await server.inject({ method: "GET", url: "/api/short-term/signals" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.signals).toHaveLength(1);
    expect(body.signals[0]).toMatchObject({
      symbol: "000001.SZ",
      side: "buy",
      suggestedPositionPct: 0.1
    });
    expect(body.signals[0].confidenceScore).toBeGreaterThanOrEqual(85);
  });

  it("marks a manual buy and starts sell-signal monitoring", async () => {
    const server = buildServer({ marketDataProvider: fakeMarketDataProvider(), externalIntelProvider: fakeExternalIntelProvider() });

    const signalsResponse = await server.inject({ method: "GET", url: "/api/short-term/signals" });
    const [signal] = signalsResponse.json().signals;

    const response = await server.inject({
      method: "POST",
      url: `/api/short-term/signals/${encodeURIComponent(signal.id)}/manual-buy`,
      payload: { quantity: 300 }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().position).toMatchObject({
      signalId: signal.id,
      symbol: "000001.SZ",
      quantity: 300,
      status: "monitoring"
    });

    const positions = await server.inject({ method: "GET", url: "/api/manual-positions" });
    expect(positions.json().positions).toHaveLength(1);

    const audit = await server.inject({ method: "GET", url: "/api/audit" });
    expect(audit.json().events.map((event: { action: string }) => event.action)).toContain("manual_buy_marked");
  });

  it("returns real market data source status and quality", async () => {
    const server = buildServer({ marketDataProvider: fakeMarketDataProvider(), externalIntelProvider: fakeExternalIntelProvider() });

    const response = await server.inject({ method: "GET", url: "/api/market-data/status" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.source).toMatchObject({
      provider: "eastmoney",
      isReal: true,
      cacheHit: false
    });
    expect(body.quality.ok).toBe(true);
    expect(body.dailyBars).toBeGreaterThan(0);
    expect(body.minuteBars).toBeGreaterThan(0);
  });

  it("returns a short-term intelligence report with real external intel items", async () => {
    const server = buildServer({
      marketDataProvider: fakeMarketDataProvider(),
      externalIntelProvider: fakeExternalIntelProvider()
    });

    const response = await server.inject({ method: "GET", url: "/api/intelligence/short-term" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.report.outlook).toContain("短期");
    expect(body.report.externalIntelItems).toContainEqual(
      expect.objectContaining({ source: "news", provider: "fixture-news", relatedSymbols: ["000001.SZ"] })
    );
    expect(body.report.externalIntelStatuses).toContainEqual(
      expect.objectContaining({ source: "news", status: "available", itemCount: 1 })
    );
  });

  it("returns aggregate data source status", async () => {
    const server = buildServer({
      marketDataProvider: fakeMarketDataProvider(),
      externalIntelProvider: fakeExternalIntelProvider()
    });

    const response = await server.inject({ method: "GET", url: "/api/data-sources/status" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.marketData.source).toMatchObject({ provider: "eastmoney", isReal: true });
    expect(body.externalIntel.statuses).toContainEqual(
      expect.objectContaining({ source: "news", status: "available", provider: "fixture-news" })
    );
  });

  it("runs virtual trading automatically when the market is open", async () => {
    const server = buildServer({
      marketDataProvider: fakeMarketDataProvider(),
      externalIntelProvider: fakeExternalIntelProvider(),
      autoTradingEnabled: true,
      now: () => new Date("2026-06-08T10:00:00+08:00")
    });

    const response = await server.inject({ method: "POST", url: "/api/auto-trading/check" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.autoTrading.enabled).toBe(true);
    expect(body.autoTrading.runCount).toBe(1);
    expect(body.autoTrading.phase).toBe("armed");
    expect(body.result.fills.length).toBeGreaterThan(0);

    const audit = await server.inject({ method: "GET", url: "/api/audit" });
    expect(audit.json().events.map((event: { action: string }) => event.action)).toContain("auto_virtual_trade_run");
  });

  it("continues the same virtual portfolio across automatic checks", async () => {
    const server = buildServer({
      marketDataProvider: fakeMarketDataProvider(),
      externalIntelProvider: fakeExternalIntelProvider(),
      autoTradingEnabled: true,
      now: () => new Date("2026-06-08T10:00:00+08:00")
    });

    const first = await server.inject({ method: "POST", url: "/api/auto-trading/check" });
    const second = await server.inject({ method: "POST", url: "/api/auto-trading/check" });
    const firstBody = first.json();
    const secondBody = second.json();

    expect(firstBody.result.fills.length).toBeGreaterThan(0);
    expect(secondBody.autoTrading.runCount).toBe(2);
    expect(secondBody.result.fills).toHaveLength(0);
    expect(secondBody.result.portfolio).toEqual(firstBody.result.portfolio);
  });

  it("keeps automatic virtual trading armed but idle outside market hours", async () => {
    const server = buildServer({
      marketDataProvider: fakeMarketDataProvider(),
      autoTradingEnabled: true,
      now: () => new Date("2026-06-08T08:30:00+08:00")
    });

    const response = await server.inject({ method: "POST", url: "/api/auto-trading/check" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.autoTrading.enabled).toBe(true);
    expect(body.autoTrading.runCount).toBe(0);
    expect(body.autoTrading.lastDecision).toBe("market_closed");
    expect(body.result).toBeNull();
  });

  it("stops automatic virtual trading after the market closes", async () => {
    const server = buildServer({
      marketDataProvider: fakeMarketDataProvider(),
      autoTradingEnabled: true,
      now: () => new Date("2026-06-08T15:01:00+08:00")
    });

    const response = await server.inject({ method: "POST", url: "/api/auto-trading/check" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.autoTrading.enabled).toBe(false);
    expect(body.autoTrading.phase).toBe("paused");
    expect(body.autoTrading.lastDecision).toBe("market_closed");
    expect(body.result).toBeNull();
  });

  it("can disable automatic virtual trading", async () => {
    const server = buildServer({
      marketDataProvider: fakeMarketDataProvider(),
      autoTradingEnabled: true,
      now: () => new Date("2026-06-08T10:00:00+08:00")
    });

    const response = await server.inject({
      method: "POST",
      url: "/api/auto-trading/config",
      payload: { enabled: false }
    });
    const check = await server.inject({ method: "POST", url: "/api/auto-trading/check" });

    expect(response.statusCode).toBe(200);
    expect(response.json().autoTrading.enabled).toBe(false);
    expect(check.json().autoTrading.lastDecision).toBe("disabled");
    expect(check.json().result).toBeNull();
  });

  it("exposes configurable A-share virtual trading settings with reserved real broker boundary", async () => {
    const server = buildServer({ marketDataProvider: fakeMarketDataProvider(), externalIntelProvider: fakeExternalIntelProvider() });

    const update = await server.inject({
      method: "POST",
      url: "/api/virtual-trading/config",
      payload: { startingCash: 200000, maxSymbolExposurePct: 0.15, defaultOrderQuantity: 500, killSwitch: true }
    });
    const status = await server.inject({ method: "GET", url: "/api/virtual-trading/config" });

    expect(update.statusCode).toBe(200);
    expect(status.json().config).toMatchObject({
      market: "A股",
      mode: "virtual_with_ai_advice",
      primaryHorizon: "intraday_short",
      startingCash: 200000,
      maxSymbolExposurePct: 0.15,
      defaultOrderQuantity: 500,
      killSwitch: true,
      realBrokerReserved: true
    });
  });

  it("returns clearly separated short-term primary advice plus swing and long-term references", async () => {
    const server = buildServer({
      marketDataProvider: fakeMarketDataProvider(),
      externalIntelProvider: fakeExternalIntelProvider()
    });

    const response = await server.inject({ method: "GET", url: "/api/ai-advice" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.advice.map((item: { horizon: string }) => item.horizon)).toEqual([
      "intraday_short",
      "swing",
      "long_term"
    ]);
    expect(body.advice[0]).toMatchObject({ priority: "primary", horizonLabel: "日内短线主策略" });
    expect(body.advice[1]).toMatchObject({ priority: "reference", horizonLabel: "波段参考策略" });
    expect(body.advice[2]).toMatchObject({ priority: "reference", horizonLabel: "长线参考策略" });
  });


  it("returns the evaluated stock list with detailed screening evidence", async () => {
    const server = buildServer({
      marketDataProvider: fakeMarketDataProvider(),
      externalIntelProvider: fakeExternalIntelProvider()
    });

    const response = await server.inject({ method: "GET", url: "/api/ai-advice" });
    const body = response.json();
    const shortTerm = body.advice[0];

    expect(response.statusCode).toBe(200);
    expect(shortTerm.evaluatedStocks.length).toBeGreaterThanOrEqual(2);
    expect(shortTerm.evaluatedStocks[0]).toMatchObject({
      symbol: "000001.SZ",
      sector: "银行",
      decision: "重点关注",
      rank: 1
    });
    expect(shortTerm.evaluatedStocks[0].scores).toMatchObject({ trend: expect.any(Number), volume: expect.any(Number), abnormal: expect.any(Number), total: expect.any(Number) });
    expect(shortTerm.evaluatedStocks[0].screeningEvidence).toEqual(
      expect.arrayContaining([expect.stringContaining("趋势"), expect.stringContaining("成交量"), expect.stringContaining("风险")])
    );
    expect(shortTerm.evaluatedStocks.map((stock: { symbol: string }) => stock.symbol)).toContain("600000.SH");
  });


  it("adds an actionable virtual trade plan to each evaluated stock", async () => {
    const server = buildServer({
      marketDataProvider: fakeMarketDataProvider(),
      externalIntelProvider: fakeExternalIntelProvider()
    });

    const response = await server.inject({ method: "GET", url: "/api/ai-advice" });
    const stock = response.json().advice[0].evaluatedStocks[0];

    expect(stock.tradePlan).toMatchObject({
      entryZoneLow: expect.any(Number),
      entryZoneHigh: expect.any(Number),
      stopLossPrice: expect.any(Number),
      takeProfitPrice: expect.any(Number),
      riskRewardRatio: expect.any(Number),
      positionPct: expect.any(Number),
      maxLossPctOfPortfolio: expect.any(Number)
    });
    expect(stock.tradePlan.stopLossPrice).toBeLessThan(stock.tradePlan.entryZoneLow);
    expect(stock.tradePlan.takeProfitPrice).toBeGreaterThan(stock.tradePlan.entryZoneHigh);
    expect(stock.tradePlan.checklist).toEqual(
      expect.arrayContaining([expect.stringContaining("入场"), expect.stringContaining("止损"), expect.stringContaining("止盈")])
    );
  });


  it("configures AI API access without exposing the secret key", async () => {
    const server = buildServer({ marketDataProvider: fakeMarketDataProvider(), externalIntelProvider: fakeExternalIntelProvider() });

    const update = await server.inject({
      method: "POST",
      url: "/api/ai/config",
      payload: {
        enabled: true,
        provider: "openai-compatible",
        baseUrl: "https://api.example.com/v1",
        model: "gpt-4o-mini",
        apiKey: "demo-key-123456",
        timeoutMs: 45000,
        temperature: 0.2
      }
    });
    const status = await server.inject({ method: "GET", url: "/api/ai/config" });

    expect(update.statusCode).toBe(200);
    expect(status.json().config).toMatchObject({
      enabled: true,
      provider: "openai-compatible",
      baseUrl: "https://api.example.com/v1",
      model: "gpt-4o-mini",
      apiKeyConfigured: true,
      apiKeyMasked: "demo***3456",
      timeoutMs: 45000,
      temperature: 0.2
    });
    expect(JSON.stringify(status.json())).not.toContain("demo-key-123456");
  });

  it("marks AI advice as rule fallback until AI API is enabled", async () => {
    const server = buildServer({ marketDataProvider: fakeMarketDataProvider(), externalIntelProvider: fakeExternalIntelProvider() });

    const response = await server.inject({ method: "GET", url: "/api/ai-advice" });
    const body = response.json();

    expect(body.aiRuntime).toMatchObject({ enabled: false, mode: "rule_fallback" });
    expect(body.advice[0].summary).toContain("规则引擎");
  });


  it("analyzes a user-entered stock symbol with strategy indicators and external information", async () => {
    const server = buildServer({
      marketDataProvider: fakeMarketDataProvider(),
      externalIntelProvider: fakeExternalIntelProvider()
    });

    const response = await server.inject({ method: "GET", url: "/api/stock-analysis?query=000001.SZ" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.analysis).toMatchObject({
      query: "000001.SZ",
      symbol: "000001.SZ",
      name: "平安银行",
      market: "A股",
      horizon: "日内短线为主，波段/长线参考",
      decision: expect.any(String),
      confidence: expect.any(Number),
      source: expect.objectContaining({ provider: "eastmoney", isReal: true })
    });
    expect(body.analysis.indicators).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "MA20趋势" }),
        expect.objectContaining({ name: "VWAP盘中承接" }),
        expect.objectContaining({ name: "RSI14动量" }),
        expect.objectContaining({ name: "ATR14波动" }),
        expect.objectContaining({ name: "成交量" })
      ])
    );
    expect(body.analysis.tradePlan.checklist).toEqual(
      expect.arrayContaining([expect.stringContaining("入场"), expect.stringContaining("止损"), expect.stringContaining("止盈")])
    );
    expect(body.analysis.externalIntel).toEqual(
      expect.arrayContaining([expect.objectContaining({ source: "news", relatedSymbols: ["000001.SZ"] })])
    );
    expect(body.analysis.disclaimer).toContain("虚拟交易");
  });

  it("returns 400 when stock-analysis query is empty", async () => {
    const server = buildServer({ marketDataProvider: fakeMarketDataProvider(), externalIntelProvider: fakeExternalIntelProvider() });

    const response = await server.inject({ method: "GET", url: "/api/stock-analysis?query=" });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("query");
  });

  it("returns 404 when hot-updating parameters for non-existent strategy", async () => {
    const server = buildServer({ marketDataProvider: fakeMarketDataProvider(), externalIntelProvider: fakeExternalIntelProvider() });

    const response = await server.inject({
      method: "POST",
      url: "/api/strategies/nonexistent/parameters",
      payload: { stopLossPct: 0.05 }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toContain("strategy");
  });

  it("returns 404 when updating non-existent AI config", async () => {
    const server = buildServer({ marketDataProvider: fakeMarketDataProvider(), externalIntelProvider: fakeExternalIntelProvider() });

    const response = await server.inject({
      method: "PUT",
      url: "/api/ai/configs/nonexistent",
      payload: { name: "test", provider: "openai-compatible", baseUrl: "http://localhost", model: "test" }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toContain("config");
  });

  it("returns 404 when deleting non-existent AI config", async () => {
    const server = buildServer({ marketDataProvider: fakeMarketDataProvider(), externalIntelProvider: fakeExternalIntelProvider() });

    const response = await server.inject({ method: "DELETE", url: "/api/ai/configs/nonexistent" });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toContain("config");
  });

  it("returns 404 when activating non-existent AI config", async () => {
    const server = buildServer({ marketDataProvider: fakeMarketDataProvider(), externalIntelProvider: fakeExternalIntelProvider() });

    const response = await server.inject({ method: "POST", url: "/api/ai/configs/nonexistent/activate" });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toContain("config");
  });

  it("returns 400 when AI config name is missing", async () => {
    const server = buildServer({ marketDataProvider: fakeMarketDataProvider(), externalIntelProvider: fakeExternalIntelProvider() });

    const response = await server.inject({
      method: "POST",
      url: "/api/ai/configs",
      payload: { provider: "openai-compatible", baseUrl: "http://localhost", model: "test" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("name");
  });

  it("returns structured error when data source status fails", async () => {
    const failingProvider: MarketDataProvider = {
      async getSnapshot(): Promise<MarketDataSnapshot> {
        throw new Error("data source connection failed");
      }
    };
    const server = buildServer({ marketDataProvider: failingProvider, externalIntelProvider: fakeExternalIntelProvider() });

    const response = await server.inject({ method: "GET", url: "/api/data-sources/status" });

    expect(response.statusCode).toBe(500);
    expect(response.json().error).toContain("data source");
  });

  it("creates, lists, updates, activates, and deletes AI configs", async () => {
    const server = buildServer({ marketDataProvider: fakeMarketDataProvider(), externalIntelProvider: fakeExternalIntelProvider() });

    // Create first config
    const create1 = await server.inject({
      method: "POST",
      url: "/api/ai/configs",
      payload: { name: "Config A", enabled: true, provider: "openai-compatible", baseUrl: "http://localhost:8080", model: "gpt-4" }
    });
    expect(create1.statusCode).toBe(200);
    const config1 = create1.json().config;
    expect(config1.name).toBe("Config A");
    expect(config1.isDefault).toBe(true); // first config is auto-default

    // Create second config
    const create2 = await server.inject({
      method: "POST",
      url: "/api/ai/configs",
      payload: { name: "Config B", enabled: false, provider: "deepseek", baseUrl: "http://localhost:8081", model: "deepseek-chat" }
    });
    expect(create2.statusCode).toBe(200);
    const config2 = create2.json().config;
    expect(config2.name).toBe("Config B");
    expect(config2.isDefault).toBe(false);

    // List configs
    const list = await server.inject({ method: "GET", url: "/api/ai/configs" });
    expect(list.statusCode).toBe(200);
    expect(list.json().configs).toHaveLength(2);
    expect(list.json().activeId).toBe(config1.id);

    // Update second config
    const update = await server.inject({
      method: "PUT",
      url: `/api/ai/configs/${config2.id}`,
      payload: { name: "Config B Updated", enabled: true, provider: "deepseek", baseUrl: "http://localhost:8081", model: "deepseek-chat-v2" }
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().config.name).toBe("Config B Updated");
    expect(update.json().config.model).toBe("deepseek-chat-v2");

    // Activate second config
    const activate = await server.inject({ method: "POST", url: `/api/ai/configs/${config2.id}/activate` });
    expect(activate.statusCode).toBe(200);
    expect(activate.json().activeId).toBe(config2.id);

    // Verify activation
    const listAfter = await server.inject({ method: "GET", url: "/api/ai/configs" });
    expect(listAfter.json().activeId).toBe(config2.id);

    // Delete first config
    const del = await server.inject({ method: "DELETE", url: `/api/ai/configs/${config1.id}` });
    expect(del.statusCode).toBe(200);

    // Verify deletion
    const listAfterDel = await server.inject({ method: "GET", url: "/api/ai/configs" });
    expect(listAfterDel.json().configs).toHaveLength(1);
    expect(listAfterDel.json().configs[0].id).toBe(config2.id);
  });

  it("validates AI config input and rejects invalid payloads", async () => {
    const server = buildServer({ marketDataProvider: fakeMarketDataProvider(), externalIntelProvider: fakeExternalIntelProvider() });

    // Missing name
    const noName = await server.inject({
      method: "POST",
      url: "/api/ai/configs",
      payload: { provider: "openai-compatible", baseUrl: "http://localhost", model: "test" }
    });
    expect(noName.statusCode).toBe(400);

    // Invalid URL
    const badUrl = await server.inject({
      method: "POST",
      url: "/api/ai/configs",
      payload: { name: "test", provider: "openai-compatible", baseUrl: "not-a-url", model: "test" }
    });
    expect(badUrl.statusCode).toBe(400);

    // Invalid provider
    const badProvider = await server.inject({
      method: "POST",
      url: "/api/ai/configs",
      payload: { name: "test", provider: "invalid", baseUrl: "http://localhost", model: "test" }
    });
    expect(badProvider.statusCode).toBe(400);
  });

  it("validates strategy parameters and rejects invalid values", async () => {
    const server = buildServer({ marketDataProvider: fakeMarketDataProvider(), externalIntelProvider: fakeExternalIntelProvider() });

    // Negative stopLossPct
    const response = await server.inject({
      method: "POST",
      url: "/api/strategies/ma-volume/parameters",
      payload: { stopLossPct: -0.5 }
    });
    expect(response.statusCode).toBe(400);
  });

  it("returns paginated audit events", async () => {
    const server = buildServer({ marketDataProvider: fakeMarketDataProvider(), externalIntelProvider: fakeExternalIntelProvider() });

    // Run simulation to generate audit events
    await server.inject({ method: "POST", url: "/api/simulation/run" });

    // Get first page
    const page1 = await server.inject({ method: "GET", url: "/api/audit?limit=2&offset=0" });
    expect(page1.statusCode).toBe(200);
    const body1 = page1.json();
    expect(body1.events).toHaveLength(2);
    expect(body1.total).toBeGreaterThan(0);
    expect(typeof body1.hasMore).toBe("boolean");

    // Get second page
    const page2 = await server.inject({ method: "GET", url: "/api/audit?limit=2&offset=2" });
    expect(page2.statusCode).toBe(200);
    const body2 = page2.json();
    expect(body2.events).toHaveLength(2);
    // Events should be different from page 1
    expect(body2.events[0].id).not.toBe(body1.events[0].id);
  });

  it("returns health check with system info", async () => {
    const server = buildServer({ marketDataProvider: fakeMarketDataProvider(), externalIntelProvider: fakeExternalIntelProvider() });

    const response = await server.inject({ method: "GET", url: "/api/health" });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.ok).toBe(true);
    expect(typeof body.uptime).toBe("number");
    expect(typeof body.memory.rss).toBe("number");
    expect(typeof body.state.auditEventCount).toBe("number");
  });

  it("rejects stock analysis query that is too long", async () => {
    const server = buildServer({ marketDataProvider: fakeMarketDataProvider(), externalIntelProvider: fakeExternalIntelProvider() });
    const longQuery = "a".repeat(101);

    const response = await server.inject({ method: "GET", url: `/api/stock-analysis?query=${longQuery}` });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("too long");
  });

  it("validates auto-trading config and rejects invalid body", async () => {
    const server = buildServer({ marketDataProvider: fakeMarketDataProvider(), externalIntelProvider: fakeExternalIntelProvider() });

    const response = await server.inject({
      method: "POST",
      url: "/api/auto-trading/config",
      payload: { enabled: "not-a-boolean" }
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 for stock analysis with empty query", async () => {
    const server = buildServer({ marketDataProvider: fakeMarketDataProvider(), externalIntelProvider: fakeExternalIntelProvider() });

    const response = await server.inject({ method: "GET", url: "/api/stock-analysis?query=" });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("query");
  });

  it("returns 404 for non-existent manual buy signal", async () => {
    const server = buildServer({ marketDataProvider: fakeMarketDataProvider(), externalIntelProvider: fakeExternalIntelProvider() });

    const response = await server.inject({
      method: "POST",
      url: "/api/short-term/signals/nonexistent/manual-buy",
      payload: { quantity: 1000 }
    });

    expect(response.statusCode).toBe(404);
  });

  it("returns 429 when rate limit is exceeded", async () => {
    const server = buildServer({ marketDataProvider: fakeMarketDataProvider(), externalIntelProvider: fakeExternalIntelProvider() });

    // Send 5 requests (the limit for simulation)
    for (let i = 0; i < 5; i++) {
      await server.inject({ method: "POST", url: "/api/simulation/run" });
    }

    // The 6th request should be rate limited
    const response = await server.inject({ method: "POST", url: "/api/simulation/run" });

    expect(response.statusCode).toBe(429);
    expect(response.json().error).toContain("频繁");
  });

});

function fakeMarketDataProvider(): MarketDataProvider {
  return {
    async getSnapshot(symbols: string[]): Promise<MarketDataSnapshot> {
      const bars = getSampleBars();

      return {
        ...bars,
        source: {
          provider: "eastmoney",
          isReal: true,
          updatedAt: "2026-06-08T10:00:00.000+08:00",
          symbols,
          warnings: [],
          cacheHit: false
        },
        quality: { ok: true, issues: [] }
      };
    }
  };
}

function fakeExternalIntelProvider(): ExternalIntelProvider {
  return {
    async getSnapshot(): Promise<ExternalIntelSnapshot> {
      return {
        items: [
          {
            id: "fixture-news-000001",
            source: "news",
            title: "Ping An Bank fixture news",
            timestamp: "2026-06-08T10:00:00.000+08:00",
            provider: "fixture-news",
            credibility: "verified",
            relatedSymbols: ["000001.SZ"],
            summary: "Verified fixture news for API integration.",
            url: "https://example.test/news"
          }
        ],
        statuses: [
          {
            source: "news",
            label: "News Catalyst",
            status: "available",
            provider: "fixture-news",
            message: "fixture news available",
            updatedAt: "2026-06-08T10:00:00.000+08:00",
            itemCount: 1
          }
        ],
        warnings: [],
        updatedAt: "2026-06-08T10:00:00.000+08:00"
      };
    },
    describe() {
      return [
        {
          source: "news",
          label: "News Catalyst",
          status: "available",
          provider: "fixture-news",
          message: "fixture news available",
          updatedAt: "2026-06-08T10:00:00.000+08:00",
          itemCount: 1
        }
      ];
    }
  };
}
