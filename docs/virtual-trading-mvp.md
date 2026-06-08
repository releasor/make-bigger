# 虚拟盘 MVP 使用说明

## 当前版本能做什么

这个 MVP 可以在本地运行一条 A 股样例数据上的虚拟交易闭环。它支持一个结构化规则策略、可切换的策略工作台、虚拟订单和成交、组合监控、当前执行阶段、最近审计事件，以及每日指标报告。

## 本地命令

安装依赖：

```powershell
npm.cmd install
```

运行测试：

```powershell
npm.cmd run test
```

运行类型检查：

```powershell
npm.cmd run typecheck
```

启动 API 和 Web 控制台：

```powershell
npm.cmd run dev
```

打开 Web 控制台：

```text
http://127.0.0.1:5173
```

运行 PowerShell API 冒烟测试：

```powershell
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8787/api/simulation/run' -ContentType 'application/json' -Body '{}'
Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/monitoring'
Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/report/daily'
```

## 安全边界

当前版本只做虚拟交易。它不会连接券商，不会发出真实订单，也不会管理真实资金。

## 第一条可用流程

1. 打开 Web 控制台。
2. 在结构化规则、画布模块、AI 助手之间切换。
3. 点击“运行虚拟盘”。
4. 查看实时监控状态、当前执行阶段和最新操作。
5. 查看日报指标。
6. 查看最近审计事件明细。

## 指标口径

交易胜率：盈利平仓交易数 / 已平仓交易数。

信号命中率：命中信号数 / 已评估信号数。

策略达标：当配置的收益目标和回撤目标同时满足时为“达标”。
