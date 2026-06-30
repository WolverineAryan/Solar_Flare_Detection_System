"use client";

import { useState } from "react";
import HeaderBar from "@/components/HeaderBar";
import { useTelemetry, SimPoint } from "@/context/TelemetryContext";
import { useTheme } from "../../context/ThemeContext";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, Legend, ReferenceLine, AreaChart, Area,
} from "recharts";
import {
  Satellite, Play, Square, Zap, Activity, Radio, ShieldAlert,
  Database, BarChart2, TrendingUp, Clock, Maximize2, X,
  CheckCircle2, Globe, Signal, Orbit, Sliders, Eye, EyeOff,
  TrendingDown, Download, BarChart, Info,
} from "lucide-react";

const WINDOW_SIZE = 10;

const alertColors: Record<string, { text: string; bg: string; border: string }> = {
  normal:   { text: "#10b981", bg: "rgba(16,185,129,0.08)",  border: "rgba(16,185,129,0.25)" },
  elevated: { text: "#f59e0b", bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.25)" },
  critical: { text: "#ef4444", bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.25)" },
};
const classColors: Record<string, string> = {
  B: "#10b981", C: "#eab308", M: "#f59e0b", X: "#ef4444",
};
function getClassColor(cls: string) {
  for (const [k, v] of Object.entries(classColors)) if (cls.startsWith(k)) return v;
  return "#10b981";
}

/* ── Reusable Chart Card ───────────────────────────────── */
function ChartCard({ title, subtitle, icon, titleColor, onExpand, children }: {
  title: string; subtitle: string; icon: React.ReactNode;
  titleColor: string; onExpand: () => void; children: React.ReactNode;
}) {
  return (
    <div className="glass-card rounded-xl flex flex-col" style={{ height: 300 }}>
      <div className="flex items-start justify-between px-5 pt-4 pb-2">
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5"
            style={{ color: titleColor }}>
            {icon} {title}
          </h3>
          <p className="text-[9px] mt-0.5" style={{ color: "var(--text-muted)" }}>{subtitle}</p>
        </div>
        <button onClick={onExpand} title="Expand and open tools"
          className="p-1.5 rounded-lg transition-colors hover:opacity-70 flex-shrink-0"
          style={{ background: "var(--bg-primary)" }}>
          <Maximize2 className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
        </button>
      </div>
      <div className="flex-1 min-h-0 px-2 pb-3">{children}</div>
    </div>
  );
}

/* ── Fullscreen Modal ───────────────────────────────────── */
function ChartModal({ title, subtitle, titleColor, icon, onClose, children }: {
  title: string; subtitle: string; titleColor: string;
  icon: React.ReactNode; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}>
      <div className="glass-card rounded-2xl w-full max-w-5xl flex flex-col pointer-events-auto" style={{ height: "82vh" }}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "var(--border-subtle)" }}>
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2" style={{ color: titleColor }}>
              {icon} {title}
            </h2>
            <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>{subtitle}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:opacity-70 transition-opacity"
            style={{ background: "var(--bg-primary)" }}>
            <X className="w-5 h-5" style={{ color: "var(--text-muted)" }} />
          </button>
        </div>
        <div className="flex-1 min-h-0 p-6">{children}</div>
      </div>
    </div>
  );
}

/* ── KPI Card ───────────────────────────────────────────── */
function KpiCard({ label, value, sub, icon, valueColor, bar }: {
  label: string; value: string; sub?: string;
  icon: React.ReactNode; valueColor: string; bar?: number;
}) {
  return (
    <div className="glass-card rounded-xl p-4 flex flex-col gap-2">
      <span className="text-[9px] font-semibold uppercase tracking-wider flex items-center gap-1.5"
        style={{ color: "var(--text-muted)" }}>
        {icon} {label}
      </span>
      <span className="text-2xl font-extrabold leading-none" style={{ color: valueColor }}>{value}</span>
      {bar !== undefined && (
        <div className="w-full rounded-full h-1" style={{ background: "var(--border-subtle)" }}>
          <div className="h-1 rounded-full transition-all duration-500" style={{ width: `${bar * 100}%`, background: valueColor }} />
        </div>
      )}
      {sub && <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>{sub}</span>}
    </div>
  );
}

/* ── Simulation Page ────────────────────────────────────── */
export default function SimulationPage() {
  const { theme } = useTheme();
  
  // Consume everything from global context to keep it working across tab switches!
  const {
    simPoints,
    isSimRunning,
    simWsStatus,
    simStatusMsg,
    simTotalPackets,
    startSimulation,
    stopSimulation,
    clearSimulation,
  } = useTelemetry();

  const [expanded, setExpanded] = useState<null | "flux" | "nowcast" | "forecast">(null);

  // Expanded Tools states
  const [showRaw, setShowRaw] = useState(true);
  const [showClean, setShowClean] = useState(true);
  const [nowcastThreshold, setNowcastThreshold] = useState(0.44);
  const [forecastThreshold, setForecastThreshold] = useState(0.50);

  // Zooming & Scrolling states for expanded charts
  const [zoomLevel, setZoomLevel] = useState(50); // visible data window size (10 to 300)
  const [scrollOffset, setScrollOffset] = useState(0); // pan offset from latest (0 = latest)

  const chartPoints = simPoints.slice(-WINDOW_SIZE);
  const latest      = simPoints[simPoints.length - 1];
  const alert       = alertColors[latest?.alertLevel ?? "normal"] ?? alertColors.normal;
  const classColor  = getClassColor(latest?.forecastClass ?? "B");

  // Get sliced data points for the expanded modal chart based on zoom and scroll panning
  const getModalChartData = () => {
    if (simPoints.length === 0) return [];
    
    // Bounds check on zoomLevel
    const visibleCount = Math.min(simPoints.length, zoomLevel);
    
    // Bounds check on scrollOffset (0 means latest packets, maxOffset means oldest packets)
    const maxOffset = Math.max(0, simPoints.length - visibleCount);
    const offset = Math.min(scrollOffset, maxOffset);
    
    const startIdx = Math.max(0, simPoints.length - visibleCount - offset);
    const endIdx = simPoints.length - offset;
    
    return simPoints.slice(startIdx, endIdx);
  };
  const modalChartData = getModalChartData();

  // Theme-aware chart colors
  const gridColor     = theme === "light" ? "#e2e8f0" : "#1f2937";
  const tooltipBg     = theme === "light" ? "#ffffff" : "#0d1117";
  const tooltipBorder = theme === "light" ? "#e2e8f0" : "#1f2937";
  const axisColor     = theme === "light" ? "#94a3b8" : "#6b7280";
  const tooltipStyle  = { backgroundColor: tooltipBg, borderColor: tooltipBorder, fontSize: 10, borderRadius: 6 };

  // Calculate statistics from the session logs
  const getStats = () => {
    if (simPoints.length === 0) return { minSxr: 0, maxSxr: 0, avgSxr: 0, minHxr: 0, maxHxr: 0, avgHxr: 0, maxNowcast: 0 };
    const sxrVals = simPoints.map(p => p.sxr_clean);
    const hxrVals = simPoints.map(p => p.hxr_clean);
    const nowcastVals = simPoints.map(p => p.nowcastProb);
    return {
      minSxr: Math.min(...sxrVals),
      maxSxr: Math.max(...sxrVals),
      avgSxr: sxrVals.reduce((a, b) => a + b, 0) / sxrVals.length,
      minHxr: Math.min(...hxrVals),
      maxHxr: Math.max(...hxrVals),
      avgHxr: hxrVals.reduce((a, b) => a + b, 0) / hxrVals.length,
      maxNowcast: Math.max(...nowcastVals),
    };
  };
  const stats = getStats();

  // Export current session data as CSV helper
  const handleExportCSV = () => {
    if (simPoints.length === 0) return;
    const headers = ["Packet", "SXR Raw", "HXR Raw", "SXR Clean", "HXR Clean", "Nowcast Probability", "Forecast Class", "M+X Probability", "Time To Peak", "Alert Level"];
    const rows = simPoints.map(p => [
      p.tickCount, p.sxr_raw, p.hxr_raw, p.sxr_clean, p.hxr_clean, p.nowcastProb, p.forecastClass, p.forecastProb, p.forecastTimeToPeak, p.alertLevel
    ]);
    const csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    
    // Create blob to avoid URI length and encoding limitations
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `simulation_telemetry_session_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };


  /* ── Chart Renderers ────────────────────────────────── */
  const fluxChart = (data: SimPoint[], isModal = false) => (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
        <XAxis dataKey="tickCount" stroke={axisColor} fontSize={8} tickFormatter={(v) => `#${v}`} />
        <YAxis stroke={axisColor} fontSize={8} label={{ value: "FLUX (W/m²)", angle: -90, position: "insideLeft", fontSize: 7, fill: axisColor, dx: -2 }} />
        <Tooltip contentStyle={tooltipStyle} formatter={(val) => [typeof val === "number" ? val.toFixed(2) : val]} />
        <Legend wrapperStyle={{ fontSize: 9 }} />
        
        {(!isModal || showClean) && (
          <Line type="monotone" dataKey="sxr_clean" stroke="#f97316" name="SXR Clean" strokeWidth={isModal ? 3 : 2.5} dot={{ r: isModal ? 4 : 3, fill: "#f97316" }} isAnimationActive={false} />
        )}
        {(!isModal || showClean) && (
          <Line type="monotone" dataKey="hxr_clean" stroke="#0ea5e9" name="HXR Clean" strokeWidth={isModal ? 2.5 : 2} dot={{ r: isModal ? 4 : 3, fill: "#0ea5e9" }} isAnimationActive={false} />
        )}
        
        {isModal && showRaw && (
          <Line type="monotone" dataKey="sxr_raw" stroke="#ea580c" name="SXR Raw (Noisy)" strokeDasharray="3 3" strokeWidth={1} dot={false} isAnimationActive={false} />
        )}
        {isModal && showRaw && (
          <Line type="monotone" dataKey="hxr_raw" stroke="#0284c7" name="HXR Raw (Noisy)" strokeDasharray="3 3" strokeWidth={1} dot={false} isAnimationActive={false} />
        )}
      </LineChart>
    </ResponsiveContainer>
  );

  const nowcastChart = (data: SimPoint[], isModal = false) => (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="ng" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#ef4444" stopOpacity={0}    />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
        <XAxis dataKey="tickCount" stroke={axisColor} fontSize={8} tickFormatter={(v) => `#${v}`} />
        <YAxis domain={[0, 1]} stroke={axisColor} fontSize={8}
          label={{ value: "PROBABILITY (%)", angle: -90, position: "insideLeft", fontSize: 7, fill: axisColor, dx: -2 }}
          tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
        <Tooltip contentStyle={tooltipStyle} formatter={(val) => [typeof val === "number" ? `${(val*100).toFixed(1)}%` : val, "Nowcast"]} />
        
        <ReferenceLine y={nowcastThreshold} stroke="#f59e0b" strokeDasharray="5 3" 
          label={{ value: `Alert Threshold (${(nowcastThreshold * 100).toFixed(0)}%)`, fill: "#f59e0b", fontSize: 8, position: "insideTopLeft" }} />
        
        {isModal && (
          <ReferenceLine y={0.80} stroke="#ef4444" strokeDasharray="5 3" 
            label={{ value: "Critical Threshold (80%)", fill: "#ef4444", fontSize: 8, position: "insideTopLeft" }} />
        )}
        
        <Area type="monotone" dataKey="nowcastProb" stroke="#ef4444" fill="url(#ng)" strokeWidth={2.5} dot={{ r: isModal ? 4 : 3, fill: "#ef4444" }} isAnimationActive={false} name="Nowcast %" />
      </AreaChart>
    </ResponsiveContainer>
  );

  const forecastChart = (data: SimPoint[], isModal = false) => (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="fg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#f97316" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#f97316" stopOpacity={0}   />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
        <XAxis dataKey="tickCount" stroke={axisColor} fontSize={8} tickFormatter={(v) => `#${v}`} />
        <YAxis
          domain={([mn, mx]: readonly [number, number]) => [Math.max(0, mn - 0.02), Math.min(1, mx + 0.05)] as [number, number]}
          stroke={axisColor} fontSize={8}
          label={{ value: "PROBABILITY (%)", angle: -90, position: "insideLeft", fontSize: 7, fill: axisColor, dx: -2 }}
          tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
        />
        <Tooltip contentStyle={tooltipStyle} formatter={(val) => [typeof val === "number" ? `${(val*100).toFixed(1)}%` : val, "Forecast M+X"]} />
        
        <ReferenceLine y={forecastThreshold} stroke="#f59e0b" strokeDasharray="5 3" 
          label={{ value: `Elevated Threshold (${(forecastThreshold * 100).toFixed(0)}%)`, fill: "#f59e0b", fontSize: 8, position: "insideTopLeft" }} />
        
        <Area type="monotone" dataKey="forecastProb" stroke="#f97316" fill="url(#fg)" strokeWidth={2.5} dot={{ r: isModal ? 4 : 3, fill: "#f97316" }} isAnimationActive={false} name="Forecast M+X" />
      </AreaChart>
    </ResponsiveContainer>
  );

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--bg-primary)" }}>
      <HeaderBar isRunning={isSimRunning} isBackendConnected={simWsStatus === "connected"} />

      {/* ── EXPANDED MODAL WITH INTEGRATED ANALYSIS TOOLS ── */}
      {expanded && (
        <ChartModal
          title={
            expanded === "flux" ? "X-Ray Flux Stream Analysis" :
            expanded === "nowcast" ? "Nowcast Flare Warning Analysis" : "BiLSTM Forecasting Model"
          }
          subtitle="Interactive analysis tools for Aditya-L1 ground segment segmentations"
          titleColor={expanded === "nowcast" ? "#ef4444" : "var(--solexs-orange)"}
          icon={expanded === "nowcast" ? <Zap className="w-5 h-5"/> : <BarChart2 className="w-5 h-5"/>}
          onClose={() => setExpanded(null)}
        >
          <div className="flex flex-col lg:flex-row gap-6 h-full">
            {/* Chart Area */}
            <div className="flex-1 min-h-0 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl p-4 flex flex-col justify-between">
              <div className="flex-1 min-h-0">
                {expanded === "flux" ? fluxChart(modalChartData, true) :
                 expanded === "nowcast" ? nowcastChart(modalChartData, true) : forecastChart(modalChartData, true)}
              </div>
              <div className="flex justify-between items-center text-[10px] text-[var(--text-muted)] mt-2 border-t pt-2 border-[var(--border-subtle)] px-2">
                <span>Displaying <strong>{modalChartData.length}</strong> packets</span>
                <span>Zoom window: {zoomLevel} pkts | Scroll offset: {scrollOffset} pkts back</span>
              </div>
            </div>

            {/* Sidebar Tools Panel — scrollable to prevent Export Button cutoff */}
            <div className="w-full lg:w-72 flex flex-col gap-4 flex-shrink-0 max-h-full overflow-y-auto pr-1 pb-6">
              
              {/* Tool 0: Zoom & Pan Scroll Controls */}
              <div className="glass-card p-4 rounded-xl border border-[var(--border-subtle)] flex flex-col gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-[var(--helios-cyan)]" />
                  Zoom & Scroll (Navigation)
                </span>
                <p className="text-[9px] text-[var(--text-muted)] leading-relaxed">
                  Scale and scroll the horizontal time axis of the dataset.
                </p>
                
                {/* Zoom input range */}
                <div className="mt-2 flex flex-col gap-1">
                  <span className="text-[8px] uppercase text-[var(--text-muted)] block font-semibold">Graph Zoom (Visible window size)</span>
                  <input
                    type="range"
                    min="10"
                    max={Math.max(10, simPoints.length)}
                    step="5"
                    value={zoomLevel}
                    onChange={(e) => setZoomLevel(parseInt(e.target.value))}
                    className="w-full h-1 bg-[var(--border-subtle)] rounded-lg appearance-none cursor-pointer accent-[var(--helios-cyan)]"
                  />
                  <div className="flex justify-between text-[8px] text-[var(--text-secondary)] font-mono">
                    <span>10 pkts</span>
                    <span className="text-[var(--helios-cyan)] font-bold">{zoomLevel} pkts</span>
                    <span>{simPoints.length} pkts (Max)</span>
                  </div>
                </div>

                {/* Pan offset input range */}
                {simPoints.length > zoomLevel && (
                  <div className="mt-3 flex flex-col gap-1">
                    <span className="text-[8px] uppercase text-[var(--text-muted)] block font-semibold">Horizontal Scroll (History Panning)</span>
                    <input
                      type="range"
                      min="0"
                      max={Math.max(0, simPoints.length - zoomLevel)}
                      step="5"
                      value={scrollOffset}
                      onChange={(e) => setScrollOffset(parseInt(e.target.value))}
                      className="w-full h-1 bg-[var(--border-subtle)] rounded-lg appearance-none cursor-pointer accent-[var(--solexs-orange)]"
                    />
                    <div className="flex justify-between text-[8px] text-[var(--text-secondary)] font-mono">
                      <span>Latest</span>
                      <span className="text-[var(--solexs-orange)] font-bold">{scrollOffset} pkts offset</span>
                      <span>Oldest</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Tool 1: Interactive Thresholds Slider */}
              {expanded !== "flux" && (
                <div className="glass-card p-4 rounded-xl border border-[var(--border-subtle)] flex flex-col gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-[var(--solexs-orange)]" />
                    Alarm Threshold Filter
                  </span>
                  <p className="text-[9px] text-[var(--text-muted)] leading-relaxed">
                    Adjust simulation alarm triggers to model alert sensitivity.
                  </p>
                  <div className="mt-2">
                    <input
                      type="range"
                      min="0.10"
                      max="0.90"
                      step="0.05"
                      value={expanded === "nowcast" ? nowcastThreshold : forecastThreshold}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (expanded === "nowcast") setNowcastThreshold(val);
                        else setForecastThreshold(val);
                      }}
                      className="w-full h-1 bg-[var(--border-subtle)] rounded-lg appearance-none cursor-pointer accent-[var(--solexs-orange)]"
                    />
                    <div className="flex justify-between text-[10px] text-[var(--text-secondary)] font-mono mt-1">
                      <span>10%</span>
                      <span className="text-[var(--solexs-orange)] font-bold">
                        {expanded === "nowcast" ? `${(nowcastThreshold * 100).toFixed(0)}%` : `${(forecastThreshold * 100).toFixed(0)}%`}
                      </span>
                      <span>90%</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Tool 2: Signal / Channel Toggle */}
              {expanded === "flux" && (
                <div className="glass-card p-4 rounded-xl border border-[var(--border-subtle)] flex flex-col gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-[var(--helios-cyan)]" />
                    Channel Isolator
                  </span>
                  <p className="text-[9px] text-[var(--text-muted)] leading-relaxed">
                    Toggle signal processing filters to inspect telemetry noise.
                  </p>
                  <div className="flex flex-col gap-2 mt-2">
                    <label className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showClean}
                        onChange={(e) => setShowClean(e.target.checked)}
                        className="rounded border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--solexs-orange)] focus:ring-0 cursor-pointer"
                      />
                      <span>Cleaned Signal (Autoencoder)</span>
                    </label>
                    <label className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showRaw}
                        onChange={(e) => setShowRaw(e.target.checked)}
                        className="rounded border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--solexs-orange)] focus:ring-0 cursor-pointer"
                      />
                      <span>Raw Sensor Stream (Telemetry)</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Tool 3: Dynamic Statistics Summary */}
              <div className="glass-card p-4 rounded-xl border border-[var(--border-subtle)] flex flex-col gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                  <BarChart className="w-3.5 h-3.5 text-emerald-400" />
                  Telemetry Session Statistics
                </span>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div className="bg-[var(--bg-primary)] p-2 rounded border border-[var(--border-subtle)]">
                    <span className="text-[8px] uppercase text-[var(--text-muted)] block">Max SXR Flux</span>
                    <span className="text-xs font-mono font-bold text-[var(--solexs-orange)]">{stats.maxSxr.toFixed(2)}</span>
                  </div>
                  <div className="bg-[var(--bg-primary)] p-2 rounded border border-[var(--border-subtle)]">
                    <span className="text-[8px] uppercase text-[var(--text-muted)] block">Avg SXR Flux</span>
                    <span className="text-xs font-mono font-bold text-[var(--text-secondary)]">{stats.avgSxr.toFixed(2)}</span>
                  </div>
                  <div className="bg-[var(--bg-primary)] p-2 rounded border border-[var(--border-subtle)]">
                    <span className="text-[8px] uppercase text-[var(--text-muted)] block">Max HXR Flux</span>
                    <span className="text-xs font-mono font-bold text-[var(--helios-cyan)]">{stats.maxHxr.toFixed(2)}</span>
                  </div>
                  <div className="bg-[var(--bg-primary)] p-2 rounded border border-[var(--border-subtle)]">
                    <span className="text-[8px] uppercase text-[var(--text-muted)] block">Avg HXR Flux</span>
                    <span className="text-xs font-mono font-bold text-[var(--text-secondary)]">{stats.avgHxr.toFixed(2)}</span>
                  </div>
                </div>
                <div className="bg-[var(--bg-primary)] p-2.5 rounded border border-[var(--border-subtle)] mt-1">
                  <span className="text-[8px] uppercase text-[var(--text-muted)] block">Peak Nowcast Probability</span>
                  <span className="text-sm font-mono font-bold text-red-500">{(stats.maxNowcast * 100).toFixed(1)}%</span>
                </div>
              </div>

              {/* Tool 4: Data Exporter */}
              <div className="glass-card p-4 rounded-xl border border-[var(--border-subtle)] flex flex-col gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5 text-purple-400" />
                  Segment Export
                </span>
                <p className="text-[9px] text-[var(--text-muted)] leading-relaxed">
                  Download logged points for the current session.
                </p>
                <button
                  onClick={handleExportCSV}
                  disabled={simPoints.length === 0}
                  className="mt-2 bg-[#1f2937] hover:bg-[#374151] border border-[var(--border-accent)] text-white text-xs font-bold py-2 rounded-lg uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export Session CSV
                </button>
              </div>

            </div>
          </div>
        </ChartModal>
      )}

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-6 flex flex-col gap-6">

        {/* ── HERO SECTION ──────────────────────────────────── */}
        <div className="relative rounded-2xl overflow-hidden" style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)",
          minHeight: 120,
        }}>
          <div className="absolute inset-0 opacity-20"
            style={{ backgroundImage: "radial-gradient(ellipse at 30% 50%, rgba(249,115,22,0.3) 0%, transparent 60%), radial-gradient(ellipse at 70% 50%, rgba(14,165,233,0.3) 0%, transparent 60%)" }} />
          <div className="relative z-10 px-8 py-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-xl font-extrabold tracking-widest uppercase text-white">
                  Aditya-L1 Live Simulation Feed
                </h1>
                <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {simWsStatus === "connected" ? "Connected" : simWsStatus === "connecting" ? "Connecting…" : "Disconnected"}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Graphs show the latest <strong className="text-slate-300">{WINDOW_SIZE} packets</strong> for clarity. Click <Maximize2 className="inline w-3 h-3 mx-0.5" /> on any chart to open interactive analysis tools.
              </p>
            </div>
            <div className="hidden md:flex items-center gap-4 opacity-60">
              <Orbit className="w-16 h-16 text-sky-400" />
            </div>
          </div>
        </div>

        {/* ── CONTROL BAR ───────────────────────────────────── */}
        <div className="glass-card rounded-xl px-5 py-3 flex flex-wrap items-center gap-3">
          <Radio className="w-4 h-4 flex-shrink-0" style={{ color: "var(--solexs-orange)" }} />
          <span className="text-[10px] uppercase tracking-wider flex-1 min-w-0 truncate" style={{ color: "var(--text-muted)" }}>
            {simStatusMsg}
          </span>
          {!isSimRunning ? (
            <button onClick={startSimulation}
              className="flex items-center gap-2 text-white text-xs font-bold px-5 py-2 rounded-lg uppercase tracking-wider transition-all hover:opacity-90 bg-[var(--solexs-orange)]">
              <Play className="w-4 h-4 fill-white" /> Start Simulation
            </button>
          ) : (
            <button onClick={stopSimulation}
              className="flex items-center gap-2 text-white text-xs font-bold px-5 py-2 rounded-lg uppercase tracking-wider transition-all hover:opacity-90 bg-red-500">
              <Square className="w-4 h-4 fill-white" /> Stop Simulation
            </button>
          )}
          <button onClick={clearSimulation}
            className="text-xs font-semibold px-4 py-2 rounded-lg uppercase tracking-wider transition-all hover:opacity-85"
            style={{ background: "var(--bg-primary)", color: "var(--text-secondary)", border: "1px solid var(--border-accent)" }}>
            Clear
          </button>
        </div>

        {/* ── KPI CARDS ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KpiCard label="Alert Status" value={latest?.alertLevel ?? "—"}
            icon={<Zap className="w-3 h-3" style={{ color: alert.text }} />}
            valueColor={alert.text}
            bar={latest?.nowcastProb} />
          <KpiCard label="Nowcast Prob" value={latest ? `${(latest.nowcastProb * 100).toFixed(1)}%` : "—"}
            icon={<Activity className="w-3 h-3" style={{ color: "var(--helios-cyan)" }} />}
            valueColor="var(--helios-cyan)" sub="1D-CNN precursor" />
          <KpiCard label="Forecast Class" value={latest?.forecastClass ?? "—"}
            icon={<ShieldAlert className="w-3 h-3" style={{ color: classColor }} />}
            valueColor={classColor}
            sub={["B","C","M","X"].map(c => (latest?.forecastClass ?? "").startsWith(c) ? `▮ ${c}` : `▯ ${c}`).join("  ")} />
          <KpiCard label="M+X Prob" value={latest ? `${(latest.forecastProb * 100).toFixed(1)}%` : "—"}
            icon={<TrendingUp className="w-3 h-3" style={{ color: "var(--solexs-orange)" }} />}
            valueColor="var(--solexs-orange)" bar={latest?.forecastProb} />
          <KpiCard label="Time to Peak" value={latest?.forecastTimeToPeak ?? "—"}
            icon={<Clock className="w-3 h-3 text-amber-500" />}
            valueColor="#f59e0b" sub="BiLSTM lead" />
          <KpiCard label="Packets" value={String(simTotalPackets)}
            icon={<Database className="w-3 h-3 text-emerald-500" />}
            valueColor="var(--text-primary)" sub="CCSDS decoded" />
        </div>

        {/* ── THREE CHARTS ──────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <ChartCard title="X-Ray Flux (SXR + HXR)" subtitle={`Last ${WINDOW_SIZE} packets — SoLEXS & HEL1OS`}
            titleColor="var(--solexs-orange)" icon={<BarChart2 className="w-3.5 h-3.5"/>}
            onExpand={() => setExpanded("flux")}>
            {fluxChart(chartPoints)}
          </ChartCard>
          <ChartCard title="Nowcast Alert Probability" subtitle={`Last ${WINDOW_SIZE} packets — threshold ${(nowcastThreshold*100).toFixed(0)}%`}
            titleColor="#ef4444" icon={<Zap className="w-3.5 h-3.5"/>}
            onExpand={() => setExpanded("nowcast")}>
            {nowcastChart(chartPoints)}
          </ChartCard>
          <ChartCard title="Forecast M+X Probability" subtitle={`Last ${WINDOW_SIZE} packets — threshold ${(forecastThreshold*100).toFixed(0)}%`}
            titleColor="var(--solexs-orange)" icon={<TrendingUp className="w-3.5 h-3.5"/>}
            onExpand={() => setExpanded("forecast")}>
            {forecastChart(chartPoints)}
          </ChartCard>
        </div>

        {/* ── LIVE PACKET TABLE ─────────────────────────────── */}
        <div className="glass-card rounded-xl p-5 flex flex-col gap-3">
          <h3 className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-primary)" }}>
            Live Packet Log — Session History Log
          </h3>
          <div className="overflow-x-auto max-h-[320px] overflow-y-auto pr-1">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10" style={{ background: "var(--bg-card)" }}>
                <tr className="text-[9px] uppercase tracking-wider border-b" style={{ color: "var(--text-muted)", borderColor: "var(--border-subtle)" }}>
                  {["Pkt #","SXR Raw","HXR Raw","SXR Clean","HXR Clean","Nowcast %","Class","M+X %","Time to Peak","Alert"].map(h => (
                    <th key={h} className="py-2 pr-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
                {simPoints.length === 0 ? (
                  <tr><td colSpan={10} className="py-8 text-center" style={{ color: "var(--text-muted)" }}>
                    No packets received yet — click <strong>Start Simulation</strong> above.
                  </td></tr>
                ) : (
                  [...simPoints].reverse().map((pt, i) => (
                    <tr key={i} className="border-b transition-colors hover:opacity-80"
                      style={{ borderColor: "var(--border-subtle)" }}>
                      <td className="py-2 pr-4 font-mono font-bold" style={{ color: "var(--text-primary)" }}>#{pt.tickCount}</td>
                      <td className="py-2 pr-4 font-mono">{pt.sxr_raw.toFixed(2)}</td>
                      <td className="py-2 pr-4 font-mono">{pt.hxr_raw.toFixed(2)}</td>
                      <td className="py-2 pr-4 font-mono" style={{ color: "#f97316" }}>{pt.sxr_clean.toFixed(2)}</td>
                      <td className="py-2 pr-4 font-mono" style={{ color: "#0ea5e9" }}>{pt.hxr_clean.toFixed(2)}</td>
                      <td className="py-2 pr-4 font-mono">{(pt.nowcastProb * 100).toFixed(1)}%</td>
                      <td className="py-2 pr-4 font-bold" style={{ color: getClassColor(pt.forecastClass) }}>{pt.forecastClass}</td>
                      <td className="py-2 pr-4 font-mono" style={{ color: "#f97316" }}>{(pt.forecastProb * 100).toFixed(1)}%</td>
                      <td className="py-2 pr-4" style={{ color: "#f59e0b" }}>{pt.forecastTimeToPeak}</td>
                      <td className="py-2">
                        <span className="px-2 py-0.5 rounded text-[8px] font-bold uppercase"
                          style={{
                            background: alertColors[pt.alertLevel]?.bg ?? alertColors.normal.bg,
                            color:      alertColors[pt.alertLevel]?.text ?? alertColors.normal.text,
                            border:     `1px solid ${alertColors[pt.alertLevel]?.border ?? alertColors.normal.border}`,
                          }}>
                          {pt.alertLevel}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── FOOTER STATUS BAR ─────────────────────────────── */}
        <div className="glass-card rounded-xl px-6 py-4 grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { icon: <CheckCircle2 className="w-5 h-5 text-emerald-500"/>, label: "Observatory Status",
              lines: ["All systems nominal", <span key="t" className="flex items-center gap-1">Telemetry nominal <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"/></span>] },
            { icon: <Globe className="w-5 h-5" style={{ color: "var(--helios-cyan)" }}/>, label: "Location",
              lines: ["L1 Lagrange Point", "~1.5 Million km from Earth"] },
            { icon: <Signal className="w-5 h-5 text-amber-500"/>, label: "Telemetry Link",
              lines: ["CCSDS Stream", <span key="u">Uplink: <span className="text-emerald-400 font-semibold">Good</span></span>] },
            { icon: <Activity className="w-5 h-5 text-purple-400"/>, label: "Data Rate",
              lines: ["128.4 kbps", "Stable"] },
            { icon: <Satellite className="w-5 h-5" style={{ color: "var(--solexs-orange)" }}/>, label: "Next Downlink",
              lines: ["00:38:12", "TDRSS Pass Window"] },
          ].map(({ icon, label, lines }) => (
            <div key={label} className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">{icon}</div>
              <div>
                <div className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>{label}</div>
                {lines.map((l, i) => (
                  <div key={i} className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>{l}</div>
                ))}
              </div>
            </div>
          ))}
        </div>

      </main>
    </div>
  );
}
