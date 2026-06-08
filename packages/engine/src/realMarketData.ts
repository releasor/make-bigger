import type { MarketBar } from "@itrade/domain";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { get } from "node:https";
import { dirname } from "node:path";
import { getSampleBars, inspectMarketDataQuality, type DataQualityResult, type MarketDataSet } from "./marketData";

export type MarketDataFrequency = "daily" | "minute";

export interface MarketDataSourceStatus {
  provider: string;
  isReal: boolean;
  updatedAt: string;
  symbols: string[];
  warnings: string[];
  cacheHit: boolean;
}

export interface MarketDataSnapshot extends MarketDataSet {
  source: MarketDataSourceStatus;
  quality: DataQualityResult;
}

export interface MarketDataProvider {
  getSnapshot(symbols: string[]): Promise<MarketDataSnapshot>;
}

type Fetcher = (url: string) => Promise<string>;

interface EastMoneyProviderOptions {
  fetcher?: Fetcher;
  now?: () => Date;
}

interface CachedProviderOptions {
  provider: MarketDataProvider;
  initialSnapshot?: MarketDataSnapshot;
  cacheFile?: string;
  maxAgeMs?: number;
}

interface EastMoneyResponse {
  rc: number;
  data?: {
    klines?: string[];
  };
}

const defaultSymbols = ["000001.SZ", "600000.SH"];

export class EastMoneyMarketDataProvider implements MarketDataProvider {
  private readonly fetcher: Fetcher;
  private readonly now: () => Date;

  constructor(options: EastMoneyProviderOptions = {}) {
    this.fetcher = options.fetcher ?? defaultFetcher;
    this.now = options.now ?? (() => new Date());
  }

  async getSnapshot(symbols: string[] = defaultSymbols): Promise<MarketDataSnapshot> {
    const normalizedSymbols = symbols.length > 0 ? symbols : defaultSymbols;
    const daily: MarketBar[] = [];
    const minute: MarketBar[] = [];

    for (const symbol of normalizedSymbols) {
      daily.push(...parseEastMoneyKlines(symbol, await this.fetchKlines(symbol, "daily"), "daily"));
      minute.push(...parseEastMoneyKlines(symbol, await this.fetchKlines(symbol, "minute"), "minute"));
    }

    const quality = inspectMarketDataQuality([...daily, ...minute]);

    return {
      daily,
      minute,
      source: {
        provider: "eastmoney",
        isReal: true,
        updatedAt: toShanghaiIso(this.now()),
        symbols: normalizedSymbols,
        warnings: quality.issues,
        cacheHit: false
      },
      quality
    };
  }

  private async fetchKlines(symbol: string, frequency: MarketDataFrequency): Promise<string[]> {
    const response = JSON.parse(await this.fetcher(buildEastMoneyKlineUrl(symbol, frequency))) as EastMoneyResponse;
    if (response.rc !== 0 || !response.data?.klines?.length) {
      throw new Error(`EastMoney returned no ${frequency} data for ${symbol}`);
    }

    return response.data.klines;
  }
}

export function createCachedMarketDataProvider(options: CachedProviderOptions): MarketDataProvider {
  let latestSnapshot = options.initialSnapshot;
  let latestSnapshotAt = 0;
  const maxAgeMs = options.maxAgeMs ?? 30_000;

  return {
    async getSnapshot(symbols: string[]): Promise<MarketDataSnapshot> {
      if (latestSnapshot && Date.now() - latestSnapshotAt <= maxAgeMs && sameSymbols(latestSnapshot.source.symbols, symbols)) {
        return latestSnapshot;
      }

      try {
        latestSnapshot = await options.provider.getSnapshot(symbols);
        latestSnapshotAt = Date.now();
        if (options.cacheFile) await writeSnapshotCache(options.cacheFile, latestSnapshot);

        return latestSnapshot;
      } catch (error) {
        latestSnapshot = latestSnapshot ?? (options.cacheFile ? await readSnapshotCache(options.cacheFile) : undefined);
        if (latestSnapshot) {
          latestSnapshot = asCachedSnapshot(latestSnapshot, error);
          latestSnapshotAt = Date.now();
          return latestSnapshot;
        }

        const sample = getSampleBars();
        const quality = inspectMarketDataQuality([...sample.daily, ...sample.minute]);
        const warning = `真实数据源不可用，且没有真实数据缓存；当前仅使用样例数据。原因：${errorMessage(error)}`;

        return {
          ...sample,
          source: {
            provider: "sample-fallback",
            isReal: false,
            updatedAt: toShanghaiIso(new Date()),
            symbols,
            warnings: [warning, ...quality.issues],
            cacheHit: false
          },
          quality: { ok: false, issues: [warning, ...quality.issues] }
        };
      }
    }
  };
}

function sameSymbols(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;

  const normalizedLeft = [...left].sort();
  const normalizedRight = [...right].sort();

  return normalizedLeft.every((symbol, index) => symbol === normalizedRight[index]);
}

async function writeSnapshotCache(cacheFile: string, snapshot: MarketDataSnapshot): Promise<void> {
  await mkdir(dirname(cacheFile), { recursive: true });
  await writeFile(cacheFile, JSON.stringify(snapshot), "utf8");
}

async function readSnapshotCache(cacheFile: string): Promise<MarketDataSnapshot | undefined> {
  try {
    return JSON.parse(await readFile(cacheFile, "utf8")) as MarketDataSnapshot;
  } catch {
    return undefined;
  }
}

function asCachedSnapshot(snapshot: MarketDataSnapshot, error?: unknown): MarketDataSnapshot {
  const provider = snapshot.source.provider.endsWith("-cache")
    ? snapshot.source.provider
    : `${snapshot.source.provider}-cache`;
  const warning = `实时数据源不可用，已使用最近一次真实数据缓存。原因：${errorMessage(error)}`;

  return {
    ...snapshot,
    source: {
      ...snapshot.source,
      provider,
      updatedAt: toShanghaiIso(new Date()),
      warnings: ["实时数据源不可用，已使用最近一次真实数据缓存。", warning, ...snapshot.source.warnings],
      cacheHit: true
    }
  };
}

export async function fetchMarketDataSnapshot(
  provider: MarketDataProvider = createCachedMarketDataProvider({ provider: new EastMoneyMarketDataProvider() }),
  symbols: string[] = defaultSymbols
): Promise<MarketDataSnapshot> {
  return provider.getSnapshot(symbols);
}

export function parseEastMoneyKlines(
  symbol: string,
  klines: string[],
  frequency: MarketDataFrequency
): MarketBar[] {
  const bars = klines.map((line) => {
    const [timestamp, open, close, high, low, volume] = line.split(",");

    return {
      symbol,
      timestamp: normalizeTimestamp(timestamp ?? "", frequency),
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: Number(volume),
      fields: {}
    };
  });

  return withIndicators(bars);
}

function buildEastMoneyKlineUrl(symbol: string, frequency: MarketDataFrequency): string {
  const secid = toEastMoneySecid(symbol);
  const klt = frequency === "daily" ? "101" : "1";
  const { begin, end } = dateRangeFor(frequency);
  const fields1 = "f1,f2,f3,f4,f5,f6";
  const fields2 = "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61";

  return `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=${fields1}&fields2=${fields2}&klt=${klt}&fqt=1&beg=${begin}&end=${end}`;
}

function toEastMoneySecid(symbol: string): string {
  const code = symbol.split(".")[0] ?? symbol;
  const market = symbol.endsWith(".SH") || code.startsWith("6") ? "1" : "0";

  return `${market}.${code}`;
}

function dateRangeFor(frequency: MarketDataFrequency): { begin: string; end: string } {
  const end = new Date();
  const begin = new Date(end);
  begin.setDate(end.getDate() - (frequency === "daily" ? 420 : 10));

  return { begin: compactDate(begin), end: compactDate(end) };
}

function compactDate(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  })
    .format(date)
    .replaceAll("/", "");
}

function normalizeTimestamp(value: string, frequency: MarketDataFrequency): string {
  if (frequency === "daily") return `${value}T15:00:00.000+08:00`;

  return `${value.replace(" ", "T")}:00.000+08:00`;
}

function withIndicators(bars: Omit<MarketBar, "fields">[] | MarketBar[]): MarketBar[] {
  return bars.map((bar, index) => {
    const window = bars.slice(Math.max(0, index - 19), index + 1);
    const ma20 = average(window.map((item) => item.close));
    const avgVolume20 = average(window.map((item) => item.volume));
    const rsi14 = calculateRsi(bars, index);

    return {
      ...bar,
      fields: {
        ...("fields" in bar ? bar.fields : {}),
        ma20,
        avgVolume20,
        rsi14
      }
    };
  });
}

function calculateRsi(bars: Omit<MarketBar, "fields">[] | MarketBar[], index: number): number {
  const start = Math.max(1, index - 13);
  let gains = 0;
  let losses = 0;

  for (let cursor = start; cursor <= index; cursor += 1) {
    const change = bars[cursor]!.close - bars[cursor - 1]!.close;
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }

  if (gains === 0 && losses === 0) return 50;
  if (losses === 0) return 100;

  return round2(100 - 100 / (1 + gains / losses));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;

  return round4(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function toShanghaiIso(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";

  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}:${value(
    "second"
  )}.000+08:00`;
}

async function defaultFetcher(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = get(
      url,
      {
        family: 4,
        headers: {
          "User-Agent": "Mozilla/5.0 iTrade Virtual Desk"
        },
        timeout: 15000
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`market data request failed: ${response.statusCode} ${body.slice(0, 120)}`));
            return;
          }

          resolve(body);
        });
      }
    );
    request.on("timeout", () => request.destroy(new Error("market data request timed out")));
    request.on("error", reject);
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "未知错误";
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
