# Short-Term Intelligence Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增一个中文短线情报中枢，基于真实行情快照输出趋势、情绪、板块、强势股、异动、风险、龙虎榜/新闻来源状态、短期展望和操作理由。

**Architecture:** 在 `packages/engine` 新建独立分析模块，通过 `MarketDataSnapshot` 输入生成 `ShortTermIntelligenceReport`；`apps/api` 暴露 `/api/intelligence/short-term`；`apps/web` 新增工作台面板展示报告。外部龙虎榜、新闻和题材先使用 provider 边界与来源状态，未配置时明确显示。

**Tech Stack:** TypeScript、Vitest、Fastify、React、Testing Library、Vite。

---

## File Structure

- Modify: `packages/domain/src/index.ts`，新增短线情报报告领域类型。
- Create: `packages/engine/src/shortTermIntelligence.ts`，实现情绪、板块、强势股、异动、风险和操作建议计算。
- Create: `packages/engine/src/shortTermIntelligence.test.ts`，引擎 TDD 覆盖。
- Modify: `packages/engine/src/index.ts`，导出新模块。
- Modify: `apps/api/src/server.ts`，维护报告状态并新增 API。
- Modify: `apps/api/src/server.test.ts`，覆盖 API 返回。
- Modify: `apps/web/src/App.tsx`，新增报告状态、拉取逻辑和展示组件。
- Modify: `apps/web/src/App.test.tsx`，覆盖 UI 展示。
- Modify: `apps/web/src/styles.css`，新增情报面板样式。
- Modify: `docs/virtual-trading-mvp.md`，中文说明新能力和数据边界。

---

### Task 1: Domain Types

**Files:**
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Write the failing type-level test by importing the future report type**

Run: `npm.cmd run typecheck`

Expected: FAIL because `ShortTermIntelligenceReport` is not exported.

```ts
import type { ShortTermIntelligenceReport } from "@itrade/domain";
```

- [ ] **Step 2: Add domain interfaces**

Add exported types for `ExternalIntelStatus`, `MarketSentimentSnapshot`, `SectorRotationItem`, `StrongStockCandidate`, `RiskSignal`, `ExternalIntelItem`, `ShortTermActionPlan`, and `ShortTermIntelligenceReport`.

- [ ] **Step 3: Run typecheck**

Run: `npm.cmd run typecheck`

Expected: PASS for the new type exports.

### Task 2: Engine Report Generation

**Files:**
- Create: `packages/engine/src/shortTermIntelligence.test.ts`
- Create: `packages/engine/src/shortTermIntelligence.ts`
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: Write failing engine tests**

Test that `buildShortTermIntelligenceReport`:

```ts
const report = buildShortTermIntelligenceReport({
  snapshot,
  sectorMap: { "000001.SZ": "银行", "600000.SH": "银行", "300750.SZ": "新能源" },
  now: "2026-06-08T15:30:00.000+08:00"
});

expect(report.outlook).toContain("短期");
expect(report.sentiment.temperatureScore).toBeGreaterThan(0);
expect(report.sectorRotation[0]?.sector).toBe("银行");
expect(report.watchlist.length).toBeGreaterThan(0);
expect(report.riskSignals.length).toBeGreaterThan(0);
expect(report.externalIntelStatuses).toContainEqual(
  expect.objectContaining({ source: "dragon_tiger", status: "not_configured" })
);
```

Run: `npm.cmd run test -- packages/engine/src/shortTermIntelligence.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 2: Implement minimal engine**

Create a pure function with this signature:

```ts
export function buildShortTermIntelligenceReport(options: BuildShortTermIntelligenceOptions): ShortTermIntelligenceReport
```

It groups bars by symbol, derives latest/previous daily bars, calculates sentiment, sector rotation, strong candidates, risk signals, external source statuses, summary, action plan and conclusion.

- [ ] **Step 3: Export module and run tests**

Run: `npm.cmd run test -- packages/engine/src/shortTermIntelligence.test.ts`

Expected: PASS.

### Task 3: API Integration

**Files:**
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/server.test.ts`

- [ ] **Step 1: Write failing API test**

Add a test for `GET /api/intelligence/short-term`:

```ts
const response = await server.inject({ method: "GET", url: "/api/intelligence/short-term" });
const body = response.json();

expect(response.statusCode).toBe(200);
expect(body.report.outlook).toContain("短期");
expect(body.report.externalIntelStatuses).toContainEqual(
  expect.objectContaining({ source: "dragon_tiger", status: "not_configured" })
);
```

Run: `npm.cmd run test -- apps/api/src/server.test.ts`

Expected: FAIL because the route does not exist.

- [ ] **Step 2: Add route and state**

Add `shortTermIntelligenceReport` to `AppState`, refresh it from `refreshMarketData()`, and return it from `/api/intelligence/short-term`.

- [ ] **Step 3: Run API tests**

Run: `npm.cmd run test -- apps/api/src/server.test.ts`

Expected: PASS.

### Task 4: Frontend Panel

**Files:**
- Modify: `apps/web/src/App.test.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Write failing UI test**

Mock `/api/intelligence/short-term` and assert visible Chinese labels:

```ts
await waitFor(() => expect(screen.getByText("短线情报中枢")).toBeInTheDocument());
expect(screen.getByText("操作建议：精选跟踪")).toBeInTheDocument();
expect(screen.getByText("银行")).toBeInTheDocument();
expect(screen.getByText("龙虎榜：未配置")).toBeInTheDocument();
```

Run: `npm.cmd run test -- apps/web/src/App.test.tsx`

Expected: FAIL because the component does not fetch or render the report.

- [ ] **Step 2: Add state, fetch and components**

Add `ShortTermIntelligenceReportState`, call `/api/intelligence/short-term` in `refresh()`, and render a dense dashboard panel between monitoring and signal center.

- [ ] **Step 3: Style panel**

Add `intelligencePanel`, `sentimentStrip`, `intelGrid`, `watchList`, `sourceStatusList`, and `riskList` styles with responsive constraints.

- [ ] **Step 4: Run UI tests**

Run: `npm.cmd run test -- apps/web/src/App.test.tsx`

Expected: PASS.

### Task 5: Docs and Verification

**Files:**
- Modify: `docs/virtual-trading-mvp.md`

- [ ] **Step 1: Update Chinese docs**

Document the new report panel, data-source statuses, virtual-only boundary, and how to interpret “重点跟踪对象” and “接近异动” labels.

- [ ] **Step 2: Full verification**

Run:

```powershell
npm.cmd run test
npm.cmd run typecheck
npm.cmd run build
```

Expected: all PASS.

- [ ] **Step 3: Browser smoke test**

Start the API and web dev servers, open the web app, confirm the “短线情报中枢” panel renders, and save a screenshot under `tmp/short-term-intelligence-smoke.png`.

- [ ] **Step 4: Commit implementation**

Run:

```powershell
git status --short
git add packages/domain/src/index.ts packages/engine/src/shortTermIntelligence.ts packages/engine/src/shortTermIntelligence.test.ts packages/engine/src/index.ts apps/api/src/server.ts apps/api/src/server.test.ts apps/web/src/App.tsx apps/web/src/App.test.tsx apps/web/src/styles.css docs/virtual-trading-mvp.md docs/superpowers/plans/2026-06-08-short-term-intelligence-center.md
git commit -m "feat: add short-term intelligence center"
```
