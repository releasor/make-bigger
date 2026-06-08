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

interface AppProps {
  now?: Date;
}

export function App({ now = new Date() }: AppProps = {}) {
  const marketSession = getAShareMarketSession(now);
  const runCopy = getRunCopy(marketSession);
  const [mode, setMode] = useState<Mode>("rules");
  const [monitoring, setMonitoring] = useState<MonitoringState | null>(null);
  const [report, setReport] = useState<DailyReportState | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEventState[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [runMessage, setRunMessage] = useState(runCopy.idle);

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

  return `${auditActionLabel(event.action)}：${event.entityId}`;
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
      detail: hasRun ? "样例分钟线已载入" : "等待启动",
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

function money(value: number): string {
  return value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}
