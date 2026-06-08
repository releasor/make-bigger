import type {
  ExternalIntelItem,
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
}

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
    const ma20 = numberField(latestDaily, "ma20");
    const avgVolume20 = numberField(latestDaily, "avgVolume20");
    const firstFiveDay = sortedDaily.slice(-5)[0] ?? previousDaily ?? latestDaily;

    contexts.push({
      symbol,
      sector: sectorMap[symbol] ?? inferSector(symbol),
      latestDaily,
      previousDaily,
      latestLive,
      dailyChangePct: previousDaily ? pct(latestDaily.close, previousDaily.close) : pct(latestDaily.close, latestDaily.open),
      fiveDayChangePct: pct(latestDaily.close, firstFiveDay.close),
      volumeRatio: avgVolume20 > 0 ? latestDaily.volume / avgVolume20 : 0
    });

    if (ma20 <= 0) {
      latestDaily.fields.ma20 = latestDaily.close;
    }
  }

  return contexts;
}

function toStrongCandidate(context: SymbolContext): StrongStockCandidate {
  const ma20 = numberField(context.latestDaily, "ma20");
  const rsi14 = numberField(context.latestDaily, "rsi14");
  const labels: string[] = [];
  const basis: string[] = [];
  const riskNotes: string[] = [];
  let trendScore = 0;
  let volumeScore = 0;
  let abnormalScore = 0;

  if (context.latestDaily.close > ma20) {
    trendScore += 35;
    labels.push("趋势突破");
    basis.push(`现价 ${formatPrice(context.latestDaily.close)} 高于 MA20 ${formatPrice(ma20)}`);
  }

  if (context.fiveDayChangePct > 0) {
    trendScore += 20;
    basis.push(`近 5 日涨幅 ${formatPct(context.fiveDayChangePct)}，短线趋势延续`);
  }

  if (context.latestDaily.close >= context.latestDaily.high * 0.98) {
    trendScore += 10;
    abnormalScore += 10;
    basis.push("收盘接近当日高点，资金承接较强");
  }

  if (context.volumeRatio >= 1.5) {
    volumeScore += context.volumeRatio >= 2 ? 30 : 22;
    labels.push("放量");
    basis.push(`成交量为 20 周期均量 ${context.volumeRatio.toFixed(2)} 倍`);
  } else if (context.volumeRatio >= 1.2) {
    volumeScore += 14;
    basis.push(`成交量温和放大至 ${context.volumeRatio.toFixed(2)} 倍`);
  }

  if (context.dailyChangePct >= 0.07 || intradayMove(context.latestLive) >= 0.05) {
    abnormalScore += 25;
    labels.push("接近异动");
    basis.push(`涨幅 ${formatPct(Math.max(context.dailyChangePct, intradayMove(context.latestLive)))}，接近短线异动阈值`);
  } else if (context.dailyChangePct >= 0.04) {
    abnormalScore += 12;
    labels.push("异动预备");
  }

  if (context.dailyChangePct >= 0.085) {
    labels.push("接近涨停");
  }

  if (rsi14 > 75) {
    riskNotes.push(`RSI14 ${rsi14.toFixed(0)}，短线过热`);
  }

  if (context.volumeRatio >= 2.5 && context.latestDaily.close < context.latestDaily.high * 0.97) {
    riskNotes.push("放量后未能贴近日高，存在冲高回落风险");
  }

  if (riskNotes.length === 0) {
    riskNotes.push("未触发过热风险，仍需按虚拟盘纪律设置止损");
  }

  return {
    symbol: context.symbol,
    sector: context.sector,
    latestPrice: round2(context.latestLive.close),
    trendScore: Math.min(60, trendScore),
    volumeScore: Math.min(30, volumeScore),
    abnormalScore: Math.min(35, abnormalScore),
    totalScore: Math.min(100, trendScore + volumeScore + abnormalScore),
    labels: [...new Set(labels)],
    basis,
    riskNotes
  };
}

function buildSentiment(contexts: SymbolContext[], watchlist: StrongStockCandidate[]): MarketSentimentSnapshot {
  const risingCount = contexts.filter((item) => item.dailyChangePct > 0).length;
  const fallingCount = contexts.filter((item) => item.dailyChangePct < 0).length;
  const trendUpCount = contexts.filter((item) => item.latestDaily.close > numberField(item.latestDaily, "ma20")).length;
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
    const rsi14 = numberField(context.latestDaily, "rsi14");

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

    if (context.latestDaily.close < numberField(context.latestDaily, "ma20")) {
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

  for (const item of items) {
    const existing = bySource.get(item.source);
    bySource.set(item.source, {
      source: item.source,
      label: existing?.label ?? sourceLabel(item.source),
      status: "available",
      provider: item.provider,
      message: "已使用真实外部情报来源。",
      updatedAt: item.timestamp,
      itemCount: (existing?.itemCount ?? 0) + 1
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
    result.set(bar.symbol, [...(result.get(bar.symbol) ?? []), bar]);
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

function numberField(bar: MarketBar, field: string): number {
  const value = bar.fields[field];
  return typeof value === "number" ? value : 0;
}

function pct(current: number, previous: number): number {
  if (previous === 0) return 0;
  return (current - previous) / previous;
}

function intradayMove(bar: MarketBar): number {
  return pct(bar.close, bar.open);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatPct(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function formatPrice(value: number): string {
  return value.toFixed(2);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
