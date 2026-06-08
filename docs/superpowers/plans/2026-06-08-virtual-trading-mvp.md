# 虚拟盘 MVP 实施计划

> **给后续 agent/工程师：** 这个计划对应已经落地的第一版 MVP。继续开发时请按任务边界推进，保持测试先行、小步提交和清晰模块边界。

**目标：** 构建 AI 驱动 A 股虚拟交易平台的第一条可运行闭环：策略定义、可切换策略工作台、样例日线/分钟线数据、虚拟交易、组合风控、监控状态、审计日志和日报指标。

**架构：** 使用 TypeScript monorepo。第一版本地运行，但 `domain`、`engine`、`api`、`web` 保持服务兼容边界，后续可以拆成独立服务或 worker。

**技术栈：** Node.js 24、npm workspaces、TypeScript、Vitest、Fastify、React、Vite、React Testing Library。

---

## 范围说明

设计规格覆盖完整的分布式研究平台。本计划实现第一条可独立测试的 MVP：

- 一个本地 API 服务。
- 一个本地 Web 控制台。
- 一个核心领域模型包。
- 一个虚拟交易引擎包。
- 内存中的样例数据和运行状态。
- 多策略组合的基础结构。
- 每日报告指标。

以下能力不在本计划内：

- 券商实盘下单。
- 外部通知通道。
- 生产级数据存储。
- 分布式 worker 部署。
- 真实行情源接入。

## 目录结构

```text
E:\Prizm\itrade
  .gitignore
  package.json
  tsconfig.base.json
  vitest.config.ts
  docs/
    virtual-trading-mvp.md
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
        main.ts
        server.ts
        server.test.ts
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

## 模块职责

`packages/domain`

- 定义策略、规则、信号、订单、成交、持仓、组合快照和审计事件类型。
- 提供策略版本创建和策略定义校验。
- 不依赖 API、Web 或具体交易实现。

`packages/engine`

- 提供样例行情数据和数据质量检查。
- 评估结构化规则并生成标准化信号。
- 执行组合风控检查。
- 运行虚拟交易会话，生成订单、成交、持仓和审计事件。
- 计算每日交易胜率、信号命中率、策略达标率等指标。

`apps/api`

- 使用 Fastify 暴露本地 API。
- 管理内存中的策略、模拟结果、日报和审计事件。
- 提供策略列表、参数热更新、运行虚拟盘、监控状态、日报和审计接口。

`apps/web`

- 提供 React Web 控制台。
- 展示可切换策略工作台：结构化规则、画布模块、AI 助手。
- 调用 API 运行虚拟盘。
- 展示监控状态、日报指标、审计事件数量和告警中心。

---

## 任务 1：初始化工作区

**已创建文件：**

- `.gitignore`
- `package.json`
- `tsconfig.base.json`
- `vitest.config.ts`
- `packages/domain/package.json`
- `packages/domain/tsconfig.json`
- `packages/engine/package.json`
- `packages/engine/tsconfig.json`
- `apps/api/package.json`
- `apps/api/tsconfig.json`
- `apps/web/package.json`
- `apps/web/tsconfig.json`
- `apps/web/index.html`
- `apps/web/vite.config.ts`

**关键结果：**

- 初始化 git 仓库。
- 配置 npm workspaces。
- 配置 TypeScript 项目引用。
- 配置根级 Vitest，让 React 测试使用 jsdom。
- 忽略 `node_modules/`、`dist/`、`.superpowers/`、`tmp/` 和 TypeScript build info。

**验证命令：**

```powershell
npm.cmd install
npm.cmd run test
npm.cmd run typecheck
```

## 任务 2：领域模型和策略校验

**文件：**

- `packages/domain/src/index.ts`
- `packages/domain/src/strategyDefinition.test.ts`

**实现内容：**

- `StrategyDefinition`
- `RuntimeParameters`
- `RuleCondition`
- `MarketBar`
- `Signal`
- `Order`
- `Fill`
- `Position`
- `PortfolioSnapshot`
- `AuditEvent`
- `createStrategyVersion`
- `validateStrategyDefinition`

**测试覆盖：**

- 合法结构化规则策略可以通过校验。
- 超过 100% 的单票仓位参数会被拒绝。

**验证命令：**

```powershell
npm.cmd run test -- packages/domain/src/strategyDefinition.test.ts
npm.cmd run typecheck
```

## 任务 3：样例行情和数据质量检查

**文件：**

- `packages/engine/src/marketData.ts`
- `packages/engine/src/marketData.test.ts`
- `packages/engine/src/index.ts`

**实现内容：**

- `getSampleBars`
- `inspectMarketDataQuality`

**样例数据：**

- 日线数据：`000001.SZ`、`600000.SH`，覆盖两个交易日。
- 分钟线数据：`000001.SZ`、`600000.SH`，覆盖盘中两个时间点。
- 指标字段：`ma20`、`avgVolume20`、`rsi14`。

**测试覆盖：**

- 可以稳定加载日线和分钟线样例数据。
- 可以发现非正价格。
- 可以发现缺失指标字段。

**验证命令：**

```powershell
npm.cmd run test -- packages/engine/src/marketData.test.ts
```

## 任务 4：结构化规则信号引擎

**文件：**

- `packages/engine/src/signalEngine.ts`
- `packages/engine/src/signalEngine.test.ts`
- `packages/engine/src/index.ts`

**实现内容：**

- `evaluateSignals`
- 字段读取：`open`、`high`、`low`、`close`、`volume`、指标字段。
- 规则操作符：`gt`、`gte`、`lt`、`lte`、`eq`。

**测试覆盖：**

- 入场规则全部满足时生成买入信号。
- 出场规则满足时生成卖出信号。
- 信号包含策略 id、策略版本、标的、方向、时间、置信度和触发原因。

**验证命令：**

```powershell
npm.cmd run test -- packages/engine/src/signalEngine.test.ts
```

## 任务 5：组合风控引擎

**文件：**

- `packages/engine/src/riskEngine.ts`
- `packages/engine/src/riskEngine.test.ts`
- `packages/engine/src/index.ts`

**实现内容：**

- `checkOrderRisk`
- 单标的暴露限制。
- 组合熔断开关。
- 现金不足检查。
- 卖出订单默认允许通过基础检查。

**测试覆盖：**

- 暴露未超限的订单通过。
- 超过单标的暴露上限的订单被拒绝。
- 熔断开关打开时所有订单被拒绝。

**验证命令：**

```powershell
npm.cmd run test -- packages/engine/src/riskEngine.test.ts
```

## 任务 6：虚拟交易引擎

**文件：**

- `packages/engine/src/virtualTrading.ts`
- `packages/engine/src/virtualTrading.test.ts`
- `packages/engine/src/index.ts`

**实现内容：**

- `runVirtualTradingSession`
- 策略信号转虚拟订单。
- 组合风控检查。
- 虚拟成交生成。
- 佣金、税费和滑点模型。
- A 股 100 股整手下单。
- 已有持仓时避免重复买入。
- 持仓、现金和组合权益更新。
- 风控检查和虚拟成交审计事件。

**测试覆盖：**

- 买入信号可以生成订单、成交和持仓。
- 持仓数量按 100 股整手向下取整。
- 运行过程中产生 `virtual_fill_created` 审计事件。

**验证命令：**

```powershell
npm.cmd run test -- packages/engine/src/virtualTrading.test.ts
```

## 任务 7：每日报告指标

**文件：**

- `packages/engine/src/reporting.ts`
- `packages/engine/src/reporting.test.ts`
- `packages/engine/src/index.ts`

**实现内容：**

- `buildDailyReport`
- 交易胜率。
- 信号命中率。
- 策略达标判断。
- 当日收益率。
- 最大回撤。
- 交易数和信号数。

**测试覆盖：**

- 一个盈利平仓和一个亏损平仓时，交易胜率为 50%。
- 三个信号中两个命中时，信号命中率为 66.67%。
- 收益和回撤都满足目标时，策略达标为 `true`。

**验证命令：**

```powershell
npm.cmd run test -- packages/engine/src/reporting.test.ts
```

## 任务 8：本地 API 服务

**文件：**

- `apps/api/src/server.ts`
- `apps/api/src/server.test.ts`
- `apps/api/src/main.ts`

**实现内容：**

- `buildServer`
- `GET /api/health`
- `GET /api/strategies`
- `POST /api/strategies/:id/parameters`
- `POST /api/simulation/run`
- `GET /api/monitoring`
- `GET /api/report/daily`
- `GET /api/audit`

**测试覆盖：**

- 运行虚拟盘后，监控状态变为 `running`。
- 运行虚拟盘后，信号数和审计事件数大于 0。
- 策略参数可以热更新。
- 参数热更新会记录 `strategy_parameters_hot_updated` 审计事件。

**验证命令：**

```powershell
npm.cmd run test -- apps/api/src/server.test.ts
```

## 任务 9：Web 控制台和可切换策略工作台

**文件：**

- `apps/web/src/App.tsx`
- `apps/web/src/App.test.tsx`
- `apps/web/src/main.tsx`
- `apps/web/src/styles.css`

**实现内容：**

- 虚拟交易工作台首页。
- 结构化规则、画布模块、AI 助手三种策略搭建模式。
- 实时监控卡片。
- A 股市场状态提示，包括交易时间、午间休市和盘后休市。
- 当前执行阶段和最新操作。
- 日报指标卡片。
- 盘后分析卡片。
- 最近审计事件明细卡片。
- 告警中心卡片。
- 响应式布局。

**测试覆盖：**

- 页面显示“虚拟交易工作台”。
- 默认显示结构化规则编辑器。
- 点击“画布模块”后展示画布模块内容。
- 点击“AI 助手”后展示 AI 安全提示。

**验证命令：**

```powershell
npm.cmd run test -- apps/web/src/App.test.tsx
```

## 任务 10：Web 控制台接入 API

**文件：**

- `apps/web/src/App.tsx`
- `apps/web/src/App.test.tsx`

**实现内容：**

- 页面加载时请求 `/api/strategies`。
- 页面加载时请求 `/api/monitoring`。
- 页面加载时请求 `/api/report/daily`。
- 页面加载时请求 `/api/audit`。
- 点击“运行虚拟盘”时调用 `/api/simulation/run`。
- 虚拟盘运行后刷新监控、日报和审计日志。
- 显示市场状态、组合权益、信号/订单/成交、当前执行阶段、最新操作、最近审计事件、交易胜率、信号命中率、策略达标和当日收益。
- 休盘且已有日报时显示盘后分析。
- 顶部按钮随市场状态变化：交易时间为“运行虚拟盘”，盘后为“生成盘后复盘”，其他休盘时段为“运行历史回放”。

**测试覆盖：**

- 可以从 API mock 中加载监控和日报。
- 可以展示当前执行阶段和最近审计事件明细。
- 可以在盘后显示休盘状态和盘后分析。
- 可以在盘后显示“生成盘后复盘”，在交易时间显示“运行虚拟盘”。
- 点击“运行虚拟盘”会调用模拟接口。

**验证命令：**

```powershell
npm.cmd run test -- apps/web/src/App.test.tsx
```

## 任务 11：冒烟测试和操作说明

**文件：**

- `docs/virtual-trading-mvp.md`
- `.gitignore`

**实现内容：**

- 中文操作说明。
- 本地启动命令。
- API 冒烟测试命令。
- 虚拟盘安全边界。
- 第一条可用流程。
- 指标口径。
- 忽略本地临时日志目录 `tmp/`。

**验证命令：**

```powershell
npm.cmd run test
npm.cmd run typecheck
npm.cmd run build
```

**本地运行命令：**

```powershell
npm.cmd run dev
```

**浏览器入口：**

```text
http://127.0.0.1:5173
```

**API 入口：**

```text
http://127.0.0.1:8787
```

**PowerShell 冒烟测试：**

```powershell
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8787/api/simulation/run' -ContentType 'application/json' -Body '{}'
Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/monitoring'
Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/report/daily'
```

---

## 当前验收结果

自动化检查已通过：

```powershell
npm.cmd run test
npm.cmd run typecheck
npm.cmd run build
```

当前测试覆盖：

- 策略定义校验。
- 行情数据质量检查。
- 结构化信号生成。
- 组合风控检查。
- 虚拟交易会话。
- 每日报告指标。
- API 服务行为。
- Web 控制台交互和 API 集成。

浏览器冒烟检查已通过：

- Web 页面可以打开。
- 页面显示“虚拟交易工作台”。
- 可以点击“运行虚拟盘”。
- 监控状态显示 `running`。
- 信号/订单/成交显示为 `4/3/3`。
- 组合权益显示为 `99,990.00`。
- 日报显示交易胜率、信号命中率、策略达标和当日收益。

## 已知边界

- 当前只使用内存状态，重启后运行结果会丢失。
- 当前只使用样例行情数据。
- 当前只运行一个默认策略。
- 当前 AI 助手只是工作台入口和安全提示，还没有接入模型。
- 当前告警中心只有平台内展示，没有外部通知。
- 当前没有真实券商接口，也不会下真实订单。

## 后续实施计划

建议按以下顺序继续：

1. 持久化存储。
   - 策略、运行结果、审计事件、日报入库。
   - 增加数据库迁移和种子数据。

2. 策略发布流程。
   - 草稿版本。
   - 校验。
   - 影子运行。
   - 发布和回滚。

3. 批量回测 worker。
   - 任务队列。
   - 参数扫描。
   - 结果排行。
   - 策略对比。

4. 数据适配器。
   - 免费数据源原型。
   - 用户自有数据导入。
   - 数据质量报告。

5. 外部通知适配器。
   - 邮件。
   - 钉钉。
   - 企业微信。
   - webhook。

6. AI 策略助手。
   - 生成策略草稿。
   - 解释策略逻辑。
   - 生成修改建议。
   - 修改前后回测对比。

7. 未来券商适配器接口。
   - 只定义接口和安全门。
   - 先做人工确认模式。
   - 再做受控实盘。
