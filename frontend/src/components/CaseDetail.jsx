import { useCallback, useEffect, useState } from "react";
import { api, getPrincipal } from "../api.js";
import { 
  RotateCw, 
  CheckCircle2, 
  XCircle, 
  HelpCircle, 
  ShieldAlert, 
  Copy, 
  Check, 
  Wrench, 
  History, 
  Cpu, 
  DollarSign, 
  User, 
  ShoppingBag, 
  Tag, 
  MessageSquare,
  AlertTriangle
} from "lucide-react";

const ACTIONABLE = ["escalated", "pending_info"];

export default function CaseDetail({ caseId, onChanged }) {
  const [detail, setDetail] = useState(null);
  const [comment, setComment] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const principal = getPrincipal();

  const load = useCallback(async () => {
    if (!caseId) return;
    try {
      setDetail(await api.getCase(caseId));
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, [caseId]);

  useEffect(() => {
    setDetail(null);
    setNotice("");
    setError("");
    setComment("");
    load();
  }, [load]);

  async function act(action) {
    setBusy(true);
    setError("");
    try {
      const resp = await api.act(caseId, action, comment);
      const extra = resp.detail ? ` — ${resp.detail}` : "";
      setNotice(`Action "${action}" recorded${extra}`);
      setComment("");
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function replay() {
    setBusy(true);
    setError("");
    try {
      await api.replay(caseId);
      setNotice("Agent replayed execution from GatherEvidence stage");
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.status === 403 ? "Only admins can replay a case." : err.message);
    } finally {
      setBusy(false);
    }
  }

  const copyId = () => {
    if (caseId) {
      navigator.clipboard.writeText(caseId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!caseId) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/60 p-12 text-center text-slate-500 shadow-xl backdrop-blur-md">
        <Cpu className="h-10 w-10 text-slate-700" />
        <p className="mt-3 text-sm font-medium text-slate-400">Select a case from the queue</p>
        <p className="mt-1 text-xs text-slate-600">Inspect evidence, agent rationale, tool provenance, and act.</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center text-slate-400 shadow-xl backdrop-blur-md">
        <RotateCw className="h-6 w-6 text-cyan-400 animate-spin" />
        <span className="mt-3 text-xs font-mono">{error || "Fetching case provenance..."}</span>
      </div>
    );
  }

  const { case: c, events = [], tool_calls: toolCalls = [] } = detail || {};

  return (
    <div className="space-y-4">
      {/* Primary Details Card */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl backdrop-blur-md">
        {/* Card Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Case ID <span className="font-mono text-cyan-400">{c?.id?.slice(0, 10)}…</span>
              </h2>
              <button
                onClick={copyId}
                title="Copy Full Case ID"
                className="rounded-md border border-slate-800 bg-slate-950 p-1 text-slate-400 hover:text-white"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
            <p className="mt-1 text-xs italic text-slate-300">“{c?.reason}”</p>
          </div>

          <button
            onClick={replay}
            disabled={busy}
            title="Re-run agent from GatherEvidence stage"
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
          >
            <RotateCw className={`h-3.5 w-3.5 text-cyan-400 ${busy ? "animate-spin" : ""}`} />
            <span>Replay Agent</span>
          </button>
        </div>

        {/* Case Attributes Grid */}
        <dl className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
          <AttributeCard
            icon={DollarSign}
            label="Refund Amount"
            value={c?.amount_cents != null ? `$${(c.amount_cents / 100).toFixed(2)} ${c.currency || "USD"}` : "—"}
            highlight
          />
          <AttributeCard icon={Tag} label="Category" value={c?.category} />
          <AttributeCard icon={User} label="Customer" value={c?.customer_id} />
          <AttributeCard icon={ShoppingBag} label="Order ID" value={c?.order_id} />
          <AttributeCard icon={Cpu} label="Agent Recommendation" value={c?.recommendation} />
          <AttributeCard icon={History} label="Outcome By" value={c?.outcome_by || "Pending"} />
        </dl>

        {/* Priority Tags */}
        {(c?.priority_tags || []).length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-slate-800/80 pt-3">
            <span className="text-xs font-medium text-slate-400">Priority Tags:</span>
            {(c.priority_tags || []).map((t) => (
              <span
                key={t}
                className="rounded-lg bg-rose-500/15 px-2 py-0.5 text-xs font-semibold text-rose-300 border border-rose-500/30"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        {/* High Value Dual Approval Banner */}
        {c?.amount_cents >= 50000 && (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-200 flex items-start gap-2.5">
            <ShieldAlert className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">High-Value Refund Requirement:</span>
              <p className="mt-0.5 text-amber-300/90">
                This transaction exceeds $500. Two distinct operators must approve before funds are disbursed.
                {(c?.approvals || []).length > 0 && (
                  <span className="ml-1 font-mono font-bold text-white">
                    (Approvals recorded: {c.approvals.length}/2)
                  </span>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Action Panel for Escalated Cases */}
        {ACTIONABLE.includes(c?.status) && (
          <div className="mt-5 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5 text-cyan-400" /> Operator Decision Console
              </label>
              <span className="text-[10px] text-slate-400 font-mono">Logged as: {principal?.username}</span>
            </div>

            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add mandatory/optional operator rationale for audit logging..."
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                onClick={() => act("approve")}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-500 disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>Approve Refund</span>
              </button>

              <button
                onClick={() => act("reject")}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-rose-600/20 hover:bg-rose-500 disabled:opacity-50"
              >
                <XCircle className="h-4 w-4" />
                <span>Reject</span>
              </button>

              <button
                onClick={() => act("request_info")}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50"
              >
                <HelpCircle className="h-4 w-4 text-sky-400" />
                <span>Request Info</span>
              </button>
            </div>
          </div>
        )}

        {notice && (
          <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
            {notice}
          </div>
        )}
        {error && (
          <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
            {error}
          </div>
        )}

        {/* Agent Rationale List */}
        <div className="mt-5 border-t border-slate-800 pt-4">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <Cpu className="h-3.5 w-3.5 text-cyan-400" /> Agent Policy Rationale
          </h3>
          <ul className="mt-2 space-y-1.5">
            {(c?.rationale || []).map((r, i) => (
              <li key={i} className="rounded-lg bg-slate-950/60 p-2.5 text-xs text-slate-300 border border-slate-800/60">
                {typeof r === "object" && r !== null ? (
                  <div>
                    <span className="font-mono text-[11px] font-semibold text-cyan-400">{r.rule}</span> — {r.detail}
                  </div>
                ) : (
                  String(r)
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Tool Call Provenance Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl backdrop-blur-md">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <Wrench className="h-3.5 w-3.5 text-cyan-400" /> Tool Calls & Provenance Log
        </h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-950/60 font-mono text-[10px] text-slate-400">
              <tr>
                <th className="py-2 px-3">Tool Name</th>
                <th className="py-2 px-3">Attempt</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3 text-right">Latency</th>
                <th className="py-2 px-3">Error Log</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 font-mono">
              {toolCalls.map((t) => (
                <tr key={t.id} className="hover:bg-slate-800/40">
                  <td className="py-2 px-3 font-semibold text-slate-200">{t.tool_name}</td>
                  <td className="py-2 px-3 text-slate-400">{t.attempt}</td>
                  <td className="py-2 px-3">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${t.status === "ok" ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" : "bg-rose-500/15 text-rose-400 border border-rose-500/30"}`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right text-slate-300">{t.latency_ms} ms</td>
                  <td className="py-2 px-3 text-rose-400 max-w-xs truncate">{t.error || "—"}</td>
                </tr>
              ))}
              {toolCalls.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-slate-500 font-sans italic">
                    No tool calls recorded for this case.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Timeline Audit Trail */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl backdrop-blur-md">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <History className="h-3.5 w-3.5 text-cyan-400" /> Immutable Audit Timeline
        </h3>
        <ol className="mt-4 space-y-3">
          {events.map((e) => (
            <li key={e.id} className="relative pl-6 text-xs">
              <span className="absolute left-0 top-1 h-2.5 w-2.5 rounded-full bg-cyan-400 ring-4 ring-slate-900 shadow-[0_0_8px_#38bdf8]" />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">{e.event_type}</span>
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                    {e.actor}
                  </span>
                </div>
                <span className="font-mono text-[10px] text-slate-500">
                  {(e.created_at || "").replace("T", " ").slice(0, 19)}
                </span>
              </div>
              <p className="mt-1 rounded-lg bg-slate-950 p-2 font-mono text-[11px] text-slate-400 border border-slate-800/80 overflow-x-auto">
                {typeof e.payload === "object" ? JSON.stringify(e.payload) : String(e.payload)}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function AttributeCard({ icon: Icon, label, value, highlight }) {
  return (
    <div className={`rounded-xl border p-3 ${highlight ? "border-cyan-500/40 bg-cyan-500/10" : "border-slate-800 bg-slate-950/60"}`}>
      <div className="flex items-center gap-1.5 text-slate-400">
        {Icon && <Icon className="h-3.5 w-3.5 text-cyan-400" />}
        <span className="text-[10px] uppercase font-semibold tracking-wide">{label}</span>
      </div>
      <p className={`mt-1 font-bold text-slate-100 ${highlight ? "text-cyan-300 font-mono text-sm" : ""}`}>
        {value || "—"}
      </p>
    </div>
  );
}
