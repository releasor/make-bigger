import type {
  ExternalIntelAvailability,
  ExternalIntelItem,
  ExternalIntelSource,
  ExternalIntelStatus
} from "@itrade/domain";
import { get } from "node:https";
import {
  buildExternalIntelStatus,
  getExternalIntelSourceLabel,
  type ExternalIntelProvider,
  type ExternalIntelRequestOptions,
  type ExternalIntelSnapshot
} from "./externalIntel";
import {
  average,
  errorMessage,
  latestTimestamp as latestTimestampRaw,
  normalizeSymbol,
  normalizeSymbols,
  round2,
  symbolCode,
  toIso,
  toTencentSymbol
} from "./utils";

export type ExternalIntelFetcher = (url: string) => Promise<string>;

interface EastMoneyExternalIntelProviderOptions {
  fetcher?: ExternalIntelFetcher;
}

interface SourceResult {
  source: ExternalIntelSource;
  provider: string;
  items: ExternalIntelItem[];
  status: ExternalIntelAvailability;
  message: string;
  warning?: string;
}

const providerBySource: Record<ExternalIntelSource, string> = {
  dragon_tiger: "eastmoney-dragon-tiger",
  announcement: "eastmoney-announcement",
  news: "eastmoney-news",
  theme: "eastmoney-theme"
};

const tencentThemeFallbackProvider = "tencent-sector-rotation";

export class EastMoneyExternalIntelProvider implements ExternalIntelProvider {
  private readonly fetcher: ExternalIntelFetcher;

  constructor(options: EastMoneyExternalIntelProviderOptions = {}) {
    this.fetcher = options.fetcher ?? defaultFetcher;
  }

  async getSnapshot(symbols: string[], options: ExternalIntelRequestOptions = {}): Promise<ExternalIntelSnapshot> {
    const normalizedSymbols = normalizeSymbols(symbols);
    const updatedAt = toIso(options.now?.() ?? new Date());
    const results = await Promise.all([
      this.fetchSource("dragon_tiger", () => this.fetchDragonTiger(normalizedSymbols)),
      this.fetchSource("announcement", () => this.fetchAnnouncements(normalizedSymbols)),
      this.fetchSource("news", () => this.fetchNews(normalizedSymbols)),
      this.fetchThemeSource(normalizedSymbols)
    ]);

    return {
      items: results.flatMap((result) => result.items),
      statuses: results.map((result) =>
        buildExternalIntelStatus({
          source: result.source,
          provider: result.provider,
          status: result.status,
          itemCount: result.items.length,
          updatedAt,
          message: result.message
        })
      ),
      warnings: results.flatMap((result) => (result.warning ? [result.warning] : [])),
      updatedAt
    };
  }

  describe(): ExternalIntelStatus[] {
    return (Object.keys(providerBySource) as ExternalIntelSource[]).map((source) =>
      buildExternalIntelStatus({
        source,
        provider: providerBySource[source],
        status: "not_configured",
        itemCount: 0,
        message: `${getExternalIntelSourceLabel(source)} public source is available when public data is enabled.`
      })
    );
  }

  private async fetchSource(
    source: ExternalIntelSource,
    loader: () => Promise<ExternalIntelItem[]>
  ): Promise<SourceResult> {
    const defaultProvider = providerBySource[source];

    try {
      const items = await loader();
      const provider = items[0]?.provider ?? defaultProvider;
      return {
        source,
        provider,
        items,
        status: items.length > 0 ? "available" : "empty",
        message:
          items.length > 0
            ? `${getExternalIntelSourceLabel(source)} public source returned ${items.length} real item(s).`
            : `${getExternalIntelSourceLabel(source)} public source returned no relevant rows.`
      };
    } catch (error) {
      return {
        source,
        provider: defaultProvider,
        items: [],
        status: "unavailable",
        message: `${getExternalIntelSourceLabel(source)} public source is unavailable: ${errorMessage(error)}`,
        warning: `${defaultProvider}: ${errorMessage(error)}`
      };
    }
  }

  private async fetchThemeSource(symbols: string[]): Promise<SourceResult> {
    return this.fetchSource("theme", () => this.fetchThemes(symbols));
  }

  private async fetchDragonTiger(symbols: string[]): Promise<ExternalIntelItem[]> {
    const body = parseJson(await this.fetcher(buildDragonTigerUrl()));
    const rows = arrayAt(body, ["result", "data"]);

    return rows
      .map((row) => parseDragonTigerRow(row))
      .filter((item): item is ExternalIntelItem => Boolean(item))
      .filter((item) => matchesSymbols(item.relatedSymbols, symbols));
  }

  private async fetchAnnouncements(symbols: string[]): Promise<ExternalIntelItem[]> {
    const body = parseJson(await this.fetcher(buildAnnouncementUrl()));
    const rows = arrayAt(body, ["data", "list"]);

    return rows
      .map((row) => parseAnnouncementRow(row))
      .filter((item): item is ExternalIntelItem => Boolean(item))
      .filter((item) => matchesSymbols(item.relatedSymbols, symbols));
  }

  private async fetchNews(symbols: string[]): Promise<ExternalIntelItem[]> {
    const body = parseJsonp(await this.fetcher(buildNewsUrl(symbols)));
    const rows = arrayAt(body, ["result", "cmsArticleWebOld"]);

    return rows
      .map((row) => parseNewsRow(row, symbols))
      .filter((item): item is ExternalIntelItem => Boolean(item))
      .filter((item) => matchesSymbols(item.relatedSymbols, symbols));
  }

  private async fetchThemes(symbols: string[]): Promise<ExternalIntelItem[]> {
    let body: unknown;
    try {
      body = parseJson(await this.fetcher(buildThemeUrl()));
    } catch (error) {
      return this.fetchTencentThemeFallback(symbols, error);
    }
    const rows = arrayAt(body, ["data", "diff"]);

    return rows.map((row) => parseThemeRow(row, symbols)).filter((item): item is ExternalIntelItem => Boolean(item));
  }

  private async fetchTencentThemeFallback(symbols: string[], eastMoneyError: unknown): Promise<ExternalIntelItem[]> {
    if (symbols.length === 0) return [];

    const body = await this.fetcher(buildTencentQuoteUrl(symbols));
    const quotes = parseTencentThemeQuotes(body, symbols);
    const bySector = new Map<string, TencentThemeQuote[]>();

    for (const quote of quotes) {
      bySector.set(quote.sector, [...(bySector.get(quote.sector) ?? []), quote]);
    }

    return [...bySector.entries()].map(([sector, sectorQuotes]) => {
      const averageChangePct = average(sectorQuotes.map((quote) => quote.changePct));
      const relatedSymbols = sectorQuotes.map((quote) => quote.symbol);

      return {
        id: `tencent-sector-rotation-${sector}-${relatedSymbols.join("-")}`,
        source: "theme",
        title: `${sector} theme rotation`,
        timestamp: latestTimestamp(sectorQuotes.map((quote) => quote.timestamp)),
        provider: tencentThemeFallbackProvider,
        credibility: "reported",
        relatedSymbols,
        summary: compactSummary([
          `Tencent real-time quote sector fallback; EastMoney theme source unavailable: ${errorMessage(eastMoneyError)}`,
          `average change pct: ${round2(averageChangePct)}`,
          `symbols: ${relatedSymbols.join(", ")}`
        ])
      };
    });
  }
}

interface TencentThemeQuote {
  symbol: string;
  sector: string;
  changePct: number;
  timestamp: string;
}

function parseDragonTigerRow(row: unknown): ExternalIntelItem | undefined {
  const value = asRecord(row);
  const symbol = normalizeSymbol(stringValue(value.SECUCODE) || stringValue(value.SECURITY_CODE));
  const title = [stringValue(value.SECURITY_NAME_ABBR) || symbol, "dragon-tiger list"].filter(Boolean).join(" ");
  const timestamp = normalizeShanghaiTimestamp(stringValue(value.TRADE_DATE));
  if (!symbol || !timestamp) return undefined;

  return {
    id: `eastmoney-dragon-tiger-${symbol}-${timestamp.slice(0, 10)}`,
    source: "dragon_tiger",
    title,
    timestamp,
    provider: providerBySource.dragon_tiger,
    credibility: "verified",
    relatedSymbols: [symbol],
    summary: compactSummary([
      stringValue(value.EXPLAIN),
      numberSummary("net buy", value.BILLBOARD_NET_AMT),
      numberSummary("close", value.CLOSE_PRICE)
    ])
  };
}

function parseAnnouncementRow(row: unknown): ExternalIntelItem | undefined {
  const value = asRecord(row);
  const title = stringValue(value.title) || stringValue(value.title_ch);
  const timestamp = normalizeShanghaiTimestamp(stringValue(value.display_time) || stringValue(value.notice_date));
  const relatedSymbols = arrayValue(value.codes)
    .map((code) => normalizeSymbol(stringValue(asRecord(code).stock_code)))
    .filter(Boolean);
  if (!title || !timestamp || relatedSymbols.length === 0) return undefined;

  const url = stringValue(value.art_code)
    ? `https://data.eastmoney.com/notices/detail/${stringValue(value.art_code)}.html`
    : "";
  const item: ExternalIntelItem = {
    id: `eastmoney-announcement-${stringValue(value.art_code) || title}`,
    source: "announcement",
    title,
    timestamp,
    provider: providerBySource.announcement,
    credibility: "verified",
    relatedSymbols,
    summary: title
  };

  return url ? { ...item, url } : item;
}

function parseNewsRow(row: unknown, requestedSymbols: string[]): ExternalIntelItem | undefined {
  const value = asRecord(row);
  const title = stringValue(value.title);
  const content = stringValue(value.content);
  const timestamp = normalizeShanghaiTimestamp(stringValue(value.date));
  const relatedSymbols = requestedSymbols.filter((symbol) => title.includes(symbolCode(symbol)) || content.includes(symbolCode(symbol)) || title.includes(symbol) || content.includes(symbol));
  if (!title || !timestamp || relatedSymbols.length === 0) return undefined;

  const url = stringValue(value.url);
  const item: ExternalIntelItem = {
    id: `eastmoney-news-${stringValue(value.code) || title}`,
    source: "news",
    title,
    timestamp,
    provider: providerBySource.news,
    credibility: "reported",
    relatedSymbols,
    summary: content || title
  };

  return url ? { ...item, url } : item;
}

function parseThemeRow(row: unknown, requestedSymbols: string[]): ExternalIntelItem | undefined {
  const value = asRecord(row);
  const boardCode = stringValue(value.f12);
  const boardName = stringValue(value.f14);
  if (!boardCode || !boardName || requestedSymbols.length === 0) return undefined;

  return {
    id: `eastmoney-theme-${boardCode}`,
    source: "theme",
    title: `${boardName} theme board`,
    timestamp: new Date().toISOString(),
    provider: providerBySource.theme,
    credibility: "reported",
    relatedSymbols: requestedSymbols,
    summary: compactSummary([`Theme board ${boardName}`, numberSummary("change pct", value.f3), numberSummary("latest", value.f2)])
  };
}

function buildDragonTigerUrl(): string {
  const columns = [
    "SECURITY_CODE",
    "SECUCODE",
    "SECURITY_NAME_ABBR",
    "TRADE_DATE",
    "EXPLAIN",
    "BILLBOARD_NET_AMT",
    "BILLBOARD_BUY_AMT",
    "BILLBOARD_SELL_AMT",
    "D1_CLOSE_ADJCHRATE",
    "CLOSE_PRICE"
  ].join(",");

  return `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_DAILYBILLBOARD_DETAILSNEW&columns=${columns}&pageSize=100&pageNumber=1&sortColumns=TRADE_DATE,SECURITY_CODE&sortTypes=-1,1`;
}

function buildAnnouncementUrl(): string {
  return "https://np-anotice-stock.eastmoney.com/api/security/ann?sr=-1&page_size=100&page_index=1&ann_type=A&client_source=web&f_node=0&s_node=0";
}

function buildNewsUrl(symbols: string[]): string {
  const keyword = encodeURIComponent(symbols.map(symbolCode).join(" "));
  const param = encodeURIComponent(
    JSON.stringify({
      uid: "",
      keyword,
      type: ["cmsArticleWebOld"],
      client: "web",
      clientType: "web",
      clientVersion: "curr",
      param: {
        cmsArticleWebOld: {
          searchScope: "default",
          sort: "default",
          pageIndex: 1,
          pageSize: 20,
          preTag: "",
          postTag: ""
        }
      }
    })
  );

  return `https://search-api-web.eastmoney.com/search/jsonp?cb=callback&param=${param}`;
}

function buildThemeUrl(): string {
  return "https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=20&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:3&fields=f12,f14,f2,f3,f20,f62";
}

function buildTencentQuoteUrl(symbols: string[]): string {
  return `https://qt.gtimg.cn/q=${symbols.map(toTencentSymbol).join(",")}`;
}

function parseTencentThemeQuotes(body: string, requestedSymbols: string[]): TencentThemeQuote[] {
  return requestedSymbols
    .map((symbol) => {
      const quoteKey = toTencentSymbol(symbol);
      const match = new RegExp(`v_${quoteKey}="([^"]+)"`).exec(body);
      if (!match?.[1]) return undefined;

      const parts = match[1].split("~");
      const name = parts[1] || symbol;
      const changePct = Number(parts[32] ?? parts[31] ?? 0);

      return {
        symbol,
        sector: sectorForSymbol(symbol, name),
        changePct: Number.isFinite(changePct) ? changePct : 0,
        timestamp: normalizeTencentTimestamp(parts[30] ?? "")
      };
    })
    .filter((quote): quote is TencentThemeQuote => Boolean(quote));
}

function sectorForSymbol(symbol: string, name: string): string {
  const code = symbolCode(symbol);
  if (["000001", "600000", "601398", "601288", "601939", "601988", "招商银行"].some((value) => code === value || name.includes(value))) {
    return "Banking";
  }
  if (["300750", "002594", "新能源", "宁德时代", "比亚迪"].some((value) => code === value || name.includes(value))) {
    return "New Energy";
  }
  if (symbol.endsWith(".SH")) return "Shanghai A-share";
  if (symbol.startsWith("300")) return "ChiNext";
  return "Shenzhen A-share";
}

function normalizeTencentTimestamp(value: string): string {
  if (!/^\d{14}$/.test(value)) return new Date().toISOString();

  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(8, 10)}:${value.slice(
    10,
    12
  )}:${value.slice(12, 14)}.000+08:00`;
}


function matchesSymbols(itemSymbols: string[], requestedSymbols: string[]): boolean {
  if (requestedSymbols.length === 0) return true;
  const requested = new Set(requestedSymbols);
  return itemSymbols.some((symbol) => requested.has(symbol));
}

function parseJson(body: string): unknown {
  return JSON.parse(body);
}

function parseJsonp(body: string): unknown {
  const trimmed = body.trim();
  const match = /^[^(]+\(([\s\S]*)\);?$/.exec(trimmed);
  return JSON.parse(match?.[1] ?? trimmed);
}

function arrayAt(value: unknown, path: string[]): unknown[] {
  let cursor = value;
  for (const key of path) {
    cursor = asRecord(cursor)[key];
  }

  return arrayValue(cursor);
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function numberSummary(label: string, value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return `${label}: ${value}`;
}

function compactSummary(values: string[]): string {
  return values.filter(Boolean).join("; ");
}

function latestTimestamp(values: string[]): string {
  return latestTimestampRaw(values) ?? new Date().toISOString();
}

function normalizeShanghaiTimestamp(value: string): string {
  if (!value) return "";
  const [date = "", time = "00:00:00"] = value.trim().split(" ");
  if (!date) return "";
  const normalizedTime = time.replace(/:(\d{3})$/, ".$1");

  return `${date}T${normalizedTime.includes(".") ? normalizedTime : `${normalizedTime}.000`}+08:00`;
}

async function defaultFetcher(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = get(
      url,
      {
        family: 4,
        headers: {
          "User-Agent": "Mozilla/5.0 iTrade External Intel"
        },
        timeout: 15000
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`external intel request failed: ${response.statusCode} ${body.slice(0, 120)}`));
            return;
          }

          resolve(body);
        });
      }
    );
    request.on("timeout", () => request.destroy(new Error("external intel request timed out")));
    request.on("error", reject);
  });
}
