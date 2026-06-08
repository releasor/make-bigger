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
});
