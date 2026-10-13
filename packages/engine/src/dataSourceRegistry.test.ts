import { describe, expect, it } from "vitest";
import { createDataSourceRegistry, createStaticExternalIntelProvider, getSampleBars, type MarketDataProvider } from ".";

describe("data source registry", () => {
  it("builds a default registry from injected market and external providers", async () => {
    const registry = createDataSourceRegistry({
      marketDataProvider: fakeMarketDataProvider(),
      externalIntelProvider: createStaticExternalIntelProvider({
        source: "news",
        provider: "fixture-news",
        items: [
          {
            id: "fixture-news-000001",
            source: "news",
            title: "Fixture news",
            timestamp: "2026-06-08T10:00:00.000+08:00",
            provider: "fixture-news",
            credibility: "verified",
            relatedSymbols: ["000001.SZ"],
            summary: "Fixture news item."
          }
        ]
      })
    });

    const status = await registry.getStatus(["000001.SZ"]);

    expect(status.marketData.source).toMatchObject({ provider: "eastmoney", isReal: true });
    expect(status.externalIntel.statuses).toContainEqual(
      expect.objectContaining({ source: "news", provider: "fixture-news", status: "available" })
    );
  });

  it("adds selected token vendor status slots from configuration", async () => {
    const registry = createDataSourceRegistry({
      marketDataProvider: fakeMarketDataProvider(),
      env: { ITRADE_DATA_VENDOR: "tushare" },
      publicDataEnabled: false
    });

    const status = await registry.getStatus(["000001.SZ"]);

    expect(status.externalIntel.statuses).toContainEqual(
      expect.objectContaining({ source: "news", provider: "tushare", status: "not_configured" })
    );
  });
});

function fakeMarketDataProvider(): MarketDataProvider {
  return {
    async getSnapshot(symbols) {
      const bars = getSampleBars();

      return {
        ...bars,
        source: {
          provider: "eastmoney",
          isReal: true,
          updatedAt: "2026-06-08T10:00:00.000+08:00",
          symbols,
          warnings: [],
          cacheHit: false
        },
        quality: { ok: true, issues: [] }
      };
    }
  };
}
