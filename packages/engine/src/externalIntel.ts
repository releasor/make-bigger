import type {
  ExternalIntelAvailability,
  ExternalIntelItem,
  ExternalIntelSource,
  ExternalIntelStatus
} from "@itrade/domain";
import { errorMessage, latestTimestamp, readJsonCache, toIso, writeJsonCache } from "./utils";

export interface ExternalIntelSnapshot {
  items: ExternalIntelItem[];
  statuses: ExternalIntelStatus[];
  warnings: string[];
  updatedAt: string;
}

export interface ExternalIntelRequestOptions {
  now?: () => Date;
}

export interface ExternalIntelProvider {
  getSnapshot(symbols: string[], options?: ExternalIntelRequestOptions): Promise<ExternalIntelSnapshot>;
  describe(): ExternalIntelStatus[];
}

interface StaticExternalIntelProviderOptions {
  source: ExternalIntelSource;
  provider: string;
  items: ExternalIntelItem[];
  status?: ExternalIntelAvailability;
  message?: string;
  updatedAt?: string;
}

interface CachedExternalIntelProviderOptions {
  provider: ExternalIntelProvider;
  initialSnapshot?: ExternalIntelSnapshot;
  cacheFile?: string;
  maxAgeMs?: number;
}

const sourceLabels: Record<ExternalIntelSource, string> = {
  dragon_tiger: "Dragon-Tiger List",
  news: "News Catalyst",
  theme: "Theme Rotation",
  announcement: "Announcement"
};

export async function fetchExternalIntelSnapshot(
  provider: ExternalIntelProvider = createCompositeExternalIntelProvider([]),
  symbols: string[] = []
): Promise<ExternalIntelSnapshot> {
  return provider.getSnapshot(symbols);
}

export function createCompositeExternalIntelProvider(providers: ExternalIntelProvider[]): ExternalIntelProvider {
  return {
    async getSnapshot(symbols: string[], options?: ExternalIntelRequestOptions): Promise<ExternalIntelSnapshot> {
      const snapshots = await Promise.all(providers.map((provider) => getProviderSnapshot(provider, symbols, options)));
      const items = snapshots.flatMap((snapshot) => snapshot.items);
      const statuses = snapshots.flatMap((snapshot) => snapshot.statuses);
      const warnings = snapshots.flatMap((snapshot) => snapshot.warnings);
      const updatedAt = latestTimestamp(snapshots.map((snapshot) => snapshot.updatedAt)) ?? toIso(options?.now?.() ?? new Date());

      return { items, statuses, warnings, updatedAt };
    },
    describe(): ExternalIntelStatus[] {
      return providers.flatMap((provider) => provider.describe());
    }
  };
}

export function createStaticExternalIntelProvider(options: StaticExternalIntelProviderOptions): ExternalIntelProvider {
  return {
    async getSnapshot(_symbols: string[], requestOptions?: ExternalIntelRequestOptions): Promise<ExternalIntelSnapshot> {
      const updatedAt = options.updatedAt ?? toIso(requestOptions?.now?.() ?? new Date());
      const status = statusForItems(options.items, options.status);

      return {
        items: options.items,
        statuses: [
          buildExternalIntelStatus({
            source: options.source,
            provider: options.provider,
            status,
            itemCount: options.items.length,
            updatedAt,
            message:
              options.message ??
              (status === "available" ? `${sourceLabels[options.source]} source returned real items.` : `${sourceLabels[options.source]} source returned no relevant items.`)
          })
        ],
        warnings: [],
        updatedAt
      };
    },
    describe(): ExternalIntelStatus[] {
      return [
        buildExternalIntelStatus({
          source: options.source,
          provider: options.provider,
          status: options.status ?? "not_configured",
          itemCount: options.items.length,
          ...(options.updatedAt ? { updatedAt: options.updatedAt } : {}),
          message: options.message ?? `${sourceLabels[options.source]} source is static.`
        })
      ];
    }
  };
}

export function createCachedExternalIntelProvider(options: CachedExternalIntelProviderOptions): ExternalIntelProvider {
  let latestSnapshot = options.initialSnapshot;
  let latestSnapshotAt = latestSnapshot ? Date.now() : 0;
  const maxAgeMs = options.maxAgeMs ?? 300_000;

  return {
    async getSnapshot(symbols: string[], requestOptions?: ExternalIntelRequestOptions): Promise<ExternalIntelSnapshot> {
      if (latestSnapshot && Date.now() - latestSnapshotAt <= maxAgeMs) {
        return latestSnapshot;
      }

      try {
        latestSnapshot = await options.provider.getSnapshot(symbols, requestOptions);
        latestSnapshotAt = Date.now();
        if (options.cacheFile) await writeJsonCache(options.cacheFile, latestSnapshot);

        return latestSnapshot;
      } catch (error) {
        const cached = latestSnapshot ?? (options.cacheFile ? await readJsonCache(options.cacheFile) : undefined);
        const warning = errorMessage(error);
        if (cached) {
          latestSnapshot = asCachedSnapshot(cached, warning);
          latestSnapshotAt = Date.now();
          return latestSnapshot;
        }

        const updatedAt = toIso(requestOptions?.now?.() ?? new Date());
        return {
          items: [],
          statuses: options.provider.describe().map((status) => ({
            ...status,
            status: "unavailable",
            updatedAt,
            message: `${status.label} source is unavailable and no cache exists: ${warning}`,
            itemCount: 0
          })),
          warnings: [warning],
          updatedAt
        };
      }
    },
    describe(): ExternalIntelStatus[] {
      return options.provider.describe();
    }
  };
}

export function buildExternalIntelStatus(options: {
  source: ExternalIntelSource;
  provider: string;
  status: ExternalIntelAvailability;
  itemCount: number;
  message: string;
  updatedAt?: string;
}): ExternalIntelStatus {
  const status = {
    source: options.source,
    label: sourceLabels[options.source],
    status: options.status,
    provider: options.provider,
    message: options.message,
    itemCount: options.itemCount
  };

  return options.updatedAt ? { ...status, updatedAt: options.updatedAt } : status;
}

export function getExternalIntelSourceLabel(source: ExternalIntelSource): string {
  return sourceLabels[source];
}

async function getProviderSnapshot(
  provider: ExternalIntelProvider,
  symbols: string[],
  options?: ExternalIntelRequestOptions
): Promise<ExternalIntelSnapshot> {
  try {
    return await provider.getSnapshot(symbols, options);
  } catch (error) {
    const updatedAt = toIso(options?.now?.() ?? new Date());
    const message = errorMessage(error);

    return {
      items: [],
      statuses: provider.describe().map((status) => ({
        ...status,
        status: "unavailable",
        updatedAt,
        message: `${status.label} source is unavailable: ${message}`,
        itemCount: 0
      })),
      warnings: [message],
      updatedAt
    };
  }
}

function statusForItems(items: ExternalIntelItem[], requestedStatus?: ExternalIntelAvailability): ExternalIntelAvailability {
  if (requestedStatus) return requestedStatus;
  return items.length > 0 ? "available" : "empty";
}

function asCachedSnapshot(snapshot: ExternalIntelSnapshot, warning: string): ExternalIntelSnapshot {
  return {
    ...snapshot,
    statuses: snapshot.statuses.map((status) => ({
      ...status,
      provider: status.provider.endsWith("-cache") ? status.provider : `${status.provider}-cache`,
      message: `${status.message} Using cached real external intelligence because the live source failed: ${warning}`
    })),
    warnings: [warning, ...snapshot.warnings]
  };
}
