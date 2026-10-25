import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import OrbitTimeline from "./OrbitTimeline.jsx";
import { 
  Sparkles, 
  RotateCw, 
  Search, 
  Filter, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Zap, 
  Layers,
  Maximize2
} from "lucide-react";

export const RESOLVED_STATUSES = ["auto_refunded", "auto_denied", "completed", "rejected"];
export const PENDING_STATUSES = ["submitted", "pending_info"];

export function bucketOf(status) {
  if (RESOLVED_STATUSES.includes(status)) return "resolved";
  if (PENDING_STATUSES.includes(status)) return "pending";
  return "escalated";
}

export const BUCKET_STYLE = {
  resolved: { color: "#10b981", glow: "rgba(16, 185, 129, 0.65)", label: "Resolved" },
  pending: { color: "#38bdf8", glow: "rgba(56, 189, 248, 0.65)", label: "Pending" },
  escalated: { color: "#f43f5e", glow: "rgba(244, 63, 94, 0.70)", label: "Escalated" },
};

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const RING_START = 86;
const RING_STEP = 48;
const PLANET_SPACING = 48;

function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Assign cases to concentric rings (resolved innermost → escalated outermost). */
function buildRings(cases) {
  const buckets = { resolved: [], pending: [], escalated: [] };
  for (const c of cases) buckets[bucketOf(c.status)].push({ ...c });
  const rings = [];
  let ringIndex = 0;
  for (const bucket of ["resolved", "pending", "escalated"]) {
    let remaining = buckets[bucket];
    while (remaining.length > 0) {
      const r = RING_START + ringIndex * RING_STEP;
      const capacity = Math.max(4, Math.floor((2 * Math.PI * r) / PLANET_SPACING));
      const chunk = remaining.slice(0, capacity);
      remaining = remaining.slice(capacity);
      chunk.forEach((c, i) => {
        c._angle = i * GOLDEN_ANGLE + hash01(c.id || "") * 0.9;
        c._size = 6.5 + 11 * Math.min(1, Math.sqrt((c.amount_cents || 0) / 100) / 40);
      });
      rings.push({
        r,
        bucket,
        speed: (ringIndex % 2 === 0 ? 1 : -1) * (0.035 + ringIndex * 0.007),
        cases: chunk,
      });
      ringIndex += 1;
    }
  }
  return rings;
}

export default function GalaxyView() {
  const [cases, setCases] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [counts, setCounts] = useState({ resolved: 0, pending: 0, escalated: 0 });

  const load = useCallback(async () => {
    try {
      const data = await api.listCases("");
      const list = data.cases || [];
      setCases(list);
      setError("");
      const cnt = { resolved: 0, pending: 0, escalated: 0 };
      list.forEach((c) => {
        cnt[bucketOf(c.status)] += 1;
      });
      setCounts(cnt);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [load]);

  if (selectedId) {
    return <OrbitTimeline caseId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  // Filter cases based on search and status filter
  const filteredCases = cases.filter((c) => {
    const bucket = bucketOf(c.status);
    if (activeFilter !== "all" && bucket !== activeFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.id?.toLowerCase().includes(q) ||
      c.customer_id?.toLowerCase().includes(q) ||
      c.reason?.toLowerCase().includes(q) ||
      c.status?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      {/* View Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-cyan-400" /> Case Galaxy
            </h2>
            <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-mono text-slate-400 border border-slate-800">
              {filteredCases.length} / {cases.length} orbiting requests
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time orbital representation of refund requests. Click any planet node to inspect its AI orbit timeline.
          </p>
        </div>

        {/* Filter & Search Bar Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search Box */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search planet / case ID..."
              className="w-48 sm:w-64 rounded-xl border border-slate-800 bg-slate-900/80 pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>

          {/* Refresh Button */}
          <button
            onClick={load}
            className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-700 hover:bg-slate-800"
          >
            <RotateCw className="h-3.5 w-3.5 text-cyan-400" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
          {error}
        </div>
      )}

      {/* Main Galaxy Canvas Container */}
      <div className="relative h-[620px] overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
        <GalaxyCanvas cases={filteredCases} onSelect={setSelectedId} />

        {/* Filter Pills overlay top-left */}
        <div className="absolute left-4 top-4 flex flex-wrap gap-2">
          <button
            onClick={() => setActiveFilter("all")}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold backdrop-blur transition border ${
              activeFilter === "all"
                ? "bg-slate-800/90 text-white border-slate-700 shadow-md"
                : "bg-slate-900/60 text-slate-400 border-white/5 hover:bg-slate-900/90 hover:text-slate-200"
            }`}
          >
            <span>All Orbiters</span>
            <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px]">{cases.length}</span>
          </button>

          {Object.entries(BUCKET_STYLE).map(([key, s]) => {
            const active = activeFilter === key;
            return (
              <button
                key={key}
                onClick={() => setActiveFilter(active ? "all" : key)}
                className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-medium backdrop-blur transition border ${
                  active
                    ? "bg-slate-800/90 text-white border-slate-600 shadow-md"
                    : "bg-slate-900/60 text-slate-300 border-white/5 hover:bg-slate-900/90"
                }`}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: s.color, boxShadow: `0 0 8px ${s.glow}` }}
                />
                <span>{s.label}</span>
                <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-mono text-slate-300">
                  {counts[key]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Legend Overlay Bottom Right */}
        <div className="pointer-events-none absolute bottom-4 right-4 flex flex-col gap-1 rounded-xl bg-slate-900/80 px-3.5 py-2.5 text-[11px] text-slate-300 border border-white/10 backdrop-blur-md shadow-lg">
          <div className="flex items-center gap-2 font-medium text-slate-200">
            <Zap className="h-3.5 w-3.5 text-cyan-400" /> Planet Map Legend
          </div>
          <div className="flex items-center gap-2 text-slate-400 mt-1">
            <span className="h-2 w-2 rounded-full bg-cyan-400" />
            <span>Planet size = Refund Amount ($)</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <span className="h-2 w-2 rounded-full bg-amber-400 ring-2 ring-amber-400/50" />
            <span>Gold Halo Ring = Dual Operator Approval Required</span>
          </div>
        </div>

        {loaded && filteredCases.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 border border-slate-800 text-slate-500">
              <Sparkles className="h-6 w-6" />
            </div>
            <p className="mt-3 text-sm font-medium text-slate-300">No matching planets in range</p>
            <p className="mt-1 text-xs text-slate-500 max-w-sm">
              {cases.length === 0
                ? "Submit a new refund request to populate the galaxy."
                : "Try adjusting your search query or filter selection."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Canvas galaxy render component. */
function GalaxyCanvas({ cases, onSelect }) {
  const canvasRef = useRef(null);
  const ringsRef = useRef([]);
  const starsRef = useRef([]);
  const sizeRef = useRef({ w: 0, h: 0 });
  const [hover, setHover] = useState(null);

  useEffect(() => {
    ringsRef.current = buildRings(cases);
  }, [cases]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rand = mulberry32(42);
    starsRef.current = Array.from({ length: 220 }, () => ({
      x: rand(),
      y: rand(),
      r: 0.3 + rand() * 1.5,
      tw: 0.4 + rand() * 2.5,
      ph: rand() * Math.PI * 2,
    }));

    const resize = () => {
      const rect = (canvas.parentElement || canvas).getBoundingClientRect();
      sizeRef.current = { w: rect.width, h: rect.height };
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement || canvas);

    let raf;
    const start = performance.now();
    const draw = (now) => {
      const t = (now - start) / 1000;
      const { w, h } = sizeRef.current;
      const dpr = window.devicePixelRatio || 1;
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Deep space canvas background
      const bg = ctx.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, "#030712");
      bg.addColorStop(0.5, "#0b0f1d");
      bg.addColorStop(1, "#070c18");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Cosmic background nebulae
      for (const [nx, ny, nr, nc] of [
        [0.18, 0.22, 0.38, "rgba(6, 182, 212, 0.12)"],
        [0.82, 0.72, 0.42, "rgba(99, 102, 241, 0.10)"],
        [0.55, 0.15, 0.30, "rgba(16, 185, 129, 0.08)"],
        [0.30, 0.80, 0.35, "rgba(244, 63, 94, 0.07)"],
      ]) {
        const g = ctx.createRadialGradient(nx * w, ny * h, 0, nx * w, ny * h, nr * Math.max(w, h));
        g.addColorStop(0, nc);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }

      // Starfield rendering
      for (const s of starsRef.current) {
        ctx.globalAlpha = 0.2 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.tw + s.ph));
        ctx.fillStyle = "#e2e8f0";
        ctx.beginPath();
        ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      const cx = w / 2;
      const cy = h / 2;
      const maxR = Math.min(w, h) / 2 - 30;

      // ARRA Central Core
      const coreR = 55;
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
      core.addColorStop(0, "rgba(6, 182, 212, 0.9)");
      core.addColorStop(0.3, "rgba(99, 102, 241, 0.4)");
      core.addColorStop(1, "rgba(15, 23, 42, 0)");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.fill();

      // Core pulsating ring
      ctx.strokeStyle = "rgba(6, 182, 212, " + (0.3 + 0.2 * Math.sin(t * 3)) + ")";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 26 + Math.sin(t * 2) * 3, 0, Math.PI * 2);
      ctx.stroke();

      // Solid central core sphere
      ctx.fillStyle = "#38bdf8";
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#e2e8f0";
      ctx.font = "600 11px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("ARRA Core", cx, cy + 28);

      const planets = [];
      ringsRef.current.forEach((ring) => {
        const r = Math.min(ring.r, maxR);
        
        // Orbital trajectory line
        ctx.strokeStyle = "rgba(148, 163, 184, 0.12)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        const rot = reduced ? 0 : t * ring.speed;
        const style = BUCKET_STYLE[ring.bucket];
        ring.cases.forEach((c, i) => {
          const a = c._angle + rot;
          const rr = r + (reduced ? 0 : Math.sin(t * 0.8 + i * 1.5 + r) * 2.5);
          const x = cx + Math.cos(a) * rr;
          const y = cy + Math.sin(a) * rr;
          planets.push({ x, y, c, r: c._size });

          // Glowing planet halo
          ctx.shadowColor = style.glow;
          ctx.shadowBlur = 16;
          ctx.fillStyle = style.color;
          ctx.beginPath();
          ctx.arc(x, y, c._size, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;

          // Planet shaded gradient depth
          ctx.fillStyle = "rgba(15, 23, 42, 0.4)";
          ctx.beginPath();
          ctx.arc(x + c._size * 0.3, y + c._size * 0.3, c._size * 0.75, 0, Math.PI * 2);
          ctx.fill();

          // Priority indicator (Dual Approval ring)
          if ((c.priority_tags || []).includes("dual_approval_required")) {
            ctx.strokeStyle = "rgba(250, 204, 21, 0.9)";
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.arc(x, y, c._size + 4, 0, Math.PI * 2);
            ctx.stroke();
          }
        });
      });

      canvas.__planets = planets;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const pickPlanet = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let best = null;
    let bestD = Infinity;
    for (const p of canvas.__planets || []) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < p.r + 8 && d < bestD) {
        best = p;
        bestD = d;
      }
    }
    return best;
  };

  return (
    <>
      <canvas
        ref={canvasRef}
        className="block"
        onMouseMove={(e) => {
          const p = pickPlanet(e);
          canvasRef.current.style.cursor = p ? "pointer" : "default";
          setHover(p ? { c: p.c, x: p.x, y: p.y } : null);
        }}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          const p = pickPlanet(e);
          if (p) onSelect(p.c.id);
        }}
      />
      {hover && (
        <div
          className="pointer-events-none absolute z-20 w-64 rounded-xl border border-slate-700 bg-slate-900/95 p-3.5 shadow-2xl backdrop-blur-md text-xs text-slate-100"
          style={{
            left: Math.min(hover.x + 16, sizeRef.current.w - 275),
            top: Math.max(hover.y - 20, 12),
          }}
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="font-mono text-[11px] font-semibold text-cyan-400">
              {hover.c.id ? (hover.c.id.length > 12 ? `${hover.c.id.slice(0, 12)}…` : hover.c.id) : "Case"}
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize"
              style={{
                background: `${BUCKET_STYLE[bucketOf(hover.c.status)].color}22`,
                color: BUCKET_STYLE[bucketOf(hover.c.status)].color,
                border: `1px solid ${BUCKET_STYLE[bucketOf(hover.c.status)].color}44`,
              }}
            >
              {hover.c.status}
            </span>
          </div>

          <div className="mt-2 space-y-1">
            <p className="text-sm font-bold text-white">
              ${((hover.c.amount_cents || 0) / 100).toFixed(2)}{" "}
              <span className="text-xs font-normal text-slate-400">{hover.c.currency || "USD"}</span>
            </p>
            <p className="text-[11px] text-slate-300 font-medium">Customer: {hover.c.customer_id}</p>
            <p className="text-[11px] text-slate-400 italic line-clamp-2">“{hover.c.reason}”</p>
          </div>

          {(hover.c.priority_tags || []).length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1 border-t border-slate-800 pt-2">
              {hover.c.priority_tags.map((t) => (
                <span key={t} className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] text-rose-300 border border-rose-500/30">
                  {t}
                </span>
              ))}
            </div>
          )}
          
          <div className="mt-2 text-[10px] font-mono text-cyan-400 flex items-center justify-end gap-1">
            <span>Click to inspect orbit</span> →
          </div>
        </div>
      )}
    </>
  );
}
