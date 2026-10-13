import { describe, expect, it, vi } from "vitest";
import { EastMoneyExternalIntelProvider } from "./publicExternalIntel";

describe("public EastMoney external intelligence provider", () => {
  it("parses dragon-tiger, announcement, news, and theme public responses into real intel items", async () => {
    const fetcher = vi.fn(fixtureFetcher);
    const provider = new EastMoneyExternalIntelProvider({ fetcher });

    const snapshot = await provider.getSnapshot(["000001.SZ"], {
      now: () => new Date("2026-06-09T08:00:00.000Z")
    });

    expect(snapshot.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "dragon_tiger",
          provider: "eastmoney-dragon-tiger",
          relatedSymbols: ["000001.SZ"],
          credibility: "verified"
        }),
        expect.objectContaining({
          source: "announcement",
          provider: "eastmoney-announcement",
          relatedSymbols: ["000001.SZ"]
        }),
        expect.objectContaining({
          source: "news",
          provider: "eastmoney-news",
          relatedSymbols: ["000001.SZ"]
        }),
        expect.objectContaining({
          source: "theme",
          provider: "eastmoney-theme",
          relatedSymbols: ["000001.SZ"]
        })
      ])
    );
    expect(snapshot.statuses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "dragon_tiger", status: "available", itemCount: 1 }),
        expect.objectContaining({ source: "announcement", status: "available", itemCount: 1 }),
        expect.objectContaining({ source: "news", status: "available", itemCount: 1 }),
        expect.objectContaining({ source: "theme", status: "available", itemCount: 1 })
      ])
    );
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("marks reachable sources with no relevant rows as empty", async () => {
    const provider = new EastMoneyExternalIntelProvider({ fetcher: emptyFetcher });

    const snapshot = await provider.getSnapshot(["300750.SZ"]);

    expect(snapshot.items).toHaveLength(0);
    expect(snapshot.statuses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "dragon_tiger", status: "empty" }),
        expect.objectContaining({ source: "announcement", status: "empty" }),
        expect.objectContaining({ source: "news", status: "empty" }),
        expect.objectContaining({ source: "theme", status: "empty" })
      ])
    );
  });

  it("falls back to Tencent quotes for theme rotation when EastMoney theme source is unavailable", async () => {
    const provider = new EastMoneyExternalIntelProvider({ fetcher: themeFallbackFetcher });

    const snapshot = await provider.getSnapshot(["000001.SZ"]);

    expect(snapshot.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "theme",
          provider: "tencent-sector-rotation",
          relatedSymbols: ["000001.SZ"],
          title: "Banking theme rotation"
        })
      ])
    );
    expect(snapshot.statuses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "theme",
          provider: "tencent-sector-rotation",
          status: "available",
          itemCount: 1
        })
      ])
    );
  });
});

async function fixtureFetcher(url: string): Promise<string> {
  if (url.includes("RPT_DAILYBILLBOARD_DETAILSNEW")) {
    return JSON.stringify({
      result: {
        data: [
          {
            SECUCODE: "000001.SZ",
            SECURITY_CODE: "000001",
            SECURITY_NAME_ABBR: "Ping An Bank",
            TRADE_DATE: "2026-06-08 00:00:00",
            EXPLAIN: "Institutional net buy",
            BILLBOARD_NET_AMT: 12000000,
            CLOSE_PRICE: 10.5
          }
        ]
      },
      success: true
    });
  }

  if (url.includes("np-anotice-stock")) {
    return JSON.stringify({
      data: {
        list: [
          {
            art_code: "AN202606090001",
            title: "Ping An Bank annual dividend announcement",
            display_time: "2026-06-09 08:30:00:000",
            codes: [{ stock_code: "000001", short_name: "Ping An Bank" }]
          }
        ]
      },
      success: 1
    });
  }

  if (url.includes("search-api-web")) {
    return `callback(${JSON.stringify({
      code: 0,
      result: {
        cmsArticleWebOld: [
          {
            code: "202606093700000001",
            title: "Ping An Bank appears in index rebalance coverage",
            content: "Ping An Bank 000001.SZ is mentioned in market coverage.",
            date: "2026-06-09 09:10:00",
            mediaName: "EastMoney News",
            url: "https://finance.eastmoney.com/a/202606093700000001.html"
          }
        ]
      }
    })})`;
  }

  if (url.includes("qt/clist/get")) {
    return JSON.stringify({
      rc: 0,
      data: {
        diff: [{ f12: "BK0001", f14: "Banking Theme", f2: 982.47, f3: 1.25 }]
      }
    });
  }

  throw new Error(`unexpected url ${url}`);
}

async function emptyFetcher(url: string): Promise<string> {
  if (url.includes("search-api-web")) {
    return "callback({\"code\":0,\"result\":{\"cmsArticleWebOld\":[]}})";
  }

  if (url.includes("np-anotice-stock")) {
    return JSON.stringify({ data: { list: [] }, success: 1 });
  }

  if (url.includes("qt/clist/get")) {
    return JSON.stringify({ rc: 0, data: { diff: [] } });
  }

  return JSON.stringify({ result: { data: [] }, success: true });
}

async function themeFallbackFetcher(url: string): Promise<string> {
  if (url.includes("qt/clist/get")) {
    throw new Error("socket hang up");
  }

  if (url.includes("qt.gtimg.cn")) {
    return 'v_sz000001="51~Ping An Bank~000001~11.10~11.03~11.01~997197~587113~410020~11.09~4018~11.08~10352~11.07~5354~11.06~4433~11.05~4402~11.10~2328~11.11~4039~11.12~5754~11.13~4584~11.14~2673~~20260609141400~0.07~0.63~11.19~10.96~11.10/997197/1107616504~997197~110762~0.80~5.30~~11.19~10.96~2.08~1210.76~1210.76~0.82~12.13~9.93~1.45~-142~11.07~5.21~6.59~~~1.05~110761.6504~0.0000~0~ ~GP-A";';
  }

  return emptyFetcher(url);
}
