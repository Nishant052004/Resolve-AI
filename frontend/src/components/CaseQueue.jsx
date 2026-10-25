import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import CaseDetail from "./CaseDetail.jsx";
import { 
  Inbox, 
  Search, 
  RotateCw, 
  Filter, 
  ChevronRight, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  XCircle,
  Layers,
  ArrowUpDown
} from "lucide-react";

const FILTERS = [
  { id: "", label: "All Cases" },
  { id: "escalated", label: "Escalated" },
  { id: "pending_info", label: "Pending Info" },
  { id: "auto_refunded", label: "Auto-refunded" },
  { id: "auto_denied", label: "Auto-denied" },
  { id: "completed", label: "Completed" },
  { id: "rejected", label: "Rejected" },
];

const STATUS_STYLES = {
  escalated: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  pending_info: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  auto_refunded: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  auto_denied: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  completed: "bg-emerald-600/30 text-emerald-200 border-emerald-500/50",
  rejected: "bg-slate-700/50 text-slate-300 border-slate-600",
  in_progress: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  submitted: "bg-slate-800 text-slate-300 border-slate-700",
  failed: "bg-rose-600/30 text-rose-200 border-rose-500/50",
};

export default function CaseQueue() {
  const [filter, setFilter] = useState("escalated");
  const [search, setSearch] = useState("");
  const [cases, setCases] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await api.listCases(filter);
      const list = resp.cases || [];
      setCases(list);
      // Auto-select first case if none selected
      if (list.length > 0 && !selectedId) {
        setSelectedId(list[0].id);
      }
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filter, selectedId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]);

  const filteredCases = cases.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.id?.toLowerCase().includes(q) ||
      c.customer_id?.toLowerCase().includes(q) ||
      c.order_id?.toLowerCase().includes(q) ||
      c.reason?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      {/* Queue Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Inbox className="h-5 w-5 text-cyan-400" /> Operator Command Queue
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Review escalated refund requests, inspect evidence & tool provenance, and issue operator decisions.
          </p>
        </div>

        {/* Search & Actions */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ID, customer, order..."
              className="w-48 sm:w-64 rounded-xl border border-slate-800 bg-slate-900/80 pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>

          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-700 hover:bg-slate-800 disabled:opacity-50"
          >
            <RotateCw className={`h-3.5 w-3.5 text-cyan-400 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-800/80 bg-slate-900/60 p-1.5 backdrop-blur-md">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
              filter === f.id
                ? "bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
          {error}
        </div>
      )}

      {/* Main Grid: Queue Table on Left, Case Detail on Right */}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr] items-start">
        {/* Cases Table Panel */}
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80 shadow-xl backdrop-blur-md">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-3">Case ID</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Tags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredCases.map((c) => {
                  const isSelected = selectedId === c.id;
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedId(c.id)}
                      className={`cursor-pointer transition ${
                        isSelected
                          ? "bg-cyan-500/10 border-l-4 border-l-cyan-400"
                          : "hover:bg-slate-800/50"
                      }`}
                    >
                      <td className="px-4 py-3 font-mono font-medium text-cyan-400">
                        {c.id ? (c.id.length > 8 ? `${c.id.slice(0, 8)}…` : c.id) : ""}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-200">
                        {c.customer_id}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-white">
                        {c.amount_cents != null ? `$${(c.amount_cents / 100).toFixed(2)}` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${
                            STATUS_STYLES[c.status] || "bg-slate-800 text-slate-300 border-slate-700"
                          }`}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(c.priority_tags || []).map((t) => (
                            <span
                              key={t}
                              className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] text-rose-300 border border-rose-500/30"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredCases.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center gap-2">
                        <Inbox className="h-8 w-8 text-slate-600" />
                        <span className="text-sm font-medium text-slate-400">No cases match this filter</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Case Detail Side View */}
        <CaseDetail caseId={selectedId} onChanged={load} />
      </div>
    </div>
  );
}
