import type { ExternalIntelSource, ExternalIntelStatus } from "@itrade/domain";
import {
  buildExternalIntelStatus,
  getExternalIntelSourceLabel,
  type ExternalIntelProvider,
  type ExternalIntelSnapshot
} from "./externalIntel";

export type TokenDataVendor = "tushare" | "jqdata" | "wind";

export interface TokenExternalIntelProviderOptions {
  vendor: TokenDataVendor;
  env?: Record<string, string | undefined>;
}

const sources: ExternalIntelSource[] = ["dragon_tiger", "announcement", "news", "theme"];

export function createTokenExternalIntelProvider(options: TokenExternalIntelProviderOptions): ExternalIntelProvider {
  const env = options.env ?? process.env;
  const configured = hasCredentials(options.vendor, env);
  const statuses = buildStatuses(options.vendor, configured);

  return {
    async getSnapshot(): Promise<ExternalIntelSnapshot> {
      const warning = configured ? `${options.vendor} adapter is not implemented in this build.` : undefined;

      return {
        items: [],
        statuses,
        warnings: warning ? [warning] : [],
        updatedAt: new Date().toISOString()
      };
    },
    describe(): ExternalIntelStatus[] {
      return statuses;
    }
  };
}

function buildStatuses(vendor: TokenDataVendor, configured: boolean): ExternalIntelStatus[] {
  return sources.map((source) =>
    buildExternalIntelStatus({
      source,
      provider: vendor,
      status: configured ? "unavailable" : "not_configured",
      itemCount: 0,
      message: configured
        ? `${vendor} credentials are configured, but the live ${getExternalIntelSourceLabel(source)} adapter is not implemented in this build.`
        : `${vendor} credentials are missing for ${getExternalIntelSourceLabel(source)}.`
    })
  );
}

function hasCredentials(vendor: TokenDataVendor, env: Record<string, string | undefined>): boolean {
  if (vendor === "tushare") return Boolean(env.TUSHARE_TOKEN);
  if (vendor === "jqdata") return Boolean(env.JQDATA_USERNAME && env.JQDATA_PASSWORD);
  return env.WIND_API_ENABLED === "true";
}
