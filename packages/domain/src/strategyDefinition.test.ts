import { describe, expect, it } from "vitest";
import { createStrategyVersion, validateStrategyDefinition } from "./index";

describe("strategy definitions", () => {
  it("accepts a valid structured-rule strategy", () => {
    const strategy = createStrategyVersion({
      id: "ma-volume",
      name: "双均线成交量策略",
      universe: ["000001.SZ", "600000.SH"],
      version: 1,
      parameters: {
        maxPositionPct: 0.1,
        stopLossPct: 0.08,
        buyThreshold: 1
      }
    });

    const result = validateStrategyDefinition(strategy);

    expect(result.ok).toBe(true);
    expect(strategy.status).toBe("draft");
    expect(strategy.rules.entry[0]?.left).toBe("close");
  });

  it("rejects position sizes above 100 percent", () => {
    const strategy = createStrategyVersion({
      id: "bad-risk",
      name: "错误风控策略",
      universe: ["000001.SZ"],
      version: 1,
      parameters: {
        maxPositionPct: 1.5,
        stopLossPct: 0.08,
        buyThreshold: 1
      }
    });

    const result = validateStrategyDefinition(strategy);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("parameters.maxPositionPct must be between 0 and 1");
  });
});
