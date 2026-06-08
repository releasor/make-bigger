import type { MarketBar, RuleCondition, Signal, StrategyDefinition } from "@itrade/domain";

export function evaluateSignals(strategy: StrategyDefinition, bars: MarketBar[]): Signal[] {
  const signals: Signal[] = [];

  for (const bar of bars) {
    if (!strategy.universe.includes(bar.symbol)) continue;

    const entryPass = strategy.rules.entry.every((rule) => evaluateRule(rule, bar));
    if (entryPass) {
      signals.push(createSignal(strategy, bar, "buy", "entry rules matched"));
      continue;
    }

    const exitPass = strategy.rules.exit.some((rule) => evaluateRule(rule, bar));
    if (exitPass) {
      signals.push(createSignal(strategy, bar, "sell", "exit rules matched"));
    }
  }

  return signals;
}

function createSignal(
  strategy: StrategyDefinition,
  bar: MarketBar,
  side: "buy" | "sell",
  reason: string
): Signal {
  return {
    id: `${strategy.id}-${strategy.version}-${bar.symbol}-${bar.timestamp}-${side}`,
    strategyId: strategy.id,
    strategyVersion: strategy.version,
    symbol: bar.symbol,
    side,
    timestamp: bar.timestamp,
    confidence: 1,
    reason
  };
}

function evaluateRule(rule: RuleCondition, bar: MarketBar): boolean {
  const left = readValue(rule.left, bar);
  const right = rule.right.kind === "number" ? Number(rule.right.value) : readValue(String(rule.right.value), bar);

  switch (rule.operator) {
    case "gt":
      return left > right;
    case "gte":
      return left >= right;
    case "lt":
      return left < right;
    case "lte":
      return left <= right;
    case "eq":
      return left === right;
  }
}

function readValue(name: string, bar: MarketBar): number {
  if (name === "open") return bar.open;
  if (name === "high") return bar.high;
  if (name === "low") return bar.low;
  if (name === "close") return bar.close;
  if (name === "volume") return bar.volume;

  const value = bar.fields[name];
  if (typeof value !== "number") {
    throw new Error(`Market field ${name} is missing for ${bar.symbol} ${bar.timestamp}`);
  }
  return value;
}
