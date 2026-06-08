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

Run a PowerShell API smoke test:

```powershell
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8787/api/simulation/run' -ContentType 'application/json' -Body '{}'
Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/monitoring'
Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/report/daily'
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
