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
    expect(screen.getByText("000001.SZ")).toBeInTheDocument();
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
