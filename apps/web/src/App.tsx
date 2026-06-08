import { getAShareMarketSession, type AShareMarketSession } from "@itrade/domain";
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
  shortTermSignals?: number;
  manualPositions?: number;
  sellAlerts?: number;
}

interface DailyReportState {
  tradingWinRate: number;
  signalHitRate: number;
  strategyTargetAchieved: boolean;
  dailyReturnPct: number;
}

interface AuditEventState {
  id: string;
  timestamp: string;
  actor: "system" | "user" | "ai";
  action: string;
  entityId: string;
  details: Record<string, string | number | boolean>;
}

interface ShortTermBuySignalState {
  id: string;
  symbol: string;
  side: "buy";
  timestamp: string;
  currentPrice: number;
  confidenceScore: number;
  recommendation: "特别值得关注";
  suggestedPositionPct: number;
  stopLossPct: number;
  stopLossPrice: number;
  basis: string[];
  riskNotes: string[];
}

interface ManualPositionState {
  id: string;
  signalId: string;
  symbol: string;
  quantity: number;
  entryPrice: number;
  stopLossPrice: number;
  entryTimestamp: string;
  status: "monitoring" | "sell_alerted" | "closed";
}

interface SellSignalAlertState {
  id: string;
  positionId: string;
  symbol: string;
  timestamp: string;
  currentPrice: number;
  triggerPrice: number;
  reason: string;
  action: "减仓观察" | "清仓观察";
  basis: string[];
}

interface MarketDataStatusState {
  source: {
    provider: string;
    isReal: boolean;
    updatedAt: string;
    symbols: string[];
    warnings: string[];
    cacheHit: boolean;
  };
  quality: {
    ok: boolean;
    issues: string[];
  };
  dailyBars: number;
  minuteBars: number;
}

interface AppProps {
  now?: Date;
}

const initialTradeMessage = "等待短线信号扫描。";

export function App({ now = new Date() }: AppProps = {}) {
  const marketSession = getAShareMarketSession(now);
  const runCopy = getRunCopy(marketSession);
  const [mode, setMode] = useState<Mode>("rules");
  const [monitoring, setMonitoring] = useState<MonitoringState | null>(null);
  const [report, setReport] = useState<DailyReportState | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEventState[]>([]);
  const [shortTermSignals, setShortTermSignals] = useState<ShortTermBuySignalState[]>([]);
  const [manualPositions, setManualPositions] = useState<ManualPositionState[]>([]);
  const [sellAlerts, setSellAlerts] = useState<SellSignalAlertState[]>([]);
  const [marketData, setMarketData] = useState<MarketDataStatusState | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [markingSignalId, setMarkingSignalId] = useState<string | null>(null);
  const [runMessage, setRunMessage] = useState(runCopy.idle);
  const [tradeMessage, setTradeMessage] = useState(initialTradeMessage);

  async function refresh() {
    const monitoringResponse = await fetch("/api/monitoring");
    const monitoringBody = (await monitoringResponse.json()) as MonitoringState;
    setMonitoring(monitoringBody);

    const reportResponse = await fetch("/api/report/daily");
    const reportBody = await reportResponse.json();
    setReport(reportBody.report);

    const auditResponse = await fetch("/api/audit");
    const auditBody = (await auditResponse.json()) as { events?: AuditEventState[] };
    setAuditEvents(auditBody.events ?? []);

    const marketDataResponse = await fetch("/api/market-data/status");
    const marketDataBody = (await marketDataResponse.json()) as MarketDataStatusState;
    setMarketData(marketDataBody);

    const shortTermResponse = await fetch("/api/short-term/signals");
    const shortTermBody = (await shortTermResponse.json()) as { signals?: ShortTermBuySignalState[] };
    const latestSignals = shortTermBody.signals ?? [];
    setShortTermSignals(latestSignals);
    setTradeMessage((message) => {
      if (message !== initialTradeMessage) return message;

      return latestSignals.length > 0 ? "发现特别值得关注的短线买入信号，等待人工确认。" : "暂无特别值得关注的短线买入信号。";
    });

    const manualResponse = await fetch("/api/manual-positions");
    const manualBody = (await manualResponse.json()) as {
      positions?: ManualPositionState[];
      sellAlerts?: SellSignalAlertState[];
    };
    setManualPositions(manualBody.positions ?? []);
    setSellAlerts(manualBody.sellAlerts ?? []);

    return monitoringBody;
  }

  async function runSimulation() {
    setIsRunning(true);
    setRunMessage(runCopy.running);

    try {
      const simulationResponse = await fetch("/api/simulation/run", { method: "POST" });
      if (!simulationResponse.ok) throw new Error("simulation failed");

      const latestMonitoring = await refresh();
      setRunMessage(`${runCopy.done}。审计事件：${latestMonitoring.auditEvents}`);
    } catch {
      setRunMessage("虚拟盘运行失败，请检查 API 服务。");
    } finally {
      setIsRunning(false);
    }
  }

  async function markManualBuy(signal: ShortTermBuySignalState) {
    setMarkingSignalId(signal.id);
    setTradeMessage(`正在标记 ${signal.symbol} 买入，卖出监控即将启动。`);

    try {
      const response = await fetch(`/api/short-term/signals/${encodeURIComponent(signal.id)}/manual-buy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: 1000 })
      });
      if (!response.ok) throw new Error("manual buy failed");

      const body = (await response.json()) as {
        position: ManualPositionState;
        sellAlerts?: SellSignalAlertState[];
      };
      setManualPositions((positions) => [
        body.position,
        ...positions.filter((position) => position.signalId !== body.position.signalId)
      ]);
      setSellAlerts(body.sellAlerts ?? []);
      setTradeMessage("已标记买入，开始监测卖出信号。");
    } catch {
      setTradeMessage("标记买入失败，请检查 API 服务。");
    } finally {
      setMarkingSignalId(null);
    }
  }

  useEffect(() => {
    void fetch("/api/strategies");
    void refresh();
  }, []);

  const recentAuditEvents = [...auditEvents].slice(-6).reverse();
  const latestAuditEvent = recentAuditEvents[0];
  const runtimePhase = getRuntimePhase(isRunning, report);
  const latestOperation = isRunning ? "执行请求中" : latestAuditEvent ? auditActionLabel(latestAuditEvent.action) : "等待指令";
  const displayStatus = getDisplayStatus(monitoring?.status, isRunning, report);
  const timeline = buildRunTimeline(isRunning, monitoring, report, auditEvents);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">iTrade Virtual Desk</p>
          <h1>虚拟交易工作台</h1>
        </div>
        <div className="runControls">
          <button className="primary" onClick={runSimulation} disabled={isRunning}>
            {isRunning ? runCopy.activeButton : runCopy.button}
          </button>
          <p className="runStatus" role="status" aria-live="polite">
            {runMessage}
          </p>
        </div>
      </header>

      <section className="grid">
        <section className="panel workspace">
          <div className="panelHeader">
            <div>
              <h2>策略：双均线成交量策略</h2>
              <p>同一份策略定义，可在三种模式间切换。</p>
            </div>
            <div className="tabs" aria-label="策略搭建模式">
              <button className={mode === "rules" ? "active" : ""} onClick={() => setMode("rules")}>
                结构化规则
              </button>
              <button className={mode === "canvas" ? "active" : ""} onClick={() => setMode("canvas")}>
                画布模块
              </button>
              <button className={mode === "ai" ? "active" : ""} onClick={() => setMode("ai")}>
                AI 助手
              </button>
            </div>
          </div>
          {mode === "rules" && <RulesMode />}
          {mode === "canvas" && <CanvasMode />}
          {mode === "ai" && <AiMode />}
        </section>

        <aside className="panel">
          <h2>实时监控</h2>
          <div className={`marketStatus ${marketSession.isOpen ? "open" : "closed"}`} aria-label="A股市场状态">
            <strong>市场状态：{marketSession.label}</strong>
            <span>当前时段：{marketSession.sessionName}</span>
            <small>{marketSession.nextAction}</small>
          </div>
          <div className={`dataStatus ${marketData?.source.isReal ? "real" : "sample"}`} aria-label="行情数据状态">
            <div>
              <strong>行情数据</strong>
              <span>{marketData ? dataRealityLabel(marketData) : "加载中"}</span>
            </div>
            <p>数据源：{marketData?.source.provider ?? "加载中"}</p>
            <p>数据质量：{marketData?.quality.ok ? "正常" : "需检查"}</p>
            <p>日线/分钟：{marketData ? `${marketData.dailyBars}/${marketData.minuteBars}` : "0/0"}</p>
            {marketData && marketData.source.warnings.length > 0 && (
              <small>{marketData.source.warnings.slice(0, 2).join("；")}</small>
            )}
          </div>
          <dl className="metrics">
            <div>
              <dt>虚拟盘</dt>
              <dd>{displayStatus}</dd>
            </div>
            <div>
              <dt>策略数</dt>
              <dd>{monitoring?.strategies ?? 0}</dd>
            </div>
            <div>
              <dt>信号/订单/成交</dt>
              <dd>{monitoring ? `${monitoring.signals}/${monitoring.orders}/${monitoring.fills}` : "0/0/0"}</dd>
            </div>
            <div>
              <dt>短线/人工/卖出提醒</dt>
              <dd>{`${shortTermSignals.length}/${manualPositions.length}/${sellAlerts.length}`}</dd>
            </div>
            <div>
              <dt>组合权益</dt>
              <dd>{money(monitoring?.totalEquity ?? 100000)}</dd>
            </div>
            <div>
              <dt>风险</dt>
              <dd className="ok">正常</dd>
            </div>
          </dl>

          <div className="runtimePanel" aria-label="虚拟盘当前执行">
            <h3>当前执行</h3>
            <p>运行阶段：{runtimePhase}</p>
            <p>最新操作：{latestOperation}</p>
            <p>最后更新时间：{latestAuditEvent ? formatAuditTime(latestAuditEvent.timestamp) : "暂无"}</p>
            <ol className="timeline" aria-label="虚拟盘执行阶段">
              {timeline.map((step) => (
                <li className={`timelineStep ${step.state}`} key={step.label}>
                  <span>{step.label}</span>
                  <strong>{step.detail}</strong>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </section>

      <section className="signalGrid">
        <section className="panel signalPanel">
          <div className="panelHeader signalHeader">
            <div>
              <h2>短线信号中心</h2>
              <p>AI 虚拟交易提示</p>
            </div>
            <span className="signalCounter">{shortTermSignals.length} 条</span>
          </div>
          <p className="tradeMessage" aria-live="polite">
            {tradeMessage}
          </p>
          {shortTermSignals.length > 0 ? (
            <div className="signalList">
              {shortTermSignals.map((signal) => (
                <ShortTermSignalItem
                  isMarked={manualPositions.some((position) => position.signalId === signal.id)}
                  isMarking={markingSignalId === signal.id}
                  key={signal.id}
                  onManualBuy={markManualBuy}
                  signal={signal}
                />
              ))}
            </div>
          ) : (
            <p className="emptyState">暂无达到阈值的短线买入信号。</p>
          )}
        </section>

        <section className="panel holdingPanel">
          <h2>人工持仓监控</h2>
          {manualPositions.length > 0 ? (
            <ul className="positionList">
              {manualPositions.map((position) => (
                <li key={position.id}>
                  <strong>
                    {position.symbol} {position.quantity} 股，成本 {price(position.entryPrice)}
                  </strong>
                  <span>止损观察 {price(position.stopLossPrice)}，状态：{positionStatusLabel(position.status)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="emptyState">尚未标记买入，等待短线信号确认。</p>
          )}
          <div className="sellAlertBox">
            <h3>卖出提醒</h3>
            {sellAlerts.length > 0 ? (
              <ul className="positionList">
                {sellAlerts.map((alert) => (
                  <li className="sellAlert" key={alert.id}>
                    <strong>
                      {alert.symbol}：{alert.action}
                    </strong>
                    <span>
                      {alert.reason}，现价 {price(alert.currentPrice)}
                    </span>
                    <small>{alert.basis.join("；")}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="emptyState">{manualPositions.length > 0 ? "暂无卖出提醒，继续监测。" : "等待手动买入后开始监测。"}</p>
            )}
          </div>
        </section>
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
        {marketSession.showAfterMarketAnalysis && (
          <section className="panel afterMarketPanel">
            <h2>盘后分析</h2>
            {report ? (
              <>
                <p>今日虚拟盘收益：{percent(report.dailyReturnPct)}</p>
                <p>复盘结论：策略今日{report.strategyTargetAchieved ? "达标" : "未达标"}</p>
                <p>
                  成交复盘：
                  {monitoring ? `${monitoring.fills} 笔成交，${monitoring.positions} 个持仓` : "等待监控数据"}
                </p>
                <p>次日观察：继续跟踪高置信度信号、未命中信号和风控拒单原因。</p>
              </>
            ) : (
              <p>盘后分析将在虚拟盘运行后生成。</p>
            )}
          </section>
        )}
        <section className="panel">
          <h2>审计日志</h2>
          <p>已记录事件：{monitoring?.auditEvents ?? 0}</p>
          <ul className="auditList" aria-label="最近审计事件">
            {recentAuditEvents.length > 0 ? (
              recentAuditEvents.map((event, index) => (
                <li key={`${event.id}-${index}`}>
                  <div>
                    <strong>{auditActionLabel(event.action)}</strong>
                    <time>{formatAuditTime(event.timestamp)}</time>
                  </div>
                  <p>{auditEventSummary(event)}</p>
                </li>
              ))
            ) : (
              <li className="emptyAudit">暂无审计事件。运行虚拟盘后会显示风控、下单和成交记录。</li>
            )}
          </ul>
        </section>
        <section className="panel">
          <h2>告警中心</h2>
          <p>第一版提供平台内状态灯、日志和通知。</p>
        </section>
      </section>
    </main>
  );
}

function ShortTermSignalItem({
  isMarked,
  isMarking,
  onManualBuy,
  signal
}: {
  isMarked: boolean;
  isMarking: boolean;
  onManualBuy: (signal: ShortTermBuySignalState) => Promise<void>;
  signal: ShortTermBuySignalState;
}) {
  const buttonText = isMarked ? "已标记买入" : isMarking ? "标记中..." : "标记已买入";

  return (
    <article className="signalItem">
      <div className="signalTop">
        <div>
          <strong>{signal.symbol}</strong>
          <time>{formatAuditTime(signal.timestamp)}</time>
        </div>
        <span className="signalBadge">{signal.recommendation}</span>
      </div>
      <div className="signalFacts">
        <p>现价：{price(signal.currentPrice)}</p>
        <p>置信度：{signal.confidenceScore}</p>
        <p>建议仓位：{percent(signal.suggestedPositionPct)}</p>
        <p>止损观察：{price(signal.stopLossPrice)}</p>
      </div>
      <div className="signalColumns">
        <div>
          <h3>购买依据</h3>
          <ul>
            {signal.basis.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3>风险边界</h3>
          <ul>
            {signal.riskNotes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
      <button className="secondary" onClick={() => void onManualBuy(signal)} disabled={isMarked || isMarking}>
        {buttonText}
      </button>
    </article>
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

function getRunCopy(marketSession: AShareMarketSession) {
  if (marketSession.isOpen) {
    return {
      button: "运行虚拟盘",
      activeButton: "运行中...",
      idle: "交易时间：可运行虚拟盘。",
      running: "正在运行虚拟盘...",
      done: "虚拟盘已完成，监控数据已刷新"
    };
  }

  if (marketSession.code === "after_market") {
    return {
      button: "生成盘后复盘",
      activeButton: "生成中...",
      idle: "休盘时间：可生成盘后复盘，不触发实时交易。",
      running: "正在生成盘后复盘...",
      done: "盘后复盘已生成，监控数据已刷新"
    };
  }

  return {
    button: "运行历史回放",
    activeButton: "回放中...",
    idle: "休盘时间：可运行历史回放，不触发实时交易。",
    running: "正在运行历史回放...",
    done: "历史回放已完成，监控数据已刷新"
  };
}

function getRuntimePhase(isRunning: boolean, report: DailyReportState | null): string {
  if (isRunning) return "执行中";
  if (report) return "运行完成";
  return "待运行";
}

function getDisplayStatus(status: string | undefined, isRunning: boolean, report: DailyReportState | null): string {
  if (isRunning) return "执行中";
  if (report) return "运行完成";
  if (status === "idle") return "待运行";
  if (status === "running") return "运行中";
  return "加载中";
}

function auditActionLabel(action: string): string {
  if (action === "risk_checked") return "风控校验";
  if (action === "virtual_fill_created") return "虚拟成交";
  if (action === "strategy_parameters_hot_updated") return "策略热更新";
  if (action === "manual_buy_marked") return "手动标记买入";
  return action;
}

function auditEventSummary(event: AuditEventState): string {
  if (event.action === "risk_checked") {
    const approved = event.details.approved ? "通过" : "拒绝";
    return `风控校验${approved}：${event.details.reason ?? "未给出原因"}`;
  }

  if (event.action === "virtual_fill_created") {
    return `买入/卖出成交：${event.details.symbol ?? event.entityId}，${event.details.quantity ?? 0} 股`;
  }

  if (event.action === "strategy_parameters_hot_updated") {
    return `策略参数已修改：${event.entityId}`;
  }

  if (event.action === "manual_buy_marked") {
    return `已标记买入：${event.details.symbol ?? event.entityId}，${event.details.quantity ?? 0} 股`;
  }

  return `${auditActionLabel(event.action)}：${event.entityId}`;
}

function positionStatusLabel(status: ManualPositionState["status"]): string {
  if (status === "monitoring") return "监测中";
  if (status === "sell_alerted") return "已触发卖出提醒";
  return "已关闭";
}

function formatAuditTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;

  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function buildRunTimeline(
  isRunning: boolean,
  monitoring: MonitoringState | null,
  report: DailyReportState | null,
  auditEvents: AuditEventState[]
) {
  const riskChecks = monitoring?.orders ?? auditEvents.filter((event) => event.action === "risk_checked").length;
  const fills = monitoring?.fills ?? 0;
  const signals = monitoring?.signals ?? 0;
  const hasRun = Boolean(report || monitoring?.auditEvents);

  return [
    {
      label: "准备行情",
      detail: hasRun ? "行情数据已载入" : "等待启动",
      state: stepState(hasRun || isRunning, isRunning && !hasRun)
    },
    {
      label: "生成信号",
      detail: `${signals} 条`,
      state: stepState(signals > 0, isRunning && signals === 0)
    },
    {
      label: "风控校验",
      detail: `${riskChecks} 次`,
      state: stepState(riskChecks > 0, isRunning && riskChecks === 0)
    },
    {
      label: "撮合成交",
      detail: `${fills} 笔`,
      state: stepState(fills > 0, isRunning && fills === 0)
    },
    {
      label: "生成日报",
      detail: report ? "已生成" : "等待运行",
      state: stepState(Boolean(report), isRunning && !report)
    }
  ];
}

function stepState(done: boolean, active: boolean): "done" | "active" | "pending" {
  if (done) return "done";
  if (active) return "active";
  return "pending";
}

function dataRealityLabel(marketData: MarketDataStatusState): string {
  if (!marketData.source.isReal) return "样例数据";
  if (marketData.source.cacheHit) return "真实缓存";
  return "真实数据";
}

function money(value: number): string {
  return value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function price(value: number): string {
  return value.toFixed(2);
}

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}
