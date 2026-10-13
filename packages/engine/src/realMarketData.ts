import type { MarketBar } from "@itrade/domain";
import { get } from "node:https";
import { getSampleBars, inspectMarketDataQuality, type DataQualityResult, type MarketDataSet } from "./marketData";
import {
  average,
  delay,
  errorMessage,
  normalizeSymbol,
  normalizeSymbols,
  readJsonCache,
  round2,
  round4,
  toEastMoneySecid,
  toIso,
  toSinaSymbol,
  toTencentSymbol,
  writeJsonCache
} from "./utils";

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

interface TencentQuoteProviderOptions {
  fetcher?: Fetcher;
  now?: () => Date;
}

interface TencentKlineProviderOptions {
  fetcher?: Fetcher;
  now?: () => Date;
}

interface SinaProviderOptions {
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

interface TencentKlineResponse {
  code: number;
  data?: Record<string, { qfqday?: string[][] }>;
}

const defaultSymbols = ["000001.SZ", "600000.SH"];

/**
 * 东方财富全量行情接口返回的单只股票数据
 */
interface EastMoneyBulkQuote {
  f2: number;   // 最新价
  f3: number;   // 涨跌幅 (%)
  f4: number;   // 涨跌额
  f5: number;   // 成交量（手）
  f6: number;   // 成交额（元）
  f7: number;   // 振幅 (%)
  f8: number;   // 换手率 (%)
  f12: string;  // 代码
  f13: number;  // 市场 (0=深圳, 1=上海)
  f14: string;  // 名称
  f15: number;  // 最高
  f16: number;  // 最低
  f17: number;  // 今开
}

interface EastMoneyBulkResponse {
  rc: number;
  data?: {
    total?: number;
    diff?: EastMoneyBulkQuote[];
  };
}

/**
 * 全市场筛选配置
 */
export interface MarketScreeningOptions {
  /** 最小涨跌幅 (%)，默认 -3 */
  minChangePct?: number;
  /** 最大涨跌幅 (%)，默认 9.5（过滤涨停） */
  maxChangePct?: number;
  /** 最小换手率 (%)，默认 0.5 */
  minTurnoverRate?: number;
  /** 最小成交额（万元），默认 5000 */
  minAmount?: number;
  /** 粗筛后获取详细 K 线的最大股票数，默认 300 */
  maxCandidates?: number;
  fetcher?: Fetcher;
  now?: () => Date;
}

/**
 * 获取沪深主板全部 A 股代码列表
 * 多源降级：东方财富 → 沪深交易所 → 腾讯验证
 */
export async function fetchAllAShareSymbols(fetcher: Fetcher = defaultFetcher): Promise<string[]> {
  // 尝试东方财富
  try {
    return await fetchAllAShareSymbolsFromEastMoney(fetcher);
  } catch {
    // 降级到沪深交易所 API
  }

  // 尝试沪深交易所官方 API
  try {
    return await fetchAllAShareSymbolsFromExchanges(fetcher);
  } catch {
    // 降级到已知代码范围生成
  }

  // 最后降级：从已知代码范围生成候选列表，用腾讯行情验证
  return fetchAllAShareSymbolsFromRanges(fetcher);
}

async function fetchAllAShareSymbolsFromEastMoney(fetcher: Fetcher): Promise<string[]> {
  const fs = "m:0+t:6,m:1+t:2";
  const url = `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=5000&po=1&np=1&fltt=2&invt=2&fid=f3&fs=${fs}&fields=f12,f13,f14`;
  const body = await fetcher(url);
  const response = JSON.parse(body) as EastMoneyBulkResponse;

  if (response.rc !== 0 || !response.data?.diff?.length) {
    throw new Error("EastMoney bulk symbol list returned no data");
  }

  return response.data.diff
    .map((item) => {
      const code = String(item.f12).padStart(6, "0");
      const suffix = item.f13 === 1 ? "SH" : "SZ";
      return `${code}.${suffix}`;
    })
    .filter((symbol) => !symbol.startsWith("000000"));
}

async function fetchAllAShareSymbolsFromExchanges(fetcher: Fetcher): Promise<string[]> {
  const symbols: string[] = [];

  // 上交所 A 股列表
  try {
    const sseUrl = "https://query.sse.com.cn/commonQuery.do?jsonCallBack=cb&isPagination=false&sqlId=COMMON_SSE_CP_GPJCTPZ_GPLB_GP_L&stat=A";
    const body = await fetchWithReferer(fetcher, sseUrl, "http://www.sse.com.cn");
    const jsonStr = body.replace(/^cb\(/, "").replace(/\);?\s*$/, "");
    const data = JSON.parse(jsonStr) as { result?: Array<{ SECURITY_CODE?: string }> };
    if (data.result?.length) {
      for (const item of data.result) {
        const code = String(item.SECURITY_CODE ?? "").padStart(6, "0");
        if (code.length === 6 && code !== "000000") {
          symbols.push(`${code}.SH`);
        }
      }
    }
  } catch {
    // 上交所 API 不可用
  }

  // 深交所 A 股列表
  try {
    let pageNo = 1;
    while (pageNo <= 10) {
      const szseUrl = `https://www.szse.cn/api/report/ShowReport/data?SHOWTYPE=JSON&CATALOGID=1110&TABKEY=tab1&PAGENO=${pageNo}&random=0.${Date.now()}`;
      const body = await fetcher(szseUrl);
      const data = JSON.parse(body) as Array<{ data?: Array<{ sjm?: string; gqdm?: string }> }>;
      const rows = data?.[0]?.data ?? [];
      if (rows.length === 0) break;
      for (const row of rows) {
        const code = String(row.gqdm ?? row.sjm ?? "").padStart(6, "0");
        if (code.length === 6 && code !== "000000") {
          symbols.push(`${code}.SZ`);
        }
      }
      pageNo++;
    }
  } catch {
    // 深交所 API 不可用
  }

  if (symbols.length < 100) {
    throw new Error(`交易所 API 返回数据不足：${symbols.length} 只`);
  }

  return [...new Set(symbols)];
}

/**
 * 从已知代码范围生成候选列表，用腾讯行情验证哪些是有效的
 */
async function fetchAllAShareSymbolsFromRanges(fetcher: Fetcher): Promise<string[]> {
  // 沪市主板: 600000-609999, 深市主板: 000001-004999
  const candidates: string[] = [];
  for (let i = 600000; i <= 605999; i++) candidates.push(`${i}.SH`);
  for (let i = 0; i <= 4999; i++) candidates.push(`${String(i).padStart(6, "0")}.SZ`);

  // 用腾讯行情批量验证（每批 500）
  const valid: string[] = [];
  const batchSize = 500;
  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    try {
      const body = await fetcher(buildTencentQuoteUrl(batch));
      for (const symbol of batch) {
        const tencentKey = toTencentSymbolLookup(symbol);
        const pattern = `v_${tencentKey}="`;
        if (body.includes(pattern)) {
          const lineStart = body.indexOf(pattern);
          const lineEnd = body.indexOf('";', lineStart);
          if (lineEnd > lineStart) {
            const data = body.slice(lineStart + pattern.length, lineEnd);
            // 有效股票有实际数据（至少包含名称和价格）
            const parts = data.split("~");
            if (parts.length > 3 && parts[1] && Number(parts[3]) > 0) {
              valid.push(symbol);
            }
          }
        }
      }
    } catch {
      // 跳过失败的批次
    }
    // 避免请求过快
    if (i + batchSize < candidates.length) await delay(200);
  }

  if (valid.length < 100) {
    throw new Error(`代码范围验证返回数据不足：${valid.length} 只`);
  }

  return valid;
}

function toTencentSymbolLookup(symbol: string): string {
  const code = symbol.split(".")[0] ?? symbol;
  const market = symbol.endsWith(".SH") || code.startsWith("6") ? "sh" : "sz";
  return `${market}${code}`;
}

function fetchWithReferer(fetcher: Fetcher, url: string, referer: string): Promise<string> {
  // 使用自定义 fetcher 需要包装，但 defaultFetcher 不支持自定义 headers
  // 这里用 node:https 直接请求
  return new Promise((resolve, reject) => {
    const request = get(url, { headers: { Referer: referer, "User-Agent": "Mozilla/5.0" }, timeout: 10000 }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
    request.on("error", reject);
    request.on("timeout", () => request.destroy(new Error("timeout")));
  });
}

/**
 * 批量获取全市场实时行情（单次请求）
 */
export async function fetchBulkQuotes(
  fetcher: Fetcher = defaultFetcher
): Promise<EastMoneyBulkQuote[]> {
  const fs = "m:0+t:6,m:1+t:2";
  const fields = "f2,f3,f4,f5,f6,f7,f8,f12,f13,f14,f15,f16,f17";
  const url = `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=5000&po=1&np=1&fltt=2&invt=2&fid=f3&fs=${fs}&fields=${fields}`;
  const body = await fetcher(url);
  const response = JSON.parse(body) as EastMoneyBulkResponse;

  if (response.rc !== 0 || !response.data?.diff?.length) {
    throw new Error("EastMoney bulk quotes returned no data");
  }

  return response.data.diff;
}

function quoteToSymbol(quote: EastMoneyBulkQuote): string {
  const code = String(quote.f12).padStart(6, "0");
  const suffix = quote.f13 === 1 ? "SH" : "SZ";
  return `${code}.${suffix}`;
}

/**
 * 将全量行情快照转换为 MarketBar（粗筛用，无历史数据）
 */
/**
 * 通过腾讯行情接口批量获取全市场行情（分批请求）
 * 将腾讯行情格式转换为 EastMoneyBulkQuote 格式以复用下游逻辑
 */
async function fetchBulkQuotesFromTencent(
  fetcher: Fetcher,
  symbols: string[]
): Promise<EastMoneyBulkQuote[]> {
  const results: EastMoneyBulkQuote[] = [];
  const batchSize = 500;

  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    try {
      const body = await fetcher(buildTencentQuoteUrl(batch));
      for (const symbol of batch) {
        const tencentKey = toTencentSymbolLookup(symbol);
        const pattern = `v_${tencentKey}="`;
        const lineStart = body.indexOf(pattern);
        if (lineStart < 0) continue;
        const lineEnd = body.indexOf('";', lineStart);
        if (lineEnd < 0) continue;
        const data = body.slice(lineStart + pattern.length, lineEnd);
        const parts = data.split("~");
        if (parts.length < 35) continue;

        const close = Number(parts[3]);
        const open = Number(parts[5]);
        const high = Number(parts[33]);
        const low = Number(parts[34]);
        const volume = Number(parts[36] ?? parts[6]);
        const prevClose = Number(parts[4]);
        const amount = Number(parts[37] ?? parts[6]);

        if (!isFinite(close) || close <= 0) continue;

        const code = symbol.split(".")[0] ?? symbol;
        const market = symbol.endsWith(".SH") ? 1 : 0;
        const changePct = prevClose > 0 ? ((close - prevClose) / prevClose) * 100 : 0;
        const turnoverRate = 0; // 腾讯行情不直接提供换手率

        results.push({
          f2: close,
          f3: changePct,
          f4: close - prevClose,
          f5: isFinite(volume) && volume > 0 ? volume : 1,
          f6: isFinite(amount) && amount > 0 ? amount : 0,
          f7: high > 0 && low > 0 ? ((high - low) / prevClose) * 100 : 0,
          f8: turnoverRate,
          f12: code,
          f13: market,
          f14: parts[1] ?? "",
          f15: isFinite(high) && high > 0 ? high : close,
          f16: isFinite(low) && low > 0 ? low : close,
          f17: isFinite(open) && open > 0 ? open : close
        });
      }
    } catch {
      // 跳过失败的批次
    }
    if (i + batchSize < symbols.length) await delay(200);
  }

  return results;
}

function quoteToDailyBar(quote: EastMoneyBulkQuote): MarketBar {
  const symbol = quoteToSymbol(quote);
  const today = new Date();
  const dateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(today);

  return {
    symbol,
    timestamp: `${dateStr}T15:00:00.000+08:00`,
    open: quote.f17,
    high: quote.f15,
    low: quote.f16,
    close: quote.f2,
    volume: quote.f5,
    fields: {
      ma20: quote.f2,
      avgVolume20: quote.f5,
      rsi14: 50,
      turnoverRate: quote.f8 / 100
    }
  };
}

/**
 * 粗筛：从全量行情中筛选候选股票
 */
function coarseScreen(quotes: EastMoneyBulkQuote[], options: MarketScreeningOptions): EastMoneyBulkQuote[] {
  const minChangePct = options.minChangePct ?? -3;
  const maxChangePct = options.maxChangePct ?? 9.5;
  const minTurnoverRate = options.minTurnoverRate ?? 0.5;
  const minAmount = options.minAmount ?? 5000; // 万元

  return quotes.filter((quote) => {
    // 过滤无效数据
    if (!quote.f2 || quote.f2 <= 0) return false;
    if (!quote.f5 || quote.f5 <= 0) return false;
    // 过滤 ST 股票（名称包含 ST）
    if (quote.f14 && (quote.f14.includes("ST") || quote.f14.includes("st"))) return false;
    // 涨跌幅过滤
    if (quote.f3 < minChangePct || quote.f3 > maxChangePct) return false;
    // 换手率过滤
    if (quote.f8 < minTurnoverRate) return false;
    // 成交额过滤（f6 是元，转换为万元）
    if (quote.f6 / 10000 < minAmount) return false;
    return true;
  });
}

/**
 * 两轮筛选：先粗筛再精筛，返回完整的 MarketDataSnapshot
 *
 * 第一轮：全量行情粗筛（涨跌幅、换手率、成交额）
 * 第二轮：对候选股获取日线 K 线，计算技术指标后精筛
 */
export async function fetchMarketScreeningSnapshot(
  options: MarketScreeningOptions = {}
): Promise<MarketDataSnapshot> {
  const fetcher = options.fetcher ?? defaultFetcher;
  const nowFn = options.now ?? (() => new Date());
  const maxCandidates = options.maxCandidates ?? 300;

  // 第一轮：获取全量行情并粗筛
  // 先尝试东方财富全量接口，失败则降级到腾讯分批获取
  let allQuotes: EastMoneyBulkQuote[] = [];
  let dataSource = "eastmoney-bulk";

  try {
    allQuotes = await fetchBulkQuotes(fetcher);
  } catch (emError) {
    // 东方财富不可用，降级到腾讯
    try {
      const symbols = await fetchAllAShareSymbols(fetcher);
      allQuotes = await fetchBulkQuotesFromTencent(fetcher, symbols);
      dataSource = "tencent-bulk";
    } catch (txError) {
      throw new Error(`全量行情获取失败：东方财富(${errorMessage(emError)})；腾讯(${errorMessage(txError)})`);
    }
  }

  const coarseCandidates = coarseScreen(allQuotes, options);

  // 按涨跌幅+换手率排序，取前 N 只
  const sorted = coarseCandidates
    .sort((a, b) => {
      const scoreA = a.f3 * 0.6 + a.f8 * 0.4;
      const scoreB = b.f3 * 0.6 + b.f8 * 0.4;
      return scoreB - scoreA;
    })
    .slice(0, maxCandidates);

  const candidateSymbols = sorted.map(quoteToSymbol);

  // 间隔一下再请求第二轮，避免连续请求被限流
  await delay(500);

  // 第二轮：对候选股获取详细日线 K 线
  // 尝试东方财富 → 腾讯K线 → 粗筛数据降级
  let daily: MarketBar[] = [];
  let minute: MarketBar[] = [];
  const warnings: string[] = [];

  if (candidateSymbols.length > 0) {
    // 尝试东方财富详细 K 线
    const eastMoneyProvider = new EastMoneyMarketDataProvider({ fetcher, now: nowFn });
    try {
      const detailSnapshot = await eastMoneyProvider.getSnapshot(candidateSymbols);
      daily = detailSnapshot.daily;
      minute = detailSnapshot.minute;
      warnings.push(...detailSnapshot.source.warnings);
    } catch (emError) {
      warnings.push(`东方财富详细 K 线不可用：${errorMessage(emError)}`);
      // 降级到腾讯 K 线
      try {
        const tencentProvider = new TencentKlineMarketDataProvider({ fetcher, now: nowFn });
        const tencentSnapshot = await tencentProvider.getSnapshot(candidateSymbols);
        daily = tencentSnapshot.daily;
        minute = tencentSnapshot.minute;
        warnings.push("已降级到腾讯 K 线数据源");
      } catch (txError) {
        warnings.push(`腾讯 K 线也不可用：${errorMessage(txError)}，使用粗筛快照数据`);
        daily = sorted.map(quoteToDailyBar);
      }
    }
  }

  // 补充粗筛中未获取到 K 线的股票
  const detailedSymbols = new Set(daily.map((bar) => bar.symbol));
  for (const quote of sorted) {
    const symbol = quoteToSymbol(quote);
    if (!detailedSymbols.has(symbol)) {
      daily.push(quoteToDailyBar(quote));
    }
  }

  const allBars = [...daily, ...minute];
  const quality = inspectMarketDataQuality(allBars);

  return {
    daily,
    minute,
    source: {
      provider: dataSource,
      isReal: true,
      updatedAt: toShanghaiIso(nowFn()),
      symbols: candidateSymbols,
      warnings: [...warnings, ...quality.issues],
      cacheHit: false
    },
    quality
  };
}

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

    const symbolResults = await Promise.all(
      normalizedSymbols.map(async (symbol) => {
        const [dailyBody, minuteBody] = await Promise.all([
          this.fetchKlines(symbol, "daily"),
          this.fetchKlines(symbol, "minute")
        ]);
        return {
          daily: parseEastMoneyKlines(symbol, dailyBody, "daily"),
          minute: parseEastMoneyKlines(symbol, minuteBody, "minute")
        };
      })
    );
    for (const result of symbolResults) {
      daily.push(...result.daily);
      minute.push(...result.minute);
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

export class TencentQuoteMarketDataProvider implements MarketDataProvider {
  private readonly fetcher: Fetcher;
  private readonly now: () => Date;

  constructor(options: TencentQuoteProviderOptions = {}) {
    this.fetcher = options.fetcher ?? defaultFetcher;
    this.now = options.now ?? (() => new Date());
  }

  async getSnapshot(symbols: string[] = defaultSymbols): Promise<MarketDataSnapshot> {
    const normalizedSymbols = symbols.length > 0 ? symbols : defaultSymbols;
    const quotes = parseTencentQuotes(await this.fetcher(buildTencentQuoteUrl(normalizedSymbols)), normalizedSymbols);
    const daily = withIndicators(quotes.map((quote) => quote.daily));
    const minute = withIndicators(quotes.map((quote) => quote.minute));
    const quality = inspectMarketDataQuality([...daily, ...minute]);
    const warning = "腾讯实时行情备援已启用；该来源提供实时盘口报价，不提供完整历史 K 线深度。";

    return {
      daily,
      minute,
      source: {
        provider: "tencent-quote",
        isReal: true,
        updatedAt: toShanghaiIso(this.now()),
        symbols: normalizedSymbols,
        warnings: quality.ok ? [warning] : [warning, ...quality.issues],
        cacheHit: false
      },
      quality
    };
  }
}

export class TencentKlineMarketDataProvider implements MarketDataProvider {
  private readonly fetcher: Fetcher;
  private readonly now: () => Date;

  constructor(options: TencentKlineProviderOptions = {}) {
    this.fetcher = options.fetcher ?? defaultFetcher;
    this.now = options.now ?? (() => new Date());
  }

  async getSnapshot(symbols: string[] = defaultSymbols): Promise<MarketDataSnapshot> {
    const normalizedSymbols = symbols.length > 0 ? symbols : defaultSymbols;
    const daily: MarketBar[] = [];

    const dailyResults = await Promise.all(
      normalizedSymbols.map(async (symbol) => parseTencentDailyKlines(symbol, await this.fetchDailyKlines(symbol)))
    );
    for (const bars of dailyResults) {
      daily.push(...bars);
    }

    const quotes = parseTencentQuotes(await this.fetcher(buildTencentQuoteUrl(normalizedSymbols)), normalizedSymbols);
    const minute = withIndicators(quotes.map((quote) => quote.minute));
    const quality = inspectMarketDataQuality([...daily, ...minute]);
    const warning = "腾讯 K 线备援已启用；日线来自腾讯真实 K 线，分钟级使用实时盘口快照。";

    return {
      daily,
      minute,
      source: {
        provider: "tencent-kline",
        isReal: true,
        updatedAt: toShanghaiIso(this.now()),
        symbols: normalizedSymbols,
        warnings: quality.ok ? [warning] : [warning, ...quality.issues],
        cacheHit: false
      },
      quality
    };
  }

  private async fetchDailyKlines(symbol: string): Promise<string[][]> {
    const response = JSON.parse(await this.fetcher(buildTencentDailyKlineUrl(symbol))) as TencentKlineResponse;
    const rows = response.data?.[toTencentSymbol(symbol)]?.qfqday;
    if (response.code !== 0 || !rows?.length) {
      throw new Error(`Tencent kline returned no daily data for ${symbol}`);
    }

    return rows;
  }
}

/**
 * 新浪财经行情 Provider
 * 实时行情：hq.sinajs.cn 批量获取
 * 日线 K 线：quotes.sina.cn 逐只获取
 */
export class SinaMarketDataProvider implements MarketDataProvider {
  private readonly fetcher: Fetcher;
  private readonly now: () => Date;

  constructor(options: SinaProviderOptions = {}) {
    this.fetcher = options.fetcher ?? defaultFetcher;
    this.now = options.now ?? (() => new Date());
  }

  async getSnapshot(symbols: string[] = defaultSymbols): Promise<MarketDataSnapshot> {
    const normalizedSymbols = symbols.length > 0 ? symbols : defaultSymbols;
    const daily: MarketBar[] = [];
    const minute: MarketBar[] = [];

    // 批量获取实时行情（每批 800 只）
    const batchSize = 800;
    for (let i = 0; i < normalizedSymbols.length; i += batchSize) {
      const batch = normalizedSymbols.slice(i, i + batchSize);
      const quotes = parseSinaQuotes(await this.fetcher(buildSinaQuoteUrl(batch)), batch, this.now);
      for (const quote of quotes) {
        daily.push(quote.daily);
        minute.push(quote.minute);
      }
    }

    // 并行获取日线 K 线（覆盖实时快照的 daily 数据）
    const sinaKlineResults = await Promise.all(
      normalizedSymbols.map(async (symbol) => {
        try {
          const klines = await this.fetchDailyKlines(symbol);
          return { symbol, bars: parseSinaDailyKlines(symbol, klines) };
        } catch {
          return { symbol, bars: [] as MarketBar[] };
        }
      })
    );
    for (const { symbol, bars } of sinaKlineResults) {
      if (bars.length > 0) {
        const existingIdx = daily.findIndex((bar) => bar.symbol === symbol);
        if (existingIdx >= 0) {
          daily.splice(existingIdx, 1);
        }
        daily.push(...bars);
      }
    }

    const quality = inspectMarketDataQuality([...daily, ...minute]);
    const warning = "新浪行情备援已启用；日线来自新浪 K 线，分钟级使用实时盘口快照。";

    return {
      daily,
      minute,
      source: {
        provider: "sina",
        isReal: true,
        updatedAt: toShanghaiIso(this.now()),
        symbols: normalizedSymbols,
        warnings: quality.ok ? [warning] : [warning, ...quality.issues],
        cacheHit: false
      },
      quality
    };
  }

  private async fetchDailyKlines(symbol: string): Promise<SinaKlineItem[]> {
    const url = buildSinaDailyKlineUrl(symbol);
    const body = await this.fetcher(url);
    return parseSinaKlineJsonp(body);
  }
}

// ── Sina Finance helpers ──

function buildSinaQuoteUrl(symbols: string[]): string {
  const sinaSymbols = symbols.map(toSinaSymbol).join(",");
  return `https://hq.sinajs.cn/list=${sinaSymbols}`;
}

interface SinaQuotePair {
  daily: MarketBar;
  minute: MarketBar;
}

function parseSinaQuotes(body: string, requestedSymbols: string[], nowFn: () => Date): SinaQuotePair[] {
  const results: SinaQuotePair[] = [];
  const lines = body.split("\n");

  for (const symbol of requestedSymbols) {
    const sinaKey = toSinaSymbol(symbol);
    const pattern = `var hq_str_${sinaKey}="`;
    const line = lines.find((l) => l.startsWith(pattern));
    if (!line) continue;

    const dataStr = line.slice(pattern.length, line.lastIndexOf('"'));
    if (!dataStr) continue;

    const parts = dataStr.split(",");
    if (parts.length < 32) continue;

    try {
      const open = Number(parts[1]);
      const previousClose = Number(parts[2]);
      const close = Number(parts[3]);
      const high = Number(parts[4]);
      const low = Number(parts[5]);
      const volume = Number(parts[8]); // 成交量（股）
      const dateStr = parts[30] ?? "";

      if (!isFinite(close) || close <= 0) continue;

      const timestamp = dateStr ? `${dateStr}T15:00:00.000+08:00` : toShanghaiIso(nowFn());

      results.push({
        daily: {
          symbol,
          timestamp,
          open: isFinite(open) && open > 0 ? open : close,
          high: isFinite(high) && high > 0 ? Math.max(high, open, close, previousClose) : close,
          low: isFinite(low) && low > 0 ? Math.min(low, open, close, previousClose) : close,
          close,
          volume: isFinite(volume) && volume > 0 ? volume : 1,
          fields: {}
        },
        minute: {
          symbol,
          timestamp: toShanghaiIso(nowFn()),
          open: isFinite(open) && open > 0 ? open : close,
          high: isFinite(high) && high > 0 ? Math.max(high, open, close) : close,
          low: isFinite(low) && low > 0 ? Math.min(low, open, close) : close,
          close,
          volume: isFinite(volume) && volume > 0 ? volume : 1,
          fields: {}
        }
      });
    } catch {
      // skip malformed entry
    }
  }

  return results.map((pair) => ({
    daily: withIndicators([pair.daily])[0]!,
    minute: withIndicators([pair.minute])[0]!
  }));
}

interface SinaKlineItem {
  day: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

function buildSinaDailyKlineUrl(symbol: string): string {
  const sinaSymbol = toSinaSymbol(symbol);
  return `https://quotes.sina.cn/cn/api/jsonp_v2.php/var/CN_MarketDataService.getKLineData?symbol=${sinaSymbol}&scale=240&ma=no&datalen=120`;
}

function parseSinaKlineJsonp(body: string): SinaKlineItem[] {
  // JSONP format: var=([{day:"2026-01-01",open:"10.00",...},...])
  const match = /=\((\[.*\])\)/s.exec(body);
  if (!match?.[1]) return [];

  try {
    return JSON.parse(match[1]) as SinaKlineItem[];
  } catch {
    return [];
  }
}

function parseSinaDailyKlines(symbol: string, klines: SinaKlineItem[]): MarketBar[] {
  const bars = klines
    .filter((k) => k.day && k.close && Number(k.close) > 0)
    .map((k) => ({
      symbol,
      timestamp: `${k.day}T15:00:00.000+08:00`,
      open: Number(k.open),
      high: Number(k.high),
      low: Number(k.low),
      close: Number(k.close),
      volume: Number(k.volume),
      fields: {}
    }));

  return withIndicators(bars);
}

export function createFallbackMarketDataProvider(providers: MarketDataProvider[]): MarketDataProvider {
  return {
    async getSnapshot(symbols: string[]): Promise<MarketDataSnapshot> {
      const errors: string[] = [];

      for (const provider of providers) {
        try {
          const snapshot = await provider.getSnapshot(symbols);
          return {
            ...snapshot,
            source: {
              ...snapshot.source,
              warnings: [...errors, ...snapshot.source.warnings]
            }
          };
        } catch (error) {
          errors.push(`${providerName(provider)} 不可用：${errorMessage(error)}`);
        }
      }

      throw new Error(errors.join("; ") || "all market data providers unavailable");
    }
  };
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
        if (options.cacheFile) await writeJsonCache(options.cacheFile, latestSnapshot);

        return latestSnapshot;
      } catch (error) {
        latestSnapshot = latestSnapshot ?? (options.cacheFile ? await readJsonCache(options.cacheFile) : undefined);
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

function providerName(provider: MarketDataProvider): string {
  if (provider instanceof EastMoneyMarketDataProvider) return "eastmoney";
  if (provider instanceof SinaMarketDataProvider) return "sina";
  if (provider instanceof TencentKlineMarketDataProvider) return "tencent-kline";
  if (provider instanceof TencentQuoteMarketDataProvider) return "tencent-quote";
  return provider.constructor.name || "market-data-provider";
}

function sameSymbols(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;

  const normalizedLeft = [...left].sort();
  const normalizedRight = [...right].sort();

  return normalizedLeft.every((symbol, index) => symbol === normalizedRight[index]);
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

function buildTencentQuoteUrl(symbols: string[]): string {
  const query = symbols.map(toTencentSymbol).join(",");

  return `https://qt.gtimg.cn/q=${query}`;
}

function buildTencentDailyKlineUrl(symbol: string): string {
  return `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${toTencentSymbol(symbol)},day,,,120,qfq`;
}


function parseTencentQuotes(
  body: string,
  requestedSymbols: string[]
): Array<{ daily: MarketBar; minute: MarketBar }> {
  return requestedSymbols.map((symbol) => {
    const quoteKey = toTencentSymbol(symbol);
    const match = new RegExp(`v_${quoteKey}="([^"]+)"`).exec(body);
    if (!match?.[1]) throw new Error(`Tencent quote returned no data for ${symbol}`);

    return tencentQuoteToBars(symbol, match[1].split("~"));
  });
}

function parseTencentDailyKlines(symbol: string, rows: string[][]): MarketBar[] {
  return withIndicators(
    rows.map((row) => {
      const [date, open, close, high, low, volume] = row;

      return {
        symbol,
        timestamp: `${date}T15:00:00.000+08:00`,
        open: Number(open),
        high: Number(high),
        low: Number(low),
        close: Number(close),
        volume: Number(volume),
        fields: {}
      };
    })
  );
}

function tencentQuoteToBars(symbol: string, parts: string[]): { daily: MarketBar; minute: MarketBar } {
  const close = positiveNumber(parts[3], `Tencent quote missing current price for ${symbol}`);
  const previousClose = positiveNumber(parts[4], `Tencent quote missing previous close for ${symbol}`);
  const open = positiveNumber(parts[5], `Tencent quote missing open for ${symbol}`);
  const high = positiveNumber(parts[33], `Tencent quote missing high for ${symbol}`);
  const low = positiveNumber(parts[34], `Tencent quote missing low for ${symbol}`);
  const volume = Math.max(positiveNumber(parts[36] ?? parts[6], `Tencent quote missing volume for ${symbol}`), 1);
  const timestamp = normalizeTencentTimestamp(parts[30] ?? "");

  const daily: MarketBar = {
    symbol,
    timestamp: `${timestamp.slice(0, 10)}T15:00:00.000+08:00`,
    open,
    high: Math.max(high, open, close, previousClose),
    low: Math.min(low, open, close, previousClose),
    close,
    volume,
    fields: {}
  };
  const minute: MarketBar = {
    symbol,
    timestamp,
    open,
    high: Math.max(high, open, close),
    low: Math.min(low, open, close),
    close,
    volume,
    fields: {}
  };

  return { daily, minute };
}

function normalizeTencentTimestamp(value: string): string {
  if (!/^\d{14}$/.test(value)) return toShanghaiIso(new Date());

  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(8, 10)}:${value.slice(
    10,
    12
  )}:${value.slice(12, 14)}.000+08:00`;
}

function positiveNumber(value: string | undefined, message: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(message);

  return parsed;
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
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const request = get(
      url,
      {
        family: 4,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept: "*/*",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
          Connection: "keep-alive"
        },
        timeout: 20000
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          done(() => {
            const body = Buffer.concat(chunks).toString("utf8");
            if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
              reject(new Error(`market data request failed: ${response.statusCode} ${body.slice(0, 120)}`));
              return;
            }
            resolve(body);
          });
        });
        response.on("error", (err) => done(() => reject(err)));
      }
    );
    request.on("timeout", () => done(() => request.destroy(new Error("market data request timed out"))));
    request.on("error", (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      done(() => reject(new Error(`market data request error: ${msg}`)));
    });
    request.on("close", () => done(() => reject(new Error("market data request connection closed"))));
  });
}

