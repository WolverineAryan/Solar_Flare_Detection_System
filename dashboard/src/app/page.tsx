"use client";

import { useState } from "react";
import HeaderBar from "@/components/HeaderBar";
import AlertBanner from "@/components/AlertBanner";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";
import { Zap, Hourglass, ShieldAlert, BarChart3, Settings, Play, Database, RefreshCw, Download, FileDown } from "lucide-react";

interface LiveLogPoint {
  tickCount: number;
  sxr_clean: number;
  hxr_clean: number;
  nowcastProb: number;
  forecastClass: string;
  forecastTimeToPeak: string;
  alertLevel: string;
}

import { useTelemetry } from "@/context/TelemetryContext";

export default function Home() {
  const [sxrInput, setSxrInput] = useState("");
  const [hxrInput, setHxrInput] = useState("");
  const { points, setPoints } = useTelemetry();
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    const sxr = parseFloat(sxrInput);
    const hxr = parseFloat(hxrInput);

    if (isNaN(sxr) || isNaN(hxr)) {
      setErrorMsg("Please enter valid numbers for SXR and HXR.");
      setStatus("error");
      return;
    }

    setStatus("submitting");
    setErrorMsg("");

    try {
      const response = await fetch("http://127.0.0.1:8000/predict/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sxr_raw: sxr, hxr_raw: hxr }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const result: LiveLogPoint = await response.json();
      setPoints((prev) => [...prev, result]);
      setStatus("success");
      setSxrInput("");
      setHxrInput("");
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Failed to feed live telemetry point.");
      setStatus("error");
    }
  };

  const handleClear = () => {
    setPoints([]);
    setStatus("idle");
    setErrorMsg("");
  };

  // Extract latest state
  const latest = points[points.length - 1] || {
    tickCount: 0,
    sxr_clean: 0,
    hxr_clean: 0,
    nowcastProb: 0,
    forecastClass: "B2.1",
    forecastTimeToPeak: "N/A",
    alertLevel: "normal",
  };

  return (
    <div className="flex flex-col min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <HeaderBar isRunning={points.length > 0} isBackendConnected={true} />
      <AlertBanner alertLevel={latest.alertLevel as any} />

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full flex flex-col gap-6 animate-slide-in">
        
        {/* ── KPI CARDS GRID ────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Card 1: Nowcast Alert Status */}
          <div className="glass-card p-4 border border-[var(--border-subtle)] rounded-xl flex flex-col justify-between">
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-[var(--solexs-orange)]" />
              Nowcast Alert Status
            </span>
            <div className="my-3">
              <span className={`text-2xl font-extrabold tracking-wide uppercase ${
                latest.alertLevel === "critical" ? "text-red-500 animate-pulse" :
                latest.alertLevel === "elevated" ? "text-amber-500" : "text-emerald-500"
              }`}>
                {latest.alertLevel}
              </span>
              <span className="text-xs text-[var(--text-muted)] block mt-1">
                Probability: {(latest.nowcastProb * 100).toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-[#1f2937] rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  latest.alertLevel === "critical" ? "bg-red-500" :
                  latest.alertLevel === "elevated" ? "bg-amber-500" : "bg-emerald-500"
                }`}
                style={{ width: `${latest.nowcastProb * 100}%` }}
              />
            </div>
          </div>

          {/* Card 2: Forecasted Class */}
          <div className="glass-card p-4 border border-[var(--border-subtle)] rounded-xl flex flex-col justify-between">
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-[var(--helios-cyan)]" />
              Forecast Classification
            </span>
            <div className="my-3">
              <span className="text-2xl font-extrabold text-[var(--helios-cyan)]">
                Class {latest.forecastClass}
              </span>
              <span className="text-xs text-[var(--text-muted)] block mt-1">
                15-Minute lead prediction
              </span>
            </div>
            <div className="w-full h-1.5 flex gap-1">
              <div className={`h-1.5 flex-1 rounded-sm ${latest.forecastClass.startsWith("B") ? "bg-emerald-500" : "bg-[#1f2937]"}`} />
              <div className={`h-1.5 flex-1 rounded-sm ${latest.forecastClass.startsWith("C") ? "bg-yellow-500" : "bg-[#1f2937]"}`} />
              <div className={`h-1.5 flex-1 rounded-sm ${latest.forecastClass.startsWith("M") ? "bg-orange-500" : "bg-[#1f2937]"}`} />
              <div className={`h-1.5 flex-1 rounded-sm ${latest.forecastClass.startsWith("X") ? "bg-red-500 animate-pulse" : "bg-[#1f2937]"}`} />
            </div>
          </div>

          {/* Card 3: Lead Time to Peak */}
          <div className="glass-card p-4 border border-[var(--border-subtle)] rounded-xl flex flex-col justify-between">
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold flex items-center gap-1.5">
              <Hourglass className="w-3.5 h-3.5 text-[var(--solexs-orange)]" />
              Est. Time to Peak
            </span>
            <div className="my-3">
              <span className="text-2xl font-extrabold text-[var(--solexs-orange)]">
                {latest.forecastTimeToPeak}
              </span>
              <span className="text-xs text-[var(--text-muted)] block mt-1">
                Max flare intensity window
              </span>
            </div>
            <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">
              BiLSTM Recurrent Forecast
            </span>
          </div>

          {/* Card 4: Ingestion Count */}
          <div className="glass-card p-4 border border-[var(--border-subtle)] rounded-xl flex flex-col justify-between">
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-emerald-400" />
              Live Telemetry Count
            </span>
            <div className="my-3">
              <span className="text-2xl font-extrabold text-white">
                {latest.tickCount} ticks
              </span>
              <span className="text-xs text-[var(--text-muted)] block mt-1">
                Ingested in current session
              </span>
            </div>
            <button
              onClick={handleClear}
              className="text-[9px] uppercase tracking-wider text-[var(--text-secondary)] hover:text-white flex items-center gap-1 transition-all"
            >
              <RefreshCw className="w-3 h-3" />
              Clear Session Logs
            </button>
          </div>
        </div>

        {/* ── TWO-COLUMN CONTENT LAYOUT ────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Column: Two Graphs Stacked (takes 2/3 width) */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            
            {/* Chart 1: Nowcasting Telemetry & Alert Probability */}
            <div className="glass-card p-5 border border-[var(--border-subtle)] rounded-xl flex flex-col h-[320px]">
              <div className="flex justify-between items-center mb-3">
                <div>
                  <h3 className="text-xs font-bold tracking-wider uppercase text-[var(--solexs-orange)]">
                    Nowcasting Telemetry & Probability
                  </h3>
                  <p className="text-[9px] text-[var(--text-muted)] uppercase">
                    1-second cadence Soft & Hard X-Ray vs CNN alert threshold (0.44)
                  </p>
                </div>
              </div>
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={points}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                    <XAxis dataKey="tickCount" stroke="var(--text-muted)" fontSize={9} tickFormatter={(v) => `#${v}`} />
                    <YAxis yAxisId="flux" stroke="var(--text-muted)" fontSize={9} />
                    <YAxis yAxisId="prob" orientation="right" domain={[0, 1]} stroke="var(--text-muted)" fontSize={9} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                    <Tooltip contentStyle={{ backgroundColor: "var(--chart-tooltip-bg)", borderColor: "var(--chart-tooltip-border)" }} />
                    <Legend wrapperStyle={{ fontSize: 9 }} />
                    <Line yAxisId="flux" type="monotone" dataKey="sxr_clean" stroke="var(--solexs-orange)" name="Clean SXR" strokeWidth={2} dot={false} />
                    <Line yAxisId="flux" type="monotone" dataKey="hxr_clean" stroke="var(--helios-cyan)" name="Clean HXR" strokeWidth={1.5} dot={false} />
                    <Line yAxisId="prob" type="monotone" dataKey="nowcastProb" stroke="#ef4444" name="Nowcast Probability" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 2: Forecasting Telemetry & Class Alert Probability */}
            <div className="glass-card p-5 border border-[var(--border-subtle)] rounded-xl flex flex-col h-[320px]">
              <div className="flex justify-between items-center mb-3">
                <div>
                  <h3 className="text-xs font-bold tracking-wider uppercase text-[var(--helios-cyan)]">
                    Forecasting Telemetry & Lead Probability
                  </h3>
                  <p className="text-[9px] text-[var(--text-muted)] uppercase">
                    Clean SXR flux vs 15-minute lead alert probability
                  </p>
                </div>
              </div>
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={points}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                    <XAxis dataKey="tickCount" stroke="var(--text-muted)" fontSize={9} tickFormatter={(v) => `#${v}`} />
                    <YAxis yAxisId="flux" stroke="var(--text-muted)" fontSize={9} />
                    <YAxis yAxisId="prob" orientation="right" domain={[0, 1]} stroke="var(--text-muted)" fontSize={9} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                    <Tooltip contentStyle={{ backgroundColor: "var(--chart-tooltip-bg)", borderColor: "var(--chart-tooltip-border)" }} />
                    <Legend wrapperStyle={{ fontSize: 9 }} />
                    <Line yAxisId="flux" type="monotone" dataKey="sxr_clean" stroke="var(--solexs-orange)" name="Clean SXR" strokeWidth={2} dot={false} />
                    <Line yAxisId="prob" type="monotone" dataKey="nowcastProb" stroke="var(--helios-cyan)" name="Lead Probability" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>

          {/* Right Column: Controller & Live Logs (takes 1/3 width) */}
          <div className="flex flex-col gap-6">
            
            {/* Live Controller Card */}
            <div className="glass-card p-6 border border-[var(--border-subtle)] rounded-xl flex flex-col gap-4">
              <div>
                <h3 className="text-xs font-bold tracking-wider uppercase text-[var(--solexs-orange)] flex items-center gap-1.5">
                  <Play className="w-4 h-4 fill-[var(--solexs-orange)]" />
                  Live Ingestion Controller
                </h3>
                <p className="text-[10px] text-[var(--text-muted)] mt-1">
                  Feed telemetry points manually. The backend will instantly clean them and update the active forecasts.
                </p>
              </div>

              <form onSubmit={handleIngest} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] uppercase text-[var(--text-secondary)] tracking-wider">Raw SXR (SoLEXS Counts)</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="e.g. 8.4"
                    value={sxrInput}
                    onChange={(e) => setSxrInput(e.target.value)}
                    className="bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--helios-cyan)] transition-all"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[9px] uppercase text-[var(--text-secondary)] tracking-wider">Raw HXR (HEL1OS Counts)</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="e.g. 3.2"
                    value={hxrInput}
                    onChange={(e) => setHxrInput(e.target.value)}
                    className="bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--helios-cyan)] transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={status === "submitting"}
                  className="bg-[var(--solexs-orange)] hover:bg-orange-600 text-white text-xs font-bold py-2 rounded-lg uppercase tracking-wider transition-all"
                >
                  {status === "submitting" ? "Feeding Point..." : "Feed Telemetry Point"}
                </button>
              </form>

              {status === "error" && (
                <span className="text-[10px] text-red-400 font-medium">{errorMsg}</span>
              )}
            </div>

            {/* Quick Live Dataset Download Logs */}
            <div className="glass-card p-6 border border-[var(--border-subtle)] rounded-xl flex flex-col gap-3">
              <h3 className="text-xs font-bold tracking-wider uppercase text-[var(--text-primary)] flex items-center gap-1.5">
                <FileDown className="w-4 h-4 text-emerald-400" />
                Download Cleaned Logs
              </h3>
              <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
                Export the session's clean telemetry stream containing all predicted labels.
              </p>
              
              <div className="flex flex-col gap-2 mt-2">
                <a
                  href="http://127.0.0.1:8000/download/live/solexs"
                  className="flex items-center justify-center gap-2 bg-[#1f2937] hover:bg-[#374151] border border-[var(--border-accent)] text-white text-xs font-semibold py-2 rounded-lg uppercase tracking-wider transition-all"
                >
                  <Download className="w-4 h-4" />
                  SoLEXS Cleaned CSV
                </a>
                <a
                  href="http://127.0.0.1:8000/download/live/helios"
                  className="flex items-center justify-center gap-2 bg-[#1f2937] hover:bg-[#374151] border border-[var(--border-accent)] text-white text-xs font-semibold py-2 rounded-lg uppercase tracking-wider transition-all"
                >
                  <Download className="w-4 h-4" />
                  HEL1OS Cleaned CSV
                </a>
              </div>
            </div>

          </div>

        </div>

      </main>
    </div>
  );
}
