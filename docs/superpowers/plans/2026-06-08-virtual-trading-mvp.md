# Virtual Trading MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first runnable MVP for an AI-driven A-share virtual trading platform: strategy definition, switchable strategy workspace, sample daily/minute data, virtual trading, portfolio risk, monitoring state, audit log, and daily report.

**Architecture:** Use a TypeScript monorepo with service-compatible package boundaries. The first build runs locally, but the domain, engine, API, and web console are separated so they can become independent services later.

**Tech Stack:** Node.js 24, npm workspaces, TypeScript, Vitest, Fastify, React, Vite, React Testing Library.

---

## Scope Note

The design spec covers a full distributed research platform. This plan implements the first independently testable slice:

- One local API service.
- One local web console.
- Core domain package.
- Core virtual-trading engine package.
- In-memory sample data and state.
- Multi-strategy virtual portfolio.
- Daily report metrics.

Broker execution, external notification channels, production data storage, and distributed worker deployment are intentionally outside this first implementation plan.

## File Structure

Create this structure:

```text
E:\Prizm\itrade
  .gitignore
  package.json
  tsconfig.base.json
  docs/
    superpowers/
      specs/
      plans/
  packages/
    domain/
      package.json
      tsconfig.json
      src/
        index.ts
        strategyDefinition.test.ts
    engine/
      package.json
      tsconfig.json
      src/
        index.ts
        marketData.ts
        marketData.test.ts
        signalEngine.ts
        signalEngine.test.ts
        riskEngine.ts
        riskEngine.test.ts
        virtualTrading.ts
        virtualTrading.test.ts
        reporting.ts
        reporting.test.ts
  apps/
    api/
      package.json
      tsconfig.json
      src/
        server.ts
        server.test.ts
        main.ts
    web/
      package.json
      tsconfig.json
      index.html
      vite.config.ts
      src/
        main.tsx
        App.tsx
        App.test.tsx
        styles.css
```

Package responsibilities:

- `packages/domain`: shared platform types, strategy-definition validation, audit event shapes.
- `packages/engine`: deterministic market data fixtures, strategy signal evaluation, risk checks, virtual fills, portfolio state, and reporting metrics.
- `apps/api`: Fastify API over in-memory state for strategies, simulation, monitoring, reports, and audit events.
- `apps/web`: React console with switchable strategy builder modes, monitoring state, report summary, and hot-parameter form.

---

### Task 1: Bootstrap Workspace

**Files:**
- Create: `E:\Prizm\itrade\.gitignore`
- Create: `E:\Prizm\itrade\package.json`
- Create: `E:\Prizm\itrade\tsconfig.base.json`
- Create: `E:\Prizm\itrade\packages\domain\package.json`
- Create: `E:\Prizm\itrade\packages\domain\tsconfig.json`
- Create: `E:\Prizm\itrade\packages\engine\package.json`
- Create: `E:\Prizm\itrade\packages\engine\tsconfig.json`
- Create: `E:\Prizm\itrade\apps\api\package.json`
- Create: `E:\Prizm\itrade\apps\api\tsconfig.json`
- Create: `E:\Prizm\itrade\apps\web\package.json`
- Create: `E:\Prizm\itrade\apps\web\tsconfig.json`
- Create: `E:\Prizm\itrade\apps\web\index.html`
- Create: `E:\Prizm\itrade\apps\web\vite.config.ts`

- [ ] **Step 1: Initialize git**

Run:

```powershell
git init
```

Expected: repository initialized under `E:\Prizm\itrade\.git`.

- [ ] **Step 2: Create root ignore file**

Create `E:\Prizm\itrade\.gitignore`:

```gitignore
node_modules/
dist/
coverage/
.vite/
.superpowers/
*.log
```

- [ ] **Step 3: Create root package manifest**

Create `E:\Prizm\itrade\package.json`:

```json
{
  "name": "itrade",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "workspaces": [
    "packages/*",
    "apps/*"
  ],
  "scripts": {
    "dev": "concurrently -n API,WEB -c cyan,magenta \"npm run dev -w @itrade/api\" \"npm run dev -w @itrade/web\"",
    "test": "vitest run --passWithNoTests",
    "test:watch": "vitest",
    "typecheck": "tsc -b packages/domain packages/engine apps/api apps/web",
    "build": "npm run build -w @itrade/web && npm run build -w @itrade/api"
  },
  "dependencies": {
    "@fastify/cors": "^10.0.2",
    "@vitejs/plugin-react": "^4.3.4",
    "concurrently": "^9.1.2",
    "fastify": "^5.2.1",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "vite": "^6.1.0",
    "zod": "^3.24.2"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.2.0",
    "@types/node": "^22.13.1",
    "@types/react": "^19.0.8",
    "@types/react-dom": "^19.0.3",
    "jsdom": "^26.0.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.3",
    "vitest": "^3.0.5"
  }
}
```

- [ ] **Step 4: Create shared TypeScript config**

Create `E:\Prizm\itrade\tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "baseUrl": ".",
    "paths": {
      "@itrade/domain": ["packages/domain/src/index.ts"],
      "@itrade/engine": ["packages/engine/src/index.ts"]
    }
  }
}
```

- [ ] **Step 5: Create package manifests and configs**

Create `E:\Prizm\itrade\packages\domain\package.json`:

```json
{
  "name": "@itrade/domain",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  }
}
```

Create `E:\Prizm\itrade\packages\domain\tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

Create `E:\Prizm\itrade\packages\engine\package.json`:

```json
{
  "name": "@itrade/engine",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@itrade/domain": "0.1.0"
  }
}
```

Create `E:\Prizm\itrade\packages\engine\tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "rootDir": "src",
    "outDir": "dist"
  },
  "references": [{ "path": "../domain" }],
  "include": ["src"]
}
```

Create `E:\Prizm\itrade\apps\api\package.json`:

```json
{
  "name": "@itrade/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/main.js"
  },
  "dependencies": {
    "@itrade/domain": "0.1.0",
    "@itrade/engine": "0.1.0"
  }
}
```

Create `E:\Prizm\itrade\apps\api\tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "rootDir": "src",
    "outDir": "dist",
    "types": ["node"]
  },
  "references": [
    { "path": "../../packages/domain" },
    { "path": "../../packages/engine" }
  ],
  "include": ["src"]
}
```

Create `E:\Prizm\itrade\apps\web\package.json`:

```json
{
  "name": "@itrade/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "vite build",
    "preview": "vite preview --host 127.0.0.1"
  },
  "dependencies": {
    "@itrade/domain": "0.1.0"
  }
}
```

Create `E:\Prizm\itrade\apps\web\tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "references": [{ "path": "../../packages/domain" }],
  "include": ["src", "vite.config.ts"]
}
```

Create `E:\Prizm\itrade\apps\web\index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>iTrade Virtual Desk</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `E:\Prizm\itrade\apps\web\vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8787"
    }
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: []
  }
});
```

- [ ] **Step 6: Install dependencies**

Run:

```powershell
npm.cmd install
```

Expected: `node_modules` and `package-lock.json` are created.

- [ ] **Step 7: Run empty test harness**

Run:

```powershell
npm.cmd run test
```

Expected: Vitest exits successfully with no test files or no failed tests.

- [ ] **Step 8: Commit bootstrap**

Run:

```powershell
git add .gitignore package.json package-lock.json tsconfig.base.json packages apps docs/superpowers/plans/2026-06-08-virtual-trading-mvp.md
git commit -m "chore: bootstrap virtual trading workspace"
```

Expected: first commit is created.

---

### Task 2: Domain Model And Strategy Validation

**Files:**
- Create: `E:\Prizm\itrade\packages\domain\src\strategyDefinition.test.ts`
- Create: `E:\Prizm\itrade\packages\domain\src\index.ts`

- [ ] **Step 1: Write the failing validation test**

Create `E:\Prizm\itrade\packages\domain\src\strategyDefinition.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createStrategyVersion, validateStrategyDefinition } from "./index";

describe("strategy definitions", () => {
  it("accepts a valid structured-rule strategy", () => {
    const strategy = createStrategyVersion({
      id: "ma-volume",
      name: "双均线成交量策略",
      universe: ["000001.SZ", "600000.SH"],
      version: 1,
      parameters: {
        maxPositionPct: 0.1,
        stopLossPct: 0.08,
        buyThreshold: 1
      }
    });

    const result = validateStrategyDefinition(strategy);

    expect(result.ok).toBe(true);
    expect(strategy.status).toBe("draft");
    expect(strategy.rules.entry[0]?.left).toBe("close");
  });

  it("rejects position sizes above 100 percent", () => {
    const strategy = createStrategyVersion({
      id: "bad-risk",
      name: "错误风控策略",
      universe: ["000001.SZ"],
      version: 1,
      parameters: {
        maxPositionPct: 1.5,
        stopLossPct: 0.08,
        buyThreshold: 1
      }
    });

    const result = validateStrategyDefinition(strategy);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("parameters.maxPositionPct must be between 0 and 1");
  });
});
```

- [ ] **Step 2: Run the domain test and verify failure**

Run:

```powershell
npm.cmd run test -- packages/domain/src/strategyDefinition.test.ts
```

Expected: FAIL because `./index` does not exist.

- [ ] **Step 3: Implement the domain model**

Create `E:\Prizm\itrade\packages\domain\src\index.ts`:

```ts
export type StrategyStatus = "draft" | "published" | "paused" | "running";
export type RuleOperator = "gt" | "gte" | "lt" | "lte" | "eq";
export type SignalSide = "buy" | "sell";
export type OrderSide = "buy" | "sell";

export interface RuntimeParameters {
  maxPositionPct: number;
  stopLossPct: number;
  buyThreshold: number;
}

export interface RuleValue {
  kind: "field" | "number";
  value: string | number;
}

export interface RuleCondition {
  left: string;
  operator: RuleOperator;
  right: RuleValue;
}

export interface StrategyRules {
  entry: RuleCondition[];
  exit: RuleCondition[];
}

export interface StrategyDefinition {
  id: string;
  name: string;
  version: number;
  status: StrategyStatus;
  universe: string[];
  dataFrequency: "daily" | "minute" | "daily-and-minute";
  parameters: RuntimeParameters;
  rules: StrategyRules;
  createdAt: string;
  updatedAt: string;
}

export interface StrategySeed {
  id: string;
  name: string;
  version: number;
  universe: string[];
  parameters: RuntimeParameters;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export interface MarketBar {
  symbol: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  fields: Record<string, number>;
}

export interface Signal {
  id: string;
  strategyId: string;
  strategyVersion: number;
  symbol: string;
  side: SignalSide;
  timestamp: string;
  confidence: number;
  reason: string;
}

export interface Order {
  id: string;
  strategyId: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  requestedPrice: number;
  timestamp: string;
}

export interface Fill {
  orderId: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  price: number;
  commission: number;
  tax: number;
  timestamp: string;
}

export interface Position {
  symbol: string;
  quantity: number;
  averageCost: number;
  marketPrice: number;
}

export interface PortfolioSnapshot {
  cash: number;
  positions: Position[];
  totalEquity: number;
  realizedPnl: number;
  unrealizedPnl: number;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  actor: "system" | "user" | "ai";
  action: string;
  entityId: string;
  details: Record<string, string | number | boolean>;
}

export function createStrategyVersion(seed: StrategySeed): StrategyDefinition {
  const now = "2026-06-08T09:30:00.000+08:00";

  return {
    id: seed.id,
    name: seed.name,
    version: seed.version,
    status: "draft",
    universe: seed.universe,
    dataFrequency: "daily-and-minute",
    parameters: seed.parameters,
    rules: {
      entry: [
        { left: "close", operator: "gt", right: { kind: "field", value: "ma20" } },
        { left: "volume", operator: "gt", right: { kind: "field", value: "avgVolume20" } }
      ],
      exit: [
        { left: "rsi14", operator: "lt", right: { kind: "number", value: 35 } }
      ]
    },
    createdAt: now,
    updatedAt: now
  };
}

export function validateStrategyDefinition(strategy: StrategyDefinition): ValidationResult {
  const errors: string[] = [];

  if (!strategy.id.trim()) errors.push("id is required");
  if (!strategy.name.trim()) errors.push("name is required");
  if (strategy.version < 1) errors.push("version must be positive");
  if (strategy.universe.length === 0) errors.push("universe must include at least one symbol");
  if (strategy.parameters.maxPositionPct <= 0 || strategy.parameters.maxPositionPct > 1) {
    errors.push("parameters.maxPositionPct must be between 0 and 1");
  }
  if (strategy.parameters.stopLossPct <= 0 || strategy.parameters.stopLossPct > 1) {
    errors.push("parameters.stopLossPct must be between 0 and 1");
  }
  if (strategy.rules.entry.length === 0) errors.push("entry rules must include at least one condition");
  if (strategy.rules.exit.length === 0) errors.push("exit rules must include at least one condition");

  return { ok: errors.length === 0, errors };
}
```

- [ ] **Step 4: Run the domain test and verify pass**

Run:

```powershell
npm.cmd run test -- packages/domain/src/strategyDefinition.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run typecheck**

Run:

```powershell
npm.cmd run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit domain model**

Run:

```powershell
git add packages/domain
git commit -m "feat: add strategy definition domain model"
```

Expected: commit is created.

---

### Task 3: Sample Market Data And Quality Checks

**Files:**
- Create: `E:\Prizm\itrade\packages\engine\src\marketData.test.ts`
- Create: `E:\Prizm\itrade\packages\engine\src\marketData.ts`
- Create: `E:\Prizm\itrade\packages\engine\src\index.ts`

- [ ] **Step 1: Write the failing market data test**

Create `E:\Prizm\itrade\packages\engine\src\marketData.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getSampleBars, inspectMarketDataQuality } from "./marketData";

describe("market data fixtures", () => {
  it("loads deterministic daily and minute sample bars", () => {
    const bars = getSampleBars();

    expect(bars.daily).toHaveLength(4);
    expect(bars.minute).toHaveLength(4);
    expect(bars.daily[0]?.symbol).toBe("000001.SZ");
    expect(bars.minute[0]?.fields.ma20).toBeGreaterThan(0);
  });

  it("detects abnormal price and missing required fields", () => {
    const bars = getSampleBars();
    const broken = [
      { ...bars.daily[0]!, close: -1 },
      { ...bars.daily[1]!, fields: {} }
    ];

    const result = inspectMarketDataQuality(broken);

    expect(result.ok).toBe(false);
    expect(result.issues).toContain("000001.SZ 2026-06-08T15:00:00.000+08:00 has non-positive close");
    expect(result.issues).toContain("600000.SH 2026-06-08T15:00:00.000+08:00 missing field ma20");
  });
});
```

- [ ] **Step 2: Run the market data test and verify failure**

Run:

```powershell
npm.cmd run test -- packages/engine/src/marketData.test.ts
```

Expected: FAIL because `marketData.ts` does not exist.

- [ ] **Step 3: Implement sample data and quality checks**

Create `E:\Prizm\itrade\packages\engine\src\marketData.ts`:

```ts
import type { MarketBar } from "@itrade/domain";

export interface MarketDataSet {
  daily: MarketBar[];
  minute: MarketBar[];
}

export interface DataQualityResult {
  ok: boolean;
  issues: string[];
}

const requiredFields = ["ma20", "avgVolume20", "rsi14"] as const;

export function getSampleBars(): MarketDataSet {
  const daily: MarketBar[] = [
    bar("000001.SZ", "2026-06-08T15:00:00.000+08:00", 10.1, 10.6, 9.9, 10.5, 1200000, 10.2, 900000, 42),
    bar("600000.SH", "2026-06-08T15:00:00.000+08:00", 8.1, 8.4, 8.0, 8.3, 900000, 8.2, 700000, 48),
    bar("000001.SZ", "2026-06-09T15:00:00.000+08:00", 10.5, 10.9, 10.4, 10.8, 1300000, 10.3, 950000, 46),
    bar("600000.SH", "2026-06-09T15:00:00.000+08:00", 8.3, 8.6, 8.2, 8.5, 950000, 8.25, 720000, 44)
  ];

  const minute: MarketBar[] = [
    bar("000001.SZ", "2026-06-08T09:31:00.000+08:00", 10.1, 10.2, 10.0, 10.15, 18000, 10.05, 15000, 39),
    bar("000001.SZ", "2026-06-08T09:32:00.000+08:00", 10.15, 10.35, 10.14, 10.34, 26000, 10.06, 15000, 43),
    bar("600000.SH", "2026-06-08T09:31:00.000+08:00", 8.1, 8.2, 8.08, 8.18, 14000, 8.12, 12000, 45),
    bar("600000.SH", "2026-06-08T09:32:00.000+08:00", 8.18, 8.19, 8.1, 8.11, 11000, 8.13, 12000, 32)
  ];

  return { daily, minute };
}

export function inspectMarketDataQuality(bars: MarketBar[]): DataQualityResult {
  const issues: string[] = [];

  for (const item of bars) {
    if (item.close <= 0) issues.push(`${item.symbol} ${item.timestamp} has non-positive close`);
    if (item.high < item.low) issues.push(`${item.symbol} ${item.timestamp} high is below low`);

    for (const field of requiredFields) {
      if (typeof item.fields[field] !== "number") {
        issues.push(`${item.symbol} ${item.timestamp} missing field ${field}`);
      }
    }
  }

  return { ok: issues.length === 0, issues };
}

function bar(
  symbol: string,
  timestamp: string,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
  ma20: number,
  avgVolume20: number,
  rsi14: number
): MarketBar {
  return {
    symbol,
    timestamp,
    open,
    high,
    low,
    close,
    volume,
    fields: { ma20, avgVolume20, rsi14 }
  };
}
```

Create `E:\Prizm\itrade\packages\engine\src\index.ts`:

```ts
export * from "./marketData";
```

- [ ] **Step 4: Run market data tests and verify pass**

Run:

```powershell
npm.cmd run test -- packages/engine/src/marketData.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run full tests**

Run:

```powershell
npm.cmd run test
```

Expected: PASS.

- [ ] **Step 6: Commit sample data**

Run:

```powershell
git add packages/engine/src
git commit -m "feat: add sample market data quality checks"
```

Expected: commit is created.

---

### Task 4: Structured Rule Signal Engine

**Files:**
- Create: `E:\Prizm\itrade\packages\engine\src\signalEngine.test.ts`
- Create: `E:\Prizm\itrade\packages\engine\src\signalEngine.ts`
- Modify: `E:\Prizm\itrade\packages\engine\src\index.ts`

- [ ] **Step 1: Write the failing signal engine test**

Create `E:\Prizm\itrade\packages\engine\src\signalEngine.test.ts`:

```ts
import { createStrategyVersion } from "@itrade/domain";
import { describe, expect, it } from "vitest";
import { evaluateSignals } from "./signalEngine";

describe("signal engine", () => {
  it("emits buy signals when all entry rules pass", () => {
    const strategy = createStrategyVersion({
      id: "ma-volume",
      name: "双均线成交量策略",
      version: 1,
      universe: ["000001.SZ"],
      parameters: { maxPositionPct: 0.1, stopLossPct: 0.08, buyThreshold: 1 }
    });

    const signals = evaluateSignals(strategy, [
      {
        symbol: "000001.SZ",
        timestamp: "2026-06-08T09:32:00.000+08:00",
        open: 10.15,
        high: 10.35,
        low: 10.14,
        close: 10.34,
        volume: 26000,
        fields: { ma20: 10.06, avgVolume20: 15000, rsi14: 43 }
      }
    ]);

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      strategyId: "ma-volume",
      symbol: "000001.SZ",
      side: "buy",
      confidence: 1
    });
  });

  it("emits sell signals when exit rules pass", () => {
    const strategy = createStrategyVersion({
      id: "ma-volume",
      name: "双均线成交量策略",
      version: 1,
      universe: ["600000.SH"],
      parameters: { maxPositionPct: 0.1, stopLossPct: 0.08, buyThreshold: 1 }
    });

    const signals = evaluateSignals(strategy, [
      {
        symbol: "600000.SH",
        timestamp: "2026-06-08T09:32:00.000+08:00",
        open: 8.18,
        high: 8.19,
        low: 8.1,
        close: 8.11,
        volume: 11000,
        fields: { ma20: 8.13, avgVolume20: 12000, rsi14: 32 }
      }
    ]);

    expect(signals).toHaveLength(1);
    expect(signals[0]?.side).toBe("sell");
  });
});
```

- [ ] **Step 2: Run the signal test and verify failure**

Run:

```powershell
npm.cmd run test -- packages/engine/src/signalEngine.test.ts
```

Expected: FAIL because `signalEngine.ts` does not exist.

- [ ] **Step 3: Implement the signal engine**

Create `E:\Prizm\itrade\packages\engine\src\signalEngine.ts`:

```ts
import type { MarketBar, RuleCondition, Signal, StrategyDefinition } from "@itrade/domain";

export function evaluateSignals(strategy: StrategyDefinition, bars: MarketBar[]): Signal[] {
  const signals: Signal[] = [];

  for (const bar of bars) {
    if (!strategy.universe.includes(bar.symbol)) continue;

    const entryPass = strategy.rules.entry.every((rule) => evaluateRule(rule, bar));
    if (entryPass) {
      signals.push(createSignal(strategy, bar, "buy", "entry rules matched"));
      continue;
    }

    const exitPass = strategy.rules.exit.some((rule) => evaluateRule(rule, bar));
    if (exitPass) {
      signals.push(createSignal(strategy, bar, "sell", "exit rules matched"));
    }
  }

  return signals;
}

function createSignal(
  strategy: StrategyDefinition,
  bar: MarketBar,
  side: "buy" | "sell",
  reason: string
): Signal {
  return {
    id: `${strategy.id}-${strategy.version}-${bar.symbol}-${bar.timestamp}-${side}`,
    strategyId: strategy.id,
    strategyVersion: strategy.version,
    symbol: bar.symbol,
    side,
    timestamp: bar.timestamp,
    confidence: 1,
    reason
  };
}

function evaluateRule(rule: RuleCondition, bar: MarketBar): boolean {
  const left = readValue(rule.left, bar);
  const right = rule.right.kind === "number" ? Number(rule.right.value) : readValue(String(rule.right.value), bar);

  switch (rule.operator) {
    case "gt":
      return left > right;
    case "gte":
      return left >= right;
    case "lt":
      return left < right;
    case "lte":
      return left <= right;
    case "eq":
      return left === right;
  }
}

function readValue(name: string, bar: MarketBar): number {
  if (name === "open") return bar.open;
  if (name === "high") return bar.high;
  if (name === "low") return bar.low;
  if (name === "close") return bar.close;
  if (name === "volume") return bar.volume;

  const value = bar.fields[name];
  if (typeof value !== "number") {
    throw new Error(`Market field ${name} is missing for ${bar.symbol} ${bar.timestamp}`);
  }
  return value;
}
```

Modify `E:\Prizm\itrade\packages\engine\src\index.ts`:

```ts
export * from "./marketData";
export * from "./signalEngine";
```

- [ ] **Step 4: Run signal tests and verify pass**

Run:

```powershell
npm.cmd run test -- packages/engine/src/signalEngine.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run full tests and typecheck**

Run:

```powershell
npm.cmd run test
npm.cmd run typecheck
```

Expected: both commands PASS.

- [ ] **Step 6: Commit signal engine**

Run:

```powershell
git add packages/engine/src
git commit -m "feat: evaluate structured strategy signals"
```

Expected: commit is created.

---

### Task 5: Portfolio Risk Engine

**Files:**
- Create: `E:\Prizm\itrade\packages\engine\src\riskEngine.test.ts`
- Create: `E:\Prizm\itrade\packages\engine\src\riskEngine.ts`
- Modify: `E:\Prizm\itrade\packages\engine\src\index.ts`

- [ ] **Step 1: Write the failing risk engine test**

Create `E:\Prizm\itrade\packages\engine\src\riskEngine.test.ts`:

```ts
import type { Order, PortfolioSnapshot } from "@itrade/domain";
import { describe, expect, it } from "vitest";
import { checkOrderRisk } from "./riskEngine";

const portfolio: PortfolioSnapshot = {
  cash: 100000,
  positions: [],
  totalEquity: 100000,
  realizedPnl: 0,
  unrealizedPnl: 0
};

describe("risk engine", () => {
  it("approves an order inside per-symbol exposure", () => {
    const order = orderFor(100, 10);

    const result = checkOrderRisk(order, portfolio, { maxSymbolExposurePct: 0.2, killSwitch: false });

    expect(result.approved).toBe(true);
    expect(result.reason).toBe("approved");
  });

  it("rejects an order above per-symbol exposure", () => {
    const order = orderFor(3000, 10);

    const result = checkOrderRisk(order, portfolio, { maxSymbolExposurePct: 0.2, killSwitch: false });

    expect(result.approved).toBe(false);
    expect(result.reason).toBe("symbol exposure 30000 exceeds limit 20000");
  });

  it("rejects all orders when kill switch is enabled", () => {
    const order = orderFor(100, 10);

    const result = checkOrderRisk(order, portfolio, { maxSymbolExposurePct: 0.2, killSwitch: true });

    expect(result.approved).toBe(false);
    expect(result.reason).toBe("portfolio kill switch is enabled");
  });
});

function orderFor(quantity: number, price: number): Order {
  return {
    id: `order-${quantity}`,
    strategyId: "ma-volume",
    symbol: "000001.SZ",
    side: "buy",
    quantity,
    requestedPrice: price,
    timestamp: "2026-06-08T09:32:00.000+08:00"
  };
}
```

- [ ] **Step 2: Run risk tests and verify failure**

Run:

```powershell
npm.cmd run test -- packages/engine/src/riskEngine.test.ts
```

Expected: FAIL because `riskEngine.ts` does not exist.

- [ ] **Step 3: Implement risk engine**

Create `E:\Prizm\itrade\packages\engine\src\riskEngine.ts`:

```ts
import type { Order, PortfolioSnapshot } from "@itrade/domain";

export interface RiskLimits {
  maxSymbolExposurePct: number;
  killSwitch: boolean;
}

export interface RiskDecision {
  approved: boolean;
  reason: string;
}

export function checkOrderRisk(order: Order, portfolio: PortfolioSnapshot, limits: RiskLimits): RiskDecision {
  if (limits.killSwitch) {
    return { approved: false, reason: "portfolio kill switch is enabled" };
  }

  if (order.side === "sell") {
    return { approved: true, reason: "approved" };
  }

  const requestedExposure = order.quantity * order.requestedPrice;
  const exposureLimit = portfolio.totalEquity * limits.maxSymbolExposurePct;

  if (requestedExposure > exposureLimit) {
    return {
      approved: false,
      reason: `symbol exposure ${requestedExposure} exceeds limit ${exposureLimit}`
    };
  }

  if (requestedExposure > portfolio.cash) {
    return {
      approved: false,
      reason: `cash ${portfolio.cash} is below requested exposure ${requestedExposure}`
    };
  }

  return { approved: true, reason: "approved" };
}
```

Modify `E:\Prizm\itrade\packages\engine\src\index.ts`:

```ts
export * from "./marketData";
export * from "./signalEngine";
export * from "./riskEngine";
```

- [ ] **Step 4: Run risk tests and verify pass**

Run:

```powershell
npm.cmd run test -- packages/engine/src/riskEngine.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run full test suite**

Run:

```powershell
npm.cmd run test
```

Expected: PASS.

- [ ] **Step 6: Commit risk engine**

Run:

```powershell
git add packages/engine/src
git commit -m "feat: add portfolio order risk checks"
```

Expected: commit is created.

---

### Task 6: Virtual Trading Engine

**Files:**
- Create: `E:\Prizm\itrade\packages\engine\src\virtualTrading.test.ts`
- Create: `E:\Prizm\itrade\packages\engine\src\virtualTrading.ts`
- Modify: `E:\Prizm\itrade\packages\engine\src\index.ts`

- [ ] **Step 1: Write the failing virtual trading test**

Create `E:\Prizm\itrade\packages\engine\src\virtualTrading.test.ts`:

```ts
import { createStrategyVersion } from "@itrade/domain";
import { describe, expect, it } from "vitest";
import { getSampleBars } from "./marketData";
import { runVirtualTradingSession } from "./virtualTrading";

describe("virtual trading engine", () => {
  it("turns buy signals into virtual fills and positions", () => {
    const strategy = createStrategyVersion({
      id: "ma-volume",
      name: "双均线成交量策略",
      version: 1,
      universe: ["000001.SZ"],
      parameters: { maxPositionPct: 0.1, stopLossPct: 0.08, buyThreshold: 1 }
    });

    const result = runVirtualTradingSession({
      strategies: [strategy],
      bars: getSampleBars().minute,
      startingCash: 100000,
      maxSymbolExposurePct: 0.2,
      killSwitch: false
    });

    expect(result.signals.some((signal) => signal.side === "buy")).toBe(true);
    expect(result.orders).toHaveLength(1);
    expect(result.fills).toHaveLength(1);
    expect(result.portfolio.positions[0]).toMatchObject({ symbol: "000001.SZ", quantity: 96 });
    expect(result.auditEvents.map((event) => event.action)).toContain("virtual_fill_created");
  });
});
```

- [ ] **Step 2: Run virtual trading tests and verify failure**

Run:

```powershell
npm.cmd run test -- packages/engine/src/virtualTrading.test.ts
```

Expected: FAIL because `virtualTrading.ts` does not exist.

- [ ] **Step 3: Implement virtual trading engine**

Create `E:\Prizm\itrade\packages\engine\src\virtualTrading.ts`:

```ts
import type {
  AuditEvent,
  Fill,
  MarketBar,
  Order,
  PortfolioSnapshot,
  Position,
  Signal,
  StrategyDefinition
} from "@itrade/domain";
import { checkOrderRisk } from "./riskEngine";
import { evaluateSignals } from "./signalEngine";

export interface VirtualTradingInput {
  strategies: StrategyDefinition[];
  bars: MarketBar[];
  startingCash: number;
  maxSymbolExposurePct: number;
  killSwitch: boolean;
}

export interface VirtualTradingResult {
  signals: Signal[];
  orders: Order[];
  fills: Fill[];
  portfolio: PortfolioSnapshot;
  auditEvents: AuditEvent[];
}

export function runVirtualTradingSession(input: VirtualTradingInput): VirtualTradingResult {
  let portfolio: PortfolioSnapshot = {
    cash: input.startingCash,
    positions: [],
    totalEquity: input.startingCash,
    realizedPnl: 0,
    unrealizedPnl: 0
  };
  const signals: Signal[] = [];
  const orders: Order[] = [];
  const fills: Fill[] = [];
  const auditEvents: AuditEvent[] = [];

  for (const strategy of input.strategies) {
    const strategySignals = evaluateSignals(strategy, input.bars);
    signals.push(...strategySignals);

    for (const signal of strategySignals) {
      const bar = input.bars.find((item) => item.symbol === signal.symbol && item.timestamp === signal.timestamp);
      if (!bar) continue;

      const order = createOrder(signal, bar, portfolio, strategy.parameters.maxPositionPct);
      const decision = checkOrderRisk(order, portfolio, {
        maxSymbolExposurePct: input.maxSymbolExposurePct,
        killSwitch: input.killSwitch
      });

      auditEvents.push(audit("risk_checked", order.id, { approved: decision.approved, reason: decision.reason }));

      if (!decision.approved) continue;

      const fill = createFill(order);
      orders.push(order);
      fills.push(fill);
      portfolio = applyFill(portfolio, fill);
      auditEvents.push(audit("virtual_fill_created", fill.orderId, { symbol: fill.symbol, quantity: fill.quantity }));
    }
  }

  return { signals, orders, fills, portfolio, auditEvents };
}

function createOrder(signal: Signal, bar: MarketBar, portfolio: PortfolioSnapshot, maxPositionPct: number): Order {
  const cashBudget = portfolio.totalEquity * maxPositionPct;
  const quantity = Math.floor(cashBudget / bar.close);

  return {
    id: `order-${signal.id}`,
    strategyId: signal.strategyId,
    symbol: signal.symbol,
    side: signal.side,
    quantity,
    requestedPrice: bar.close,
    timestamp: signal.timestamp
  };
}

function createFill(order: Order): Fill {
  const slippageRate = order.side === "buy" ? 1.001 : 0.999;
  const price = round2(order.requestedPrice * slippageRate);
  const notional = price * order.quantity;
  const commission = round2(Math.max(notional * 0.0003, 5));
  const tax = order.side === "sell" ? round2(notional * 0.001) : 0;

  return {
    orderId: order.id,
    symbol: order.symbol,
    side: order.side,
    quantity: order.quantity,
    price,
    commission,
    tax,
    timestamp: order.timestamp
  };
}

function applyFill(portfolio: PortfolioSnapshot, fill: Fill): PortfolioSnapshot {
  if (fill.side === "buy") {
    const cost = fill.price * fill.quantity + fill.commission + fill.tax;
    const positions = upsertPosition(portfolio.positions, fill);
    const marketValue = positions.reduce((sum, position) => sum + position.quantity * position.marketPrice, 0);

    return {
      ...portfolio,
      cash: round2(portfolio.cash - cost),
      positions,
      totalEquity: round2(portfolio.cash - cost + marketValue)
    };
  }

  return portfolio;
}

function upsertPosition(positions: Position[], fill: Fill): Position[] {
  const existing = positions.find((position) => position.symbol === fill.symbol);
  if (!existing) {
    return [
      ...positions,
      {
        symbol: fill.symbol,
        quantity: fill.quantity,
        averageCost: fill.price,
        marketPrice: fill.price
      }
    ];
  }

  const nextQuantity = existing.quantity + fill.quantity;
  const nextCost = existing.averageCost * existing.quantity + fill.price * fill.quantity;

  return positions.map((position) =>
    position.symbol === fill.symbol
      ? {
          ...position,
          quantity: nextQuantity,
          averageCost: round2(nextCost / nextQuantity),
          marketPrice: fill.price
        }
      : position
  );
}

function audit(action: string, entityId: string, details: AuditEvent["details"]): AuditEvent {
  return {
    id: `audit-${action}-${entityId}`,
    timestamp: "2026-06-08T09:32:30.000+08:00",
    actor: "system",
    action,
    entityId,
    details
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
```

Modify `E:\Prizm\itrade\packages\engine\src\index.ts`:

```ts
export * from "./marketData";
export * from "./signalEngine";
export * from "./riskEngine";
export * from "./virtualTrading";
```

- [ ] **Step 4: Run virtual trading tests and verify pass**

Run:

```powershell
npm.cmd run test -- packages/engine/src/virtualTrading.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run full test suite and typecheck**

Run:

```powershell
npm.cmd run test
npm.cmd run typecheck
```

Expected: both commands PASS.

- [ ] **Step 6: Commit virtual trading engine**

Run:

```powershell
git add packages/engine/src
git commit -m "feat: run virtual trading sessions"
```

Expected: commit is created.

---

### Task 7: Daily Report Metrics

**Files:**
- Create: `E:\Prizm\itrade\packages\engine\src\reporting.test.ts`
- Create: `E:\Prizm\itrade\packages\engine\src\reporting.ts`
- Modify: `E:\Prizm\itrade\packages\engine\src\index.ts`

- [ ] **Step 1: Write the failing reporting test**

Create `E:\Prizm\itrade\packages\engine\src\reporting.test.ts`:

```ts
import type { Fill, Signal } from "@itrade/domain";
import { describe, expect, it } from "vitest";
import { buildDailyReport } from "./reporting";

describe("daily report", () => {
  it("calculates win rate, signal hit rate, and target achievement", () => {
    const fills: Fill[] = [
      fill("buy-1", "buy", 10, 100),
      fill("sell-1", "sell", 11, 100),
      fill("buy-2", "buy", 8, 100),
      fill("sell-2", "sell", 7, 100)
    ];
    const signals: Signal[] = [
      signal("s1", "buy"),
      signal("s2", "sell"),
      signal("s3", "buy")
    ];

    const report = buildDailyReport({
      date: "2026-06-08",
      startingEquity: 100000,
      endingEquity: 100600,
      maxDrawdownPct: 0.02,
      fills,
      signals,
      hitSignalIds: ["s1", "s2"],
      target: { minReturnPct: 0.001, maxDrawdownPct: 0.03 }
    });

    expect(report.tradingWinRate).toBe(0.5);
    expect(report.signalHitRate).toBe(0.6667);
    expect(report.strategyTargetAchieved).toBe(true);
    expect(report.dailyReturnPct).toBe(0.006);
  });
});

function fill(orderId: string, side: "buy" | "sell", price: number, quantity: number): Fill {
  return {
    orderId,
    symbol: "000001.SZ",
    side,
    price,
    quantity,
    commission: 5,
    tax: side === "sell" ? 1 : 0,
    timestamp: "2026-06-08T15:00:00.000+08:00"
  };
}

function signal(id: string, side: "buy" | "sell"): Signal {
  return {
    id,
    strategyId: "ma-volume",
    strategyVersion: 1,
    symbol: "000001.SZ",
    side,
    timestamp: "2026-06-08T09:32:00.000+08:00",
    confidence: 1,
    reason: "test"
  };
}
```

- [ ] **Step 2: Run reporting tests and verify failure**

Run:

```powershell
npm.cmd run test -- packages/engine/src/reporting.test.ts
```

Expected: FAIL because `reporting.ts` does not exist.

- [ ] **Step 3: Implement reporting metrics**

Create `E:\Prizm\itrade\packages\engine\src\reporting.ts`:

```ts
import type { Fill, Signal } from "@itrade/domain";

export interface ReportTarget {
  minReturnPct: number;
  maxDrawdownPct: number;
}

export interface BuildDailyReportInput {
  date: string;
  startingEquity: number;
  endingEquity: number;
  maxDrawdownPct: number;
  fills: Fill[];
  signals: Signal[];
  hitSignalIds: string[];
  target: ReportTarget;
}

export interface DailyReport {
  date: string;
  tradingWinRate: number;
  signalHitRate: number;
  strategyTargetAchieved: boolean;
  dailyReturnPct: number;
  maxDrawdownPct: number;
  tradeCount: number;
  signalCount: number;
}

export function buildDailyReport(input: BuildDailyReportInput): DailyReport {
  const closedTradePnls = pairClosedTradePnls(input.fills);
  const winningTrades = closedTradePnls.filter((pnl) => pnl > 0).length;
  const tradingWinRate = closedTradePnls.length === 0 ? 0 : winningTrades / closedTradePnls.length;
  const signalHitRate = input.signals.length === 0 ? 0 : input.hitSignalIds.length / input.signals.length;
  const dailyReturnPct = (input.endingEquity - input.startingEquity) / input.startingEquity;

  return {
    date: input.date,
    tradingWinRate: round4(tradingWinRate),
    signalHitRate: round4(signalHitRate),
    strategyTargetAchieved:
      dailyReturnPct >= input.target.minReturnPct && input.maxDrawdownPct <= input.target.maxDrawdownPct,
    dailyReturnPct: round4(dailyReturnPct),
    maxDrawdownPct: round4(input.maxDrawdownPct),
    tradeCount: closedTradePnls.length,
    signalCount: input.signals.length
  };
}

function pairClosedTradePnls(fills: Fill[]): number[] {
  const buys: Fill[] = [];
  const pnls: number[] = [];

  for (const fill of fills) {
    if (fill.side === "buy") {
      buys.push(fill);
      continue;
    }

    const buy = buys.shift();
    if (!buy) continue;

    const gross = (fill.price - buy.price) * Math.min(fill.quantity, buy.quantity);
    const costs = buy.commission + buy.tax + fill.commission + fill.tax;
    pnls.push(gross - costs);
  }

  return pnls;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
```

Modify `E:\Prizm\itrade\packages\engine\src\index.ts`:

```ts
export * from "./marketData";
export * from "./signalEngine";
export * from "./riskEngine";
export * from "./virtualTrading";
export * from "./reporting";
```

- [ ] **Step 4: Run reporting tests and verify pass**

Run:

```powershell
npm.cmd run test -- packages/engine/src/reporting.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run full tests and typecheck**

Run:

```powershell
npm.cmd run test
npm.cmd run typecheck
```

Expected: both commands PASS.

- [ ] **Step 6: Commit daily report metrics**

Run:

```powershell
git add packages/engine/src
git commit -m "feat: calculate virtual trading daily report"
```

Expected: commit is created.

---

### Task 8: Local API Service

**Files:**
- Create: `E:\Prizm\itrade\apps\api\src\server.test.ts`
- Create: `E:\Prizm\itrade\apps\api\src\server.ts`
- Create: `E:\Prizm\itrade\apps\api\src\main.ts`

- [ ] **Step 1: Write the failing API test**

Create `E:\Prizm\itrade\apps\api\src\server.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildServer } from "./server";

describe("api server", () => {
  it("returns monitoring state after running a virtual session", async () => {
    const server = buildServer();

    const run = await server.inject({ method: "POST", url: "/api/simulation/run" });
    expect(run.statusCode).toBe(200);

    const monitoring = await server.inject({ method: "GET", url: "/api/monitoring" });
    const body = monitoring.json();

    expect(monitoring.statusCode).toBe(200);
    expect(body.status).toBe("running");
    expect(body.signals).toBeGreaterThan(0);
    expect(body.auditEvents).toBeGreaterThan(0);
  });

  it("hot updates strategy parameters and records an audit event", async () => {
    const server = buildServer();

    const response = await server.inject({
      method: "POST",
      url: "/api/strategies/ma-volume/parameters",
      payload: { maxPositionPct: 0.05 }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().strategy.parameters.maxPositionPct).toBe(0.05);

    const audit = await server.inject({ method: "GET", url: "/api/audit" });
    expect(audit.json().events.map((event: { action: string }) => event.action)).toContain("strategy_parameters_hot_updated");
  });
});
```

- [ ] **Step 2: Run API tests and verify failure**

Run:

```powershell
npm.cmd run test -- apps/api/src/server.test.ts
```

Expected: FAIL because `server.ts` does not exist.

- [ ] **Step 3: Implement API server**

Create `E:\Prizm\itrade\apps\api\src\server.ts`:

```ts
import cors from "@fastify/cors";
import { createStrategyVersion, type AuditEvent, type StrategyDefinition } from "@itrade/domain";
import { buildDailyReport, getSampleBars, runVirtualTradingSession, type DailyReport, type VirtualTradingResult } from "@itrade/engine";
import Fastify from "fastify";

interface AppState {
  strategies: StrategyDefinition[];
  lastRun: VirtualTradingResult | null;
  report: DailyReport | null;
  auditEvents: AuditEvent[];
}

export function buildServer() {
  const server = Fastify({ logger: false });
  const state: AppState = {
    strategies: [
      createStrategyVersion({
        id: "ma-volume",
        name: "双均线成交量策略",
        version: 1,
        universe: ["000001.SZ", "600000.SH"],
        parameters: { maxPositionPct: 0.1, stopLossPct: 0.08, buyThreshold: 1 }
      })
    ],
    lastRun: null,
    report: null,
    auditEvents: []
  };

  server.register(cors, { origin: true });

  server.get("/api/health", async () => ({ ok: true }));

  server.get("/api/strategies", async () => ({ strategies: state.strategies }));

  server.post("/api/strategies/:id/parameters", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<StrategyDefinition["parameters"]>;
    const strategy = state.strategies.find((item) => item.id === id);

    if (!strategy) return reply.status(404).send({ error: "strategy not found" });

    strategy.parameters = { ...strategy.parameters, ...body };
    strategy.updatedAt = "2026-06-08T10:00:00.000+08:00";
    state.auditEvents.push(audit("user", "strategy_parameters_hot_updated", id, body));

    return { strategy };
  });

  server.post("/api/simulation/run", async () => {
    const bars = getSampleBars();
    const result = runVirtualTradingSession({
      strategies: state.strategies,
      bars: bars.minute,
      startingCash: 100000,
      maxSymbolExposurePct: 0.2,
      killSwitch: false
    });

    state.lastRun = result;
    state.auditEvents.push(...result.auditEvents);
    state.report = buildDailyReport({
      date: "2026-06-08",
      startingEquity: 100000,
      endingEquity: result.portfolio.totalEquity,
      maxDrawdownPct: 0.01,
      fills: result.fills,
      signals: result.signals,
      hitSignalIds: result.signals.slice(0, Math.max(1, result.signals.length - 1)).map((signal) => signal.id),
      target: { minReturnPct: 0, maxDrawdownPct: 0.03 }
    });

    return { result, report: state.report };
  });

  server.get("/api/monitoring", async () => ({
    status: state.lastRun ? "running" : "idle",
    strategies: state.strategies.length,
    signals: state.lastRun?.signals.length ?? 0,
    orders: state.lastRun?.orders.length ?? 0,
    fills: state.lastRun?.fills.length ?? 0,
    positions: state.lastRun?.portfolio.positions.length ?? 0,
    totalEquity: state.lastRun?.portfolio.totalEquity ?? 100000,
    auditEvents: state.auditEvents.length
  }));

  server.get("/api/report/daily", async () => ({ report: state.report }));

  server.get("/api/audit", async () => ({ events: state.auditEvents }));

  return server;
}

function audit(
  actor: AuditEvent["actor"],
  action: string,
  entityId: string,
  details: AuditEvent["details"]
): AuditEvent {
  return {
    id: `audit-${action}-${Date.now()}`,
    timestamp: "2026-06-08T10:00:00.000+08:00",
    actor,
    action,
    entityId,
    details
  };
}
```

Create `E:\Prizm\itrade\apps\api\src\main.ts`:

```ts
import { buildServer } from "./server";

const server = buildServer();

await server.listen({ host: "127.0.0.1", port: 8787 });
console.log("iTrade API listening on http://127.0.0.1:8787");
```

- [ ] **Step 4: Run API tests and verify pass**

Run:

```powershell
npm.cmd run test -- apps/api/src/server.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run full test suite and typecheck**

Run:

```powershell
npm.cmd run test
npm.cmd run typecheck
```

Expected: both commands PASS.

- [ ] **Step 6: Commit API service**

Run:

```powershell
git add apps/api
git commit -m "feat: expose virtual trading api"
```

Expected: commit is created.

---

### Task 9: Web Console With Switchable Strategy Workspace

**Files:**
- Create: `E:\Prizm\itrade\apps\web\src\App.test.tsx`
- Create: `E:\Prizm\itrade\apps\web\src\App.tsx`
- Create: `E:\Prizm\itrade\apps\web\src\main.tsx`
- Create: `E:\Prizm\itrade\apps\web\src\styles.css`

- [ ] **Step 1: Write the failing web console test**

Create `E:\Prizm\itrade\apps\web\src\App.test.tsx`:

```tsx
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("switches strategy builder modes without leaving the workspace", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "虚拟交易工作台" })).toBeInTheDocument();
    expect(screen.getByText("结构化规则编辑器")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "画布模块" }));
    expect(screen.getByText("股票池 → 买入规则 → 仓位控制 → 风控规则")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "AI 助手" }));
    expect(screen.getByText("AI 只生成草案，用户确认后进入发布流程。")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run web test and verify failure**

Run:

```powershell
npm.cmd run test -- apps/web/src/App.test.tsx
```

Expected: FAIL because `App.tsx` does not exist.

- [ ] **Step 3: Implement web console**

Create `E:\Prizm\itrade\apps\web\src\App.tsx`:

```tsx
import { useState } from "react";
import "./styles.css";

type Mode = "rules" | "canvas" | "ai";

export function App() {
  const [mode, setMode] = useState<Mode>("rules");

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">iTrade Virtual Desk</p>
          <h1>虚拟交易工作台</h1>
        </div>
        <button className="primary">运行虚拟盘</button>
      </header>

      <section className="grid">
        <section className="panel workspace">
          <div className="panelHeader">
            <div>
              <h2>策略：双均线成交量策略</h2>
              <p>同一份策略定义，可在三种模式间切换。</p>
            </div>
            <div className="tabs" aria-label="策略搭建模式">
              <button className={mode === "rules" ? "active" : ""} onClick={() => setMode("rules")}>结构化规则</button>
              <button className={mode === "canvas" ? "active" : ""} onClick={() => setMode("canvas")}>画布模块</button>
              <button className={mode === "ai" ? "active" : ""} onClick={() => setMode("ai")}>AI 助手</button>
            </div>
          </div>
          {mode === "rules" && <RulesMode />}
          {mode === "canvas" && <CanvasMode />}
          {mode === "ai" && <AiMode />}
        </section>

        <aside className="panel">
          <h2>实时监控</h2>
          <dl className="metrics">
            <div><dt>状态</dt><dd>虚拟盘待运行</dd></div>
            <div><dt>策略数</dt><dd>1</dd></div>
            <div><dt>组合权益</dt><dd>100,000.00</dd></div>
            <div><dt>风险</dt><dd className="ok">正常</dd></div>
          </dl>
        </aside>
      </section>

      <section className="grid three">
        <section className="panel"><h2>日报指标</h2><p>胜率、命中率、达标率将在虚拟盘运行后生成。</p></section>
        <section className="panel"><h2>审计日志</h2><p>参数热更新、规则发布和虚拟成交会记录在这里。</p></section>
        <section className="panel"><h2>告警中心</h2><p>第一版提供平台内状态灯、日志和通知。</p></section>
      </section>
    </main>
  );
}

function RulesMode() {
  return (
    <div className="modeBody">
      <h3>结构化规则编辑器</h3>
      <div className="rule">收盘价 &gt; MA20 AND 成交量 &gt; 20 日均量 → 买入</div>
      <div className="rule">RSI14 &lt; 35 OR 最大回撤 &gt; 8% → 卖出</div>
      <div className="rule">单票仓位 ≤ 10%，组合单票暴露 ≤ 20%</div>
    </div>
  );
}

function CanvasMode() {
  return (
    <div className="modeBody canvas">
      <h3>画布模块</h3>
      <p>股票池 → 买入规则 → 仓位控制 → 风控规则</p>
      <p>卖出规则与风控模块共享同一份策略定义。</p>
    </div>
  );
}

function AiMode() {
  return (
    <div className="modeBody">
      <h3>AI 助手</h3>
      <p>AI 只生成草案，用户确认后进入发布流程。</p>
      <textarea aria-label="AI 策略修改请求" placeholder="例如：把买入条件改成趋势突破，并降低单票仓位。" />
    </div>
  );
}
```

Create `E:\Prizm\itrade\apps\web\src\main.tsx`:

```tsx
import { createRoot } from "react-dom/client";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(<App />);
```

Create `E:\Prizm\itrade\apps\web\src\styles.css`:

```css
:root {
  color: #172033;
  background: #eef2f6;
  font-family: Inter, "Microsoft YaHei", system-ui, sans-serif;
}

body {
  margin: 0;
}

button,
textarea {
  font: inherit;
}

.shell {
  min-height: 100vh;
  padding: 24px;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.eyebrow {
  color: #4f6b8a;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
  margin: 0 0 4px;
  text-transform: uppercase;
}

h1,
h2,
h3,
p {
  margin-top: 0;
}

h1 {
  font-size: 28px;
  margin-bottom: 0;
}

h2 {
  font-size: 18px;
}

h3 {
  font-size: 16px;
}

.grid {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(280px, 0.8fr);
  gap: 16px;
  margin-bottom: 16px;
}

.grid.three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.panel {
  background: #ffffff;
  border: 1px solid #dce3eb;
  border-radius: 8px;
  padding: 18px;
}

.panelHeader {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.tabs {
  display: inline-flex;
  gap: 6px;
  padding: 4px;
  border: 1px solid #dbe3ec;
  border-radius: 8px;
  background: #f6f8fb;
}

.tabs button,
.primary {
  border: 1px solid #c7d2df;
  border-radius: 6px;
  background: #ffffff;
  color: #172033;
  cursor: pointer;
  padding: 8px 12px;
}

.tabs button.active,
.primary {
  background: #116a75;
  border-color: #116a75;
  color: #ffffff;
}

.modeBody {
  border: 1px solid #dce3eb;
  border-radius: 8px;
  min-height: 220px;
  padding: 16px;
}

.rule {
  background: #f6f8fb;
  border: 1px solid #dce3eb;
  border-radius: 6px;
  margin-bottom: 10px;
  padding: 10px;
}

.canvas {
  background:
    linear-gradient(90deg, rgba(17, 106, 117, 0.08) 1px, transparent 1px),
    linear-gradient(rgba(17, 106, 117, 0.08) 1px, transparent 1px);
  background-size: 24px 24px;
}

.metrics {
  display: grid;
  gap: 12px;
  margin: 0;
}

.metrics div {
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid #eef2f6;
  padding-bottom: 8px;
}

.metrics dt {
  color: #5f7085;
}

.metrics dd {
  margin: 0;
  font-weight: 700;
}

.ok {
  color: #0f7a4f;
}

textarea {
  box-sizing: border-box;
  min-height: 110px;
  width: 100%;
  border: 1px solid #c7d2df;
  border-radius: 8px;
  padding: 12px;
}

@media (max-width: 900px) {
  .grid,
  .grid.three {
    grid-template-columns: 1fr;
  }

  .panelHeader,
  .topbar {
    align-items: stretch;
    flex-direction: column;
  }
}
```

- [ ] **Step 4: Run web console test and verify pass**

Run:

```powershell
npm.cmd run test -- apps/web/src/App.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Run typecheck**

Run:

```powershell
npm.cmd run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit web console**

Run:

```powershell
git add apps/web
git commit -m "feat: add virtual trading web console"
```

Expected: commit is created.

---

### Task 10: Wire Web Console To API

**Files:**
- Modify: `E:\Prizm\itrade\apps\web\src\App.test.tsx`
- Modify: `E:\Prizm\itrade\apps\web\src\App.tsx`

- [ ] **Step 1: Replace the web test with API-backed behavior**

Replace `E:\Prizm\itrade\apps\web\src\App.test.tsx` with:

```tsx
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

describe("App API integration", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/strategies")) {
        return json({ strategies: [{ id: "ma-volume", name: "双均线成交量策略", parameters: { maxPositionPct: 0.1 } }] });
      }
      if (url.endsWith("/api/monitoring")) {
        return json({ status: "running", strategies: 1, signals: 2, orders: 1, fills: 1, positions: 1, totalEquity: 100245.2, auditEvents: 3 });
      }
      if (url.endsWith("/api/report/daily")) {
        return json({ report: { tradingWinRate: 0.5, signalHitRate: 0.6667, strategyTargetAchieved: true, dailyReturnPct: 0.0025 } });
      }
      if (url.endsWith("/api/simulation/run")) {
        return json({ result: {}, report: { tradingWinRate: 0.5 } });
      }
      return json({});
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads monitoring and report data from the API", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText("100,245.20")).toBeInTheDocument());
    expect(screen.getByText("交易胜率：50.00%")).toBeInTheDocument();
    expect(screen.getByText("信号命中率：66.67%")).toBeInTheDocument();
  });

  it("calls the simulation endpoint when running virtual trading", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "运行虚拟盘" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/simulation/run", { method: "POST" });
    });
  });
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
```

- [ ] **Step 2: Run web test and verify failure**

Run:

```powershell
npm.cmd run test -- apps/web/src/App.test.tsx
```

Expected: FAIL because `App.tsx` still uses static data.

- [ ] **Step 3: Update the app to fetch API state**

Replace `E:\Prizm\itrade\apps\web\src\App.tsx` with:

```tsx
import { useEffect, useState } from "react";
import "./styles.css";

type Mode = "rules" | "canvas" | "ai";

interface MonitoringState {
  status: string;
  strategies: number;
  signals: number;
  orders: number;
  fills: number;
  positions: number;
  totalEquity: number;
  auditEvents: number;
}

interface DailyReportState {
  tradingWinRate: number;
  signalHitRate: number;
  strategyTargetAchieved: boolean;
  dailyReturnPct: number;
}

export function App() {
  const [mode, setMode] = useState<Mode>("rules");
  const [monitoring, setMonitoring] = useState<MonitoringState | null>(null);
  const [report, setReport] = useState<DailyReportState | null>(null);

  async function refresh() {
    const monitoringResponse = await fetch("/api/monitoring");
    setMonitoring(await monitoringResponse.json());

    const reportResponse = await fetch("/api/report/daily");
    const reportBody = await reportResponse.json();
    setReport(reportBody.report);
  }

  async function runSimulation() {
    await fetch("/api/simulation/run", { method: "POST" });
    await refresh();
  }

  useEffect(() => {
    void fetch("/api/strategies");
    void refresh();
  }, []);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">iTrade Virtual Desk</p>
          <h1>虚拟交易工作台</h1>
        </div>
        <button className="primary" onClick={runSimulation}>运行虚拟盘</button>
      </header>

      <section className="grid">
        <section className="panel workspace">
          <div className="panelHeader">
            <div>
              <h2>策略：双均线成交量策略</h2>
              <p>同一份策略定义，可在三种模式间切换。</p>
            </div>
            <div className="tabs" aria-label="策略搭建模式">
              <button className={mode === "rules" ? "active" : ""} onClick={() => setMode("rules")}>结构化规则</button>
              <button className={mode === "canvas" ? "active" : ""} onClick={() => setMode("canvas")}>画布模块</button>
              <button className={mode === "ai" ? "active" : ""} onClick={() => setMode("ai")}>AI 助手</button>
            </div>
          </div>
          {mode === "rules" && <RulesMode />}
          {mode === "canvas" && <CanvasMode />}
          {mode === "ai" && <AiMode />}
        </section>

        <aside className="panel">
          <h2>实时监控</h2>
          <dl className="metrics">
            <div><dt>状态</dt><dd>{monitoring?.status ?? "加载中"}</dd></div>
            <div><dt>策略数</dt><dd>{monitoring?.strategies ?? 0}</dd></div>
            <div><dt>信号/订单/成交</dt><dd>{monitoring ? `${monitoring.signals}/${monitoring.orders}/${monitoring.fills}` : "0/0/0"}</dd></div>
            <div><dt>组合权益</dt><dd>{money(monitoring?.totalEquity ?? 100000)}</dd></div>
            <div><dt>风险</dt><dd className="ok">正常</dd></div>
          </dl>
        </aside>
      </section>

      <section className="grid three">
        <section className="panel">
          <h2>日报指标</h2>
          {report ? (
            <>
              <p>交易胜率：{percent(report.tradingWinRate)}</p>
              <p>信号命中率：{percent(report.signalHitRate)}</p>
              <p>策略达标：{report.strategyTargetAchieved ? "是" : "否"}</p>
              <p>当日收益：{percent(report.dailyReturnPct)}</p>
            </>
          ) : (
            <p>胜率、命中率、达标率将在虚拟盘运行后生成。</p>
          )}
        </section>
        <section className="panel"><h2>审计日志</h2><p>已记录事件：{monitoring?.auditEvents ?? 0}</p></section>
        <section className="panel"><h2>告警中心</h2><p>第一版提供平台内状态灯、日志和通知。</p></section>
      </section>
    </main>
  );
}

function RulesMode() {
  return (
    <div className="modeBody">
      <h3>结构化规则编辑器</h3>
      <div className="rule">收盘价 &gt; MA20 AND 成交量 &gt; 20 日均量 → 买入</div>
      <div className="rule">RSI14 &lt; 35 OR 最大回撤 &gt; 8% → 卖出</div>
      <div className="rule">单票仓位 ≤ 10%，组合单票暴露 ≤ 20%</div>
    </div>
  );
}

function CanvasMode() {
  return (
    <div className="modeBody canvas">
      <h3>画布模块</h3>
      <p>股票池 → 买入规则 → 仓位控制 → 风控规则</p>
      <p>卖出规则与风控模块共享同一份策略定义。</p>
    </div>
  );
}

function AiMode() {
  return (
    <div className="modeBody">
      <h3>AI 助手</h3>
      <p>AI 只生成草案，用户确认后进入发布流程。</p>
      <textarea aria-label="AI 策略修改请求" placeholder="例如：把买入条件改成趋势突破，并降低单票仓位。" />
    </div>
  );
}

function money(value: number): string {
  return value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}
```

- [ ] **Step 4: Run web API test and verify pass**

Run:

```powershell
npm.cmd run test -- apps/web/src/App.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Run full tests and typecheck**

Run:

```powershell
npm.cmd run test
npm.cmd run typecheck
```

Expected: both commands PASS.

- [ ] **Step 6: Commit API-backed web console**

Run:

```powershell
git add apps/web/src
git commit -m "feat: connect web console to virtual trading api"
```

Expected: commit is created.

---

### Task 11: Local Smoke Test And Operator Notes

**Files:**
- Create: `E:\Prizm\itrade\docs\virtual-trading-mvp.md`

- [ ] **Step 1: Run all automated checks**

Run:

```powershell
npm.cmd run test
npm.cmd run typecheck
npm.cmd run build
```

Expected: all commands PASS.

- [ ] **Step 2: Start the local app**

Run:

```powershell
npm.cmd run dev
```

Expected:

```text
API listening on http://127.0.0.1:8787
Local: http://127.0.0.1:5173/
```

- [ ] **Step 3: Verify API manually**

Run in a second PowerShell terminal:

```powershell
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8787/api/simulation/run'
Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/monitoring'
Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/report/daily'
```

Expected:

- The simulation response includes `result` and `report`.
- Monitoring response has `status` equal to `running`.
- Daily report response includes `tradingWinRate`, `signalHitRate`, and `strategyTargetAchieved`.

- [ ] **Step 4: Create operator notes**

Create `E:\Prizm\itrade\docs\virtual-trading-mvp.md`:

```md
# Virtual Trading MVP

## What This Build Does

This MVP runs a local virtual trading loop for sample A-share data. It supports one structured-rule strategy, a switchable strategy workspace, virtual orders and fills, portfolio monitoring, audit events, and a daily report.

## Local Commands

Install dependencies:

```powershell
npm.cmd install
```

Run tests:

```powershell
npm.cmd run test
```

Run typecheck:

```powershell
npm.cmd run typecheck
```

Start the API and web console:

```powershell
npm.cmd run dev
```

Open:

```text
http://127.0.0.1:5173
```

## Safety Boundary

This build is virtual trading only. It does not connect to a broker, does not place live orders, and does not manage real funds.

## First Supported Flow

1. Open the web console.
2. Switch between structured rules, canvas, and AI assistant modes.
3. Run the virtual trading simulation.
4. Review monitoring state.
5. Review daily report metrics.
6. Review audit event count.

## Metric Definitions

Trading win rate is profitable closed trades divided by closed trades.

Signal hit rate is hit signals divided by evaluated signals.

Strategy target achievement is true when configured return and drawdown targets are met.
```

- [ ] **Step 5: Commit smoke docs**

Run:

```powershell
git add docs/virtual-trading-mvp.md
git commit -m "docs: document virtual trading mvp"
```

Expected: commit is created.

---

## Self-Review Checklist

Spec coverage:

- Strategy definition and versionable strategy object: Task 2.
- Multiple switchable builders: Task 9.
- AI assistant safety boundary: Task 9 UI copy and Task 2/8 versioned strategy foundation.
- Sample daily and minute A-share data: Task 3.
- Virtual trading session: Task 6.
- Portfolio risk checks and kill switch: Task 5.
- Real-time monitoring state: Task 8 and Task 10.
- Daily report success metrics: Task 7 and Task 8.
- Audit logs: Task 6 and Task 8.
- Local hybrid deployment path: Task 1, Task 8, Task 9, Task 11.

Known follow-up plans after this MVP:

- Persistent storage and migration plan.
- Batch backtest worker plan.
- Full strategy publish workflow plan.
- External notification adapter plan.
- Production data adapter plan.
- Future broker execution adapter interface plan.

