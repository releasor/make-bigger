import type { ManualPosition, MarketBar, SellSignalAlert, ShortTermBuySignal } from "@itrade/domain";

interface ShortTermSignalOptions {
  minConfidenceScore?: number;
  suggestedPositionPct?: number;
  stopLossPct?: number;
}

export function findShortTermBuySignals(
  bars: MarketBar[],
  options: ShortTermSignalOptions = {}
): ShortTermBuySignal[] {
  const minConfidenceScore = options.minConfidenceScore ?? 85;
  const suggestedPositionPct = options.suggestedPositionPct ?? 0.1;
  const stopLossPct = options.stopLossPct ?? 0.08;

  const signals = bars
    .map((bar) => buildBuySignal(bar, suggestedPositionPct, stopLossPct))
    .filter((signal): signal is ShortTermBuySignal => Boolean(signal && signal.confidenceScore >= minConfidenceScore));

  return latestBuySignalPerSymbol(signals);
}

export function createManualPositionFromSignal(signal: ShortTermBuySignal, quantity = 1000): ManualPosition {
  return {
    id: `manual-${signal.id}`,
    signalId: signal.id,
    symbol: signal.symbol,
    quantity,
    entryPrice: signal.currentPrice,
    stopLossPrice: signal.stopLossPrice,
    entryTimestamp: signal.timestamp,
    status: "monitoring"
  };
}

export function monitorSellSignals(positions: ManualPosition[], bars: MarketBar[]): SellSignalAlert[] {
  const alerts: SellSignalAlert[] = [];

  for (const position of positions.filter((item) => item.status === "monitoring")) {
    const bar = latestBarForSymbol(bars, position.symbol);
    if (!bar) continue;

    const rsi14 = bar.fields.rsi14;
    const ma20 = bar.fields.ma20;
    const basis: string[] = [];
    let reason = "";
    let action: SellSignalAlert["action"] = "减仓观察";
    let triggerPrice = bar.close;

    if (bar.close <= position.stopLossPrice) {
      reason = "跌破止损价";
      action = "清仓观察";
      triggerPrice = position.stopLossPrice;
      basis.push(`现价 ${bar.close.toFixed(2)} <= 止损价 ${position.stopLossPrice.toFixed(2)}`);
    } else if (typeof rsi14 === "number" && rsi14 < 35) {
      reason = "RSI 转弱";
      basis.push(`RSI14 ${rsi14.toFixed(0)} < 35`);
    } else if (typeof ma20 === "number" && bar.close < ma20) {
      reason = "跌破 MA20";
      triggerPrice = ma20;
      basis.push(`收盘价 ${bar.close.toFixed(2)} < MA20 ${ma20.toFixed(2)}`);
    }

    if (!reason) continue;

    alerts.push({
      id: `sell-${position.id}-${bar.timestamp}`,
      positionId: position.id,
      symbol: position.symbol,
      timestamp: bar.timestamp,
      currentPrice: bar.close,
      triggerPrice,
      reason,
      action,
      basis
    });
  }

  return alerts;
}

function buildBuySignal(
  bar: MarketBar,
  suggestedPositionPct: number,
  stopLossPct: number
): ShortTermBuySignal | null {
  const ma20 = bar.fields.ma20;
  const avgVolume20 = bar.fields.avgVolume20;
  const rsi14 = bar.fields.rsi14;
  if (typeof ma20 !== "number" || typeof avgVolume20 !== "number" || typeof rsi14 !== "number") return null;

  const basis: string[] = [];
  const riskNotes: string[] = [];
  let score = 0;

  if (bar.close > ma20) {
    score += 35;
    basis.push(`收盘价 ${bar.close.toFixed(2)} 突破 MA20 ${ma20.toFixed(2)}`);
  }

  const volumeRatio = avgVolume20 > 0 ? bar.volume / avgVolume20 : 0;
  if (volumeRatio >= 1.5) {
    score += 30;
    basis.push(`放量 ${volumeRatio.toFixed(2)} 倍，短线资金活跃`);
  }

  const intradayChangePct = bar.open > 0 ? (bar.close - bar.open) / bar.open : 0;
  if (intradayChangePct >= 0.015) {
    score += 15;
    basis.push(`日内上涨 ${(intradayChangePct * 100).toFixed(2)}%，动能增强`);
  }

  if (rsi14 >= 35 && rsi14 <= 65) {
    score += 15;
    basis.push(`RSI14 ${rsi14.toFixed(0)}，未进入过热区`);
  }

  if (bar.close >= bar.high * 0.98) {
    score += 5;
    basis.push("价格接近当周期高位，突破延续性较强");
  }

  const stopLossPrice = round2(bar.close * (1 - stopLossPct));
  riskNotes.push(`跌破 ${stopLossPrice.toFixed(2)} 触发止损观察`);
  if (rsi14 > 70) riskNotes.push("RSI 过热，追高风险增加");
  if (volumeRatio < 1.5) riskNotes.push("量能不足，突破可信度下降");

  return {
    id: `short-buy-${bar.symbol}-${bar.timestamp}`,
    symbol: bar.symbol,
    side: "buy",
    timestamp: bar.timestamp,
    currentPrice: bar.close,
    confidenceScore: Math.min(score, 100),
    recommendation: "特别值得关注",
    suggestedPositionPct,
    stopLossPct,
    stopLossPrice,
    basis,
    riskNotes
  };
}

function latestBarForSymbol(bars: MarketBar[], symbol: string): MarketBar | undefined {
  return bars
    .filter((bar) => bar.symbol === symbol)
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))[0];
}

function latestBuySignalPerSymbol(signals: ShortTermBuySignal[]): ShortTermBuySignal[] {
  const latestBySymbol = new Map<string, ShortTermBuySignal>();

  for (const signal of signals) {
    const existing = latestBySymbol.get(signal.symbol);
    if (!existing || signal.timestamp > existing.timestamp) {
      latestBySymbol.set(signal.symbol, signal);
    }
  }

  return [...latestBySymbol.values()].sort((left, right) => right.confidenceScore - left.confidenceScore);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
