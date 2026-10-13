import { describe, expect, it, vi } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EastMoneyMarketDataProvider,
  TencentKlineMarketDataProvider,
  TencentQuoteMarketDataProvider,
  createCachedMarketDataProvider,
  createFallbackMarketDataProvider,
  fetchMarketDataSnapshot,
  parseEastMoneyKlines
} from "./realMarketData";

describe("real market data provider", () => {
  it("parses EastMoney daily and minute klines into market bars with indicators", () => {
    const bars = parseEastMoneyKlines(
      "000001.SZ",
      [
        "2026-06-01,10.00,10.20,10.30,9.90,1000,100000.00,3.00,2.00,0.20,1.00",
        "2026-06-02,10.20,10.10,10.25,10.00,1200,121200.00,2.50,-0.98,-0.10,1.20",
        "2026-06-03,10.10,10.50,10.60,10.05,2500,262500.00,5.45,3.96,0.40,2.50"
      ],
      "daily"
    );

    expect(bars).toHaveLength(3);
    expect(bars[0]).toMatchObject({
      symbol: "000001.SZ",
      timestamp: "2026-06-01T15:00:00.000+08:00",
      open: 10,
      close: 10.2,
      volume: 1000
    });
    expect(bars[2]?.fields.ma20).toBeCloseTo(10.2667, 4);
    expect(bars[2]?.fields.avgVolume20).toBeCloseTo(1566.6667, 4);
    expect(bars[2]?.fields.rsi14).toBeGreaterThan(0);
  });

  it("loads daily and minute bars from an injected EastMoney fetcher", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes("klt=101")) {
        return eastMoneyResponse([
          "2026-06-01,10.00,10.20,10.30,9.90,1000,100000.00,3.00,2.00,0.20,1.00",
          "2026-06-02,10.20,10.40,10.50,10.10,1500,156000.00,4.00,1.96,0.20,1.50"
        ]);
      }

      return eastMoneyResponse([
        "2026-06-08 09:31,10.20,10.25,10.30,10.15,300,30750.00,1.47,0.49,0.05,0.30",
        "2026-06-08 09:32,10.25,10.35,10.36,10.24,500,51750.00,1.17,0.98,0.10,0.50"
      ]);
    });
    const provider = new EastMoneyMarketDataProvider({ fetcher });

    const snapshot = await fetchMarketDataSnapshot(provider, ["000001.SZ"]);

    expect(snapshot.source.provider).toBe("eastmoney");
    expect(snapshot.source.isReal).toBe(true);
    expect(snapshot.daily).toHaveLength(2);
    expect(snapshot.minute).toHaveLength(2);
    expect(snapshot.quality.ok).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("loads a real-time snapshot from an injected Tencent quote fetcher", async () => {
    const provider = new TencentQuoteMarketDataProvider({
      fetcher: async () =>
        'v_sz000001="51~平安银行~000001~11.17~11.03~11.01~694056~454277~239778~11.16~3477~11.15~2830~11.14~2866~11.13~6577~11.12~1388~11.17~8028~11.18~9292~11.19~16365~11.20~20653~11.21~7734~~20260609110112~0.14~1.27~11.19~10.96~11.17/694056/770234531~694056~77023~0.36~5.03~~11.19~10.96~2.09~2167.61~2167.64~0.47~12.13~9.93~1.94~-44934~11.10~3.73~5.08~~~0.39~77023.4531~0.0000~0";'
    });

    const snapshot = await fetchMarketDataSnapshot(provider, ["000001.SZ"]);

    expect(snapshot.source.provider).toBe("tencent-quote");
    expect(snapshot.source.isReal).toBe(true);
    expect(snapshot.daily.at(-1)).toMatchObject({
      symbol: "000001.SZ",
      open: 11.01,
      close: 11.17,
      high: 11.19,
      low: 10.96
    });
    expect(snapshot.minute.at(-1)?.timestamp).toBe("2026-06-09T11:01:12.000+08:00");
    expect(snapshot.quality.ok).toBe(true);
  });

  it("loads Tencent daily kline depth with a real-time minute quote fallback", async () => {
    const provider = new TencentKlineMarketDataProvider({
      fetcher: async (url: string) => {
        if (url.includes("fqkline/get")) {
          return JSON.stringify({
            code: 0,
            data: {
              sz000001: {
                qfqday: [
                  ["2026-06-06", "11.000", "11.030", "11.080", "10.960", "600000.000"],
                  ["2026-06-09", "11.010", "11.170", "11.190", "10.960", "694056.000"]
                ]
              }
            }
          });
        }

        return 'v_sz000001="51~骞冲畨閾惰~000001~11.17~11.03~11.01~694056~454277~239778~11.16~3477~11.15~2830~11.14~2866~11.13~6577~11.12~1388~11.17~8028~11.18~9292~11.19~16365~11.20~20653~11.21~7734~~20260609110112~0.14~1.27~11.19~10.96~11.17/694056/770234531~694056~77023~0.36~5.03~~11.19~10.96~2.09~2167.61~2167.64~0.47~12.13~9.93~1.94~-44934~11.10~3.73~5.08~~~0.39~77023.4531~0.0000~0";';
      }
    });

    const snapshot = await fetchMarketDataSnapshot(provider, ["000001.SZ"]);

    expect(snapshot.source.provider).toBe("tencent-kline");
    expect(snapshot.daily).toHaveLength(2);
    expect(snapshot.minute).toHaveLength(1);
    expect(snapshot.daily.at(-1)).toMatchObject({ close: 11.17, high: 11.19, low: 10.96 });
    expect(snapshot.source.warnings.join(" ")).toContain("腾讯 K 线备援");
  });

  it("tries a backup real-time provider before using cache fallback", async () => {
    const provider = createFallbackMarketDataProvider([
      new EastMoneyMarketDataProvider({
        fetcher: async () => {
          throw new Error("socket hang up");
        }
      }),
      new TencentQuoteMarketDataProvider({
        fetcher: async () =>
          'v_sz000001="51~平安银行~000001~11.17~11.03~11.01~694056~454277~239778~11.16~3477~11.15~2830~11.14~2866~11.13~6577~11.12~1388~11.17~8028~11.18~9292~11.19~16365~11.20~20653~11.21~7734~~20260609110112~0.14~1.27~11.19~10.96~11.17/694056/770234531~694056~77023~0.36~5.03~~11.19~10.96~2.09~2167.61~2167.64~0.47~12.13~9.93~1.94~-44934~11.10~3.73~5.08~~~0.39~77023.4531~0.0000~0";'
      })
    ]);

    const snapshot = await fetchMarketDataSnapshot(provider, ["000001.SZ"]);

    expect(snapshot.source.provider).toBe("tencent-quote");
    expect(snapshot.source.warnings).toContain("eastmoney 不可用：socket hang up");
  });

  it("uses cached real market data when the upstream provider fails", async () => {
    const cachedSnapshot = await fetchMarketDataSnapshot(new EastMoneyMarketDataProvider({ fetcher: successfulFetcher }), [
      "000001.SZ"
    ]);
    const provider = createCachedMarketDataProvider({
      provider: new EastMoneyMarketDataProvider({ fetcher: async () => { throw new Error("network down"); } }),
      initialSnapshot: cachedSnapshot
    });

    const snapshot = await fetchMarketDataSnapshot(provider, ["000001.SZ"]);

    expect(snapshot.source.provider).toBe("eastmoney-cache");
    expect(snapshot.source.isReal).toBe(true);
    expect(snapshot.source.warnings).toContain("实时数据源不可用，已使用最近一次真实数据缓存。");
    expect(snapshot.daily).toHaveLength(cachedSnapshot.daily.length);
  });

  it("reuses a fresh in-memory snapshot to avoid repeated upstream requests", async () => {
    const fetcher = vi.fn(successfulFetcher);
    const provider = createCachedMarketDataProvider({
      provider: new EastMoneyMarketDataProvider({ fetcher }),
      maxAgeMs: 60_000
    });

    const first = await fetchMarketDataSnapshot(provider, ["000001.SZ"]);
    const second = await fetchMarketDataSnapshot(provider, ["000001.SZ"]);

    expect(first.source.provider).toBe("eastmoney");
    expect(second.source.provider).toBe("eastmoney");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("persists the latest real market data cache across provider instances", async () => {
    const cacheFile = join(await mkdtemp(join(tmpdir(), "itrade-market-cache-")), "snapshot.json");
    const writingProvider = createCachedMarketDataProvider({
      provider: new EastMoneyMarketDataProvider({ fetcher: successfulFetcher }),
      cacheFile
    });
    const freshSnapshot = await fetchMarketDataSnapshot(writingProvider, ["000001.SZ"]);
    const readingProvider = createCachedMarketDataProvider({
      provider: new EastMoneyMarketDataProvider({ fetcher: async () => { throw new Error("network down"); } }),
      cacheFile
    });

    const cachedSnapshot = await fetchMarketDataSnapshot(readingProvider, ["000001.SZ"]);

    expect(freshSnapshot.source.provider).toBe("eastmoney");
    expect(cachedSnapshot.source.provider).toBe("eastmoney-cache");
    expect(cachedSnapshot.source.isReal).toBe(true);
    expect(cachedSnapshot.daily).toHaveLength(freshSnapshot.daily.length);
  });
});

async function successfulFetcher(url: string): Promise<string> {
  if (url.includes("klt=101")) {
    return eastMoneyResponse([
      "2026-06-01,10.00,10.20,10.30,9.90,1000,100000.00,3.00,2.00,0.20,1.00",
      "2026-06-02,10.20,10.40,10.50,10.10,1500,156000.00,4.00,1.96,0.20,1.50"
    ]);
  }

  return eastMoneyResponse([
    "2026-06-08 09:31,10.20,10.25,10.30,10.15,300,30750.00,1.47,0.49,0.05,0.30",
    "2026-06-08 09:32,10.25,10.35,10.36,10.24,500,51750.00,1.17,0.98,0.10,0.50"
  ]);
}

function eastMoneyResponse(klines: string[]): string {
  return JSON.stringify({
    rc: 0,
    data: {
      code: "000001",
      market: 0,
      name: "平安银行",
      klines
    }
  });
}
