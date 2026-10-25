import { useEffect, useState } from "react";
import { api } from "../api.js";
import { BUCKET_STYLE, bucketOf } from "./GalaxyView.jsx";
import { 
  ArrowLeft, 
  RotateCw, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  ShieldCheck, 
  Wrench, 
  Layers, 
  Activity,
  Cpu,
  FileText
} from "lucide-react";

const STEPS = [
  { id: "IdentifyProblem", label: "Identify", icon: FileText },
  { id: "GatherEvidence", label: "Evidence", icon: Layers },
  { id: "CheckPolicy", label: "Policy", icon: ShieldCheck },
  { id: "RecommendResolution", label: "Recommend", icon: Cpu },
  { id: "ExecuteOrEscalate", label: "Execute / Escalate", icon: Wrench },
  { id: "FinalOutcome", label: "Outcome", icon: CheckCircle2 },
];

const CX = 400;
const CY = 225;
const RX = 300;
const RY = 132;

function nodePos(i) {
  const th = -Math.PI / 2 + (i * 2 * Math.PI) / STEPS.length;
  return { x: CX + RX * Math.cos(th), y: CY + RY * Math.sin(th) };
}

export default function OrbitTimeline({ caseId, onBack }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setDetail(null);
    setError("");
    api
      .getCase(caseId)
      .then((d) => {
        if (alive) setDetail(d);
      })
      .catch((err) => {
        if (alive) setError(err.message);
      });

    const onKey = (e) => {
      if (e.key === "Escape") onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      alive = false;
      window.removeEventListener("keydown", onKey);
    };
  }, [caseId, onBack]);

  return (
    <div className="space-y-4">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-slate-700 hover:bg-slate-800 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4 text-cyan-400" />
            <span>Back to Galaxy</span>
          </button>
          <span className="text-xs text-slate-500 font-mono">Press [Esc] to exit</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full bg-cyan-500/10 px-2.5 py-0.5 text-xs font-mono font-medium text-cyan-400 border border-cyan-500/30">
            Case Inspector Mode
          </span>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-300">
          {error}
        </div>
      )}
      {!error && !detail && (
        <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-sm text-slate-400">
          <div className="flex flex-col items-center gap-2">
            <RotateCw className="h-6 w-6 text-cyan-400 animate-spin" />
            <span>Tracing AI agent orbital trajectory…</span>
          </div>
        </div>
      )}

      {!error && detail && <OrbitBody detail={detail} />}
    </div>
  );
}

function OrbitBody({ detail }) {
  const { case: c, events = [], tool_calls: toolCalls = [] } = detail;

  const visited = new Set();
  let decision = null;
  let outcome = null;
  for (const e of events) {
    let p = e.payload;
    if (typeof p === "string") {
      try {
        p = JSON.parse(p);
      } catch {
        p = {};
      }
    }
    if (e.event_type === "state_entered" && p?.state) visited.add(p.state);
    if (e.event_type === "decision") decision = p;
    if (e.event_type === "outcome") outcome = p;
  }

  const style = BUCKET_STYLE[bucketOf(c.status)];
  const doneCount = STEPS.filter((s) => visited.has(s.id)).length;
  const okCalls = toolCalls.filter((t) => t.status === "ok").length;
  const shortId = c.id.length > 10 ? `${c.id.slice(0, 10)}…` : c.id;
  const orbitPath = `M ${CX + RX} ${CY} A ${RX} ${RY} 0 1 1 ${CX - RX} ${CY} A ${RX} ${RY} 0 1 1 ${CX + RX} ${CY}`;

  return (
    <div className="space-y-4 arra-zoom-in">
      {/* Case Details Header Card */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              Case <span className="font-mono text-cyan-400">{shortId}</span>
            </h2>
            <span
              className="rounded-full px-3 py-0.5 text-xs font-semibold capitalize"
              style={{
                background: `${style.color}22`,
                color: style.color,
                border: `1px solid ${style.color}44`,
              }}
            >
              {c.status}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-lg bg-slate-950 px-2.5 py-1 font-semibold text-white border border-slate-800">
              ${(c.amount_cents / 100).toFixed(2)} {c.currency || "USD"}
            </span>
            {c.category && (
              <span className="rounded-lg bg-slate-950 px-2.5 py-1 font-medium text-slate-300 border border-slate-800">
                {c.category}
              </span>
            )}
            <span className="rounded-lg bg-slate-950 px-2.5 py-1 font-medium text-slate-300 border border-slate-800">
              Cust: {c.customer_id}
            </span>
            {decision?.recommendation && (
              <span className="rounded-lg bg-indigo-500/15 px-2.5 py-1 font-medium text-indigo-300 border border-indigo-500/30">
                Rec: {decision.recommendation}
              </span>
            )}
            {c.transaction_id && (
              <span className="rounded-lg bg-emerald-500/15 px-2.5 py-1 font-mono text-emerald-400 border border-emerald-500/30">
                Txn: {c.transaction_id}
              </span>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <p className="text-sm italic text-slate-300">“{c.reason}”</p>
          <span className="text-xs text-slate-400 font-mono">
            {doneCount} / {STEPS.length} agent stages executed
          </span>
        </div>

        {/* SVG Orbital Diagram */}
        <div className="relative mt-4 rounded-xl bg-slate-950 p-2 border border-slate-800/80 shadow-inner">
          <svg viewBox="0 0 800 470" className="w-full" role="img" aria-label="Agent orbit timeline">
            <defs>
              <radialGradient id="arra-planet-shade" cx="35%" cy="35%" r="80%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
                <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
                <stop offset="100%" stopColor="#020617" stopOpacity="0.45" />
              </radialGradient>
            </defs>

            {/* Orbit Path Ellipse */}
            <ellipse cx={CX} cy={CY} rx={RX} ry={RY} fill="none" stroke="#1e293b" strokeWidth="2" />
            <ellipse
              cx={CX}
              cy={CY}
              rx={RX}
              ry={RY}
              fill="none"
              stroke="#38bdf8"
              strokeWidth="1.5"
              strokeDasharray="4 12"
              opacity="0.6"
              className="arra-orbit-dash"
            />
            
            {/* Particle motion along orbit */}
            <circle r="4" fill="#38bdf8" opacity="0.95">
              <animateMotion dur="14s" repeatCount="indefinite" path={orbitPath} />
            </circle>

            {/* Central Planet (Case Core) */}
            <circle cx={CX} cy={CY} r="38" fill={style.color} opacity="0.25" className="arra-pulse-halo" />
            <circle cx={CX} cy={CY} r="24" fill={style.color} />
            <circle cx={CX} cy={CY} r="24" fill="url(#arra-planet-shade)" />
            <text
              x={CX}
              y={CY + 48}
              textAnchor="middle"
              fontSize="11"
              fontWeight="600"
              fill="#e2e8f0"
              fontFamily="JetBrains Mono, monospace"
            >
              case-{shortId}
            </text>

            {/* Orbit Nodes */}
            {STEPS.map((stepObj, i) => {
              const p = nodePos(i);
              const done = visited.has(stepObj.id);
              return (
                <g key={stepObj.id}>
                  {/* Outer ring glow if visited */}
                  {done && (
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r="20"
                      fill={style.color}
                      opacity="0.2"
                    />
                  )}

                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="14"
                    fill={done ? style.color : "#0f172a"}
                    stroke={done ? style.color : "#334155"}
                    strokeWidth="2"
                  />
                  {done && <circle cx={p.x} cy={p.y} r="5" fill="#030712" opacity="0.8" />}
                  
                  <text
                    x={p.x}
                    y={p.y + 32}
                    textAnchor="middle"
                    fontSize="12"
                    fontWeight={done ? "600" : "400"}
                    fill={done ? "#f8fafc" : "#64748b"}
                    fontFamily="Inter, sans-serif"
                  >
                    {stepObj.label}
                  </text>
                  <text
                    x={p.x}
                    y={p.y + 45}
                    textAnchor="middle"
                    fontSize="9"
                    fill="#64748b"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {stepObj.id}
                  </text>
                </g>
              );
            })}
          </svg>

          {outcome && (
            <div className="mt-2 rounded-lg bg-slate-900 p-2.5 text-center font-mono text-xs text-slate-300 border border-slate-800">
              <span className="text-cyan-400 font-semibold">Final Outcome Payload:</span>{" "}
              {JSON.stringify(outcome)}
            </div>
          )}
        </div>
      </div>

      {/* Rationale & Tool Calls Grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Agent Rationale */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl backdrop-blur-md">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Cpu className="h-4 w-4 text-cyan-400" /> Agent Rationale & Policy Check
          </h3>
          <ul className="mt-3 space-y-2">
            {(c.rationale || []).map((r, i) => (
              <li key={i} className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3 text-xs text-slate-300">
                {typeof r === "object" && r !== null ? (
                  <div className="space-y-1">
                    <span className="inline-block rounded bg-cyan-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-cyan-400 border border-cyan-500/30">
                      Rule: {r.rule}
                    </span>
                    <p className="text-slate-300">{r.detail}</p>
                  </div>
                ) : (
                  <span>{String(r)}</span>
                )}
              </li>
            ))}
            {(c.rationale || []).length === 0 && (
              <li className="text-xs text-slate-500 italic">No agent rationale statements recorded.</li>
            )}
          </ul>
        </div>

        {/* Tool Call Provenance */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Wrench className="h-4 w-4 text-cyan-400" /> Tool Execution Provenance
            </h3>
            <span className="text-xs text-slate-400 font-mono">
              {okCalls}/{toolCalls.length} succeeded
            </span>
          </div>

          <ul className="mt-3 space-y-2">
            {toolCalls.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs"
              >
                <div className="flex items-center gap-2 font-mono">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      t.status === "ok" ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-rose-500"
                    }`}
                  />
                  <span className="font-semibold text-slate-200">{t.tool_name}</span>
                  <span className="text-[10px] text-slate-500">att {t.attempt}</span>
                </div>

                <div className="flex items-center gap-3 font-mono">
                  <span className="text-slate-400">{t.latency_ms} ms</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                      t.status === "ok"
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                        : "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                    }`}
                  >
                    {t.status}
                  </span>
                </div>
              </li>
            ))}
            {toolCalls.length === 0 && (
              <li className="text-xs text-slate-500 italic">No tool execution records found.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
