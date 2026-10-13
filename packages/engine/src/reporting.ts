import type { Fill, Signal } from "@itrade/domain";
import { round4 } from "./utils";

export interface ReportTarget {
  minReturnPct: number;
  maxDrawdownPct: number;
}

export interface BuildDailyReportInput {
  date: string;
  startingEquity: number;
  endingEquity: number;
  maxDrawdownPct: number;
  fills: Fill[];
  signals: Signal[];
  hitSignalIds: string[];
  target: ReportTarget;
}

export interface DailyReport {
  date: string;
  tradingWinRate: number;
  signalHitRate: number;
  strategyTargetAchieved: boolean;
  dailyReturnPct: number;
  maxDrawdownPct: number;
  tradeCount: number;
  signalCount: number;
}

export function buildDailyReport(input: BuildDailyReportInput): DailyReport {
  const closedTradePnls = pairClosedTradePnls(input.fills);
  const winningTrades = closedTradePnls.filter((pnl) => pnl > 0).length;
  const tradingWinRate = closedTradePnls.length === 0 ? 0 : winningTrades / closedTradePnls.length;
  const signalHitRate = input.signals.length === 0 ? 0 : input.hitSignalIds.length / input.signals.length;
  const dailyReturnPct = input.startingEquity === 0
    ? 0
    : (input.endingEquity - input.startingEquity) / input.startingEquity;

  return {
    date: input.date,
    tradingWinRate: round4(tradingWinRate),
    signalHitRate: round4(signalHitRate),
    strategyTargetAchieved:
      dailyReturnPct >= input.target.minReturnPct && input.maxDrawdownPct <= input.target.maxDrawdownPct,
    dailyReturnPct: round4(dailyReturnPct),
    maxDrawdownPct: round4(input.maxDrawdownPct),
    tradeCount: closedTradePnls.length,
    signalCount: input.signals.length
  };
}

function pairClosedTradePnls(fills: Fill[]): number[] {
  const buyQueue: { fill: Fill; remaining: number }[] = [];
  const pnls: number[] = [];

  for (const fill of fills) {
    if (fill.side === "buy") {
      buyQueue.push({ fill, remaining: fill.quantity });
      continue;
    }

    let sellRemaining = fill.quantity;
    while (sellRemaining > 0 && buyQueue.length > 0) {
      const buy = buyQueue[0]!;
      const matched = Math.min(sellRemaining, buy.remaining);
      const gross = (fill.price - buy.fill.price) * matched;
      const buyCostRatio = matched / buy.fill.quantity;
      const sellCostRatio = matched / fill.quantity;
      const costs = (buy.fill.commission + buy.fill.tax) * buyCostRatio + (fill.commission + fill.tax) * sellCostRatio;
      pnls.push(gross - costs);
      buy.remaining -= matched;
      sellRemaining -= matched;
      if (buy.remaining <= 0) buyQueue.shift();
    }
  }

  return pnls;
}
