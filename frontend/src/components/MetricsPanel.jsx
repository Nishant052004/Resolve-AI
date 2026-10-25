import { useEffect, useState } from "react";
import { api } from "../api.js";
import { 
  BarChart3, 
  TrendingUp, 
  ShieldAlert, 
  CheckCircle2, 
  Wrench, 
  Clock, 
  DollarSign, 
  Activity, 
  Layers, 
  RotateCw,
  Zap
} from "lucide-react";

export default function MetricsPanel() {
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .metrics()
      .then(setMetrics)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, []);

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-300">
        {error}
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-slate-400">
        <div className="flex flex-col items-center gap-2">
          <RotateCw className="h-6 w-6 text-cyan-400 animate-spin" />
          <span className="text-xs font-mono">Aggregating telemetry & runtime metrics…</span>
        </div>
      </div>
    );
  }

  const pct = (v) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
  const usd = (v) => (v == null ? "—" : `$${v.toFixed(4)}`);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-cyan-400" /> System Telemetry & Metrics
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time monitoring of AI resolution efficiency, policy accuracy, tool execution success, and cost metrics.
          </p>
        </div>

        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-700 hover:bg-slate-800 disabled:opacity-50"
        >
          <RotateCw className={`h-3.5 w-3.5 text-cyan-400 ${loading ? "animate-spin" : ""}`} />
          <span>Live Sync</span>
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={TrendingUp}
          title="Autonomous Resolution Rate"
          value={pct(metrics.autonomous_resolution_rate)}
          hint="auto-refunded + auto-denied / total"
          color="emerald"
          percentValue={metrics.autonomous_resolution_rate}
        />
        <MetricCard
          icon={ShieldAlert}
          title="Total Escalations"
          value={metrics.escalations}
          hint={`out of ${metrics.total_cases} total cases`}
          color="amber"
        />
        <MetricCard
          icon={CheckCircle2}
          title="Escalation Accuracy"
          value={pct(metrics.escalation_accuracy)}
          hint="operator agreement rate"
          color="indigo"
          percentValue={metrics.escalation_accuracy}
        />
        <MetricCard
          icon={Wrench}
          title="Tool-Call Success Rate"
          value={pct(metrics.tool_call_success_rate)}
          hint="incl. injected fault retries"
          color="cyan"
          percentValue={metrics.tool_call_success_rate}
        />
        <MetricCard
          icon={Layers}
          title="Avg Steps Per Case"
          value={metrics.avg_steps_per_case ?? "—"}
          hint="state transitions count"
          color="sky"
        />
        <MetricCard
          icon={Clock}
          title="Average Latency"
          value={metrics.latency?.avg_ms != null ? `${metrics.latency.avg_ms} ms` : "—"}
          hint={`p95 latency: ${metrics.latency?.p95_ms ?? "—"} ms`}
          color="violet"
        />
        <MetricCard
          icon={DollarSign}
          title="Cost Per Resolution"
          value={usd(metrics.cost_per_resolution_usd)}
          hint="modeled step + tool invocation cost"
          color="emerald"
        />
        <MetricCard
          icon={Activity}
          title="Total Processed Cases"
          value={metrics.total_cases}
          hint="active in database"
          color="indigo"
        />
      </div>

      {/* Case Status Distribution Breakdown Panel */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl backdrop-blur-md space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Zap className="h-4 w-4 text-cyan-400" /> Status Distribution Breakdown
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(metrics.by_status || {}).map(([status, count]) => (
            <div key={status} className="rounded-xl border border-slate-800 bg-slate-950 p-3.5">
              <span className="text-[10px] uppercase font-semibold font-mono text-slate-400">{status}</span>
              <p className="mt-1 text-xl font-bold text-white">{count}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-500 font-mono pt-2 border-t border-slate-800">
          Prometheus runtime counters active at <code className="text-cyan-400">GET /metrics</code>. Detailed specs in docs/metrics.md.
        </p>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, title, value, hint, color = "cyan", percentValue }) {
  const colorMap = {
    cyan: "text-cyan-400 border-cyan-500/30 bg-cyan-500/10",
    emerald: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
    amber: "text-amber-400 border-amber-500/30 bg-amber-500/10",
    indigo: "text-indigo-400 border-indigo-500/30 bg-indigo-500/10",
    sky: "text-sky-400 border-sky-500/30 bg-sky-500/10",
    violet: "text-violet-400 border-violet-500/30 bg-violet-500/10",
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl backdrop-blur-md relative overflow-hidden">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</span>
        <div className={`flex h-8 w-8 items-center justify-center rounded-xl border ${colorMap[color]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>

      <p className="mt-3 text-2xl font-extrabold text-white font-mono tracking-tight">{value}</p>

      {/* Optional Progress Bar for Percentage Metrics */}
      {percentValue != null && (
        <div className="mt-2.5 h-1.5 w-full rounded-full bg-slate-950 overflow-hidden border border-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(0, percentValue * 100))}%` }}
          />
        </div>
      )}

      <p className="mt-2 text-[11px] text-slate-400">{hint}</p>
    </div>
  );
}
