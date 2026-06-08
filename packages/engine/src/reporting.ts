import type { Fill, Signal } from "@itrade/domain";

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
  const dailyReturnPct = (input.endingEquity - input.startingEquity) / input.startingEquity;

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
  const buys: Fill[] = [];
  const pnls: number[] = [];

  for (const fill of fills) {
    if (fill.side === "buy") {
      buys.push(fill);
      continue;
    }

    const buy = buys.shift();
    if (!buy) continue;

    const gross = (fill.price - buy.price) * Math.min(fill.quantity, buy.quantity);
    const costs = buy.commission + buy.tax + fill.commission + fill.tax;
    pnls.push(gross - costs);
  }

  return pnls;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
