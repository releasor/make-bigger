import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

describe("App API integration", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
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
            auditEvents: 3
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
        if (url.endsWith("/api/audit")) {
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
            ]
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

  it("shows real market data source and quality status", async () => {
    renderApp();

    await waitFor(() => expect(screen.getByText("数据源：eastmoney")).toBeInTheDocument());
    expect(screen.getByText("真实数据")).toBeInTheDocument();
    expect(screen.getByText("数据质量：正常")).toBeInTheDocument();
    expect(screen.getByText("日线/分钟：4/240")).toBeInTheDocument();
  });

  it("shows the short-term intelligence center with action reasons and source status", async () => {
    renderApp();

    await waitFor(() => expect(screen.getByText("短线情报中枢")).toBeInTheDocument());
    expect(screen.getByText("操作建议：精选跟踪")).toBeInTheDocument();
    expect(screen.getAllByText("银行").length).toBeGreaterThan(0);
    expect(screen.getAllByText("000001.SZ").length).toBeGreaterThan(0);
    expect(screen.getByText("龙虎榜：未配置")).toBeInTheDocument();
    expect(screen.getByText("新闻催化：未配置")).toBeInTheDocument();
    expect(screen.getByText("核心结论：当前建议为精选跟踪，重点跟踪 000001.SZ。")).toBeInTheDocument();
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

  it("calls the simulation endpoint when running virtual trading", async () => {
    renderApp();

    fireEvent.click(screen.getByRole("button", { name: "生成盘后复盘" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/simulation/run", { method: "POST" });
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
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quantity: 1000 })
        }
      );
    });
    expect(screen.getByText("已标记买入，开始监测卖出信号。")).toBeInTheDocument();
    expect(screen.getByText("000001.SZ 1000 股，成本 10.34")).toBeInTheDocument();
  });
});

function renderApp(now = new Date("2026-06-08T21:13:30+08:00")) {
  return render(<App now={now} />);
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
