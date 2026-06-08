import { describe, expect, it } from "vitest";
import { buildServer } from "./server";

describe("api server", () => {
  it("returns monitoring state after running a virtual session", async () => {
    const server = buildServer();

    const run = await server.inject({ method: "POST", url: "/api/simulation/run" });
    expect(run.statusCode).toBe(200);

    const monitoring = await server.inject({ method: "GET", url: "/api/monitoring" });
    const body = monitoring.json();

    expect(monitoring.statusCode).toBe(200);
    expect(body.status).toBe("running");
    expect(body.signals).toBeGreaterThan(0);
    expect(body.auditEvents).toBeGreaterThan(0);
  });

  it("hot updates strategy parameters and records an audit event", async () => {
    const server = buildServer();

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
    const server = buildServer();

    const response = await server.inject({ method: "GET", url: "/api/short-term/signals" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.signals).toHaveLength(1);
    expect(body.signals[0]).toMatchObject({
      symbol: "000001.SZ",
      side: "buy",
      recommendation: "特别值得关注",
      suggestedPositionPct: 0.1
    });
    expect(body.signals[0].confidenceScore).toBeGreaterThanOrEqual(85);
    expect(body.signals[0].basis.join(" ")).toContain("放量");
    expect(body.signals[0].riskNotes.join(" ")).toContain("止损");
  });

  it("marks a manual buy and starts sell-signal monitoring", async () => {
    const server = buildServer();

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
});
