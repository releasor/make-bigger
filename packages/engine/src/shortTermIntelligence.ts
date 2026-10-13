import type {
  ExternalIntelItem,
  ExternalIntelSource,
  ExternalIntelStatus,
  MarketBar,
  MarketSentimentSnapshot,
  RiskSignal,
  SectorRotationItem,
  ShortTermActionPlan,
  ShortTermIntelligenceReport,
  StrongStockCandidate
} from "@itrade/domain";
import type { MarketDataSnapshot } from "./realMarketData";
import { average, clampScore, formatPct, formatPrice, numberField, round2 } from "./utils";

export interface BuildShortTermIntelligenceOptions {
  snapshot: MarketDataSnapshot;
  sectorMap?: Record<string, string>;
  externalIntelItems?: ExternalIntelItem[];
  externalIntelStatuses?: ExternalIntelStatus[];
  now?: string;
}

interface SymbolContext {
  symbol: string;
  sector: string;
  latestDaily: MarketBar;
  previousDaily: MarketBar | undefined;
  latestLive: MarketBar;
  dailyChangePct: number;
  fiveDayChangePct: number;
  volumeRatio: number;
  latestMinuteVolumeRatio: number;
  intradayDrawdownFromHighPct: number;
  upperWickPct: number;
  closePositionInRange: number;
  vwap: number;
  atr14: number;
  rsi14: number;
  atrPct: number;
  aboveVwapPct: number;
  openingRangeHigh: number;
  openingRangeLow: number;
  brokeOpeningRange: boolean;
  vwapRetestConfirmed: boolean;
  turnoverRate: number;
  hasPriorBreakout: boolean;
  macdHist: number;
  previousMacdHist: number;
  bbUpper: number;
  bbLower: number;
  bbMiddle: number;
  bbBandwidthPct: number;
  bbSqueeze: boolean;
  bbBreakout: boolean;
  kdjK: number;
  kdjD: number;
  kdjJ: number;
  kdjPrevK: number;
  kdjPrevD: number;
};

const defaultIntelStatuses: ExternalIntelStatus[] = [
  {
    source: "dragon_tiger",
    label: "龙虎榜",
    status: "not_configured",
    provider: "official-exchange-provider",
    message: "龙虎榜真实来源尚未配置，本次不生成席位结论。",
    itemCount: 0
  },
  {
    source: "news",
    label: "新闻催化",
    status: "not_configured",
    provider: "verified-news-provider",
    message: "新闻真实来源尚未配置，本次不编造新闻催化。",
    itemCount: 0
  },
  {
    source: "theme",
    label: "主线题材",
    status: "not_configured",
    provider: "theme-rotation-provider",
    message: "题材真实来源尚未配置，本次仅按 K 线和板块映射判断。",
    itemCount: 0
  },
  {
    source: "announcement",
    label: "公告",
    status: "not_configured",
    provider: "exchange-announcement-provider",
    message: "公告真实来源尚未配置，本次不生成公告驱动结论。",
    itemCount: 0
  }
];

export function buildShortTermIntelligenceReport(
  options: BuildShortTermIntelligenceOptions
): ShortTermIntelligenceReport {
  const contexts = buildSymbolContexts(options.snapshot, options.sectorMap ?? {});
  const watchlist = contexts.map(toStrongCandidate).sort((left, right) => right.totalScore - left.totalScore);
  const sentiment = buildSentiment(contexts, watchlist);
  const sectorRotation = buildSectorRotation(contexts, watchlist);
  const riskSignals = buildRiskSignals(contexts, sentiment);
  const externalIntelItems = options.externalIntelItems ?? [];
  const externalIntelStatuses = mergeExternalIntelStatuses(options.externalIntelStatuses, externalIntelItems);
  const actionPlan = buildActionPlan(sentiment, watchlist, riskSignals);
  const reasons = buildReasons(sentiment, sectorRotation, watchlist, riskSignals, externalIntelStatuses);

  return {
    title: "短线情报与决策中枢",
    generatedAt: options.now ?? new Date().toISOString(),
    outlook: buildOutlook(sentiment, sectorRotation, watchlist),
    actionPlan,
    sentiment,
    sectorRotation,
    watchlist: watchlist.slice(0, 6),
    nearAbnormal: watchlist.filter((item) => item.labels.includes("接近异动")).slice(0, 6),
    riskSignals,
    externalIntelStatuses,
    externalIntelItems,
    conclusion: buildConclusion(actionPlan, watchlist, riskSignals),
    reasons
  };
}

function buildSymbolContexts(snapshot: MarketDataSnapshot, sectorMap: Record<string, string>): SymbolContext[] {
  const dailyBySymbol = groupBars(snapshot.daily);
  const minuteBySymbol = groupBars(snapshot.minute);
  const contexts: SymbolContext[] = [];

  for (const [symbol, dailyBars] of dailyBySymbol) {
    const sortedDaily = sortBars(dailyBars);
    const latestDaily = sortedDaily.at(-1);
    if (!latestDaily) continue;

    const previousDaily = sortedDaily.at(-2);
    const liveBars = sortBars(minuteBySymbol.get(symbol) ?? []);
    const latestLive = liveBars.at(-1) ?? latestDaily;
    const ma20 = numberField(latestDaily.fields, "ma20");
    const avgVolume20 = numberField(latestDaily.fields, "avgVolume20");
    const firstFiveDay = sortedDaily.slice(-5)[0] ?? previousDaily ?? latestDaily;

    const rsi14 = numberField(latestDaily.fields, "rsi14");
    const vwap = numberField(latestLive.fields, "vwap") || numberField(latestDaily.fields, "vwap");
    const atr14 = numberField(latestDaily.fields, "atr14");
    const atrPct = atr14 > 0 ? atr14 / latestDaily.close : 0;
    const latestMinuteAvgVolume = numberField(latestLive.fields, "avgVolume20");
    const latestMinuteVolumeRatio = latestMinuteAvgVolume > 0 ? latestLive.volume / latestMinuteAvgVolume : 0;
    const intradayDrawdownFromHighPct = latestDaily.high > 0 ? (latestDaily.high - latestLive.close) / latestDaily.high : 0;
    const dailyRange = latestDaily.high - latestDaily.low;
    const upperWickPct = dailyRange > 0 ? (latestDaily.high - Math.max(latestDaily.open, latestDaily.close)) / dailyRange : 0;
    const closePositionInRange = dailyRange > 0 ? (latestLive.close - latestDaily.low) / dailyRange : 1;

    const openingRange = buildOpeningRange(liveBars);
    const brokeOpeningRange = openingRange.high > 0 && latestLive.close > openingRange.high;
    const vwapRetestConfirmed = vwap > 0 && hasVwapRetestConfirmation(liveBars, vwap, latestLive.close);

    const priorDailyBars = sortedDaily.slice(0, -1);
    const hasPriorBreakout = priorDailyBars.some((bar) => {
      const barAvgVol = numberField(bar.fields, "avgVolume20");
      const barPrev = sortedDaily[sortedDaily.indexOf(bar) - 1];
      const barChangePct = barPrev ? pct(bar.close, barPrev.close) : pct(bar.close, bar.open);
      return barAvgVol > 0 && bar.volume / barAvgVol >= 1.5 && barChangePct >= 0.03;
    });

    // Bollinger Bands: 20-period SMA ± 2 * stdDev from recent daily closes
    const bbPeriod = 20;
    const bbCloses = sortedDaily.slice(-bbPeriod).map((bar) => bar.close);
    const bbMiddle = bbCloses.length >= bbPeriod ? average(bbCloses) : 0;
    const bbStdDev = bbCloses.length >= bbPeriod
      ? Math.sqrt(bbCloses.reduce((sum, c) => sum + (c - bbMiddle) ** 2, 0) / bbCloses.length)
      : 0;
    const bbUpper = bbMiddle + 2 * bbStdDev;
    const bbLower = bbMiddle - 2 * bbStdDev;
    const bbBandwidthPct = bbMiddle > 0 ? ((bbUpper - bbLower) / bbMiddle) * 100 : 0;
    const bbSqueeze = bbBandwidthPct > 0 && bbBandwidthPct < 10;
    const currentVolumeRatio = avgVolume20 > 0 ? latestDaily.volume / avgVolume20 : 0;
    const bbBreakout = bbSqueeze && latestDaily.close > bbUpper && currentVolumeRatio >= 1.5;

    // KDJ(9,3,3): stochastic oscillator with J signal line
    const kdjPeriod = 9;
    const kdjBars = sortedDaily.slice(-kdjPeriod);
    const kdjResult = computeKdj(kdjBars, sortedDaily);

    contexts.push({
      symbol,
      sector: sectorMap[symbol] ?? inferSector(symbol),
      latestDaily,
      previousDaily,
      latestLive,
      dailyChangePct: previousDaily ? pct(latestDaily.close, previousDaily.close) : pct(latestDaily.close, latestDaily.open),
      fiveDayChangePct: pct(latestDaily.close, firstFiveDay.close),
      volumeRatio: avgVolume20 > 0 ? latestDaily.volume / avgVolume20 : 0,
      latestMinuteVolumeRatio,
      intradayDrawdownFromHighPct,
      upperWickPct,
      closePositionInRange,
      vwap,
      atr14,
      rsi14,
      atrPct,
      aboveVwapPct: vwap > 0 ? pct(latestLive.close, vwap) : 0,
      openingRangeHigh: openingRange.high,
      openingRangeLow: openingRange.low,
      brokeOpeningRange,
      vwapRetestConfirmed,
      turnoverRate: numberField(latestDaily.fields, "turnoverRate"),
      hasPriorBreakout,
      macdHist: numberField(latestDaily.fields, "macdHist"),
      previousMacdHist: previousDaily ? numberField(previousDaily.fields, "macdHist") : 0,
      bbUpper,
      bbLower,
      bbMiddle,
      bbBandwidthPct,
      bbSqueeze,
      bbBreakout,
      kdjK: kdjResult.k,
      kdjD: kdjResult.d,
      kdjJ: kdjResult.j,
      kdjPrevK: kdjResult.prevK,
      kdjPrevD: kdjResult.prevD
    });

    if (ma20 <= 0) {
      latestDaily.fields = { ...latestDaily.fields, ma20: latestDaily.close };
    }
  }

  return contexts;
}

// ── Scoring constants ──
const TREND = {
  MA20_ABOVE: 35,
  FIVE_DAY_POSITIVE: 20,
  CLOSE_NEAR_HIGH: 10,
  VWAP_STRONG: 12,
  VWAP_MODERATE: 8,
  VWAP_WEAK: -8,
  VWAP_BREAKOUT_RISK: -45,
  RSI_HEALTHY: 8,
  RSI_OVERBOUGHT: -12,
  RSI_WEAK: -8,
  MACD_EXPANDING: 10,
  MACD_SHRINKING: -4,
  MACD_CONVERGING: 4,
  MACD_EXPANDING_BEAR: -8,
  KDJ_GOLDEN_OVERSOLD: 12,
  KDJ_GOLDEN_NEUTRAL: 8,
  KDJ_GOLDEN_HIGH: 4,
  KDJ_DEATH_OVERBOUGHT: -12,
  KDJ_DEATH_HIGH: -6,
  KDJ_DEATH_LOW: -3,
  BB_BREAKOUT: 15,
  PRIOR_BREAKOUT_PULLBACK: 12,
  OPENING_RANGE_BREAKOUT: 10,
  VWAP_RETEST_CONFIRMED: 10,
  VWAP_RETEST_FAILED: -45,
  TAIL_SESSION: 8
} as const;

const VOLUME = {
  STRONG: 30,
  MODERATE: 22,
  LIGHT: 14,
  TURNOVER_ACTIVE_HIGH: 8,
  TURNOVER_ACTIVE_LOW: 5,
  BB_BREAKOUT: 8,
  PRIOR_BREAKOUT_PULLBACK: 5
} as const;

const ABNORMAL = {
  CLOSE_NEAR_HIGH: 10,
  VWAP_BREAKOUT_RISK: -25,
  ATR_HIGH: -8,
  TURNOVER_HIGH: -8,
  KDJ_OVERSOLD: 6,
  KDJ_OVERBOUGHT: 5,
  OPENING_RANGE_BREAKOUT: 8,
  VWAP_RETEST_FAILED: -30,
  DAILY_CHANGE_STRONG: 25,
  DAILY_CHANGE_MODERATE: 12,
  TAIL_SESSION: 8,
  TAIL_REVERSAL: -10,
  VOLUME_PRICE_DIVERGENCE: -15
} as const;

const THRESHOLD = {
  CLOSE_TO_HIGH: 0.98,
  VOLUME_STRONG: 1.5,
  VOLUME_VERY_STRONG: 2,
  VOLUME_LIGHT: 1.2,
  VWAP_SIGNIFICANT: 0.01,
  VWAP_BREAKOUT: 0.06,
  RSI_HEALTHY_LOW: 50,
  RSI_HEALTHY_HIGH: 70,
  RSI_OVERBOUGHT: 75,
  RSI_WEAK: 45,
  RSI_PULLBACK_LOW: 40,
  RSI_PULLBACK_HIGH: 70,
  ATR_MODERATE: 0.06,
  TURNOVER_LOW: 0.03,
  TURNOVER_HIGH: 0.05,
  TURNOVER_MAX: 0.10,
  TURNOVER_EXCESSIVE: 0.15,
  KDJ_OVERSOLD: 20,
  KDJ_NEUTRAL: 50,
  KDJ_OVERBOUGHT: 80,
  KDJ_EXTREME_HIGH: 100,
  KDJ_EXTREME_LOW: 0,
  BB_SQUEEZE: 10,
  PULLBACK_VOLUME: 0.85,
  MINUTE_VOLUME_RETEST: 1.15,
  DAILY_CHANGE_STRONG: 0.07,
  DAILY_CHANGE_MODERATE: 0.04,
  INTRADAY_CHANGE_STRONG: 0.05,
  NEAR_LIMIT_UP: 0.085,
  TAIL_CLOSE_NEAR_HIGH: 0.985,
  TAIL_VOLUME: 1.2,
  TAIL_REVERSAL_CLOSE: 0.97,
  VOLUME_PRICE_DIVERGENCE: 2.5
} as const;

interface ScorerResult {
  trendScore: number;
  volumeScore: number;
  abnormalScore: number;
  labels: string[];
  basis: string[];
  riskNotes: string[];
}

function scoreTrend(context: SymbolContext, ma20: number): ScorerResult {
  let trendScore = 0;
  const labels: string[] = [];
  const basis: string[] = [];
  const riskNotes: string[] = [];

  if (context.latestDaily.close > ma20) {
    trendScore += TREND.MA20_ABOVE;
    labels.push("趋势突破");
    basis.push(`现价 ${formatPrice(context.latestDaily.close)} 高于 MA20 ${formatPrice(ma20)}`);
  }

  if (context.fiveDayChangePct > 0) {
    trendScore += TREND.FIVE_DAY_POSITIVE;
    basis.push(`近 5 日涨幅 ${formatPct(context.fiveDayChangePct)}，短线趋势延续`);
  }

  if (context.latestDaily.close >= context.latestDaily.high * THRESHOLD.CLOSE_TO_HIGH) {
    trendScore += TREND.CLOSE_NEAR_HIGH;
    basis.push("收盘接近当日高点，资金承接较强");
  }

  if (context.vwap > 0 && context.latestLive.close > context.vwap) {
    trendScore += context.aboveVwapPct >= THRESHOLD.VWAP_SIGNIFICANT ? TREND.VWAP_STRONG : TREND.VWAP_MODERATE;
    labels.push("VWAP强势");
    basis.push(`现价 ${formatPrice(context.latestLive.close)} 高于 VWAP ${formatPrice(context.vwap)}，盘中承接偏强`);
    if (context.brokeOpeningRange && context.aboveVwapPct >= THRESHOLD.VWAP_BREAKOUT && !context.vwapRetestConfirmed) {
      trendScore += TREND.VWAP_BREAKOUT_RISK;
      labels.push("突破追高风险");
      riskNotes.push(`开盘区间突破后价格偏离VWAP ${formatPct(context.aboveVwapPct)}，尚无回踩确认，避免追高假突破`);
    }
  } else if (context.vwap > 0) {
    trendScore += TREND.VWAP_WEAK;
    riskNotes.push(`现价低于 VWAP ${formatPrice(context.vwap)}，盘中资金承接不足`);
  }

  if (context.rsi14 >= THRESHOLD.RSI_HEALTHY_LOW && context.rsi14 <= THRESHOLD.RSI_HEALTHY_HIGH) {
    trendScore += TREND.RSI_HEALTHY;
    labels.push("RSI健康动量");
    basis.push(`RSI14 ${context.rsi14.toFixed(0)} 处于 50-70 健康动量区间`);
  } else if (context.rsi14 > THRESHOLD.RSI_OVERBOUGHT) {
    trendScore += TREND.RSI_OVERBOUGHT;
    riskNotes.push(`RSI14 ${context.rsi14.toFixed(0)}，短线过热`);
  } else if (context.rsi14 < THRESHOLD.RSI_WEAK) {
    trendScore += TREND.RSI_WEAK;
    riskNotes.push(`RSI14 ${context.rsi14.toFixed(0)}，短线动量不足`);
  }

  return { trendScore, volumeScore: 0, abnormalScore: 0, labels, basis, riskNotes };
}

function scoreVolume(context: SymbolContext): ScorerResult {
  let volumeScore = 0;
  let abnormalScore = 0;
  const labels: string[] = [];
  const basis: string[] = [];
  const riskNotes: string[] = [];

  if (context.volumeRatio >= THRESHOLD.VOLUME_STRONG) {
    volumeScore += context.volumeRatio >= THRESHOLD.VOLUME_VERY_STRONG ? VOLUME.STRONG : VOLUME.MODERATE;
    labels.push("放量");
    basis.push(`成交量为 20 周期均量 ${context.volumeRatio.toFixed(2)} 倍`);
  } else if (context.volumeRatio >= THRESHOLD.VOLUME_LIGHT) {
    volumeScore += VOLUME.LIGHT;
    basis.push(`成交量温和放大至 ${context.volumeRatio.toFixed(2)} 倍`);
  }

  if (context.turnoverRate > 0) {
    if (context.turnoverRate >= THRESHOLD.TURNOVER_LOW && context.turnoverRate <= THRESHOLD.TURNOVER_MAX) {
      volumeScore += context.turnoverRate >= THRESHOLD.TURNOVER_HIGH ? VOLUME.TURNOVER_ACTIVE_HIGH : VOLUME.TURNOVER_ACTIVE_LOW;
      labels.push("换手活跃");
      basis.push(`换手率 ${(context.turnoverRate * 100).toFixed(1)}%，交投活跃度适中`);
    } else if (context.turnoverRate > THRESHOLD.TURNOVER_EXCESSIVE) {
      abnormalScore += ABNORMAL.TURNOVER_HIGH;
      labels.push("换手过高");
      riskNotes.push(`换手率 ${(context.turnoverRate * 100).toFixed(1)}%，筹码交换过快，短线投机氛围浓`);
    }
  }

  return { trendScore: 0, volumeScore, abnormalScore, labels, basis, riskNotes };
}

function scoreMacd(context: SymbolContext, ma20: number): ScorerResult {
  let trendScore = 0;
  const labels: string[] = [];
  const basis: string[] = [];
  const riskNotes: string[] = [];

  const macdCurrent = context.macdHist;
  const macdPrevious = context.previousMacdHist;
  if (macdCurrent !== 0 || macdPrevious !== 0) {
    const priceAboveMa20 = context.latestDaily.close > ma20;

    if (macdCurrent > 0 && macdCurrent > macdPrevious) {
      trendScore += TREND.MACD_EXPANDING;
      labels.push("MACD动量增强");
      basis.push(`MACD柱 ${macdCurrent.toFixed(3)} 较前值 ${macdPrevious.toFixed(3)} 放大，多头动能增强`);
    } else if (macdCurrent > 0 && macdCurrent < macdPrevious) {
      if (priceAboveMa20) {
        trendScore += TREND.MACD_SHRINKING;
        labels.push("MACD动量衰减");
        riskNotes.push(`MACD柱 ${macdCurrent.toFixed(3)} 较前值 ${macdPrevious.toFixed(3)} 缩小，多头动能衰减，注意趋势转弱风险`);
      }
    } else if (macdCurrent < 0 && macdCurrent > macdPrevious) {
      trendScore += TREND.MACD_CONVERGING;
      labels.push("MACD底部收敛");
      basis.push(`MACD柱 ${macdCurrent.toFixed(3)} 负值收敛中，空头动能减弱`);
    } else if (macdCurrent < 0 && macdCurrent < macdPrevious) {
      trendScore += TREND.MACD_EXPANDING_BEAR;
      riskNotes.push(`MACD柱 ${macdCurrent.toFixed(3)} 负值扩大，空头动能增强`);
    }
  }

  return { trendScore, volumeScore: 0, abnormalScore: 0, labels, basis, riskNotes };
}

function scoreKdj(context: SymbolContext): ScorerResult {
  let trendScore = 0;
  let abnormalScore = 0;
  const labels: string[] = [];
  const basis: string[] = [];
  const riskNotes: string[] = [];

  const { kdjK, kdjD, kdjJ, kdjPrevK, kdjPrevD } = context;
  const kdjCrossedUp = kdjPrevK <= kdjPrevD && kdjK > kdjD;
  const kdjCrossedDown = kdjPrevK >= kdjPrevD && kdjK < kdjD;

  if (kdjCrossedUp) {
    if (kdjJ < THRESHOLD.KDJ_OVERSOLD) {
      trendScore += TREND.KDJ_GOLDEN_OVERSOLD;
      abnormalScore += ABNORMAL.KDJ_OVERSOLD;
      labels.push("KDJ金叉");
      basis.push(`KDJ 金叉（K=${kdjK.toFixed(1)}, D=${kdjD.toFixed(1)}, J=${kdjJ.toFixed(1)}），J 值低于 20 超卖区金叉，短线反弹信号强`);
    } else if (kdjJ < THRESHOLD.KDJ_NEUTRAL) {
      trendScore += TREND.KDJ_GOLDEN_NEUTRAL;
      labels.push("KDJ金叉");
      basis.push(`KDJ 金叉（K=${kdjK.toFixed(1)}, D=${kdjD.toFixed(1)}, J=${kdjJ.toFixed(1)}），中低位金叉，短线动能转强`);
    } else {
      trendScore += TREND.KDJ_GOLDEN_HIGH;
      labels.push("KDJ金叉");
      basis.push(`KDJ 金叉（K=${kdjK.toFixed(1)}, D=${kdjD.toFixed(1)}, J=${kdjJ.toFixed(1)}），高位金叉信号偏弱`);
    }
  } else if (kdjCrossedDown) {
    if (kdjJ > THRESHOLD.KDJ_OVERBOUGHT) {
      trendScore += TREND.KDJ_DEATH_OVERBOUGHT;
      labels.push("KDJ死叉");
      riskNotes.push(`KDJ 死叉（K=${kdjK.toFixed(1)}, D=${kdjD.toFixed(1)}, J=${kdjJ.toFixed(1)}），J 值高于 80 超买区死叉，短线回调风险大`);
    } else if (kdjJ > THRESHOLD.KDJ_NEUTRAL) {
      trendScore += TREND.KDJ_DEATH_HIGH;
      labels.push("KDJ死叉");
      riskNotes.push(`KDJ 死叉（K=${kdjK.toFixed(1)}, D=${kdjD.toFixed(1)}, J=${kdjJ.toFixed(1)}），中高位死叉，短线动能转弱`);
    } else {
      trendScore += TREND.KDJ_DEATH_LOW;
      riskNotes.push(`KDJ 死叉（K=${kdjK.toFixed(1)}, D=${kdjD.toFixed(1)}, J=${kdjJ.toFixed(1)}），低位死叉信号偏弱`);
    }
  }

  if (kdjJ > THRESHOLD.KDJ_EXTREME_HIGH) {
    abnormalScore += ABNORMAL.KDJ_OVERBOUGHT;
    labels.push("KDJ超买");
    riskNotes.push(`KDJ J 值 ${kdjJ.toFixed(1)} 超过 100，短线严重超买，追高风险极高`);
  } else if (kdjJ < THRESHOLD.KDJ_EXTREME_LOW) {
    abnormalScore += ABNORMAL.KDJ_OVERSOLD;
    labels.push("KDJ超卖");
    basis.push(`KDJ J 值 ${kdjJ.toFixed(1)} 低于 0，短线严重超卖，关注反弹机会`);
  }

  return { trendScore, volumeScore: 0, abnormalScore, labels, basis, riskNotes };
}

function scoreBollinger(context: SymbolContext): ScorerResult {
  let trendScore = 0;
  let volumeScore = 0;
  const labels: string[] = [];
  const basis: string[] = [];

  if (context.bbSqueeze) {
    labels.push("布林收窄");
    basis.push(`布林带带宽 ${context.bbBandwidthPct.toFixed(1)}% 收窄至 10% 以下，波动率压缩，可能酝酿突破`);

    if (context.bbBreakout) {
      trendScore += TREND.BB_BREAKOUT;
      volumeScore += VOLUME.BB_BREAKOUT;
      labels.push("布林突破");
      basis.push(`现价 ${formatPrice(context.latestDaily.close)} 突破布林上轨 ${formatPrice(context.bbUpper)}，量比 ${context.volumeRatio.toFixed(2)}，收窄后放量突破`);
    }
  }

  return { trendScore, volumeScore, abnormalScore: 0, labels, basis, riskNotes: [] };
}

function scoreIntradayPatterns(context: SymbolContext, ma20: number): ScorerResult {
  let trendScore = 0;
  let volumeScore = 0;
  let abnormalScore = 0;
  const labels: string[] = [];
  const basis: string[] = [];
  const riskNotes: string[] = [];

  // Prior breakout pullback
  if (context.hasPriorBreakout) {
    const isPullback = context.volumeRatio < THRESHOLD.PULLBACK_VOLUME;
    const holdsAboveSupport = context.latestDaily.close > ma20;
    const rsiHealthy = context.rsi14 >= THRESHOLD.RSI_PULLBACK_LOW && context.rsi14 <= THRESHOLD.RSI_PULLBACK_HIGH;

    if (isPullback && holdsAboveSupport && rsiHealthy) {
      trendScore += TREND.PRIOR_BREAKOUT_PULLBACK;
      volumeScore += VOLUME.PRIOR_BREAKOUT_PULLBACK;
      labels.push("缩量回踩支撑");
      basis.push(`近期存在放量突破，当前缩量回踩（量比 ${context.volumeRatio.toFixed(2)}），价格 ${formatPrice(context.latestDaily.close)} 守住 MA20 ${formatPrice(ma20)}，二次确认入场机会`);
    }
  }

  // Opening range breakout
  if (context.brokeOpeningRange) {
    trendScore += TREND.OPENING_RANGE_BREAKOUT;
    abnormalScore += ABNORMAL.OPENING_RANGE_BREAKOUT;
    labels.push("开盘区间突破");
    basis.push(`现价 ${formatPrice(context.latestLive.close)} 突破开盘区间高点 ${formatPrice(context.openingRangeHigh)}，日内主动性增强`);
  }

  // VWAP retest
  if (context.vwapRetestConfirmed) {
    if (context.latestMinuteVolumeRatio >= THRESHOLD.MINUTE_VOLUME_RETEST) {
      trendScore += TREND.VWAP_RETEST_CONFIRMED;
      labels.push("VWAP回踩确认");
      basis.push(`盘中回踩VWAP不破后重新走强，VWAP ${formatPrice(context.vwap)}，最新量能 ${context.latestMinuteVolumeRatio.toFixed(2)} 倍`);
    } else {
      trendScore += TREND.VWAP_RETEST_FAILED;
      abnormalScore += ABNORMAL.VWAP_RETEST_FAILED;
      labels.push("缩量回踩风险");
      riskNotes.push(`回踩确认缺少放量，最新分钟量能仅 ${context.latestMinuteVolumeRatio.toFixed(2)} 倍，可能是假修复或承接不足`);
    }
  }

  // Daily change abnormality
  if (context.dailyChangePct >= THRESHOLD.DAILY_CHANGE_STRONG || intradayMove(context.latestLive) >= THRESHOLD.INTRADAY_CHANGE_STRONG) {
    abnormalScore += ABNORMAL.DAILY_CHANGE_STRONG;
    labels.push("接近异动");
    basis.push(`涨幅 ${formatPct(Math.max(context.dailyChangePct, intradayMove(context.latestLive)))}，接近短线异动阈值`);
  } else if (context.dailyChangePct >= THRESHOLD.DAILY_CHANGE_MODERATE) {
    abnormalScore += ABNORMAL.DAILY_CHANGE_MODERATE;
    labels.push("异动预备");
  }

  if (context.dailyChangePct >= THRESHOLD.NEAR_LIMIT_UP) {
    labels.push("接近涨停");
  }

  // Tail session patterns
  if (isTailSessionTimestamp(context.latestLive.timestamp)) {
    const tailCloseNearHigh = context.latestLive.close >= context.latestDaily.high * THRESHOLD.TAIL_CLOSE_NEAR_HIGH;
    const tailAboveVwap = context.vwap > 0 && context.latestLive.close > context.vwap;
    const tailVolumeActive = context.volumeRatio >= THRESHOLD.TAIL_VOLUME;
    if (tailCloseNearHigh && tailAboveVwap && tailVolumeActive && context.dailyChangePct < THRESHOLD.NEAR_LIMIT_UP) {
      trendScore += TREND.TAIL_SESSION;
      abnormalScore += ABNORMAL.TAIL_SESSION;
      labels.push("尾盘承接");
      basis.push(`尾盘收于日内高位 ${formatPrice(context.latestLive.close)}，高于VWAP ${formatPrice(context.vwap)}，量比 ${context.volumeRatio.toFixed(2)}，承接未明显衰竭`);
    }

    if (context.volumeRatio >= THRESHOLD.VOLUME_VERY_STRONG && context.latestLive.close < context.latestDaily.high * THRESHOLD.TAIL_REVERSAL_CLOSE) {
      abnormalScore += ABNORMAL.TAIL_REVERSAL;
      riskNotes.push("尾盘放量但回落，疑似冲高兑现，次日冲高卖出假设需降级");
    }
  }

  // Volume-price divergence
  if (context.volumeRatio >= THRESHOLD.VOLUME_PRICE_DIVERGENCE && context.latestDaily.close < context.latestDaily.high * THRESHOLD.TAIL_REVERSAL_CLOSE) {
    abnormalScore += ABNORMAL.VOLUME_PRICE_DIVERGENCE;
    labels.push("量价背离风险");
    riskNotes.push("放量冲高回落，量价背离明显，短线追高风险上升");
  }

  return { trendScore, volumeScore, abnormalScore, labels, basis, riskNotes };
}

function mergeScorerResults(results: ScorerResult[]): ScorerResult {
  const merged: ScorerResult = { trendScore: 0, volumeScore: 0, abnormalScore: 0, labels: [], basis: [], riskNotes: [] };
  for (const r of results) {
    merged.trendScore += r.trendScore;
    merged.volumeScore += r.volumeScore;
    merged.abnormalScore += r.abnormalScore;
    merged.labels.push(...r.labels);
    merged.basis.push(...r.basis);
    merged.riskNotes.push(...r.riskNotes);
  }
  return merged;
}

function toStrongCandidate(context: SymbolContext): StrongStockCandidate {
  const ma20 = numberField(context.latestDaily.fields, "ma20");

  const trend = scoreTrend(context, ma20);
  const volume = scoreVolume(context);
  const macd = scoreMacd(context, ma20);
  const kdj = scoreKdj(context);
  const bb = scoreBollinger(context);
  const intraday = scoreIntradayPatterns(context, ma20);

  const merged = mergeScorerResults([trend, volume, macd, kdj, bb, intraday]);

  if (merged.riskNotes.length === 0) {
    merged.riskNotes.push("未触发过热风险，仍需按虚拟盘纪律设置止损");
  }

  // ATR risk note (informational, no score impact)
  if (context.atr14 > 0) {
    if (context.atrPct <= THRESHOLD.ATR_MODERATE) {
      merged.labels.push("ATR风险适中");
      merged.riskNotes.push(`ATR14 ${formatPrice(context.atr14)}，约为现价 ${formatPct(context.atrPct)}，波动风险适中`);
    } else {
      merged.abnormalScore += ABNORMAL.ATR_HIGH;
      merged.riskNotes.push(`ATR14 ${formatPrice(context.atr14)}，约为现价 ${formatPct(context.atrPct)}，日内波动过大需降低仓位`);
    }
  }

  return {
    symbol: context.symbol,
    sector: context.sector,
    latestPrice: round2(context.latestLive.close),
    trendScore: clampScore(merged.trendScore, 0, 75),
    volumeScore: clampScore(merged.volumeScore, 0, 30),
    abnormalScore: clampScore(merged.abnormalScore, 0, 35),
    totalScore: clampScore(merged.trendScore + merged.volumeScore + merged.abnormalScore, 0, 100),
    turnoverRate: round2(context.turnoverRate),
    labels: [...new Set(merged.labels)],
    basis: merged.basis,
    riskNotes: merged.riskNotes
  };
}


function buildOpeningRange(liveBars: MarketBar[]): { high: number; low: number } {
  const openingBars = liveBars.filter((bar) => isOpeningRangeTimestamp(bar.timestamp));
  if (openingBars.length === 0) return { high: 0, low: 0 };

  return {
    high: Math.max(...openingBars.map((bar) => bar.high)),
    low: Math.min(...openingBars.map((bar) => bar.low))
  };
}

function computeKdj(
  recentBars: MarketBar[],
  allSortedBars: MarketBar[]
): { k: number; d: number; j: number; prevK: number; prevD: number } {
  const period = 9;
  if (recentBars.length < period) return { k: 50, d: 50, j: 50, prevK: 50, prevD: 50 };

  // We need at least `period` bars to start computing. Iterate from the earliest available bar.
  let k = 50;
  let d = 50;
  let prevK = 50;
  let prevD = 50;

  // Compute from all available bars starting from index (length - period) to get proper smoothing
  const startIdx = Math.max(0, allSortedBars.length - period - 5); // a few extra for smoothing
  for (let i = startIdx; i < allSortedBars.length; i++) {
    const windowStart = Math.max(0, i - period + 1);
    const window = allSortedBars.slice(windowStart, i + 1);
    const highestHigh = Math.max(...window.map((bar) => bar.high));
    const lowestLow = Math.min(...window.map((bar) => bar.low));
    const range = highestHigh - lowestLow;
    const rsv = range > 0 ? ((allSortedBars[i]!.close - lowestLow) / range) * 100 : 50;

    prevK = k;
    prevD = d;
    k = (2 / 3) * k + (1 / 3) * rsv;
    d = (2 / 3) * d + (1 / 3) * k;
  }

  const j = 3 * k - 2 * d;
  return { k, d, j, prevK, prevD };
}

function isOpeningRangeTimestamp(timestamp: string): boolean {
  const match = /T(\d{2}):(\d{2}):/.exec(timestamp);
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour === 9 && minute >= 30 && minute <= 59;
}

function isTailSessionTimestamp(timestamp: string): boolean {
  const match = /T(\d{2}):(\d{2}):/.exec(timestamp);
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour === 14 && minute >= 30;
}

function hasVwapRetestConfirmation(liveBars: MarketBar[], vwap: number, latestClose: number): boolean {
  if (vwap <= 0 || latestClose <= vwap) return false;
  return liveBars.some((bar) => {
    const touchedVwap = !isOpeningRangeTimestamp(bar.timestamp) && bar.low <= vwap * 1.005 && bar.close >= vwap * 0.998;
    const recoveredAboveVwap = latestClose >= vwap * 1.01;
    return touchedVwap && recoveredAboveVwap;
  });
}

function buildSentiment(contexts: SymbolContext[], watchlist: StrongStockCandidate[]): MarketSentimentSnapshot {
  const risingCount = contexts.filter((item) => item.dailyChangePct > 0).length;
  const fallingCount = contexts.filter((item) => item.dailyChangePct < 0).length;
  const trendUpCount = contexts.filter((item) => item.latestDaily.close > numberField(item.latestDaily.fields, "ma20")).length;
  const strongCount = watchlist.filter((item) => item.totalScore >= 70).length;
  const volumeActiveCount = contexts.filter((item) => item.volumeRatio >= 1.5).length;
  const total = Math.max(contexts.length, 1);
  const averageVolumeRatio = average(contexts.map((item) => item.volumeRatio));
  const temperatureScore = Math.round(
    (risingCount / total) * 30 +
      (trendUpCount / total) * 30 +
      (strongCount / total) * 25 +
      Math.min(averageVolumeRatio / 2, 1) * 15
  );
  const trendLabel: MarketSentimentSnapshot["trendLabel"] =
    temperatureScore >= 70 ? "偏强" : temperatureScore >= 45 ? "中性" : "偏弱";

  return {
    temperatureScore,
    trendLabel,
    risingCount,
    fallingCount,
    trendUpCount,
    strongCount,
    volumeActiveCount,
    averageVolumeRatio: round2(averageVolumeRatio),
    reasons: [
      `${risingCount}/${contexts.length} 只观察股上涨`,
      `${trendUpCount}/${contexts.length} 只站上 MA20`,
      `${volumeActiveCount}/${contexts.length} 只出现放量`
    ]
  };
}

function buildSectorRotation(
  contexts: SymbolContext[],
  watchlist: StrongStockCandidate[]
): SectorRotationItem[] {
  const contextsBySector = new Map<string, SymbolContext[]>();
  const candidatesBySymbol = new Map(watchlist.map((item) => [item.symbol, item]));

  for (const context of contexts) {
    contextsBySector.set(context.sector, [...(contextsBySector.get(context.sector) ?? []), context]);
  }

  return [...contextsBySector.entries()]
    .map(([sector, sectorContexts]) => {
      const candidates = sectorContexts.map((item) => candidatesBySymbol.get(item.symbol)).filter(Boolean) as StrongStockCandidate[];
      const strengthScore = Math.round(average(candidates.map((item) => item.totalScore)));
      const persistenceScore = Math.round(
        average(sectorContexts.map((item) => (item.fiveDayChangePct > 0 ? 60 : 30) + Math.min(item.volumeRatio, 2) * 20))
      );
      const direction: SectorRotationItem["direction"] =
        strengthScore >= 70 ? "领涨" : strengthScore >= 45 ? "轮动" : "退潮";
      const sampleQuality: SectorRotationItem["sampleQuality"] =
        sectorContexts.length >= 2 ? "样本充足" : "样本不足";

      return {
        sector,
        sampleSize: sectorContexts.length,
        strengthScore,
        persistenceScore,
        sampleQuality,
        direction,
        representativeSymbols: candidates.sort((left, right) => right.totalScore - left.totalScore).map((item) => item.symbol),
        reasons: [
          `板块平均强度 ${strengthScore}`,
          `平均量能 ${round2(average(sectorContexts.map((item) => item.volumeRatio)))} 倍`
        ]
      };
    })
    .sort((left, right) => right.strengthScore - left.strengthScore);
}

function buildRiskSignals(contexts: SymbolContext[], sentiment: MarketSentimentSnapshot): RiskSignal[] {
  const signals: RiskSignal[] = [];

  for (const context of contexts) {
    const rsi14 = context.rsi14;

    if (rsi14 >= 75) {
      signals.push({
        id: `risk-overheat-${context.symbol}`,
        level: "high",
        symbol: context.symbol,
        title: "短线过热",
        reason: `${context.symbol} RSI14 达到 ${rsi14.toFixed(0)}，追高回撤风险上升。`,
        suggestion: "虚拟盘只做观察，不扩大仓位；等待回踩或卖出信号。"
      });
    }

    if (context.latestDaily.close < numberField(context.latestDaily.fields, "ma20")) {
      signals.push({
        id: `risk-ma20-${context.symbol}`,
        level: "medium",
        symbol: context.symbol,
        title: "跌破趋势线",
        reason: `${context.symbol} 最新价低于 MA20。`,
        suggestion: "从重点跟踪中降级，等待重新站上均线。"
      });
    }
  }

  if (sentiment.temperatureScore < 45) {
    signals.push({
      id: "risk-market-weak",
      level: "high",
      title: "市场情绪偏弱",
      reason: "观察池趋势和上涨家数不足。",
      suggestion: "降低虚拟仓位，优先做盘后复盘。"
    });
  }

  return signals;
}

function buildActionPlan(
  sentiment: MarketSentimentSnapshot,
  watchlist: StrongStockCandidate[],
  riskSignals: RiskSignal[]
): ShortTermActionPlan {
  const highRisks = riskSignals.filter((item) => item.level === "high").length;

  if (sentiment.temperatureScore >= 70 && watchlist.length > 0 && highRisks <= 1) {
    return {
      mode: "进攻观察",
      positionTone: "仅限虚拟盘小仓位跟踪，单票不超过既定风控上限。",
      operationAdvice: ["优先跟踪强度排名靠前且未过热的标的", "手动标记买入后等待卖出监控信号"],
      followUp: ["观察放量能否延续", "盘后复核板块是否继续领涨"]
    };
  }

  if (sentiment.temperatureScore >= 45) {
    return {
      mode: "精选跟踪",
      positionTone: "虚拟盘以观察为主，只记录特别清晰的信号。",
      operationAdvice: ["不追涨，只等待回踩确认或二次放量", "优先过滤 RSI 过热标的"],
      followUp: ["继续观察板块轮动", "等待新闻或龙虎榜真实来源确认"]
    };
  }

  return {
    mode: "防守观望",
    positionTone: "虚拟盘暂停新增激进买入观察。",
    operationAdvice: ["保留现金假设", "仅复盘历史信号和风险触发"],
    followUp: ["等待情绪温度回到中性以上", "检查弱势板块是否继续拖累"]
  };
}

function buildOutlook(
  sentiment: MarketSentimentSnapshot,
  sectorRotation: SectorRotationItem[],
  watchlist: StrongStockCandidate[]
): string {
  const leadingSector = sectorRotation[0]?.sector ?? "暂无明确板块";
  const leadingSymbol = watchlist[0]?.symbol ?? "暂无明确强势股";

  if (sentiment.trendLabel === "偏强") {
    return `短期情绪偏强，${leadingSector} 处于轮动前列，重点观察 ${leadingSymbol} 的放量延续。`;
  }

  if (sentiment.trendLabel === "中性") {
    return `短期情绪中性，${leadingSector} 有局部表现，等待强势股二次确认。`;
  }

  return "短期情绪偏弱，优先控制虚拟仓位并等待趋势重新修复。";
}

function buildConclusion(
  actionPlan: ShortTermActionPlan,
  watchlist: StrongStockCandidate[],
  riskSignals: RiskSignal[]
): string {
  const symbols = watchlist.slice(0, 3).map((item) => item.symbol).join("、") || "暂无";
  const riskText = riskSignals.length > 0 ? `同时存在 ${riskSignals.length} 条风险信号。` : "暂未出现高优先级风险信号。";

  return `核心结论：当前建议为${actionPlan.mode}，重点跟踪 ${symbols}。${riskText}`;
}

function buildReasons(
  sentiment: MarketSentimentSnapshot,
  sectorRotation: SectorRotationItem[],
  watchlist: StrongStockCandidate[],
  riskSignals: RiskSignal[],
  statuses: ExternalIntelStatus[]
): string[] {
  const reasons = [
    `市场情绪温度 ${sentiment.temperatureScore}，趋势标签为${sentiment.trendLabel}`,
    `领先板块：${sectorRotation[0]?.sector ?? "暂无"}`,
    `强势观察数量：${watchlist.length}`,
    `风险信号数量：${riskSignals.length}`
  ];
  const notConfigured = statuses.filter((item) => item.status === "not_configured").map((item) => item.label);
  if (notConfigured.length > 0) {
    reasons.push(`${notConfigured.join("、")}真实来源未配置，相关结论保持空缺`);
  }

  return reasons;
}

function mergeExternalIntelStatuses(
  statuses: ExternalIntelStatus[] | undefined,
  items: ExternalIntelItem[]
): ExternalIntelStatus[] {
  const provided = statuses ?? [];
  const bySource = new Map<ExternalIntelStatus["source"], ExternalIntelStatus>(
    defaultIntelStatuses.map((status) => [status.source, status])
  );

  for (const status of provided) {
    bySource.set(status.source, status);
  }

  // Pre-count items by source to avoid O(N²) filtering
  const countBySource = new Map<ExternalIntelSource, number>();
  const latestBySource = new Map<ExternalIntelSource, ExternalIntelItem>();
  for (const item of items) {
    countBySource.set(item.source, (countBySource.get(item.source) ?? 0) + 1);
    const existing = latestBySource.get(item.source);
    if (!existing || item.timestamp > existing.timestamp) {
      latestBySource.set(item.source, item);
    }
  }

  for (const [source, count] of countBySource) {
    const latest = latestBySource.get(source)!;
    const existing = bySource.get(source);
    bySource.set(source, {
      source,
      label: existing?.label ?? sourceLabel(source),
      status: "available",
      provider: latest.provider,
      message: "已使用真实外部情报来源。",
      updatedAt: latest.timestamp,
      itemCount: count
    });
  }

  return [...bySource.values()];
}

function sourceLabel(source: ExternalIntelStatus["source"]): string {
  if (source === "dragon_tiger") return "龙虎榜";
  if (source === "news") return "新闻催化";
  if (source === "theme") return "主线题材";
  return "公告";
}

function groupBars(bars: MarketBar[]): Map<string, MarketBar[]> {
  const result = new Map<string, MarketBar[]>();

  for (const bar of bars) {
    const existing = result.get(bar.symbol);
    if (existing) {
      existing.push(bar);
    } else {
      result.set(bar.symbol, [bar]);
    }
  }

  return result;
}

function sortBars(bars: MarketBar[]): MarketBar[] {
  return [...bars].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

function inferSector(symbol: string): string {
  if (symbol.startsWith("60") || symbol.endsWith(".SH")) return "沪市观察池";
  if (symbol.startsWith("30")) return "创业板观察池";
  return "深市观察池";
}

function pct(current: number, previous: number): number {
  if (previous === 0) return 0;
  return (current - previous) / previous;
}

function intradayMove(bar: MarketBar): number {
  return pct(bar.close, bar.open);
}
