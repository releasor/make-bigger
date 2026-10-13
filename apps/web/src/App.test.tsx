import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

describe("App API integration", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/strategies")) {
          return json({
            strategies: [{ id: "ma-volume", name: "双均线成交量策略", parameters: { maxPositionPct: 0.1 } }]
          });
        }
        if (url.endsWith("/api/monitoring")) {
          return json({
            status: "running",
            strategies: 1,
            signals: 2,
            orders: 1,
            fills: 1,
            positions: 1,
            totalEquity: 100245.2,
            auditEvents: 3,
            autoTrading: {
              enabled: true,
              phase: "armed",
              intervalMs: 30000,
              runCount: 2,
              lastDecision: "auto_virtual_trade_run",
              lastRunAt: "2026-06-08T10:00:00.000+08:00"
            }
          });
        }
        if (url.endsWith("/api/virtual-trading/config")) {
          const payload = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
          return json({
            config: {
              market: "A股",
              mode: "virtual_with_ai_advice",
              primaryHorizon: "intraday_short",
              startingCash: payload.startingCash ?? 100000,
              maxSymbolExposurePct: payload.maxSymbolExposurePct ?? 0.2,
              defaultOrderQuantity: payload.defaultOrderQuantity ?? 1000,
              autoTradingIntervalMs: 30000,
              killSwitch: payload.killSwitch ?? false,
              realBrokerReserved: true
            }
          });
        }
        if (url.endsWith("/api/ai/config")) {
          const payload = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
          return json({
            config: {
              enabled: payload.enabled ?? false,
              provider: payload.provider ?? "openai-compatible",
              baseUrl: payload.baseUrl ?? "",
              model: payload.model ?? "",
              apiKeyConfigured: Boolean(payload.apiKey),
              apiKeyMasked: payload.apiKey ? "sk-***cret" : undefined,
              timeoutMs: payload.timeoutMs ?? 30000,
              temperature: payload.temperature ?? 0.2
            }
          });
        }
        if (url.startsWith("/api/stock-analysis")) {
          return json({
            analysis: {
              query: "000001.SZ",
              symbol: "000001.SZ",
              name: "平安银行",
              market: "A股",
              horizon: "日内短线为主，波段/长线参考",
              decision: "重点关注",
              confidence: 0.88,
              summary: "平安银行站上 MA20 且高于 VWAP，RSI14 处于健康动量区间。",
              indicators: [
                { name: "MA20趋势", status: "positive", value: "10.80 > 10.30", explanation: "趋势向上" },
                { name: "VWAP盘中承接", status: "positive", value: "10.34 > 10.06", explanation: "盘中承接偏强" },
                { name: "RSI14动量", status: "neutral", value: "64", explanation: "健康动量" },
                { name: "ATR14波动", status: "neutral", value: "4.2%", explanation: "波动可控" },
                { name: "成交量", status: "positive", value: "1.37x", explanation: "量能放大" }
              ],
              reasons: ["趋势突破", "VWAP强势", "RSI健康动量", "ATR风险适中"],
              risks: ["仅虚拟交易参考", "外部数据源可能延迟"],
              tradePlan: { entryZoneLow: 10.24, entryZoneHigh: 10.42, stopLossPrice: 9.82, takeProfitPrice: 11.22, riskRewardRatio: 2.1, positionPct: 0.1, maxLossPctOfPortfolio: 0.01, checklist: ["入场：回踩区间内企稳", "止损：跌破9.82", "止盈：接近11.22分批止盈"] },
              externalIntel: [{ source: "news", title: "Ping An Bank fixture news", summary: "Verified fixture news for API integration.", relatedSymbols: ["000001.SZ"], credibility: "verified" }],
              source: { provider: "eastmoney", isReal: true, cacheHit: false, updatedAt: "2026-06-08T10:00:00.000+08:00" },
              disclaimer: "仅用于虚拟交易和研究，不构成投资建议。"
            }
          });
        }
        if (url.endsWith("/api/ai-advice")) {
          return json({
            advice: [
              { id: "advice-short", horizon: "intraday_short", horizonLabel: "日内短线主策略", priority: "primary", symbol: "000001.SZ", action: "buy_watch", title: "短线主策略：只做高置信度盘中机会", summary: "围绕放量突破和止损边界做虚拟交易。", confidence: 0.82, positionHintPct: 0.1, riskBoundary: "跌破盘中止损价即退出观察", reasons: ["放量突破", "AI仅给建议，执行为虚拟盘"], evaluatedStocks: [
                { symbol: "000001.SZ", sector: "银行", rank: 1, decision: "重点关注", latestPrice: 10.34, scores: { trend: 65, volume: 25, abnormal: 20, risk: 15, total: 95 }, screeningEvidence: ["趋势：站上MA20且近5日延续", "成交量：放量1.73倍", "风险：止损价9.51"], tradePlan: { entryZoneLow: 10.24, entryZoneHigh: 10.42, stopLossPrice: 9.82, takeProfitPrice: 11.22, riskRewardRatio: 2.1, positionPct: 0.1, maxLossPctOfPortfolio: 0.01, checklist: ["入场：回踩区间内企稳", "止损：跌破9.82", "止盈：接近11.22分批止盈"] } },
                { symbol: "600000.SH", sector: "银行", rank: 2, decision: "观察等待", latestPrice: 9.35, scores: { trend: 20, volume: 10, abnormal: 0, risk: 35, total: 30 }, screeningEvidence: ["趋势：低于MA20", "成交量：未明显放大", "风险：RSI偏弱"] }
              ] },
              { id: "advice-swing", horizon: "swing", horizonLabel: "波段参考策略", priority: "reference", action: "hold_watch", title: "波段参考：观察板块持续性", summary: "用于几天到几周维度参考，不覆盖短线主策略。", confidence: 0.62, positionHintPct: 0.05, riskBoundary: "跌破20日均线降低关注", reasons: ["板块轮动"] },
              { id: "advice-long", horizon: "long_term", horizonLabel: "长线参考策略", priority: "reference", action: "wait", title: "长线参考：等待基本面验证", summary: "仅作为长期观察清单，不触发日内虚拟交易。", confidence: 0.48, positionHintPct: 0.03, riskBoundary: "长期逻辑失效则移出观察", reasons: ["真实基本面源未接入"] }
            ]
          });
        }
        if (url.endsWith("/api/auto-trading/status")) {
          return json({
            autoTrading: {
              enabled: true,
              phase: "armed",
              intervalMs: 30000,
              runCount: 2,
              lastDecision: "auto_virtual_trade_run",
              lastRunAt: "2026-06-08T10:00:00.000+08:00"
            },
            marketSession: { isOpen: true, label: "浜ゆ槗鏃堕棿", sessionName: "杩炵画绔炰环" }
          });
        }
        if (url.endsWith("/api/auto-trading/config")) {
          const body = JSON.parse(String(init?.body ?? "{}")) as { enabled?: boolean };
          const enabled = Boolean(body.enabled);
          return json({
            autoTrading: {
              enabled,
              phase: enabled ? "armed" : "paused",
              intervalMs: 30000,
              runCount: 2,
              lastDecision: enabled ? "waiting" : "disabled"
            },
            marketSession: { isOpen: true, label: "浜ゆ槗鏃堕棿", sessionName: "杩炵画绔炰环" }
          });
        }
        if (url.endsWith("/api/auto-trading/check")) {
          return json({
            autoTrading: {
              enabled: true,
              phase: "armed",
              intervalMs: 30000,
              runCount: 3,
              lastDecision: "auto_virtual_trade_run",
              lastRunAt: "2026-06-08T10:00:10.000+08:00"
            },
            marketSession: { isOpen: true, label: "浜ゆ槗鏃堕棿", sessionName: "杩炵画绔炰环" },
            result: {},
            report: { tradingWinRate: 0.5 }
          });
        }
        if (url.endsWith("/api/report/daily")) {
          return json({
            report: {
              tradingWinRate: 0.5,
              signalHitRate: 0.6667,
              strategyTargetAchieved: true,
              dailyReturnPct: 0.0025
            }
          });
        }
        if (url.endsWith("/api/market-data/status")) {
          return json({
            source: {
              provider: "eastmoney",
              isReal: true,
              updatedAt: "2026-06-08T10:00:00.000+08:00",
              symbols: ["000001.SZ", "600000.SH"],
              warnings: [],
              cacheHit: false
            },
            quality: { ok: true, issues: [] },
            dailyBars: 4,
            minuteBars: 240
          });
        }
        if (url.endsWith("/api/intelligence/short-term")) {
          return json({
            report: {
              title: "短线情报与决策中枢",
              generatedAt: "2026-06-08T15:30:00.000+08:00",
              outlook: "短期情绪中性，银行有局部表现，等待强势股二次确认。",
              actionPlan: {
                mode: "精选跟踪",
                positionTone: "虚拟盘以观察为主，只记录特别清晰的信号。",
                operationAdvice: ["不追涨，只等待回踩确认或二次放量"],
                followUp: ["继续观察板块轮动"]
              },
              sentiment: {
                temperatureScore: 62,
                trendLabel: "中性",
                risingCount: 1,
                fallingCount: 1,
                trendUpCount: 1,
                strongCount: 1,
                volumeActiveCount: 1,
                averageVolumeRatio: 1.45,
                reasons: ["1/2 只观察股上涨"]
              },
              sectorRotation: [
                {
                  sector: "银行",
                  sampleSize: 2,
                  strengthScore: 68,
                  persistenceScore: 70,
                  sampleQuality: "样本充足",
                  direction: "轮动",
                  representativeSymbols: ["000001.SZ"],
                  reasons: ["板块平均强度 68"]
                }
              ],
              watchlist: [
                {
                  symbol: "000001.SZ",
                  sector: "银行",
                  latestPrice: 10.34,
                  trendScore: 55,
                  volumeScore: 25,
                  abnormalScore: 15,
                  totalScore: 95,
                  turnoverRate: 0.07,
                  labels: ["趋势突破", "放量", "接近异动"],
                  basis: ["现价高于 MA20"],
                  riskNotes: ["按虚拟盘纪律设置止损"]
                }
              ],
              nearAbnormal: [
                {
                  symbol: "000001.SZ",
                  sector: "银行",
                  latestPrice: 10.34,
                  trendScore: 55,
                  volumeScore: 25,
                  abnormalScore: 15,
                  totalScore: 95,
                  turnoverRate: 0.07,
                  labels: ["接近异动"],
                  basis: ["涨幅接近短线异动阈值"],
                  riskNotes: ["按虚拟盘纪律设置止损"]
                }
              ],
              riskSignals: [
                {
                  id: "risk-1",
                  level: "medium",
                  title: "放量追高风险",
                  reason: "短线量能快速放大。",
                  suggestion: "等待回踩确认。",
                  symbol: "000001.SZ"
                }
              ],
              externalIntelStatuses: [
                {
                  source: "dragon_tiger",
                  label: "龙虎榜",
                  status: "not_configured",
                  provider: "official-exchange-provider",
                  message: "龙虎榜真实来源尚未配置，本次不生成席位结论。",
                  itemCount: 0
                },
                {
                  source: "news",
                  label: "新闻催化",
                  status: "not_configured",
                  provider: "verified-news-provider",
                  message: "新闻真实来源尚未配置，本次不编造新闻催化。",
                  itemCount: 0
                }
              ],
              externalIntelItems: [],
              conclusion: "核心结论：当前建议为精选跟踪，重点跟踪 000001.SZ。",
              reasons: ["龙虎榜、新闻催化真实来源未配置，相关结论保持空缺"]
            }
          });
        }
        if (url.endsWith("/api/short-term/signals")) {
          return json({
            signals: [
              {
                id: "short-buy-000001.SZ-2026-06-08T09:32:00.000+08:00",
                symbol: "000001.SZ",
                side: "buy",
                timestamp: "2026-06-08T09:32:00.000+08:00",
                currentPrice: 10.34,
                confidenceScore: 92,
                recommendation: "特别值得关注",
                suggestedPositionPct: 0.1,
                stopLossPct: 0.08,
                stopLossPrice: 9.51,
                basis: ["放量 1.73 倍，短线资金活跃", "收盘价 10.34 突破 MA20 10.06"],
                riskNotes: ["跌破 9.51 触发止损观察"]
              }
            ]
          });
        }
        if (url.endsWith("/api/manual-positions")) {
          return json({ positions: [], sellAlerts: [] });
        }
        if (url.includes("/api/short-term/signals/") && url.endsWith("/manual-buy")) {
          return json({
            position: {
              id: "manual-short-buy-000001",
              signalId: "short-buy-000001.SZ-2026-06-08T09:32:00.000+08:00",
              symbol: "000001.SZ",
              quantity: 1000,
              entryPrice: 10.34,
              stopLossPrice: 9.51,
              entryTimestamp: "2026-06-08T09:32:00.000+08:00",
              status: "monitoring"
            },
            sellAlerts: []
          });
        }
        if (url.includes("/api/audit")) {
          return json({
            events: [
              {
                id: "audit-risk-1",
                timestamp: "2026-06-08T09:32:30.000+08:00",
                actor: "system",
                action: "risk_checked",
                entityId: "order-1",
                details: { approved: true, reason: "within_exposure_limit" }
              },
              {
                id: "audit-fill-1",
                timestamp: "2026-06-08T09:32:31.000+08:00",
                actor: "system",
                action: "virtual_fill_created",
                entityId: "order-1",
                details: { symbol: "000001.SZ", quantity: 100 }
              }
            ],
            total: 2,
            hasMore: false
          });
        }
        if (url.endsWith("/api/virtual-trading/latest")) {
          return json({
            result: {
              signals: [
                {
                  id: "ma-volume-1-000001.SZ-2026-06-08T09:32:00.000+08:00-buy",
                  strategyId: "ma-volume",
                  strategyVersion: 1,
                  symbol: "000001.SZ",
                  side: "buy",
                  timestamp: "2026-06-08T09:32:00.000+08:00",
                  confidence: 1,
                  reason: "entry rules matched"
                }
              ],
              orders: [
                {
                  id: "order-ma-volume-1-000001.SZ-2026-06-08T09:32:00.000+08:00-buy",
                  strategyId: "ma-volume",
                  symbol: "000001.SZ",
                  side: "buy",
                  quantity: 900,
                  requestedPrice: 10.34,
                  timestamp: "2026-06-08T09:32:00.000+08:00"
                }
              ],
              fills: [
                {
                  orderId: "order-ma-volume-1-000001.SZ-2026-06-08T09:32:00.000+08:00-buy",
                  symbol: "000001.SZ",
                  side: "buy",
                  quantity: 900,
                  price: 10.35,
                  commission: 5,
                  tax: 0,
                  timestamp: "2026-06-08T09:32:00.000+08:00"
                }
              ],
              portfolio: {
                cash: 90680,
                positions: [{ symbol: "000001.SZ", quantity: 900, averageCost: 10.35, marketPrice: 10.35 }],
                totalEquity: 99995,
                realizedPnl: 0,
                unrealizedPnl: 0
              }
            },
            portfolio: {
              cash: 90680,
              positions: [{ symbol: "000001.SZ", quantity: 900, averageCost: 10.35, marketPrice: 10.35 }],
              totalEquity: 99995,
              realizedPnl: 0,
              unrealizedPnl: 0
            },
            processedSignalIds: ["ma-volume-1-000001.SZ-2026-06-08T09:32:00.000+08:00-buy"]
          });
        }
        if (url.endsWith("/api/simulation/run")) {
          return json({ result: {}, report: { tradingWinRate: 0.5 } });
        }
        return json({});
      })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("loads monitoring and report data from the API", async () => {
    renderApp();

    await waitFor(() => expect(screen.getByText("100,245.20")).toBeInTheDocument());
    expect(screen.getByText("交易胜率：50.00%")).toBeInTheDocument();
    expect(screen.getByText("信号命中率：66.67%")).toBeInTheDocument();
  });

  it("shows the current virtual trading operation and recent audit details", async () => {
    renderApp();

    await waitFor(() => expect(screen.getByText("当前执行")).toBeInTheDocument());
    expect(screen.getByText("运行阶段：运行完成")).toBeInTheDocument();
    expect(screen.getByText("最新操作：虚拟成交")).toBeInTheDocument();
    expect(screen.getByText("买入/卖出成交：000001.SZ，100 股")).toBeInTheDocument();
    expect(screen.getByText("风控校验通过：within_exposure_limit")).toBeInTheDocument();
  });

  it("shows generated strategy signals and concrete virtual trades", async () => {
    renderApp();

    await waitFor(() => expect(screen.getByText("虚拟盘信号与交易明细")).toBeInTheDocument());
    expect(screen.getByText("1 信号")).toBeInTheDocument();
    expect(screen.getByText("1 委托")).toBeInTheDocument();
    expect(screen.getByText("1 成交")).toBeInTheDocument();
    expect(screen.getByText("信号原因：买入规则命中：收盘价高于 MA20 且成交量高于 20 日均量")).toBeInTheDocument();
    expect(screen.getByText("000001.SZ 买入 900 股")).toBeInTheDocument();
    expect(screen.getByText(/成交价：10.35/)).toBeInTheDocument();
    expect(screen.getByText("000001.SZ 900 股")).toBeInTheDocument();
  });

  it("shows real market data source and quality status", async () => {
    renderApp();

    await waitFor(() => expect(screen.getByText("数据源：eastmoney")).toBeInTheDocument());
    expect(screen.getByText("真实数据")).toBeInTheDocument();
    expect(screen.getByText("数据质量：正常")).toBeInTheDocument();
    expect(screen.getByText("日线/分钟：4/240")).toBeInTheDocument();
  });

  it("shows and can pause automatic virtual trading", async () => {
    renderApp(new Date("2026-06-08T10:00:00+08:00"));

    await waitFor(() => expect(screen.getByText("自动虚拟交易")).toBeInTheDocument());
    expect(screen.getByText("已启用")).toBeInTheDocument();
    expect(screen.getByText("自动运行次数：2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "暂停自动交易" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/auto-trading/config", expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false })
      }));
    });
  });

  it("shows the short-term intelligence center with action reasons and source status", async () => {
    renderApp();

    await waitFor(() => expect(screen.getByText("短线情报中枢")).toBeInTheDocument());
    expect(screen.getByText("操作建议：精选跟踪")).toBeInTheDocument();
    expect(screen.getAllByText("银行").length).toBeGreaterThan(0);
    expect(screen.getByText("行情来源：真实数据")).toBeInTheDocument();
    expect(screen.getByText("执行属性：虚拟盘模拟成交")).toBeInTheDocument();
    expect(screen.getByText("虚拟盘实时操作")).toBeInTheDocument();
    expect(screen.getByText("虚拟成交：000001.SZ 100 股")).toBeInTheDocument();
    expect(screen.getByText("监控中")).toBeInTheDocument();
    expect(screen.getAllByText("000001.SZ").length).toBeGreaterThan(0);
    expect(screen.getByText("龙虎榜：未配置")).toBeInTheDocument();
    expect(screen.getByText("新闻催化：未配置")).toBeInTheDocument();
    expect(screen.getByText("核心结论：当前建议为精选跟踪，重点跟踪 000001.SZ。")).toBeInTheDocument();
  });

  it("places short-term intelligence directly after the strategy module", async () => {
    renderApp();

    const strategy = await screen.findByText("策略：双均线成交量策略");
    const intelligence = await screen.findByText("短线情报中枢");
    const monitor = await screen.findByText("实时监控");

    expect(strategy.compareDocumentPosition(intelligence) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(intelligence.compareDocumentPosition(monitor) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows closed market status and after-market analysis outside trading hours", async () => {
    renderApp();

    await waitFor(() => expect(screen.getByText("市场状态：休盘时间")).toBeInTheDocument());
    expect(screen.getByText("当前时段：盘后休市")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成盘后复盘" })).toBeInTheDocument();
    expect(screen.getByText("盘后分析")).toBeInTheDocument();
    expect(screen.getByText("今日虚拟盘收益：0.25%")).toBeInTheDocument();
    expect(screen.getByText("复盘结论：策略今日达标")).toBeInTheDocument();
  });

  it("keeps the virtual trading label during trading hours", async () => {
    renderApp(new Date("2026-06-08T10:00:00+08:00"));

    await waitFor(() => expect(screen.getByText("市场状态：交易时间")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "运行虚拟盘" })).toBeInTheDocument();
  });

  it("starts continuous automatic virtual trading from the main button during market hours", async () => {
    renderApp(new Date("2026-06-08T10:00:00+08:00"));

    fireEvent.click(await screen.findByRole("button", { name: "运行虚拟盘" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/auto-trading/config", expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true })
      }));
    });
    expect(fetch).toHaveBeenCalledWith("/api/auto-trading/check", expect.objectContaining({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    }));
    expect(fetch).not.toHaveBeenCalledWith("/api/simulation/run", { method: "POST" });
    expect(screen.getByRole("status")).toHaveTextContent("自动虚拟盘已启动，将持续运行到休盘");
  });

  it("keeps refreshing while automatic virtual trading is enabled", async () => {
    vi.useFakeTimers();
    renderApp(new Date("2026-06-08T10:00:00+08:00"));

    await act(async () => {
      await flushPromises();
    });
    // Initial refresh calls multiple endpoints
    expect(fetch).toHaveBeenCalled();
    vi.mocked(fetch).mockClear();

    await act(async () => {
      vi.advanceTimersByTime(30000);
      await flushPromises();
    });

    // After timer, volatile data endpoints are called
    expect(fetch).toHaveBeenCalled();
  });

  it("calls the simulation endpoint when running virtual trading", async () => {
    renderApp();

    fireEvent.click(screen.getByRole("button", { name: "生成盘后复盘" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/simulation/run", expect.objectContaining({ method: "POST" }));
    });
  });

  it("shows visible feedback after virtual trading finishes", async () => {
    renderApp();

    fireEvent.click(screen.getByRole("button", { name: "生成盘后复盘" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("盘后复盘已生成，监控数据已刷新");
    });
  });

  it("shows high-conviction short-term buy signals with AI trading context", async () => {
    renderApp();

    await waitFor(() => expect(screen.getByText("短线信号中心")).toBeInTheDocument());
    expect(screen.getByText("AI 虚拟交易提示")).toBeInTheDocument();
    expect(screen.getAllByText("000001.SZ").length).toBeGreaterThan(0);
    expect(screen.getByText("特别值得关注")).toBeInTheDocument();
    expect(screen.getByText("建议仓位：10.00%")).toBeInTheDocument();
    expect(screen.getByText("购买依据")).toBeInTheDocument();
    expect(screen.getByText("放量 1.73 倍，短线资金活跃")).toBeInTheDocument();
    expect(screen.getByText("风险边界")).toBeInTheDocument();
  });

  it("marks a manual buy and starts sell monitoring", async () => {
    renderApp();

    fireEvent.click(await screen.findByRole("button", { name: "标记已买入" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/short-term/signals/short-buy-000001.SZ-2026-06-08T09%3A32%3A00.000%2B08%3A00/manual-buy",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quantity: 1000 })
        })
      );
    });
    expect(screen.getByText("已标记买入，开始监测卖出信号。")).toBeInTheDocument();
    expect(screen.getByText("000001.SZ 1000 股，成本 10.34")).toBeInTheDocument();
  });

  it("shows configurable virtual trading settings and clearly separated AI advice horizons", async () => {
    renderApp(new Date("2026-06-08T10:00:00+08:00"));

    await waitFor(() => expect(screen.getByText("虚拟交易配置")).toBeInTheDocument());
    expect(screen.getByText("市场：A股")).toBeInTheDocument();
    expect(screen.getByText("模式：虚拟交易 + AI建议")).toBeInTheDocument();
    expect(screen.getByText("真实接口：已预留，当前禁用")).toBeInTheDocument();
    expect(screen.getByText("日内短线主策略")).toBeInTheDocument();
    expect(screen.getByText("波段参考策略")).toBeInTheDocument();
    expect(screen.getByText("长线参考策略")).toBeInTheDocument();
    expect(screen.getByText("短线主策略：只做高置信度盘中机会")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("初始资金"), { target: { value: "200000" } });
    fireEvent.click(screen.getByRole("button", { name: "保存虚拟交易配置" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/virtual-trading/config", expect.objectContaining({ method: "POST" }));
    });
  });


  it("shows the judged stock list with screening evidence", async () => {
    renderApp(new Date("2026-06-08T10:00:00+08:00"));

    await waitFor(() => expect(screen.getByText("判断股票列表")).toBeInTheDocument());
    expect(screen.getByText("000001.SZ · 银行")).toBeInTheDocument();
    expect(screen.getByText("600000.SH · 银行")).toBeInTheDocument();
    expect(screen.getByText("重点关注")).toBeInTheDocument();
    expect(screen.getByText("观察等待")).toBeInTheDocument();
    expect(screen.getByText("趋势：站上MA20且近5日延续")).toBeInTheDocument();
    expect(screen.getByText("成交量：放量1.73倍")).toBeInTheDocument();
    expect(screen.getByText("风险：RSI偏弱")).toBeInTheDocument();
  });


  it("shows actionable trade plan for evaluated stocks", async () => {
    renderApp(new Date("2026-06-08T10:00:00+08:00"));

    await waitFor(() => expect(screen.getByText("交易计划")).toBeInTheDocument());
    expect(screen.getByText("入场区间：10.24 - 10.42")).toBeInTheDocument();
    expect(screen.getByText("止损：9.82")).toBeInTheDocument();
    expect(screen.getByText("止盈：11.22")).toBeInTheDocument();
    expect(screen.getByText("盈亏比：2.10")).toBeInTheDocument();
    expect(screen.getByText("入场：回踩区间内企稳")).toBeInTheDocument();
    expect(screen.getByText("止盈：接近11.22分批止盈")).toBeInTheDocument();
  });


  it("shows and saves AI API connection settings", async () => {
    renderApp(new Date("2026-06-08T10:00:00+08:00"));

    await waitFor(() => expect(screen.getByText("AI API 接入配置")).toBeInTheDocument());
    expect(screen.getByText("状态：未启用，当前使用规则引擎兜底")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("启用此配置"));
    fireEvent.change(screen.getByLabelText("Base URL"), { target: { value: "https://api.example.com/v1" } });
    fireEvent.change(screen.getByLabelText("模型"), { target: { value: "gpt-4o-mini" } });
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "sk-live-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "保存 AI API 配置" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/ai/config", expect.objectContaining({ method: "POST" }));
    });
    expect(screen.getByText("AI API 配置已保存，密钥仅后端保存并脱敏显示。")).toBeInTheDocument();
  });


  it("lets the user enter a stock symbol and shows a full indicator analysis", async () => {
    renderApp(new Date("2026-06-08T10:00:00+08:00"));

    await waitFor(() => expect(screen.getByText("单股综合分析")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("股票名称或代码"), { target: { value: "000001.SZ" } });
    fireEvent.click(screen.getByRole("button", { name: "分析股票" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/stock-analysis?query=000001.SZ", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    });
    expect(screen.getByText("000001.SZ · 平安银行")).toBeInTheDocument();
    expect(screen.getAllByText("重点关注").length).toBeGreaterThan(0);
    expect(screen.getByText("MA20趋势")).toBeInTheDocument();
    expect(screen.getByText("VWAP盘中承接")).toBeInTheDocument();
    expect(screen.getByText("RSI14动量")).toBeInTheDocument();
    expect(screen.getByText("ATR14波动")).toBeInTheDocument();
    expect(screen.getByText("成交量")).toBeInTheDocument();
    expect(screen.getByText("Ping An Bank fixture news")).toBeInTheDocument();
    expect(screen.getAllByText("入场：回踩区间内企稳").length).toBeGreaterThan(0);
    expect(screen.getByText("仅用于虚拟交易和研究，不构成投资建议。")).toBeInTheDocument();
  });

});

function renderApp(now = new Date("2026-06-08T21:13:30+08:00")) {
  return render(<App now={now} />);
}

async function flushPromises() {
  for (let index = 0; index < 50; index++) {
    await Promise.resolve();
  }
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
