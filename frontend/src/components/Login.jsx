import { useState } from "react";
import { api, storeSession } from "../api.js";
import { Cpu, Lock, User, ShieldCheck, Sparkles, ArrowRight, CheckCircle2 } from "lucide-react";

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("operator1");
  const [password, setPassword] = useState("operator1");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const resp = await api.login(username, password);
      storeSession(resp);
      onLogin({ username: resp.username, role: resp.role });
    } catch (err) {
      setError(err.message || "Failed to sign in. Check backend connection.");
    } finally {
      setBusy(false);
    }
  }

  const quickFill = (u) => {
    setUsername(u);
    setPassword(u);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-4 font-sans text-slate-100">
      {/* Ambient background glow elements */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-cyan-600/20 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-indigo-600/20 blur-[120px]" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full bg-violet-600/10 blur-[150px]" />

      <div className="relative w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl backdrop-blur-xl">
        {/* Header Branding */}
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 via-indigo-600 to-violet-600 p-0.5 shadow-lg shadow-cyan-500/30">
            <div className="flex h-full w-full items-center justify-center rounded-[14px] bg-slate-950">
              <Cpu className="h-7 w-7 text-cyan-400 animate-pulse" />
            </div>
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-white">
            Sign in to <span className="bg-gradient-to-r from-cyan-400 to-indigo-300 bg-clip-text text-transparent">ARRA</span>
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Autonomous Refund Resolution Agent · Command Hub
          </p>
        </div>

        {/* Form */}
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">Username</label>
            <div className="relative mt-1.5">
              <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="operator1"
                required
                className="w-full rounded-xl border border-slate-800 bg-slate-950/80 pl-9 pr-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 shadow-inner transition focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">Password</label>
            <div className="relative mt-1.5">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full rounded-xl border border-slate-800 bg-slate-950/80 pl-9 pr-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 shadow-inner transition focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
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
            className="group relative flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/25 transition duration-200 hover:from-cyan-400 hover:to-indigo-500 active:scale-[0.99] disabled:opacity-50"
          >
            {busy ? (
              <span>Authenticating…</span>
            ) : (
              <>
                <span>Enter Control Center</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </>
            )}
          </button>
        </form>

        {/* Quick Demo Access Pills */}
        <div className="mt-6 border-t border-slate-800/80 pt-5">
          <p className="text-center text-[11px] font-medium text-slate-400">Quick-fill Demo Credentials:</p>
          <div className="mt-2.5 flex flex-wrap gap-2 justify-center">
            {[
              { id: "operator1", label: "Operator 1", role: "standard" },
              { id: "operator2", label: "Operator 2", role: "approver" },
              { id: "admin", label: "Admin", role: "full access" },
            ].map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => quickFill(d.id)}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition ${
                  username === d.id
                    ? "border-cyan-500/60 bg-cyan-500/15 text-cyan-300"
                    : "border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                }`}
              >
                {username === d.id && <CheckCircle2 className="h-3 w-3 text-cyan-400" />}
                <span className="font-semibold">{d.label}</span>
                <span className="text-[10px] opacity-60">({d.role})</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
