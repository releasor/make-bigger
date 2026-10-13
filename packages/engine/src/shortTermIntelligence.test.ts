import { describe, expect, it } from "vitest";
import type { MarketBar } from "@itrade/domain";
import type { MarketDataSnapshot } from "./realMarketData";
import { buildShortTermIntelligenceReport } from "./shortTermIntelligence";

describe("short-term intelligence report", () => {
  it("builds a Chinese research report from K-line trend, sentiment, sectors, abnormal moves, and source status", () => {
    const report = buildShortTermIntelligenceReport({
      snapshot: marketSnapshot(),
      sectorMap: {
        "000001.SZ": "银行",
        "600000.SH": "银行",
        "300750.SZ": "新能源"
      },
      now: "2026-06-08T15:30:00.000+08:00"
    });

    expect(report.title).toBe("短线情报与决策中枢");
    expect(report.outlook).toContain("短期");
    expect(report.actionPlan.mode).toBe("进攻观察");
    expect(report.actionPlan.positionTone).toContain("虚拟");
    expect(report.sentiment.temperatureScore).toBeGreaterThanOrEqual(70);
    expect(report.sentiment.trendLabel).toBe("偏强");
    expect(report.sectorRotation[0]).toMatchObject({
      sector: "银行",
      sampleQuality: "样本充足"
    });
    expect(report.watchlist.map((item) => item.symbol)).toContain("000001.SZ");
    expect(report.watchlist[0]?.labels).toContain("接近异动");
    expect(report.riskSignals.map((item) => item.level)).toContain("high");
    expect(report.externalIntelStatuses).toContainEqual(
      expect.objectContaining({ source: "dragon_tiger", status: "not_configured" })
    );
    expect(report.conclusion).toContain("核心结论");
    expect(report.generatedAt).toBe("2026-06-08T15:30:00.000+08:00");
  });

  it("uses VWAP, ATR volatility, and RSI momentum filters to refine intraday candidates", () => {
    const report = buildShortTermIntelligenceReport({
      snapshot: enhancedIndicatorSnapshot(),
      sectorMap: { "000001.SZ": "银行", "600000.SH": "银行" },
      now: "2026-06-08T10:30:00.000+08:00"
    });

    const lead = report.watchlist[0];
    expect(lead).toBeDefined();
    if (!lead) throw new Error("missing lead candidate");

    expect(lead.symbol).toBe("000001.SZ");
    expect(lead.labels).toEqual(expect.arrayContaining(["VWAP强势", "RSI健康动量", "ATR风险适中"]));
    expect(lead.basis).toEqual(expect.arrayContaining([expect.stringContaining("VWAP"), expect.stringContaining("RSI14") ]));
    expect(lead.riskNotes).toEqual(expect.arrayContaining([expect.stringContaining("ATR") ]));
    expect(lead.totalScore).toBeGreaterThan(report.watchlist[1]?.totalScore ?? 0);
  });


  it("rewards opening range breakout and VWAP retest confirmation for intraday entries", () => {
    const report = buildShortTermIntelligenceReport({
      snapshot: openingRangeBreakoutSnapshot(),
      sectorMap: { "000001.SZ": "银行", "600000.SH": "银行" },
      now: "2026-06-08T10:35:00.000+08:00"
    });

    const lead = report.watchlist[0];
    expect(lead).toBeDefined();
    if (!lead) throw new Error("missing lead candidate");

    expect(lead.symbol).toBe("000001.SZ");
    expect(lead.labels).toEqual(expect.arrayContaining(["开盘区间突破", "VWAP回踩确认"]));
    expect(lead.basis).toEqual(
      expect.arrayContaining([expect.stringContaining("突破开盘区间高点"), expect.stringContaining("回踩VWAP不破")])
    );
    expect(lead.totalScore).toBeGreaterThan(report.watchlist[1]?.totalScore ?? 0);
  });

  it("penalizes opening range breakouts that chase too far above VWAP", () => {
    const report = buildShortTermIntelligenceReport({
      snapshot: overheatedOpeningRangeBreakoutSnapshot(),
      sectorMap: { "000001.SZ": "银行", "600000.SH": "银行" },
      now: "2026-06-08T10:35:00.000+08:00"
    });

    const chased = report.watchlist.find((item) => item.symbol === "000001.SZ");
    const steady = report.watchlist.find((item) => item.symbol === "600000.SH");
    expect(chased).toBeDefined();
    expect(steady).toBeDefined();
    if (!chased || !steady) throw new Error("missing candidates");

    expect(chased.labels).toContain("突破追高风险");
    expect(chased.riskNotes).toEqual(expect.arrayContaining([expect.stringContaining("偏离VWAP") ]));
    // Both candidates hit the 100-point cap, but the chased one has risk labels
    expect(chased.totalScore).toBeLessThanOrEqual(steady.totalScore);
  });

  it("rewards tail-session acceptance when late price holds near day high above VWAP", () => {
    const report = buildShortTermIntelligenceReport({
      snapshot: tailSessionAcceptanceSnapshot(),
      sectorMap: { "000001.SZ": "银行", "600000.SH": "银行" },
      now: "2026-06-08T14:55:00.000+08:00"
    });

    const accepted = report.watchlist.find((item) => item.symbol === "000001.SZ");
    const faded = report.watchlist.find((item) => item.symbol === "600000.SH");
    expect(accepted).toBeDefined();
    expect(faded).toBeDefined();
    if (!accepted || !faded) throw new Error("missing tail candidates");

    expect(accepted.labels).toContain("尾盘承接");
    expect(accepted.basis).toEqual(expect.arrayContaining([expect.stringContaining("尾盘收于日内高位") ]));
    expect(faded.riskNotes).toEqual(expect.arrayContaining([expect.stringContaining("尾盘放量但回落") ]));
    expect(accepted.totalScore).toBeGreaterThan(faded.totalScore);
  });

  it("requires volume expansion to confirm VWAP pullback entries", () => {
    const report = buildShortTermIntelligenceReport({
      snapshot: weakVolumeVwapPullbackSnapshot(),
      sectorMap: { "000001.SZ": "银行", "600000.SH": "银行" },
      now: "2026-06-08T10:35:00.000+08:00"
    });

    const weakPullback = report.watchlist.find((item) => item.symbol === "000001.SZ");
    const confirmed = report.watchlist.find((item) => item.symbol === "600000.SH");
    expect(weakPullback).toBeDefined();
    expect(confirmed).toBeDefined();
    if (!weakPullback || !confirmed) throw new Error("missing candidates");

    expect(weakPullback.labels).toContain("缩量回踩风险");
    expect(weakPullback.riskNotes).toEqual(expect.arrayContaining([expect.stringContaining("回踩确认缺少放量") ]));
    expect(weakPullback.totalScore).toBeLessThan(confirmed.totalScore);
  });

  it("rewards healthy turnover rate 5%-10% and penalizes excessive turnover above 15%", () => {
    const report = buildShortTermIntelligenceReport({
      snapshot: turnoverRateSnapshot(),
      sectorMap: { "000001.SZ": "银行", "600000.SH": "银行" },
      now: "2026-06-08T10:30:00.000+08:00"
    });

    const healthy = report.watchlist.find((item) => item.symbol === "000001.SZ");
    const excessive = report.watchlist.find((item) => item.symbol === "600000.SH");
    expect(healthy).toBeDefined();
    expect(excessive).toBeDefined();
    if (!healthy || !excessive) throw new Error("missing candidates");

    expect(healthy.turnoverRate).toBeCloseTo(0.07, 2);
    expect(healthy.labels).toContain("换手活跃");
    expect(healthy.basis).toEqual(expect.arrayContaining([expect.stringContaining("换手率")]));

    expect(excessive.turnoverRate).toBeCloseTo(0.18, 2);
    expect(excessive.labels).toContain("换手过高");
    expect(excessive.riskNotes).toEqual(expect.arrayContaining([expect.stringContaining("换手率")]));

    expect(healthy.totalScore).toBeGreaterThan(excessive.totalScore);
  });

  it("rewards volume-breakout-then-low-volume-pullback-to-support as secondary entry", () => {
    const report = buildShortTermIntelligenceReport({
      snapshot: volumeBreakoutPullbackSnapshot(),
      sectorMap: { "000001.SZ": "银行", "600000.SH": "银行" },
      now: "2026-06-08T10:30:00.000+08:00"
    });

    const pullback = report.watchlist.find((item) => item.symbol === "000001.SZ");
    const consolidating = report.watchlist.find((item) => item.symbol === "600000.SH");
    expect(pullback).toBeDefined();
    expect(consolidating).toBeDefined();
    if (!pullback || !consolidating) throw new Error("missing candidates");

    // 000001.SZ: prior breakout with volume, current pullback with low volume above MA20
    expect(pullback.labels).toContain("缩量回踩支撑");
    expect(pullback.basis).toEqual(expect.arrayContaining([expect.stringContaining("回踩")]));

    // 600000.SH: no prior breakout, just normal consolidation — no special label
    expect(consolidating.labels).not.toContain("缩量回踩支撑");

    // The pullback candidate should score higher due to secondary-entry bonus
    expect(pullback.totalScore).toBeGreaterThan(consolidating.totalScore);
  });

  it("penalizes high-volume price divergence after intraday false breakout", () => {
    const report = buildShortTermIntelligenceReport({
      snapshot: volumePriceDivergenceSnapshot(),
      sectorMap: { "000001.SZ": "银行", "600000.SH": "银行" },
      now: "2026-06-08T14:50:00.000+08:00"
    });

    const divergent = report.watchlist.find((item) => item.symbol === "000001.SZ");
    const steady = report.watchlist.find((item) => item.symbol === "600000.SH");
    expect(divergent).toBeDefined();
    expect(steady).toBeDefined();
    if (!divergent || !steady) throw new Error("missing candidates");

    expect(divergent.labels).toContain("量价背离风险");
    expect(divergent.riskNotes).toEqual(expect.arrayContaining([expect.stringContaining("放量冲高回落") ]));
    expect(divergent.totalScore).toBeLessThan(steady.totalScore);
  });

  it("detects Bollinger Bands squeeze and rewards breakout from squeeze with volume", () => {
    // 000001.SZ: tight range bars => narrow BB => squeeze, then breakout above upper band with volume
    // 600000.SH: wide range bars => normal BB width, no squeeze
    const report = buildShortTermIntelligenceReport({
      snapshot: bollingerSqueezeSnapshot(),
      sectorMap: { "000001.SZ": "银行", "600000.SH": "银行" },
      now: "2026-06-08T10:30:00.000+08:00"
    });

    const squeezed = report.watchlist.find((item) => item.symbol === "000001.SZ");
    const normal = report.watchlist.find((item) => item.symbol === "600000.SH");
    expect(squeezed).toBeDefined();
    expect(normal).toBeDefined();
    if (!squeezed || !normal) throw new Error("missing candidates");

    // 000001.SZ: narrow BB bandwidth => squeeze label, breakout with volume => 布林突破 label
    expect(squeezed.labels).toContain("布林收窄");
    expect(squeezed.labels).toContain("布林突破");
    expect(squeezed.basis).toEqual(expect.arrayContaining([expect.stringContaining("布林带")]));

    // 600000.SH: normal bandwidth, no squeeze label
    expect(normal.labels).not.toContain("布林收窄");

    // Squeeze + breakout stock should score higher
    expect(squeezed.totalScore).toBeGreaterThan(normal.totalScore);
  });

  it("rewards expanding MACD histogram and penalizes shrinking histogram as trend confirmation", () => {
    const report = buildShortTermIntelligenceReport({
      snapshot: macdMomentumSnapshot(),
      sectorMap: { "000001.SZ": "银行", "600000.SH": "银行" },
      now: "2026-06-08T10:30:00.000+08:00"
    });

    const expanding = report.watchlist.find((item) => item.symbol === "000001.SZ");
    const shrinking = report.watchlist.find((item) => item.symbol === "600000.SH");
    expect(expanding).toBeDefined();
    expect(shrinking).toBeDefined();
    if (!expanding || !shrinking) throw new Error("missing candidates");

    // 000001.SZ: macdHist expanding (0.12 -> 0.20), price above MA20 => MACD动量增强 label
    expect(expanding.labels).toContain("MACD动量增强");
    expect(expanding.basis).toEqual(expect.arrayContaining([expect.stringContaining("MACD柱")]));

    // 600000.SH: macdHist shrinking (0.15 -> 0.06), price above MA20 => MACD动量衰减 label
    expect(shrinking.labels).toContain("MACD动量衰减");
    expect(shrinking.riskNotes).toEqual(expect.arrayContaining([expect.stringContaining("MACD")]));

    // Expanding histogram stock should score higher
    expect(expanding.totalScore).toBeGreaterThan(shrinking.totalScore);
  });

  it("rewards KDJ golden cross in oversold zone and penalizes death cross in overbought zone", () => {
    const report = buildShortTermIntelligenceReport({
      snapshot: kdjSnapshot(),
      sectorMap: { "000001.SZ": "银行", "600000.SH": "银行" },
      now: "2026-06-08T10:30:00.000+08:00"
    });

    const golden = report.watchlist.find((item) => item.symbol === "000001.SZ");
    const death = report.watchlist.find((item) => item.symbol === "600000.SH");
    expect(golden).toBeDefined();
    expect(death).toBeDefined();
    if (!golden || !death) throw new Error("missing KDJ candidates");

    // 000001.SZ: price declining then stabilizing → KDJ oversold, K crosses above D
    expect(golden.labels).toEqual(expect.arrayContaining(["KDJ金叉"]));
    expect(golden.basis).toEqual(expect.arrayContaining([expect.stringContaining("KDJ")]));

    // 600000.SH: price rising strongly → KDJ overbought, K crosses below D
    expect(death.labels).toEqual(expect.arrayContaining(["KDJ死叉"]));
    expect(death.riskNotes).toEqual(expect.arrayContaining([expect.stringContaining("KDJ")]));

    // Golden cross stock should score higher than death cross stock
    expect(golden.totalScore).toBeGreaterThan(death.totalScore);
  });

});

function volumePriceDivergenceSnapshot(): MarketDataSnapshot {
  const daily = [
    barWithFields("000001.SZ", "2026-06-06T15:00:00.000+08:00", 10, 10.2, 9.8, 10, 1000, { ma20: 9.8, avgVolume20: 1000, rsi14: 54, atr14: 0.38, vwap: 9.95 }),
    barWithFields("000001.SZ", "2026-06-07T15:00:00.000+08:00", 10, 10.6, 9.9, 10.4, 1300, { ma20: 9.9, avgVolume20: 1050, rsi14: 58, atr14: 0.4, vwap: 10.22 }),
    barWithFields("000001.SZ", "2026-06-08T15:00:00.000+08:00", 10.5, 11.35, 10.3, 10.62, 3600, { ma20: 10, avgVolume20: 1200, rsi14: 66, atr14: 0.42, vwap: 10.72 }),
    barWithFields("600000.SH", "2026-06-06T15:00:00.000+08:00", 8.1, 8.3, 8, 8.2, 800, { ma20: 8.0, avgVolume20: 800, rsi14: 50, atr14: 0.32, vwap: 8.15 }),
    barWithFields("600000.SH", "2026-06-07T15:00:00.000+08:00", 8.2, 8.5, 8.1, 8.45, 1000, { ma20: 8.1, avgVolume20: 850, rsi14: 54, atr14: 0.35, vwap: 8.35 }),
    barWithFields("600000.SH", "2026-06-08T15:00:00.000+08:00", 8.48, 8.9, 8.45, 8.82, 1700, { ma20: 8.2, avgVolume20: 900, rsi14: 59, atr14: 0.36, vwap: 8.55 })
  ];
  const minute = [
    barWithFields("000001.SZ", "2026-06-08T14:40:00.000+08:00", 11.05, 11.34, 11.02, 11.28, 1800, { ma20: 10.1, avgVolume20: 520, rsi14: 66, atr14: 0.42, vwap: 10.7 }),
    barWithFields("000001.SZ", "2026-06-08T14:50:00.000+08:00", 11.28, 11.35, 10.55, 10.62, 2300, { ma20: 10.1, avgVolume20: 520, rsi14: 66, atr14: 0.42, vwap: 10.72 }),
    barWithFields("600000.SH", "2026-06-08T14:40:00.000+08:00", 8.68, 8.8, 8.66, 8.76, 800, { ma20: 8.3, avgVolume20: 500, rsi14: 58, atr14: 0.36, vwap: 8.52 }),
    barWithFields("600000.SH", "2026-06-08T14:50:00.000+08:00", 8.76, 8.88, 8.72, 8.82, 900, { ma20: 8.3, avgVolume20: 500, rsi14: 59, atr14: 0.36, vwap: 8.55 })
  ];

  return {
    daily,
    minute,
    source: { provider: "eastmoney", isReal: true, updatedAt: "2026-06-08T14:50:00.000+08:00", symbols: ["000001.SZ", "600000.SH"], warnings: [], cacheHit: false },
    quality: { ok: true, issues: [] }
  };
}

function weakVolumeVwapPullbackSnapshot(): MarketDataSnapshot {
  const daily = [
    barWithFields("000001.SZ", "2026-06-06T15:00:00.000+08:00", 10, 10.2, 9.8, 10, 1000, { ma20: 9.8, avgVolume20: 1000, rsi14: 54, atr14: 0.38, vwap: 9.95 }),
    barWithFields("000001.SZ", "2026-06-07T15:00:00.000+08:00", 10, 10.6, 9.9, 10.4, 1300, { ma20: 9.9, avgVolume20: 1050, rsi14: 58, atr14: 0.4, vwap: 10.22 }),
    barWithFields("000001.SZ", "2026-06-08T15:00:00.000+08:00", 10.5, 11.2, 10.4, 10.88, 1900, { ma20: 10, avgVolume20: 1200, rsi14: 63, atr14: 0.42, vwap: 10.68 }),
    barWithFields("600000.SH", "2026-06-06T15:00:00.000+08:00", 8.1, 8.3, 8, 8.2, 800, { ma20: 8.0, avgVolume20: 800, rsi14: 50, atr14: 0.32, vwap: 8.15 }),
    barWithFields("600000.SH", "2026-06-07T15:00:00.000+08:00", 8.2, 8.5, 8.1, 8.45, 1100, { ma20: 8.1, avgVolume20: 850, rsi14: 54, atr14: 0.35, vwap: 8.35 }),
    barWithFields("600000.SH", "2026-06-08T15:00:00.000+08:00", 8.48, 8.9, 8.45, 8.66, 1600, { ma20: 8.2, avgVolume20: 900, rsi14: 59, atr14: 0.36, vwap: 8.5 })
  ];
  const minute = [
    barWithFields("000001.SZ", "2026-06-08T09:31:00.000+08:00", 10.52, 10.7, 10.5, 10.66, 600, { ma20: 10.1, avgVolume20: 520, rsi14: 60, atr14: 0.42, vwap: 10.58 }),
    barWithFields("000001.SZ", "2026-06-08T09:45:00.000+08:00", 10.66, 10.76, 10.6, 10.72, 700, { ma20: 10.1, avgVolume20: 520, rsi14: 62, atr14: 0.42, vwap: 10.62 }),
    barWithFields("000001.SZ", "2026-06-08T10:05:00.000+08:00", 10.72, 10.8, 10.65, 10.69, 480, { ma20: 10.1, avgVolume20: 520, rsi14: 63, atr14: 0.42, vwap: 10.66 }),
    barWithFields("000001.SZ", "2026-06-08T10:34:00.000+08:00", 10.78, 10.95, 10.74, 10.9, 500, { ma20: 10.1, avgVolume20: 520, rsi14: 64, atr14: 0.42, vwap: 10.7 }),
    barWithFields("600000.SH", "2026-06-08T09:31:00.000+08:00", 8.48, 8.56, 8.45, 8.52, 500, { ma20: 8.3, avgVolume20: 500, rsi14: 57, atr14: 0.36, vwap: 8.52 }),
    barWithFields("600000.SH", "2026-06-08T10:05:00.000+08:00", 8.5, 8.56, 8.48, 8.51, 540, { ma20: 8.3, avgVolume20: 500, rsi14: 58, atr14: 0.36, vwap: 8.5 }),
    barWithFields("600000.SH", "2026-06-08T10:34:00.000+08:00", 8.56, 8.7, 8.54, 8.66, 900, { ma20: 8.3, avgVolume20: 500, rsi14: 59, atr14: 0.36, vwap: 8.5 })
  ];

  return {
    daily,
    minute,
    source: { provider: "eastmoney", isReal: true, updatedAt: "2026-06-08T10:35:00.000+08:00", symbols: ["000001.SZ", "600000.SH"], warnings: [], cacheHit: false },
    quality: { ok: true, issues: [] }
  };
}

function tailSessionAcceptanceSnapshot(): MarketDataSnapshot {
  const daily = [
    barWithFields("000001.SZ", "2026-06-06T15:00:00.000+08:00", 10, 10.2, 9.8, 10, 1000, { ma20: 9.8, avgVolume20: 1000, rsi14: 54, atr14: 0.38, vwap: 9.95 }),
    barWithFields("000001.SZ", "2026-06-07T15:00:00.000+08:00", 10, 10.6, 9.9, 10.4, 1200, { ma20: 9.9, avgVolume20: 1000, rsi14: 58, atr14: 0.4, vwap: 10.22 }),
    barWithFields("000001.SZ", "2026-06-08T15:00:00.000+08:00", 10.5, 11.05, 10.4, 10.98, 2100, { ma20: 10, avgVolume20: 1100, rsi14: 64, atr14: 0.42, vwap: 10.7 }),
    barWithFields("600000.SH", "2026-06-06T15:00:00.000+08:00", 8.1, 8.3, 8, 8.2, 800, { ma20: 8.0, avgVolume20: 800, rsi14: 50, atr14: 0.32, vwap: 8.15 }),
    barWithFields("600000.SH", "2026-06-07T15:00:00.000+08:00", 8.2, 8.5, 8.1, 8.45, 900, { ma20: 8.1, avgVolume20: 850, rsi14: 54, atr14: 0.35, vwap: 8.35 }),
    barWithFields("600000.SH", "2026-06-08T15:00:00.000+08:00", 8.48, 9.05, 8.45, 8.72, 2400, { ma20: 8.2, avgVolume20: 900, rsi14: 68, atr14: 0.36, vwap: 8.55 })
  ];
  const minute = [
    barWithFields("000001.SZ", "2026-06-08T14:45:00.000+08:00", 10.82, 10.95, 10.8, 10.93, 900, { ma20: 10.1, avgVolume20: 520, rsi14: 63, atr14: 0.42, vwap: 10.68 }),
    barWithFields("000001.SZ", "2026-06-08T14:55:00.000+08:00", 10.93, 11.02, 10.9, 10.99, 1300, { ma20: 10.1, avgVolume20: 520, rsi14: 64, atr14: 0.42, vwap: 10.7 }),
    barWithFields("600000.SH", "2026-06-08T14:45:00.000+08:00", 8.9, 9.04, 8.88, 8.98, 1300, { ma20: 8.3, avgVolume20: 500, rsi14: 68, atr14: 0.36, vwap: 8.55 }),
    barWithFields("600000.SH", "2026-06-08T14:55:00.000+08:00", 8.98, 9.05, 8.68, 8.72, 1800, { ma20: 8.3, avgVolume20: 500, rsi14: 68, atr14: 0.36, vwap: 8.55 })
  ];

  return {
    daily,
    minute,
    source: { provider: "eastmoney", isReal: true, updatedAt: "2026-06-08T14:55:00.000+08:00", symbols: ["000001.SZ", "600000.SH"], warnings: [], cacheHit: false },
    quality: { ok: true, issues: [] }
  };
}

function overheatedOpeningRangeBreakoutSnapshot(): MarketDataSnapshot {
  const daily = [
    barWithFields("000001.SZ", "2026-06-06T15:00:00.000+08:00", 10, 10.2, 9.8, 10, 1000, { ma20: 9.8, avgVolume20: 1000, rsi14: 54, atr14: 0.38, vwap: 9.95 }),
    barWithFields("000001.SZ", "2026-06-07T15:00:00.000+08:00", 10, 10.6, 9.9, 10.4, 1300, { ma20: 9.9, avgVolume20: 1050, rsi14: 58, atr14: 0.4, vwap: 10.22 }),
    barWithFields("000001.SZ", "2026-06-08T15:00:00.000+08:00", 10.5, 11.6, 10.4, 11.42, 2600, { ma20: 10, avgVolume20: 1200, rsi14: 67, atr14: 0.42, vwap: 10.68 }),
    barWithFields("600000.SH", "2026-06-06T15:00:00.000+08:00", 8.1, 8.3, 8, 8.2, 800, { ma20: 8.0, avgVolume20: 800, rsi14: 50, atr14: 0.32, vwap: 8.15 }),
    barWithFields("600000.SH", "2026-06-07T15:00:00.000+08:00", 8.2, 8.5, 8.1, 8.45, 1100, { ma20: 8.1, avgVolume20: 850, rsi14: 54, atr14: 0.35, vwap: 8.35 }),
    barWithFields("600000.SH", "2026-06-08T15:00:00.000+08:00", 8.48, 8.9, 8.45, 8.66, 1600, { ma20: 8.2, avgVolume20: 900, rsi14: 59, atr14: 0.36, vwap: 8.5 })
  ];
  const minute = [
    barWithFields("000001.SZ", "2026-06-08T09:31:00.000+08:00", 10.52, 10.7, 10.5, 10.66, 600, { ma20: 10.1, avgVolume20: 520, rsi14: 60, atr14: 0.42, vwap: 10.58 }),
    barWithFields("000001.SZ", "2026-06-08T09:45:00.000+08:00", 10.66, 10.76, 10.6, 10.72, 700, { ma20: 10.1, avgVolume20: 520, rsi14: 62, atr14: 0.42, vwap: 10.62 }),
    barWithFields("000001.SZ", "2026-06-08T10:34:00.000+08:00", 11.18, 11.5, 11.12, 11.42, 1500, { ma20: 10.1, avgVolume20: 520, rsi14: 67, atr14: 0.42, vwap: 10.68 }),
    barWithFields("600000.SH", "2026-06-08T09:31:00.000+08:00", 8.48, 8.56, 8.45, 8.52, 500, { ma20: 8.3, avgVolume20: 500, rsi14: 57, atr14: 0.36, vwap: 8.52 }),
    barWithFields("600000.SH", "2026-06-08T10:34:00.000+08:00", 8.56, 8.7, 8.54, 8.66, 900, { ma20: 8.3, avgVolume20: 500, rsi14: 59, atr14: 0.36, vwap: 8.5 })
  ];

  return {
    daily,
    minute,
    source: { provider: "eastmoney", isReal: true, updatedAt: "2026-06-08T10:35:00.000+08:00", symbols: ["000001.SZ", "600000.SH"], warnings: [], cacheHit: false },
    quality: { ok: true, issues: [] }
  };
}

function openingRangeBreakoutSnapshot(): MarketDataSnapshot {
  const daily = [
    barWithFields("000001.SZ", "2026-06-06T15:00:00.000+08:00", 10, 10.2, 9.8, 10, 1000, { ma20: 9.8, avgVolume20: 1000, rsi14: 54, atr14: 0.38, vwap: 9.95 }),
    barWithFields("000001.SZ", "2026-06-07T15:00:00.000+08:00", 10, 10.6, 9.9, 10.4, 1300, { ma20: 9.9, avgVolume20: 1050, rsi14: 58, atr14: 0.4, vwap: 10.22 }),
    barWithFields("000001.SZ", "2026-06-08T15:00:00.000+08:00", 10.5, 11.2, 10.4, 10.98, 2200, { ma20: 10, avgVolume20: 1200, rsi14: 63, atr14: 0.42, vwap: 10.68 }),
    barWithFields("600000.SH", "2026-06-06T15:00:00.000+08:00", 8.1, 8.3, 8, 8.2, 800, { ma20: 8.0, avgVolume20: 800, rsi14: 50, atr14: 0.32, vwap: 8.15 }),
    barWithFields("600000.SH", "2026-06-07T15:00:00.000+08:00", 8.2, 8.5, 8.1, 8.45, 1100, { ma20: 8.1, avgVolume20: 850, rsi14: 54, atr14: 0.35, vwap: 8.35 }),
    barWithFields("600000.SH", "2026-06-08T15:00:00.000+08:00", 8.48, 8.9, 8.45, 8.55, 900, { ma20: 8.2, avgVolume20: 900, rsi14: 57, atr14: 0.4, vwap: 8.58 })
  ];
  const minute = [
    barWithFields("000001.SZ", "2026-06-08T09:31:00.000+08:00", 10.52, 10.7, 10.5, 10.66, 600, { ma20: 10.1, avgVolume20: 520, rsi14: 60, atr14: 0.42, vwap: 10.58 }),
    barWithFields("000001.SZ", "2026-06-08T09:45:00.000+08:00", 10.66, 10.76, 10.6, 10.72, 700, { ma20: 10.1, avgVolume20: 520, rsi14: 62, atr14: 0.42, vwap: 10.62 }),
    barWithFields("000001.SZ", "2026-06-08T10:05:00.000+08:00", 10.72, 10.8, 10.65, 10.69, 650, { ma20: 10.1, avgVolume20: 520, rsi14: 63, atr14: 0.42, vwap: 10.66 }),
    barWithFields("000001.SZ", "2026-06-08T10:34:00.000+08:00", 10.78, 10.95, 10.74, 10.92, 1200, { ma20: 10.1, avgVolume20: 520, rsi14: 64, atr14: 0.42, vwap: 10.7 }),
    barWithFields("600000.SH", "2026-06-08T09:31:00.000+08:00", 8.48, 8.56, 8.45, 8.52, 500, { ma20: 8.3, avgVolume20: 500, rsi14: 57, atr14: 0.4, vwap: 8.52 }),
    barWithFields("600000.SH", "2026-06-08T10:34:00.000+08:00", 8.52, 8.57, 8.5, 8.53, 520, { ma20: 8.3, avgVolume20: 500, rsi14: 57, atr14: 0.4, vwap: 8.54 })
  ];

  return {
    daily,
    minute,
    source: { provider: "eastmoney", isReal: true, updatedAt: "2026-06-08T10:35:00.000+08:00", symbols: ["000001.SZ", "600000.SH"], warnings: [], cacheHit: false },
    quality: { ok: true, issues: [] }
  };
}

function enhancedIndicatorSnapshot(): MarketDataSnapshot {
  const daily = [
    barWithFields("000001.SZ", "2026-06-06T15:00:00.000+08:00", 10, 10.2, 9.8, 10, 1000, { ma20: 9.8, avgVolume20: 1000, rsi14: 52, atr14: 0.38, vwap: 9.95 }),
    barWithFields("000001.SZ", "2026-06-07T15:00:00.000+08:00", 10, 10.6, 9.9, 10.4, 1300, { ma20: 9.9, avgVolume20: 1050, rsi14: 58, atr14: 0.4, vwap: 10.22 }),
    barWithFields("000001.SZ", "2026-06-08T15:00:00.000+08:00", 10.5, 11.1, 10.4, 10.95, 2400, { ma20: 10, avgVolume20: 1200, rsi14: 64, atr14: 0.46, vwap: 10.62 }),
    barWithFields("600000.SH", "2026-06-06T15:00:00.000+08:00", 8.1, 8.3, 8, 8.2, 800, { ma20: 8.0, avgVolume20: 800, rsi14: 50, atr14: 0.32, vwap: 8.15 }),
    barWithFields("600000.SH", "2026-06-07T15:00:00.000+08:00", 8.2, 8.5, 8.1, 8.45, 1100, { ma20: 8.1, avgVolume20: 850, rsi14: 54, atr14: 0.35, vwap: 8.35 }),
    barWithFields("600000.SH", "2026-06-08T15:00:00.000+08:00", 8.48, 8.95, 8.45, 8.55, 900, { ma20: 8.2, avgVolume20: 900, rsi14: 82, atr14: 0.9, vwap: 8.72 })
  ];
  const minute = [
    barWithFields("000001.SZ", "2026-06-08T10:29:00.000+08:00", 10.82, 10.96, 10.8, 10.93, 1100, { ma20: 10.1, avgVolume20: 520, rsi14: 64, atr14: 0.46, vwap: 10.62 }),
    barWithFields("600000.SH", "2026-06-08T10:29:00.000+08:00", 8.62, 8.66, 8.5, 8.52, 600, { ma20: 8.3, avgVolume20: 500, rsi14: 82, atr14: 0.9, vwap: 8.72 })
  ];

  return {
    daily,
    minute,
    source: { provider: "eastmoney", isReal: true, updatedAt: "2026-06-08T10:30:00.000+08:00", symbols: ["000001.SZ", "600000.SH"], warnings: [], cacheHit: false },
    quality: { ok: true, issues: [] }
  };
}

function barWithFields(
  symbol: string,
  timestamp: string,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
  fields: Record<string, number>
): MarketBar {
  return { symbol, timestamp, open, high, low, close, volume, fields };
}

function marketSnapshot(): MarketDataSnapshot {
  const daily = [
    bar("000001.SZ", "2026-06-06T15:00:00.000+08:00", 10, 10.2, 9.8, 10, 1000, 9.8, 1000, 52),
    bar("000001.SZ", "2026-06-07T15:00:00.000+08:00", 10, 10.6, 9.9, 10.4, 1300, 9.9, 1050, 58),
    bar("000001.SZ", "2026-06-08T15:00:00.000+08:00", 10.5, 11.35, 10.4, 11.2, 2600, 10, 1200, 68),
    bar("600000.SH", "2026-06-06T15:00:00.000+08:00", 8.1, 8.3, 8, 8.2, 800, 8, 800, 50),
    bar("600000.SH", "2026-06-07T15:00:00.000+08:00", 8.2, 8.5, 8.1, 8.45, 1100, 8.1, 850, 54),
    bar("600000.SH", "2026-06-08T15:00:00.000+08:00", 8.48, 8.95, 8.45, 8.9, 1800, 8.2, 900, 62),
    bar("300750.SZ", "2026-06-06T15:00:00.000+08:00", 180, 185, 178, 182, 1200, 170, 1000, 65),
    bar("300750.SZ", "2026-06-07T15:00:00.000+08:00", 182, 192, 181, 190, 1700, 172, 1100, 72),
    bar("300750.SZ", "2026-06-08T15:00:00.000+08:00", 191, 210, 190, 207, 3600, 175, 1200, 82)
  ];

  const minute = [
    bar("000001.SZ", "2026-06-08T14:58:00.000+08:00", 11, 11.28, 10.98, 11.24, 900, 10.9, 500, 66),
    bar("000001.SZ", "2026-06-08T14:59:00.000+08:00", 11.24, 11.34, 11.2, 11.32, 1100, 10.95, 520, 70),
    bar("600000.SH", "2026-06-08T14:59:00.000+08:00", 8.88, 8.96, 8.86, 8.94, 900, 8.5, 500, 63),
    bar("300750.SZ", "2026-06-08T14:59:00.000+08:00", 205, 210, 203, 208, 1800, 180, 900, 84)
  ];

  return {
    daily,
    minute,
    source: {
      provider: "eastmoney",
      isReal: true,
      updatedAt: "2026-06-08T15:30:00.000+08:00",
      symbols: ["000001.SZ", "600000.SH", "300750.SZ"],
      warnings: [],
      cacheHit: false
    },
    quality: { ok: true, issues: [] }
  };
}

function bar(
  symbol: string,
  timestamp: string,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
  ma20: number,
  avgVolume20: number,
  rsi14: number
): MarketBar {
  return {
    symbol,
    timestamp,
    open,
    high,
    low,
    close,
    volume,
    fields: { ma20, avgVolume20, rsi14 }
  };
}

function volumeBreakoutPullbackSnapshot(): MarketDataSnapshot {
  // 000001.SZ: prior day (06-07) had breakout with high volume (+4.4%, volumeRatio 1.3x→2.5x)
  // Latest day (06-08): low volume pullback, close above MA20, RSI healthy
  const daily = [
    barWithFields("000001.SZ", "2026-06-06T15:00:00.000+08:00", 10, 10.2, 9.8, 10, 1000, { ma20: 9.8, avgVolume20: 1000, rsi14: 52, atr14: 0.38, vwap: 9.95 }),
    barWithFields("000001.SZ", "2026-06-07T15:00:00.000+08:00", 10, 10.6, 9.9, 10.44, 2500, { ma20: 9.9, avgVolume20: 1050, rsi14: 60, atr14: 0.4, vwap: 10.22 }),
    barWithFields("000001.SZ", "2026-06-08T15:00:00.000+08:00", 10.4, 10.55, 10.2, 10.35, 800, { ma20: 10.05, avgVolume20: 1200, rsi14: 56, atr14: 0.42, vwap: 10.38 }),
    // 600000.SH: no prior breakout, just normal consolidation
    barWithFields("600000.SH", "2026-06-06T15:00:00.000+08:00", 8.1, 8.3, 8, 8.2, 800, { ma20: 8.0, avgVolume20: 800, rsi14: 50, atr14: 0.32, vwap: 8.15 }),
    barWithFields("600000.SH", "2026-06-07T15:00:00.000+08:00", 8.2, 8.35, 8.1, 8.25, 780, { ma20: 8.1, avgVolume20: 850, rsi14: 51, atr14: 0.35, vwap: 8.22 }),
    barWithFields("600000.SH", "2026-06-08T15:00:00.000+08:00", 8.22, 8.35, 8.15, 8.3, 750, { ma20: 8.15, avgVolume20: 850, rsi14: 52, atr14: 0.34, vwap: 8.28 })
  ];
  const minute = [
    barWithFields("000001.SZ", "2026-06-08T10:29:00.000+08:00", 10.3, 10.4, 10.25, 10.35, 400, { ma20: 10.1, avgVolume20: 520, rsi14: 56, atr14: 0.42, vwap: 10.38 }),
    barWithFields("600000.SH", "2026-06-08T10:29:00.000+08:00", 8.25, 8.32, 8.2, 8.3, 380, { ma20: 8.2, avgVolume20: 500, rsi14: 52, atr14: 0.34, vwap: 8.28 })
  ];

  return {
    daily,
    minute,
    source: { provider: "eastmoney", isReal: true, updatedAt: "2026-06-08T10:30:00.000+08:00", symbols: ["000001.SZ", "600000.SH"], warnings: [], cacheHit: false },
    quality: { ok: true, issues: [] }
  };
}

function turnoverRateSnapshot(): MarketDataSnapshot {
  const daily = [
    barWithFields("000001.SZ", "2026-06-06T15:00:00.000+08:00", 10, 10.2, 9.8, 10, 1000, { ma20: 9.8, avgVolume20: 1000, rsi14: 54, atr14: 0.38, vwap: 9.95, turnoverRate: 0.06 }),
    barWithFields("000001.SZ", "2026-06-07T15:00:00.000+08:00", 10, 10.6, 9.9, 10.4, 1300, { ma20: 9.9, avgVolume20: 1050, rsi14: 58, atr14: 0.4, vwap: 10.22, turnoverRate: 0.07 }),
    barWithFields("000001.SZ", "2026-06-08T15:00:00.000+08:00", 10.5, 11.1, 10.4, 10.95, 2400, { ma20: 10, avgVolume20: 1200, rsi14: 64, atr14: 0.46, vwap: 10.62, turnoverRate: 0.07 }),
    barWithFields("600000.SH", "2026-06-06T15:00:00.000+08:00", 8.1, 8.3, 8, 8.2, 800, { ma20: 8.3, avgVolume20: 800, rsi14: 50, atr14: 0.32, vwap: 8.15, turnoverRate: 0.15 }),
    barWithFields("600000.SH", "2026-06-07T15:00:00.000+08:00", 8.2, 8.5, 8.1, 8.25, 900, { ma20: 8.35, avgVolume20: 850, rsi14: 54, atr14: 0.35, vwap: 8.35, turnoverRate: 0.17 }),
    barWithFields("600000.SH", "2026-06-08T15:00:00.000+08:00", 8.48, 8.72, 8.45, 8.55, 1200, { ma20: 8.5, avgVolume20: 900, rsi14: 55, atr14: 0.36, vwap: 8.55, turnoverRate: 0.18 })
  ];
  const minute = [
    barWithFields("000001.SZ", "2026-06-08T10:29:00.000+08:00", 10.82, 10.96, 10.8, 10.93, 1100, { ma20: 10.1, avgVolume20: 520, rsi14: 64, atr14: 0.46, vwap: 10.62, turnoverRate: 0.07 }),
    barWithFields("600000.SH", "2026-06-08T10:29:00.000+08:00", 8.5, 8.56, 8.45, 8.52, 500, { ma20: 8.5, avgVolume20: 500, rsi14: 55, atr14: 0.36, vwap: 8.55, turnoverRate: 0.18 })
  ];

  return {
    daily,
    minute,
    source: { provider: "eastmoney", isReal: true, updatedAt: "2026-06-08T10:30:00.000+08:00", symbols: ["000001.SZ", "600000.SH"], warnings: [], cacheHit: false },
    quality: { ok: true, issues: [] }
  };
}

function bollingerSqueezeSnapshot(): MarketDataSnapshot {
  // 000001.SZ: 20 tight-range bars centered ~10.0, then breakout bar above upper BB with volume
  // BB bandwidth = 4 * stdDev / SMA20. With std close range ~9.95-10.05, stdDev ≈ 0.029, bandwidth ≈ 1.16% => squeeze
  const squeezeDaily: MarketBar[] = [];
  for (let i = 0; i < 20; i++) {
    const day = String(i + 1).padStart(2, "0");
    const close = 9.95 + (i % 5) * 0.02; // range 9.95-10.03, very tight
    squeezeDaily.push(barWithFields(
      "000001.SZ", `2026-05-${day}T15:00:00.000+08:00`,
      close - 0.05, close + 0.05, close - 0.06, close, 1000,
      { ma20: 10.0, avgVolume20: 1000, rsi14: 52, atr14: 0.1, vwap: close }
    ));
  }
  // Latest bar: breakout above upper BB (~10.116) with volume
  squeezeDaily.push(barWithFields(
    "000001.SZ", "2026-06-08T15:00:00.000+08:00",
    10.05, 10.35, 10.03, 10.28, 2500,
    { ma20: 10.0, avgVolume20: 1000, rsi14: 65, atr14: 0.15, vwap: 10.18 }
  ));

  // 600000.SH: 20 wider-range bars => normal BB width, no squeeze
  const normalDaily: MarketBar[] = [];
  for (let i = 0; i < 20; i++) {
    const day = String(i + 1).padStart(2, "0");
    const close = 9.0 + (i % 5) * 0.5; // range 9.0-11.0, wide
    normalDaily.push(barWithFields(
      "600000.SH", `2026-05-${day}T15:00:00.000+08:00`,
      close - 0.3, close + 0.3, close - 0.35, close, 800,
      { ma20: 10.0, avgVolume20: 800, rsi14: 50, atr14: 0.5, vwap: close }
    ));
  }
  normalDaily.push(barWithFields(
    "600000.SH", "2026-06-08T15:00:00.000+08:00",
    10.0, 10.5, 9.9, 10.3, 900,
    { ma20: 10.0, avgVolume20: 800, rsi14: 55, atr14: 0.5, vwap: 10.2 }
  ));

  const minute = [
    barWithFields("000001.SZ", "2026-06-08T10:29:00.000+08:00", 10.2, 10.35, 10.15, 10.28, 1200, { ma20: 10.0, avgVolume20: 500, rsi14: 65, atr14: 0.15, vwap: 10.18 }),
    barWithFields("600000.SH", "2026-06-08T10:29:00.000+08:00", 10.2, 10.5, 10.1, 10.3, 400, { ma20: 10.0, avgVolume20: 400, rsi14: 55, atr14: 0.5, vwap: 10.2 })
  ];

  return {
    daily: [...squeezeDaily, ...normalDaily],
    minute,
    source: { provider: "eastmoney", isReal: true, updatedAt: "2026-06-08T10:30:00.000+08:00", symbols: ["000001.SZ", "600000.SH"], warnings: [], cacheHit: false },
    quality: { ok: true, issues: [] }
  };
}

function macdMomentumSnapshot(): MarketDataSnapshot {
  // 000001.SZ: MACD histogram expanding (0.08 -> 0.12 -> 0.20), price above MA20 => bullish momentum
  // 600000.SH: MACD histogram shrinking (0.10 -> 0.15 -> 0.06), price above MA20 => weakening momentum
  const daily = [
    barWithFields("000001.SZ", "2026-06-06T15:00:00.000+08:00", 10, 10.2, 9.8, 10, 1000, { ma20: 9.8, avgVolume20: 1000, rsi14: 54, atr14: 0.38, vwap: 9.95, macdHist: 0.08 }),
    barWithFields("000001.SZ", "2026-06-07T15:00:00.000+08:00", 10, 10.5, 9.9, 10.4, 1300, { ma20: 9.9, avgVolume20: 1050, rsi14: 58, atr14: 0.4, vwap: 10.22, macdHist: 0.12 }),
    barWithFields("000001.SZ", "2026-06-08T15:00:00.000+08:00", 10.5, 11.1, 10.4, 10.95, 2400, { ma20: 10, avgVolume20: 1200, rsi14: 64, atr14: 0.46, vwap: 10.62, macdHist: 0.20 }),
    barWithFields("600000.SH", "2026-06-06T15:00:00.000+08:00", 8.1, 8.3, 8, 8.2, 800, { ma20: 8.0, avgVolume20: 800, rsi14: 50, atr14: 0.32, vwap: 8.15, macdHist: 0.10 }),
    barWithFields("600000.SH", "2026-06-07T15:00:00.000+08:00", 8.2, 8.5, 8.1, 8.45, 1100, { ma20: 8.1, avgVolume20: 850, rsi14: 54, atr14: 0.35, vwap: 8.35, macdHist: 0.15 }),
    barWithFields("600000.SH", "2026-06-08T15:00:00.000+08:00", 8.48, 8.72, 8.45, 8.55, 1200, { ma20: 8.2, avgVolume20: 900, rsi14: 55, atr14: 0.36, vwap: 8.55, macdHist: 0.06 })
  ];
  const minute = [
    barWithFields("000001.SZ", "2026-06-08T10:29:00.000+08:00", 10.82, 10.96, 10.8, 10.93, 1100, { ma20: 10.1, avgVolume20: 520, rsi14: 64, atr14: 0.46, vwap: 10.62, macdHist: 0.20 }),
    barWithFields("600000.SH", "2026-06-08T10:29:00.000+08:00", 8.5, 8.56, 8.45, 8.52, 500, { ma20: 8.2, avgVolume20: 500, rsi14: 55, atr14: 0.36, vwap: 8.55, macdHist: 0.06 })
  ];

  return {
    daily,
    minute,
    source: { provider: "eastmoney", isReal: true, updatedAt: "2026-06-08T10:30:00.000+08:00", symbols: ["000001.SZ", "600000.SH"], warnings: [], cacheHit: false },
    quality: { ok: true, issues: [] }
  };
}

function kdjSnapshot(): MarketDataSnapshot {
  // 000001.SZ: declining price for 9 days, then bounce → KDJ oversold golden cross
  const goldenDaily: MarketBar[] = [];
  const goldenPrices = [12.0, 11.5, 11.0, 10.7, 10.5, 10.3, 10.2, 10.15, 10.3];
  for (let i = 0; i < goldenPrices.length; i++) {
    const day = String(i + 21).padStart(2, "0");
    const c = goldenPrices[i] as number;
    goldenDaily.push(barWithFields("000001.SZ", `2026-05-${day}T15:00:00.000+08:00`, c + 0.1, c + 0.3, c - 0.2, c, 1000, { ma20: 11.0, avgVolume20: 1000, rsi14: 30, atr14: 0.4, vwap: c }));
  }
  // Day 10: bounce close 10.8 → RSV=100 → K≈60.2, D≈60.1 → K > D (golden cross)
  goldenDaily.push(barWithFields("000001.SZ", "2026-06-08T15:00:00.000+08:00", 10.2, 10.85, 10.15, 10.8, 1100, { ma20: 10.8, avgVolume20: 1000, rsi14: 40, atr14: 0.42, vwap: 10.5 }));

  // 600000.SH: rising price for 9 days, then pullback → KDJ overbought death cross
  const deathPrices = [8.0, 8.3, 8.6, 8.9, 9.2, 9.5, 9.8, 10.1, 10.4];
  const deathDaily: MarketBar[] = [];
  for (let i = 0; i < deathPrices.length; i++) {
    const day = String(i + 21).padStart(2, "0");
    const c = deathPrices[i] as number;
    deathDaily.push(barWithFields("600000.SH", `2026-05-${day}T15:00:00.000+08:00`, c - 0.1, c + 0.2, c - 0.2, c, 800, { ma20: 9.0, avgVolume20: 800, rsi14: 75, atr14: 0.3, vwap: c }));
  }
  // Day 10: strong pullback close 9.5 → RSV≈56 → K≈77.9, D≈81.0 → K < D (death cross)
  deathDaily.push(barWithFields("600000.SH", "2026-06-08T15:00:00.000+08:00", 10.4, 10.5, 9.4, 9.5, 900, { ma20: 9.5, avgVolume20: 800, rsi14: 45, atr14: 0.35, vwap: 10.0 }));

  const minute = [
    barWithFields("000001.SZ", "2026-06-08T10:29:00.000+08:00", 10.05, 10.2, 10.0, 10.15, 550, { ma20: 10.8, avgVolume20: 500, rsi14: 35, atr14: 0.42, vwap: 10.1 }),
    barWithFields("600000.SH", "2026-06-08T10:29:00.000+08:00", 9.6, 9.7, 9.4, 9.5, 450, { ma20: 9.5, avgVolume20: 400, rsi14: 45, atr14: 0.35, vwap: 10.0 })
  ];

  return {
    daily: [...goldenDaily, ...deathDaily],
    minute,
    source: { provider: "eastmoney", isReal: true, updatedAt: "2026-06-08T10:30:00.000+08:00", symbols: ["000001.SZ", "600000.SH"], warnings: [], cacheHit: false },
    quality: { ok: true, issues: [] }
  };
}
