# AI-Driven A-Share Virtual Trading Platform Design

Date: 2026-06-08

## Goal

Build an AI-driven A-share trading research platform that starts with virtual trading and is designed to evolve into controlled live trading after broker adapters, compliance checks, and operational controls are ready.

The first product direction is not a simple backtesting toy. It is a distributed research-grade platform with virtual trading, multi-strategy portfolio management, real-time monitoring, daily performance reports, batch research tasks, and switchable visual strategy builders.

## Current Scope

In scope for the first major design:

- Virtual trading, not live broker execution.
- Intraday quasi-real-time virtual trading plus end-of-day replay and reporting.
- Daily and minute-level market data support.
- AI-assisted strategy creation and modification.
- Multiple switchable visual strategy builders.
- Multi-strategy portfolio management.
- Research-grade expansion path for batch backtests and full-market minute-level simulation.
- Real-time monitoring and extensible alerts.
- Strategy hot parameter updates, versioned rule publishing, and audit logs.

Out of scope for the first implementation:

- Direct live order placement.
- Specific broker adapter implementation.
- Fully automated AI changes without user confirmation.
- Production-grade high-frequency infrastructure.

## Compliance Boundary

A-share programmatic trading is regulated. The platform must be designed with reporting, auditability, risk controls, emergency stop controls, and system-management boundaries in mind.

The first version runs virtual trading only. Live trading is a later phase and must go through broker interface validation, user approval gates, risk-control review, and compliance review.

## Recommended Delivery Phases

1. Virtual research and trading platform.
   - Strategy builders.
   - Data adapters.
   - Virtual trading.
   - Monitoring.
   - Daily reports.

2. Controlled live-trading readiness.
   - Broker adapter interface.
   - Manual confirmation mode.
   - Capital limits.
   - Audit and emergency stop.

3. Fully automated live trading.
   - Enabled only after the first two phases are stable.
   - Requires stronger monitoring, operational procedures, and compliance controls.

## Architecture Choice

Use a distributed research-platform architecture.

The MVP may run on one machine or one server as multiple processes, but service boundaries should be explicit from the start. This keeps the system aligned with research-grade scale while avoiding premature cluster deployment.

### Layers

1. User and strategy layer.
   - Web console.
   - Switchable visual strategy builders.
   - AI strategy assistant.
   - Strategy versioning and publishing.

2. Trading and research core.
   - Signal engine.
   - Virtual trading engine.
   - Portfolio risk engine.
   - Batch backtest workers.
   - Factor research workers.
   - Real-time monitoring.
   - Daily reporting and attribution.

3. Data and execution layer.
   - Market data adapters.
   - Daily and minute-level storage.
   - Message bus and task queue.
   - Future broker execution adapters.

## Strategy Definition

Each strategy is stored as one unified strategy definition. Different builders are views and editors for the same underlying object.

A strategy definition includes:

- Strategy id and version.
- Name, owner, status, and lifecycle state.
- Universe.
- Data frequency requirements.
- Entry rules.
- Exit rules.
- Position sizing rules.
- Portfolio and per-symbol risk rules.
- Runtime parameters.
- Backtest and virtual-trading settings.
- Publication metadata and audit trail.

## Switchable Strategy Builders

The platform supports multiple strategy-building modes in the same strategy workspace:

- Structured rules.
  - Conditions, indicators, actions, and parameters.
  - This is the most stable first editor and should be the semantic source of truth in the MVP.

- Canvas modules.
  - Visual flow of universe, signals, position sizing, exits, and risk controls.
  - This can start as a view over the strategy definition and later become a full editor.

- AI assistant.
  - Generates drafts, explains logic, proposes changes, and summarizes backtest impact.
  - AI cannot silently change active strategies.
  - AI changes require user confirmation and then go through the normal publish flow.

Switching modes must not alter strategy semantics. If a strategy cannot be represented in one view, that view must show a clear unsupported-state message instead of silently dropping logic.

## Strategy Modification Model

The platform supports ongoing changes, but changes must be separated by risk level.

### Hot Updates

These can apply immediately:

- Position limits.
- Stop-loss or take-profit thresholds.
- Signal thresholds.
- Universe toggles.
- Strategy enable or disable state.
- Notification settings.

Hot updates are recorded in audit logs and reflected in monitoring and daily reports.

### Published Rule Updates

These require validation before activation:

- Buy and sell condition changes.
- Indicator composition changes.
- Data frequency changes.
- Position-sizing algorithm changes.
- Portfolio risk-rule changes.

Rule updates should create a draft version, run validation, optionally run shadow simulation or backtest comparison, and only then publish.

### AI-Assisted Updates

AI may:

- Draft changes.
- Explain expected impact.
- Generate test cases or backtest scenarios.
- Compare before and after behavior.

AI may not:

- Directly modify active strategy versions.
- Disable risk controls.
- Publish a strategy without user confirmation.

## Virtual Trading Engine

The virtual trading engine is designed like a future live trading engine.

Strategies emit standardized signals. The trading engine handles order creation, virtual matching, position updates, cash updates, trade records, and performance events.

The engine supports two runtime modes:

- Intraday quasi-real-time mode.
  - Uses current or streaming market data where available.
  - Updates signals, virtual orders, positions, PnL, and risk state during market hours.

- End-of-day replay mode.
  - Replays market data after close.
  - Produces full daily summaries and reconciles intraday records.

Virtual trading should model:

- Market, limit, and planned order abstractions where useful.
- Slippage assumptions.
- Commission and tax assumptions.
- Partial fills if supported by the simulator.
- Suspensions, limit-up, limit-down, missing data, and invalid orders.

## Portfolio Risk Engine

The portfolio risk engine sits above individual strategies and manages shared capital and exposure.

It controls:

- Total capital allocation.
- Per-strategy capital limits.
- Per-symbol exposure limits.
- Industry or sector exposure limits.
- Maximum drawdown thresholds.
- Turnover limits.
- Strategy-level and portfolio-level kill switches.
- Abnormal signal and order detection.

The same risk interface should be usable by virtual trading and future live trading.

## Real-Time Monitoring

The monitoring center shows:

- Strategy status.
- Data freshness and latency.
- Signal stream.
- Virtual orders and fills.
- Positions and cash.
- Real-time PnL.
- Risk status.
- Worker and task health.
- Alert history.
- Strategy version currently running.

Alerts are designed as an adapter-based system.

MVP alert channels:

- In-platform notification center.
- Dashboard status indicators.
- Logs and event timeline.

Future alert channels:

- Email.
- DingTalk.
- WeCom.
- WeChat integration where available.
- Other webhook-based channels.

## Daily Report

The platform generates daily reports after market close and after end-of-day replay completes.

Daily reports include:

- Trading win rate.
- Signal hit rate.
- Strategy target-achievement rate.
- Daily return.
- Cumulative return.
- Maximum drawdown.
- Turnover.
- Strategy contribution.
- Portfolio attribution.
- Risk events.
- Abnormal signals or orders.
- Version changes and parameter hot updates.
- Data quality warnings.

Definitions:

- Trading win rate: profitable closed trades divided by total closed trades in the reporting window.
- Signal hit rate: signals whose forward evaluation window moved in the expected direction divided by total evaluated signals.
- Strategy target-achievement rate: whether configured objectives were met, such as positive return, benchmark outperformance, or drawdown below threshold.

Reports must make metric windows explicit to avoid ambiguous "success rate" claims.

## Data Layer

The platform uses replaceable data adapters.

Early prototypes can use free or low-barrier data sources. Later versions can replace these with professional providers or user-owned data.

Supported data categories:

- Daily bars.
- Minute bars.
- Index data.
- Index constituents.
- Trading calendar.
- Corporate actions and adjustment factors.
- Financial and factor data.
- Future real-time quote streams.

Data quality checks include:

- Missing bars.
- Suspensions.
- Adjusted and unadjusted price handling.
- Abnormal prices.
- Minute-line gaps.
- Timestamp alignment.
- Trading calendar consistency.

## Research Workloads

Research-grade priority order:

1. Multi-strategy portfolio management.
   - Multiple strategies share capital, risk controls, monitoring, and attribution.

2. Large-scale batch backtesting.
   - Task queue.
   - Parallel workers.
   - Parameter scanning.
   - Result ranking.
   - Strategy comparison.

3. Full-market minute-level virtual trading.
   - Treated as a later performance expansion.
   - Requires careful data throughput, caching, and worker scaling.

Backtests and virtual trading should share metric definitions wherever possible.

## Deployment Model

Preferred target model:

- Hybrid architecture.
- Local machine can run data and future broker adapters.
- Web console can run locally or on a server.
- Research workers can scale out later.

MVP may run on one Windows machine or one server with multiple services.

Future production deployment may split:

- Web/API service.
- Market data service.
- Strategy execution service.
- Virtual trading service.
- Backtest worker pool.
- Monitoring and reporting service.
- Storage services.

## Safety Requirements

The system must include:

- No live trading in MVP.
- Strategy version history.
- Audit logs for all changes.
- User confirmation for AI-generated changes.
- Hot-update event tracking.
- Risk kill switches.
- Data-quality warnings.
- Runtime health checks.
- Clear distinction between virtual and live environments.

## Open Implementation Decisions

These are design-time decisions for the implementation plan, not unresolved product requirements:

- Exact frontend stack.
- Exact backend language and framework.
- Initial data provider.
- Storage engine choices.
- Message bus and task queue choices.
- AI provider and model integration details.
- Whether the first MVP uses true separate services or separate modules with service-compatible boundaries.

## Acceptance Criteria For The First Build Plan

The implementation plan should produce a working MVP that can:

- Create a strategy from structured rules.
- View the same strategy in canvas and AI-assistant modes.
- Hot-update safe parameters.
- Draft and publish rule changes through a versioned flow.
- Load sample daily and minute A-share data.
- Run intraday-style virtual simulation.
- Run end-of-day replay.
- Track multiple strategies in one portfolio.
- Show real-time monitoring state.
- Generate a daily report with win rate, signal hit rate, and target-achievement rate.
- Record audit logs for strategy changes and runtime events.

