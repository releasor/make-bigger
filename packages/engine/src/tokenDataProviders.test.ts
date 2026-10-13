import { describe, expect, it } from "vitest";
import { createTokenExternalIntelProvider } from "./tokenDataProviders";

describe("token data provider slots", () => {
  it("marks selected token vendors as not configured when credentials are missing", () => {
    const provider = createTokenExternalIntelProvider({ vendor: "tushare", env: {} });

    expect(provider.describe()).toContainEqual(
      expect.objectContaining({
        source: "news",
        provider: "tushare",
        status: "not_configured"
      })
    );
  });

  it("marks credentialed vendor slots as unavailable until live adapters are implemented", async () => {
    const provider = createTokenExternalIntelProvider({
      vendor: "tushare",
      env: { TUSHARE_TOKEN: "token-value" }
    });

    const snapshot = await provider.getSnapshot(["000001.SZ"]);

    expect(snapshot.items).toHaveLength(0);
    expect(snapshot.statuses).toContainEqual(
      expect.objectContaining({
        source: "announcement",
        provider: "tushare",
        status: "unavailable"
      })
    );
    expect(snapshot.warnings.join(" ")).toContain("adapter is not implemented");
  });
});
