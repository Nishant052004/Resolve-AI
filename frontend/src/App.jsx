import { useEffect, useState } from "react";
import { api, clearSession, getPrincipal } from "./api.js";
import Login from "./components/Login.jsx";
import SubmitForm from "./components/SubmitForm.jsx";
import CaseQueue from "./components/CaseQueue.jsx";
import MetricsPanel from "./components/MetricsPanel.jsx";
import GalaxyView from "./components/GalaxyView.jsx";
import { 
  Sparkles, 
  Inbox, 
  Send, 
  BarChart3, 
  LogOut, 
  User, 
  Shield, 
  Cpu, 
  Command, 
  Layers,
  ChevronRight
} from "lucide-react";

const TABS = [
  { id: "galaxy", label: "Case Galaxy", icon: Sparkles, shortcut: "Alt+4" },
  { id: "queue", label: "Operator Queue", icon: Inbox, shortcut: "Alt+1" },
  { id: "submit", label: "Submit Request", icon: Send, shortcut: "Alt+2" },
  { id: "metrics", label: "Metrics & Health", icon: BarChart3, shortcut: "Alt+3" },
];

export default function App() {
  const [principal, setPrincipal] = useState(getPrincipal());
  const [tab, setTab] = useState("galaxy");

  useEffect(() => {
    const onKey = (e) => {
      if (e.altKey && e.key === "1") setTab("queue");
      if (e.altKey && e.key === "2") setTab("submit");
      if (e.altKey && e.key === "3") setTab("metrics");
      if (e.altKey && e.key === "4") setTab("galaxy");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!principal) {
    return (
      <Login
        onLogin={(p) => {
          setPrincipal(p);
          setTab("galaxy");
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Sleek Dark Header */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          
          {/* Logo & Agent Branding */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 via-indigo-600 to-violet-600 p-0.5 shadow-lg shadow-cyan-500/20">
                <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-slate-950">
                  <Cpu className="h-5 w-5 text-cyan-400 animate-pulse" />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-cyan-300 bg-clip-text text-transparent">
                    ARRA
                  </span>
                  <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-400 ring-1 ring-cyan-500/30">
                    v2.4 Autonomous
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-medium">Refund Resolution Agent</p>
              </div>
            </div>

            {/* Live Engine Status Indicator */}
            <div className="hidden md:flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-xs text-slate-300 ring-1 ring-white/10">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="font-mono text-[11px] text-slate-300">Engine Active</span>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 rounded-xl bg-slate-900/80 p-1 ring-1 ring-white/10">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`group relative flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 ${
                    active
                      ? "bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 text-cyan-300 shadow-sm ring-1 ring-cyan-500/40"
                      : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                  }`}
                >
                  <Icon className={`h-4 w-4 transition-transform group-hover:scale-110 ${active ? "text-cyan-400" : "text-slate-400"}`} />
                  <span>{t.label}</span>
                  {active && (
                    <span className="absolute -bottom-1 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full bg-cyan-400 shadow-[0_0_8px_#38bdf8]" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* User Profile & Actions */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg bg-slate-900/60 px-3 py-1.5 text-xs ring-1 ring-white/10">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/40">
                <User className="h-3.5 w-3.5" />
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-slate-200 leading-none">{principal.username}</span>
                <span className="text-[10px] text-cyan-400 font-mono capitalize leading-tight">{principal.role}</span>
              </div>
            </div>

            <button
              onClick={() => {
                clearSession();
                setPrincipal(null);
              }}
              title="Log out of session"
              className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        <div className="arra-zoom-in">
          {tab === "galaxy" && <GalaxyView />}
          {tab === "queue" && <CaseQueue />}
          {tab === "submit" && <SubmitForm />}
          {tab === "metrics" && <MetricsPanel />}
        </div>
      </main>

      {/* Footer Bar */}
      <footer className="border-t border-slate-900 bg-slate-950 px-6 py-3 text-xs text-slate-500">
        <div className="mx-auto flex max-w-7xl flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-4">
            <span className="font-semibold text-slate-400">ARRA Control Center</span>
            <span className="text-slate-600">|</span>
            <span className="flex items-center gap-1">
              <Shield className="h-3.5 w-3.5 text-emerald-400" /> Policy Guard Engine v1.8
            </span>
          </div>
          <div className="flex items-center gap-3 font-mono text-[11px] text-slate-500">
            <span>Shortcuts:</span>
            <span className="rounded bg-slate-900 px-1.5 py-0.5 border border-slate-800">Alt+4 Galaxy</span>
            <span className="rounded bg-slate-900 px-1.5 py-0.5 border border-slate-800">Alt+1 Queue</span>
            <span className="rounded bg-slate-900 px-1.5 py-0.5 border border-slate-800">Alt+2 Submit</span>
            <span className="rounded bg-slate-900 px-1.5 py-0.5 border border-slate-800">Alt+3 Metrics</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
