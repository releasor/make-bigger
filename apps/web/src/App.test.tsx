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
    render(<App />);

    await waitFor(() => expect(screen.getByText("100,245.20")).toBeInTheDocument());
    expect(screen.getByText("交易胜率：50.00%")).toBeInTheDocument();
    expect(screen.getByText("信号命中率：66.67%")).toBeInTheDocument();
  });

  it("shows the current virtual trading operation and recent audit details", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText("当前执行")).toBeInTheDocument());
    expect(screen.getByText("运行阶段：运行完成")).toBeInTheDocument();
    expect(screen.getByText("最新操作：虚拟成交")).toBeInTheDocument();
    expect(screen.getByText("买入/卖出成交：000001.SZ，100 股")).toBeInTheDocument();
    expect(screen.getByText("风控校验通过：within_exposure_limit")).toBeInTheDocument();
  });

  it("calls the simulation endpoint when running virtual trading", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "运行虚拟盘" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/simulation/run", { method: "POST" });
    });
  });

  it("shows visible feedback after virtual trading finishes", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "运行虚拟盘" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("虚拟盘已完成，监控数据已刷新");
    });
  });
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
