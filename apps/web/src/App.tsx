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
  const [isRunning, setIsRunning] = useState(false);
  const [runMessage, setRunMessage] = useState("尚未运行虚拟盘");

  async function refresh() {
    const monitoringResponse = await fetch("/api/monitoring");
    const monitoringBody = (await monitoringResponse.json()) as MonitoringState;
    setMonitoring(monitoringBody);

    const reportResponse = await fetch("/api/report/daily");
    const reportBody = await reportResponse.json();
    setReport(reportBody.report);

    return monitoringBody;
  }

  async function runSimulation() {
    setIsRunning(true);
    setRunMessage("正在运行虚拟盘...");

    try {
      const simulationResponse = await fetch("/api/simulation/run", { method: "POST" });
      if (!simulationResponse.ok) throw new Error("simulation failed");

      const latestMonitoring = await refresh();
      setRunMessage(`虚拟盘已完成，监控数据已刷新。审计事件：${latestMonitoring.auditEvents}`);
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

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">iTrade Virtual Desk</p>
          <h1>虚拟交易工作台</h1>
        </div>
        <div className="runControls">
          <button className="primary" onClick={runSimulation} disabled={isRunning}>
            {isRunning ? "运行中..." : "运行虚拟盘"}
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
          <dl className="metrics">
            <div>
              <dt>状态</dt>
              <dd>{monitoring?.status ?? "加载中"}</dd>
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
        <section className="panel">
          <h2>审计日志</h2>
          <p>已记录事件：{monitoring?.auditEvents ?? 0}</p>
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

function money(value: number): string {
  return value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}
