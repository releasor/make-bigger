import type { MarketBar } from "@itrade/domain";

export interface MarketDataSet {
  daily: MarketBar[];
  minute: MarketBar[];
}

export interface DataQualityResult {
  ok: boolean;
  issues: string[];
}

const requiredFields = ["ma20", "avgVolume20", "rsi14"] as const;

export function getSampleBars(): MarketDataSet {
  const daily: MarketBar[] = [
    bar("000001.SZ", "2026-06-08T15:00:00.000+08:00", 10.1, 10.6, 9.9, 10.5, 1200000, 10.2, 900000, 42),
    bar("600000.SH", "2026-06-08T15:00:00.000+08:00", 8.1, 8.4, 8.0, 8.3, 900000, 8.2, 700000, 48),
    bar("000001.SZ", "2026-06-09T15:00:00.000+08:00", 10.5, 10.9, 10.4, 10.8, 1300000, 10.3, 950000, 46),
    bar("600000.SH", "2026-06-09T15:00:00.000+08:00", 8.3, 8.6, 8.2, 8.5, 950000, 8.25, 720000, 44)
  ];

  const minute: MarketBar[] = [
    bar("000001.SZ", "2026-06-08T09:31:00.000+08:00", 10.1, 10.2, 10.0, 10.15, 18000, 10.05, 15000, 39),
    bar("000001.SZ", "2026-06-08T09:32:00.000+08:00", 10.15, 10.35, 10.14, 10.34, 26000, 10.06, 15000, 43),
    bar("600000.SH", "2026-06-08T09:31:00.000+08:00", 8.1, 8.2, 8.08, 8.18, 14000, 8.12, 12000, 45),
    bar("600000.SH", "2026-06-08T09:32:00.000+08:00", 8.18, 8.19, 8.1, 8.11, 11000, 8.13, 12000, 32)
  ];

  return { daily, minute };
}

export function inspectMarketDataQuality(bars: MarketBar[]): DataQualityResult {
  const issues: string[] = [];

  for (const item of bars) {
    if (item.close <= 0) issues.push(`${item.symbol} ${item.timestamp} has non-positive close`);
    if (item.high < item.low) issues.push(`${item.symbol} ${item.timestamp} high is below low`);

    for (const field of requiredFields) {
      if (typeof item.fields[field] !== "number") {
        issues.push(`${item.symbol} ${item.timestamp} missing field ${field}`);
      }
    }
  }

  return { ok: issues.length === 0, issues };
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
