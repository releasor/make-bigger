import {
  createCachedMarketDataProvider,
  createFallbackMarketDataProvider,
  EastMoneyMarketDataProvider,
  SinaMarketDataProvider,
  TencentKlineMarketDataProvider,
  TencentQuoteMarketDataProvider,
  type MarketDataProvider,
  type MarketDataSnapshot
} from "./realMarketData";
import {
  createCachedExternalIntelProvider,
  createCompositeExternalIntelProvider,
  type ExternalIntelProvider,
  type ExternalIntelSnapshot
} from "./externalIntel";
import { EastMoneyExternalIntelProvider } from "./publicExternalIntel";
import { createTokenExternalIntelProvider, type TokenDataVendor } from "./tokenDataProviders";

export interface DataSourceRegistry {
  marketDataProvider: MarketDataProvider;
  externalIntelProvider: ExternalIntelProvider;
  getStatus(symbols: string[]): Promise<DataSourceStatusSnapshot>;
}

export interface DataSourceStatusSnapshot {
  marketData: {
    source: MarketDataSnapshot["source"];
    quality: MarketDataSnapshot["quality"];
    dailyBars: number;
    minuteBars: number;
  };
  externalIntel: ExternalIntelSnapshot;
}

export interface DataSourceRegistryOptions {
  marketDataProvider?: MarketDataProvider;
  externalIntelProvider?: ExternalIntelProvider;
  cacheDir?: string;
  publicDataEnabled?: boolean;
  env?: Record<string, string | undefined>;
}

export function createDataSourceRegistry(options: DataSourceRegistryOptions = {}): DataSourceRegistry {
  const env = options.env ?? process.env;
  const cacheDir = options.cacheDir ?? "tmp/market-data-cache";
  const publicDataEnabled = options.publicDataEnabled ?? env.ITRADE_PUBLIC_DATA_ENABLED !== "false";
  const externalProviders = [
    ...(publicDataEnabled ? [new EastMoneyExternalIntelProvider()] : []),
    ...tokenVendorsFromEnv(env).map((vendor) => createTokenExternalIntelProvider({ vendor, env }))
  ];
  const marketDataProvider =
    options.marketDataProvider ??
    createCachedMarketDataProvider({
      provider: createFallbackMarketDataProvider([
        new EastMoneyMarketDataProvider(),
        new SinaMarketDataProvider(),
        new TencentKlineMarketDataProvider(),
        new TencentQuoteMarketDataProvider()
      ]),
      cacheFile: `${cacheDir}/eastmoney-snapshot.json`
    });
  const externalIntelProvider =
    options.externalIntelProvider ??
    createCachedExternalIntelProvider({
      provider: createCompositeExternalIntelProvider(externalProviders),
      cacheFile: `${cacheDir}/external-intel-snapshot.json`
    });

  return {
    marketDataProvider,
    externalIntelProvider,
    async getStatus(symbols: string[]): Promise<DataSourceStatusSnapshot> {
      const [marketData, externalIntel] = await Promise.all([
        marketDataProvider.getSnapshot(symbols),
        externalIntelProvider.getSnapshot(symbols)
      ]);

      return {
        marketData: {
          source: marketData.source,
          quality: marketData.quality,
          dailyBars: marketData.daily.length,
          minuteBars: marketData.minute.length
        },
        externalIntel
      };
    }
  };
}

function tokenVendorsFromEnv(env: Record<string, string | undefined>): TokenDataVendor[] {
  const selected = env.ITRADE_DATA_VENDOR;
  if (selected === "tushare" || selected === "jqdata" || selected === "wind") return [selected];
  if (selected === "public") return [];

  const vendors: TokenDataVendor[] = [];
  if (env.TUSHARE_TOKEN) vendors.push("tushare");
  if (env.JQDATA_USERNAME && env.JQDATA_PASSWORD) vendors.push("jqdata");
  if (env.WIND_API_ENABLED === "true") vendors.push("wind");

  return vendors;
}
