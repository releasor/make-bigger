# Real Data Sources Design

## Background

iTrade already uses an EastMoney K-line provider for real A-share market bars, with in-memory/file cache and sample fallback. The short-term intelligence center still treats dragon-tiger list, announcements, news, and theme intelligence as unconfigured placeholders. The next step is to make the platform consume real public data by default where possible, while leaving clean provider slots for paid/token-based data vendors such as TuShare, JQData, or Wind.

This design keeps the platform as a virtual trading and research tool. It does not place live brokerage orders, promise profit, or fabricate market events when a source is unavailable.

## Goals

1. Connect all currently planned real data categories: market bars, expanded symbol universe, sector/theme hints, dragon-tiger list, announcements, and news/theme catalysts.
2. Prefer no-token public sources first, then support token-configured vendors through environment variables.
3. Expose source status clearly: `available`, `empty`, `unavailable`, or `not_configured`.
4. Cache the last successful real response so short upstream outages do not collapse the dashboard.
5. Preserve source provenance for every external intelligence item shown in reports.
6. Keep provider parsing and fallback behavior testable without live network calls.

## Non-Goals

1. No brokerage trading integration.
2. No scraping bypasses for paid data or login-only pages.
3. No guarantee that public sources are complete, stable, or suitable for commercial use.
4. No invented dragon-tiger seats, announcements, news, or themes when upstream data is missing.
5. No broad rewrite of the existing UI copy or encoding issues as part of this data-source work.

## Recommended Approach

Build a unified real-data gateway inside `packages/engine`.

The existing `EastMoneyMarketDataProvider` remains the default K-line provider. New provider modules will add external intelligence and source-status aggregation:

- `externalIntel.ts`: domain-facing provider contracts, snapshot shape, status helpers, and cache wrapper.
- `publicExternalIntel.ts`: no-token public-source provider implementations.
- `tokenDataProviders.ts`: optional provider factories for configured vendor tokens.
- `dataSourceRegistry.ts`: chooses providers from environment/config and combines their results.

The API consumes only the registry/gateway. It does not know whether an item came from EastMoney, a public source, TuShare, JQData, or a future provider.

## Provider Priority

Default priority is conservative:

1. Token-configured vendor provider if an environment variable is present and the provider is enabled.
2. Public no-token provider.
3. Cached last successful real provider response.
4. Explicit unavailable/not-configured status.

No source falls back to fabricated external intelligence. Sample fallback remains allowed only for existing market-bar demo mode, and it must continue to mark `isReal: false`.

## Data Categories

### Market Bars

Use the existing EastMoney K-line provider for daily and minute bars. Expand the symbol universe by reading strategy universes and a default watchlist. The provider keeps its current parse, quality, and cache behavior.

### Sector And Theme Hints

Add a sector/theme provider that can resolve a symbol to a sector or theme label. Initial implementation can use a static curated mapping plus a public provider when available. The report must mark sample quality when mappings are incomplete.

### Dragon-Tiger List

Add a dragon-tiger provider that returns events with:

- `source: "dragon_tiger"`
- `title`
- `provider`
- `timestamp`
- `symbols`
- `summary`
- `confidence`
- `url` when available

When no event is returned for the selected symbols/date, status is `empty`, not `unavailable`.

### Announcements

Add an announcement provider that returns exchange or public announcement items with:

- `source: "announcement"`
- title and summary
- timestamp
- related symbols
- provider and URL

Announcement summaries must be extractive or provider supplied. The first version should avoid AI-generated claims about announcement impact.

### News And Theme Catalysts

Add news/theme providers that return real items only when a source is available. News items and theme items share the same `ExternalIntelItem` type but use `source: "news"` or `source: "theme"`.

## Configuration

Use environment variables for token providers and feature toggles:

- `ITRADE_DATA_VENDOR`: `public`, `tushare`, `jqdata`, `wind`, or `auto`.
- `TUSHARE_TOKEN`: enables TuShare-backed external intelligence where implemented.
- `JQDATA_USERNAME` and `JQDATA_PASSWORD`: reserve JQData configuration.
- `WIND_API_ENABLED`: reserve Wind bridge configuration.
- `ITRADE_PUBLIC_DATA_ENABLED`: defaults to `true`.
- `ITRADE_DATA_CACHE_DIR`: optional cache directory, defaulting to `tmp/market-data-cache`.

If a vendor is selected but credentials are missing, its status is `not_configured`.

## API

Keep existing endpoints and add one status endpoint:

- `GET /api/market-data/status`: include market provider status and bar counts.
- `GET /api/intelligence/short-term`: include real `externalIntelItems` and `externalIntelStatuses`.
- `GET /api/data-sources/status`: return all configured provider statuses, cache age, and warnings.

The short-term intelligence endpoint should refresh market data and external intelligence through the registry, then pass both into `buildShortTermIntelligenceReport`.

## Error Handling

Every provider request uses:

- timeout
- parse validation
- status mapping
- warning capture
- cache read/write

Provider failures become `unavailable` statuses with a short reason. A malformed response is treated as unavailable, not empty. Empty means the source was reachable and valid but had no relevant items.

## Caching

Suggested default TTLs:

- Market bars: 30 seconds.
- Sector/theme mapping: 30 minutes.
- Dragon-tiger list: 15 minutes.
- Announcements: 15 minutes.
- News/theme catalysts: 5 minutes.

The cache stores raw provider snapshots after validation. Cached external intelligence must preserve the original provider and timestamp, and source status must indicate cache usage.

## Testing

Use TDD for implementation:

1. Provider contract tests for combining statuses and items.
2. Parser tests for each public-source response fixture.
3. Cache tests for successful write, upstream failure with cache, and upstream failure without cache.
4. API tests for `/api/intelligence/short-term` and `/api/data-sources/status`.
5. Report tests proving real external items appear in `externalIntelItems` and statuses change from `not_configured` to `available` or `empty`.

No live network call should be required for unit tests. Use injected fetchers and small fixtures.

## Rollout Plan

1. Add shared external-intelligence provider contracts and status aggregation.
2. Add cache wrapper for external intelligence snapshots.
3. Wire API to the registry with no-token public providers enabled by default.
4. Add token-provider configuration slots without requiring paid credentials.
5. Update short-term intelligence report generation to consume real external items.
6. Verify tests, typecheck, and local UI behavior.

## Risks And Boundaries

Public endpoints can change format or rate-limit requests. The system must show clear source warnings and keep using cached real data when possible.

Paid vendors differ in license, coverage, and API shape. The gateway isolates these differences so adopting a paid provider later does not require rewriting reporting or UI code.

Because this is financial data, source attribution and availability must be visible. A report can say data is missing; it must not pretend missing data exists.
