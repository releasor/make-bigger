# Real Data Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add real external data-source ingestion for public A-share intelligence while keeping paid/token vendors configurable.

**Architecture:** Keep EastMoney K-line market data as-is and add a focused external-intelligence gateway in `packages/engine`. The API will inject/use this gateway, pass real items into `buildShortTermIntelligenceReport`, and expose aggregate data-source status.

**Tech Stack:** TypeScript, Fastify, Vitest, Node `https`, existing `@itrade/domain` types.

---

### Task 1: External Intelligence Provider Contracts

**Files:**
- Create: `packages/engine/src/externalIntel.ts`
- Test: `packages/engine/src/externalIntel.test.ts`
- Modify: `packages/engine/src/index.ts`

- [x] **Step 1: Write the failing test**

```ts
it("combines provider items and marks empty sources explicitly", async () => {
  const snapshot = await fetchExternalIntelSnapshot(
    createCompositeExternalIntelProvider([
      fixedProvider("dragon_tiger", "available", [intelItem("dragon_tiger", "000001.SZ")]),
      fixedProvider("announcement", "empty", [])
    ]),
    ["000001.SZ"]
  );

  expect(snapshot.items).toHaveLength(1);
  expect(snapshot.statuses).toContainEqual(expect.objectContaining({ source: "dragon_tiger", status: "available" }));
  expect(snapshot.statuses).toContainEqual(expect.objectContaining({ source: "announcement", status: "empty" }));
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- packages/engine/src/externalIntel.test.ts`

Expected: FAIL because `externalIntel.ts` does not exist.

- [x] **Step 3: Write minimal implementation**

Implement `ExternalIntelProvider`, `ExternalIntelSnapshot`, `createCompositeExternalIntelProvider`, `fetchExternalIntelSnapshot`, `createStaticExternalIntelProvider`, and source labels.

- [x] **Step 4: Run test to verify it passes**

Run: `npm.cmd test -- packages/engine/src/externalIntel.test.ts`

Expected: PASS.

### Task 2: Public EastMoney External Providers

**Files:**
- Create: `packages/engine/src/publicExternalIntel.ts`
- Test: `packages/engine/src/publicExternalIntel.test.ts`
- Modify: `packages/engine/src/index.ts`

- [x] **Step 1: Write the failing parser tests**

```ts
it("parses EastMoney dragon-tiger rows into external intel items", async () => {
  const provider = new EastMoneyExternalIntelProvider({ fetcher: fixtureFetcher });
  const snapshot = await provider.getSnapshot(["000001.SZ"], { now: () => new Date("2026-06-09T08:00:00Z") });

  expect(snapshot.items).toContainEqual(expect.objectContaining({
    source: "dragon_tiger",
    relatedSymbols: ["000001.SZ"],
    provider: "eastmoney-dragon-tiger"
  }));
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- packages/engine/src/publicExternalIntel.test.ts`

Expected: FAIL because provider is missing.

- [x] **Step 3: Implement public provider**

Implement injected-fetcher requests for dragon-tiger, announcements, news, and theme queries. Parse valid JSON/JSONP, normalize symbols, and return `empty` when the source is valid but has no relevant rows.

- [x] **Step 4: Run test to verify it passes**

Run: `npm.cmd test -- packages/engine/src/publicExternalIntel.test.ts`

Expected: PASS.

### Task 3: Data Source Registry And API Wiring

**Files:**
- Create: `packages/engine/src/dataSourceRegistry.ts`
- Test: `packages/engine/src/dataSourceRegistry.test.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/server.test.ts`
- Modify: `packages/engine/src/index.ts`

- [x] **Step 1: Write failing API tests**

```ts
it("returns aggregate data source status", async () => {
  const server = buildServer({
    marketDataProvider: fakeMarketDataProvider(),
    externalIntelProvider: fakeExternalIntelProvider()
  });

  const response = await server.inject({ method: "GET", url: "/api/data-sources/status" });

  expect(response.statusCode).toBe(200);
  expect(response.json().externalIntel.statuses).toContainEqual(
    expect.objectContaining({ source: "news", status: "available" })
  );
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- apps/api/src/server.test.ts`

Expected: FAIL because the API does not accept/use `externalIntelProvider` and lacks `/api/data-sources/status`.

- [x] **Step 3: Wire implementation**

Add `externalIntelProvider` to `buildServer`, refresh external intel alongside market data, pass items/statuses to `buildShortTermIntelligenceReport`, and add `/api/data-sources/status`.

- [x] **Step 4: Run API tests**

Run: `npm.cmd test -- apps/api/src/server.test.ts`

Expected: PASS.

### Task 4: Token Provider Configuration Slots

**Files:**
- Create: `packages/engine/src/tokenDataProviders.ts`
- Test: `packages/engine/src/tokenDataProviders.test.ts`
- Modify: `packages/engine/src/dataSourceRegistry.ts`

- [x] **Step 1: Write failing configuration tests**

```ts
it("marks selected token vendors as not configured when credentials are missing", () => {
  const provider = createTokenExternalIntelProvider({ vendor: "tushare", env: {} });
  expect(provider.describe()).toContainEqual(expect.objectContaining({ provider: "tushare", status: "not_configured" }));
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- packages/engine/src/tokenDataProviders.test.ts`

Expected: FAIL because token provider slots do not exist.

- [x] **Step 3: Implement slots**

Return not-configured status providers for `tushare`, `jqdata`, and `wind` unless required credentials exist. Keep paid network implementations disabled for this pass.

- [x] **Step 4: Run tests**

Run: `npm.cmd test -- packages/engine/src/tokenDataProviders.test.ts`

Expected: PASS.

### Task 5: Verification

**Files:**
- Modify only if tests expose integration gaps.

- [x] **Step 1: Run focused tests**

Run: `npm.cmd test -- packages/engine/src/externalIntel.test.ts packages/engine/src/publicExternalIntel.test.ts packages/engine/src/dataSourceRegistry.test.ts packages/engine/src/tokenDataProviders.test.ts apps/api/src/server.test.ts`

- [x] **Step 2: Run full project checks**

Run: `npm.cmd run test`

Run: `npm.cmd run typecheck`

Expected: both pass.
