import { describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExternalIntelItem, ExternalIntelSource } from "@itrade/domain";
import {
  createCachedExternalIntelProvider,
  createCompositeExternalIntelProvider,
  createStaticExternalIntelProvider,
  fetchExternalIntelSnapshot
} from "./externalIntel";

describe("external intelligence providers", () => {
  it("combines provider items and keeps empty source statuses explicit", async () => {
    const snapshot = await fetchExternalIntelSnapshot(
      createCompositeExternalIntelProvider([
        createStaticExternalIntelProvider({
          source: "dragon_tiger",
          provider: "fixture-dragon",
          items: [intelItem("dragon_tiger", "000001.SZ")]
        }),
        createStaticExternalIntelProvider({
          source: "announcement",
          provider: "fixture-announcement",
          items: []
        })
      ]),
      ["000001.SZ"]
    );

    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0]).toMatchObject({
      source: "dragon_tiger",
      provider: "fixture-dragon_tiger",
      relatedSymbols: ["000001.SZ"]
    });
    expect(snapshot.statuses).toContainEqual(
      expect.objectContaining({
        source: "dragon_tiger",
        provider: "fixture-dragon",
        status: "available",
        itemCount: 1
      })
    );
    expect(snapshot.statuses).toContainEqual(
      expect.objectContaining({
        source: "announcement",
        provider: "fixture-announcement",
        status: "empty",
        itemCount: 0
      })
    );
  });

  it("turns provider failures into unavailable statuses without dropping other sources", async () => {
    const snapshot = await fetchExternalIntelSnapshot(
      createCompositeExternalIntelProvider([
        createStaticExternalIntelProvider({
          source: "news",
          provider: "fixture-news",
          items: [intelItem("news", "600000.SH")]
        }),
        {
          async getSnapshot() {
            throw new Error("upstream down");
          },
          describe() {
            return [
              {
                source: "theme" as const,
                label: "Theme",
                status: "not_configured" as const,
                provider: "fixture-theme",
                message: "fixture theme source",
                itemCount: 0
              }
            ];
          }
        }
      ]),
      ["600000.SH"]
    );

    expect(snapshot.items.map((item) => item.source)).toEqual(["news"]);
    expect(snapshot.statuses).toContainEqual(
      expect.objectContaining({
        source: "theme",
        provider: "fixture-theme",
        status: "unavailable",
        itemCount: 0
      })
    );
    expect(snapshot.warnings.join(" ")).toContain("upstream down");
  });

  it("uses cached external intel when the upstream provider fails", async () => {
    const cacheFile = join(await mkdtemp(join(tmpdir(), "itrade-external-intel-")), "snapshot.json");
    const writingProvider = createCachedExternalIntelProvider({
      provider: createStaticExternalIntelProvider({
        source: "news",
        provider: "fixture-news",
        items: [intelItem("news", "000001.SZ")]
      }),
      cacheFile
    });
    await fetchExternalIntelSnapshot(writingProvider, ["000001.SZ"]);
    const failingProvider = createCachedExternalIntelProvider({
      provider: {
        async getSnapshot() {
          throw new Error("network down");
        },
        describe() {
          return [
            {
              source: "news" as const,
              label: "News Catalyst",
              status: "not_configured" as const,
              provider: "fixture-news",
              message: "fixture news source",
              itemCount: 0
            }
          ];
        }
      },
      cacheFile
    });

    const cached = await fetchExternalIntelSnapshot(failingProvider, ["000001.SZ"]);

    expect(cached.items).toHaveLength(1);
    expect(cached.statuses).toContainEqual(
      expect.objectContaining({
        source: "news",
        status: "available",
        provider: "fixture-news-cache"
      })
    );
    expect(cached.warnings.join(" ")).toContain("network down");
  });
});

function intelItem(source: ExternalIntelSource, symbol: string): ExternalIntelItem {
  return {
    id: `${source}-${symbol}`,
    source,
    title: `${symbol} real external event`,
    timestamp: "2026-06-09T10:00:00.000+08:00",
    provider: `fixture-${source}`,
    credibility: "verified",
    relatedSymbols: [symbol],
    summary: "Fixture item that represents a verified external data event.",
    url: "https://example.test/event"
  };
}
