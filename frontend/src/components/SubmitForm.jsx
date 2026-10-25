import { useState } from "react";
import { api } from "../api.js";
import { 
  Send, 
  User, 
  Mail, 
  ShoppingBag, 
  DollarSign, 
  MessageSquare, 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle, 
  RotateCw, 
  ArrowRight,
  ShieldCheck,
  Zap,
  Tag
} from "lucide-react";

const PRESETS = [
  {
    title: "📦 Damaged Shipment",
    customer_id: "CUST-042",
    customer_email: "jane.doe@example.com",
    order_id: "ORD-1001",
    amount: "49.99",
    currency: "USD",
    reason: "Item arrived damaged during transit with broken display.",
  },
  {
    title: "✈️ Shipping Delay",
    customer_id: "CUST-108",
    customer_email: "alex.smith@example.com",
    order_id: "ORD-1042",
    amount: "18.50",
    currency: "USD",
    reason: "Express delivery arrived 5 days late beyond guaranteed SLA.",
  },
  {
    title: "💎 High-Value Refund",
    customer_id: "CUST-999",
    customer_email: "vip.customer@corporate.com",
    order_id: "ORD-8888",
    amount: "650.00",
    currency: "USD",
    reason: "Defective industrial hardware unit returned under warranty.",
  },
];

const EMPTY = {
  customer_id: "",
  customer_email: "",
  order_id: "",
  amount: "",
  currency: "USD",
  reason: "",
};

export default function SubmitForm() {
  const [form, setForm] = useState(EMPTY);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const applyPreset = (preset) => {
    setForm({
      customer_id: preset.customer_id,
      customer_email: preset.customer_email,
      order_id: preset.order_id,
      amount: preset.amount,
      currency: preset.currency,
      reason: preset.reason,
    });
  };

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setResult(null);

    const parsedAmount = parseFloat(form.amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("Please enter a valid positive refund amount.");
      setBusy(false);
      return;
    }

    try {
      const resp = await api.submitRefund({
        customer_id: form.customer_id,
        customer_email: form.customer_email,
        order_id: form.order_id,
        amount_cents: Math.round(parsedAmount * 100),
        currency: form.currency,
        reason: form.reason,
      });
      setResult(resp.case);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const statusColor = {
    auto_refunded: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    auto_denied: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    escalated: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  }[result?.status] || "bg-slate-800 text-slate-300 border-slate-700";

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
          <Send className="h-5 w-5 text-cyan-400" /> Submit Refund Request
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Trigger real-time AI resolution. The ARRA agent evaluates history, applies policy rules, and auto-resolves or escalates immediately.
        </p>
      </div>

      {/* Preset Quick Fill Pills */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-3 backdrop-blur-md">
        <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
          <Zap className="h-3.5 w-3.5 text-amber-400" /> Quick-Fill Demo Presets:
        </span>
        {PRESETS.map((p, i) => (
          <button
            key={i}
            type="button"
            onClick={() => applyPreset(p)}
            className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-1 text-xs font-medium text-slate-300 transition hover:border-cyan-500/50 hover:bg-cyan-500/10 hover:text-cyan-300"
          >
            {p.title} (${p.amount})
          </button>
        ))}
      </div>

      {/* Grid: Form on Left, Instant Result on Right */}
      <div className="grid gap-6 lg:grid-cols-2 items-start">
        {/* Form Container */}
        <form onSubmit={submit} className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl backdrop-blur-md space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Customer ID */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">Customer ID</label>
              <div className="relative mt-1">
                <User className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
                <input
                  value={form.customer_id}
                  onChange={set("customer_id")}
                  placeholder="CUST-042"
                  required
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>
            </div>

            {/* Customer Email */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">Customer Email</label>
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
                <input
                  type="email"
                  value={form.customer_email}
                  onChange={set("customer_email")}
                  placeholder="cust@example.com"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>
            </div>

            {/* Order ID */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">Order ID</label>
              <div className="relative mt-1">
                <ShoppingBag className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
                <input
                  value={form.order_id}
                  onChange={set("order_id")}
                  placeholder="ORD-100"
                  required
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>
            </div>

            {/* Amount & Currency */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">Amount</label>
              <div className="mt-1 flex gap-2">
                <div className="relative flex-1">
                  <DollarSign className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={form.amount}
                    onChange={set("amount")}
                    placeholder="49.99"
                    required
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 pl-8 pr-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                </div>
                <input
                  value={form.currency}
                  onChange={set("currency")}
                  className="w-20 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-center text-slate-200 uppercase focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Reason Textarea */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">Refund Rationale & Details</label>
            <div className="relative mt-1">
              <textarea
                value={form.reason}
                onChange={set("reason")}
                rows={3}
                placeholder="Describe the claim or issue, e.g. item arrived damaged or order missing..."
                required
                className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-200 placeholder-slate-600 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 py-2.5 text-xs font-semibold text-white shadow-lg shadow-cyan-500/20 hover:from-cyan-400 hover:to-indigo-500 active:scale-[0.99] disabled:opacity-50"
          >
            {busy ? (
              <>
                <RotateCw className="h-4 w-4 animate-spin text-white" />
                <span>Running AI Resolution Engine…</span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 text-cyan-200" />
                <span>Submit & Run AI Agent</span>
              </>
            )}
          </button>
        </form>

        {/* Real-time Agent Outcome Card */}
        {result ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl backdrop-blur-md space-y-4 arra-zoom-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-cyan-400" /> Resolution Outcome
              </h3>
              <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${statusColor}`}>
                {result.status}
              </span>
            </div>

            <dl className="grid grid-cols-2 gap-3 text-xs">
              <Row label="Amount" value={`$${((result.amount_cents || 0) / 100).toFixed(2)} ${result.currency || "USD"}`} />
              <Row label="Category" value={result.category} />
              <Row label="Recommendation" value={result.recommendation} />
              <Row label="Transaction ID" value={result.transaction_id || "—"} />
              <Row label="Steps Run" value={result.steps} />
            </dl>

            {(result.priority_tags || []).length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-800 pt-3">
                <span className="text-xs text-slate-400 font-medium">Tags:</span>
                {result.priority_tags.map((t) => (
                  <span key={t} className="rounded bg-rose-500/15 px-2 py-0.5 text-xs font-semibold text-rose-300 border border-rose-500/30">
                    {t}
                  </span>
                ))}
              </div>
            )}

            {result.escalated_reason && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-200 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Escalated to Operator Queue:</span>
                  <p className="mt-0.5 text-amber-300/90">{result.escalated_reason}</p>
                </div>
              </div>
            )}

            <div className="border-t border-slate-800 pt-3">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">AI Policy Rationale</h4>
              <ul className="mt-2 space-y-1.5">
                {(result.rationale || []).map((r, i) => (
                  <li key={i} className="rounded-lg bg-slate-950 p-2 text-xs text-slate-300 border border-slate-800">
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
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/60 p-12 text-center text-slate-500 backdrop-blur-md">
            <Sparkles className="h-10 w-10 text-slate-700" />
            <p className="mt-3 text-sm font-medium text-slate-400">Awaiting submission</p>
            <p className="mt-1 text-xs text-slate-600 max-w-xs">
              Fill out the form or select a quick-fill preset to trigger live evaluation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2.5">
      <dt className="text-[10px] uppercase font-semibold text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-bold text-slate-100">{value || "—"}</dd>
    </div>
  );
}
