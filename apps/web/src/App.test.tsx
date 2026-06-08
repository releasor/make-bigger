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

  it("calls the simulation endpoint when running virtual trading", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "运行虚拟盘" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/simulation/run", { method: "POST" });
    });
  });
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
