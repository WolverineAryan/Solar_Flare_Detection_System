"use client";

import { useState } from "react";
import HeaderBar from "@/components/HeaderBar";
import AlertBanner from "@/components/AlertBanner";
import { useTelemetrySimulator } from "@/hooks/useTelemetrySimulator";
import { Upload, FileDown, AlertCircle, CheckCircle2, Loader2, Play, Keyboard, PlusCircle } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";

interface PreprocessResult {
  status: string;
  total_rows_1s: number;
  total_rows_1m: number;
  detected_flares: number;
  download_nowcast_url: string;
  download_forecast_url: string;
  preview_data?: PreviewPoint[];
}

interface LiveLogPoint {
  tickCount: number;
  sxr_clean: number;
  hxr_clean: number;
  nowcastProb: number;
  forecastClass: string;
  forecastTimeToPeak: string;
  alertLevel: string;
}

interface PreviewPoint {
  time: string;
  sxr: number;
  hxr: number;
  nowcast_prob: number;
}

import { useTelemetry } from "@/context/TelemetryContext";

export default function DataExporter() {
  const { isRunning, isBackendConnected, alertLevel } = useTelemetrySimulator();
  const { theme } = useTheme();

  // Theme-aware chart colors
  const gridColor     = theme === "light" ? "#e2e8f0" : "#1f2937";
  const tooltipBg     = theme === "light" ? "#ffffff" : "#0d1117";
  const tooltipBorder = theme === "light" ? "#e2e8f0" : "#1f2937";
  const axisColor     = theme === "light" ? "#94a3b8" : "#6b7280";
  const tooltipStyle  = { backgroundColor: tooltipBg, borderColor: tooltipBorder, fontSize: 10, borderRadius: 6 };
  
  const {
    points,
    setPoints,
    fileSolexs,
    setFileSolexs,
    fileHelios,
    setFileHelios,
    uploadStatus,
    setUploadStatus,
    uploadError,
    setUploadError,
    uploadResult,
    setUploadResult,
    previewData,
    setPreviewData,
  } = useTelemetry();

  const [sxrInput, setSxrInput] = useState("");
  const [hxrInput, setHxrInput] = useState("");
  const [liveStatus, setLiveStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [liveError, setLiveError] = useState("");

  const handleUpload = async () => {
    if (!fileSolexs && !fileHelios) {
      setUploadError("Please select at least one telemetry file to process.");
      setUploadStatus("error");
      return;
    }
    setUploadStatus("uploading");
    setUploadError("");
    setUploadResult(null);

    const formData = new FormData();
    if (fileSolexs) {
      formData.append("file_solexs", fileSolexs);
    }
    if (fileHelios) {
      formData.append("file_helios", fileHelios);
    }

    try {
      const response = await fetch("http://127.0.0.1:8000/preprocess-and-clean", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
      if (data.status === "success") {
        setUploadResult(data);
        setPreviewData(data.preview_data || []);
        setUploadStatus("success");
      } else {
        throw new Error(data.message || "Failed to preprocess files.");
      }
    } catch (err: any) {
      console.error(err);
      setUploadError(err.message || "An error occurred during file upload.");
      setUploadStatus("error");
    }
  };

  const handleLiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sxrNum = parseFloat(sxrInput);
    const hxrNum = parseFloat(hxrInput);

    if (isNaN(sxrNum) || isNaN(hxrNum)) {
      setLiveError("Please enter valid numeric values for both SXR and HXR.");
      setLiveStatus("error");
      return;
    }

    setLiveStatus("submitting");
    setLiveError("");

    try {
      const response = await fetch("http://127.0.0.1:8000/predict/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sxr_raw: sxrNum, hxr_raw: hxrNum }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const resultPoint: LiveLogPoint = await response.json();
      setPoints((prev) => [...prev, resultPoint]);
      setLiveStatus("success");
      setSxrInput("");
      setHxrInput("");
    } catch (err: any) {
      console.error(err);
      setLiveError(err.message || "Failed to submit live data point.");
      setLiveStatus("error");
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <HeaderBar isRunning={isRunning} isBackendConnected={isBackendConnected} />
      <AlertBanner alertLevel={alertLevel} />

      <main className="flex-1 p-6 max-w-5xl mx-auto w-full flex flex-col gap-8 animate-slide-in">
        {/* Title Block */}
        <div>
          <h2 className="text-xl font-bold tracking-wider uppercase text-[var(--solexs-orange)] flex items-center gap-2">
            <Keyboard className="w-6 h-6 text-[var(--solexs-orange)]" />
            Aditya-L1 Data Preprocessor & Exporter
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Analyze Aditya-L1 SDD telemetry. Use either real-time 1-by-1 manual inputs or upload bulk telemetry CSV files. 
            The system automatically cleans raw data and generates downloadable, model-ready datasets.
          </p>
        </div>

        {/* ── SECTION 1: REAL-TIME 1-BY-1 DATA INPUT ──────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Form Card */}
          <div className="lg:col-span-1 glass-card p-6 border border-[var(--border-subtle)] rounded-xl flex flex-col gap-4">
            <h3 className="text-xs font-bold tracking-wider uppercase text-[var(--helios-cyan)] flex items-center gap-2">
              <PlusCircle className="w-4 h-4 text-[var(--helios-cyan)]" />
              Live 1-by-1 Data Input
            </h3>
            
            <form onSubmit={handleLiveSubmit} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase text-[var(--text-secondary)] tracking-wider">Raw SoLEXS (SXR) Value</label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="e.g. 5.2"
                  value={sxrInput}
                  onChange={(e) => setSxrInput(e.target.value)}
                  className="bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--helios-cyan)] transition-all"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase text-[var(--text-secondary)] tracking-wider">Raw HEL1OS (HXR) Value</label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="e.g. 2.4"
                  value={hxrInput}
                  onChange={(e) => setHxrInput(e.target.value)}
                  className="bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--helios-cyan)] transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={liveStatus === "submitting"}
                className="mt-2 bg-[var(--helios-cyan)] hover:bg-cyan-500 text-[var(--bg-secondary)] text-xs font-bold py-2 rounded-lg uppercase tracking-wider transition-all flex items-center justify-center gap-2"
              >
                {liveStatus === "submitting" ? (
                  <>
                    <Loader2 className="w-4.5 h-4.5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-[#0a0e17]" />
                    <span>Submit Point</span>
                  </>
                )}
              </button>
            </form>

            {liveStatus === "error" && (
              <span className="text-[10px] text-red-400 font-medium">{liveError}</span>
            )}
            
            {/* Live download buttons */}
            <div className="border-t border-[var(--border-subtle)] pt-4 mt-2 flex flex-col gap-2">
              <span className="text-[10px] uppercase text-[var(--text-muted)] tracking-wider font-semibold">Download Live Logs</span>
              <a
                href="http://127.0.0.1:8000/download/live/solexs"
                className="flex items-center justify-center gap-2 bg-[#1f2937] hover:bg-[#374151] border border-[var(--border-accent)] text-white text-[11px] font-semibold py-1.5 rounded-lg uppercase tracking-wider transition-all"
              >
                <FileDown className="w-3.5 h-3.5" />
                Download Live SoLEXS CSV
              </a>
              <a
                href="http://127.0.0.1:8000/download/live/helios"
                className="flex items-center justify-center gap-2 bg-[#1f2937] hover:bg-[#374151] border border-[var(--border-accent)] text-white text-[11px] font-semibold py-1.5 rounded-lg uppercase tracking-wider transition-all"
              >
                <FileDown className="w-3.5 h-3.5" />
                Download Live HEL1OS CSV
              </a>
            </div>
          </div>

          {/* Table Card */}
          <div className="lg:col-span-2 glass-card p-6 border border-[var(--border-subtle)] rounded-xl flex flex-col gap-3">
            <h3 className="text-xs font-bold tracking-wider uppercase text-[var(--text-primary)]">Live Processing Log (Last 10 points)</h3>
            <div className="flex-1 overflow-x-auto min-h-[250px]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
                    <th className="py-2">Tick</th>
                    <th className="py-2">SXR Clean</th>
                    <th className="py-2">HXR Clean</th>
                    <th className="py-2">Nowcast Prob</th>
                    <th className="py-2">Forecast Class</th>
                    <th className="py-2">Alert Level</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1f2937] text-xs text-[var(--text-secondary)]">
                  {points.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-[var(--text-muted)]">
                        No telemetry points submitted in this session yet. Submit values on the left.
                      </td>
                    </tr>
                  ) : (
                    [...points].reverse().slice(0, 10).map((pt, idx) => (
                      <tr key={idx} className="hover:bg-[#1a2332]/50 transition-colors">
                        <td className="py-2.5 font-mono text-[var(--text-primary)]">#{pt.tickCount}</td>
                        <td className="py-2.5 font-mono">{pt.sxr_clean.toFixed(2)}</td>
                        <td className="py-2.5 font-mono">{pt.hxr_clean.toFixed(2)}</td>
                        <td className="py-2.5 font-mono text-[var(--solexs-orange)]">{(pt.nowcastProb * 100).toFixed(1)}%</td>
                        <td className="py-2.5 font-semibold text-[var(--helios-cyan)]">{pt.forecastClass}</td>
                        <td className="py-2.5">
                          <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold ${
                            pt.alertLevel === "critical" ? "bg-red-500/10 text-red-400 border border-red-500/20" :
                            pt.alertLevel === "elevated" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                            "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          }`}>
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
        </div>

        {/* ── SECTION 2: BULK DATASET PREPROCESSOR ──────────────── */}
        <div className="border-t border-[var(--border-subtle)] pt-8 flex flex-col gap-6">
          <div>
            <h3 className="text-xs font-bold tracking-wider uppercase text-[var(--solexs-orange)] flex items-center gap-2">
              <Upload className="w-4.5 h-4.5 text-[var(--solexs-orange)]" />
              Bulk Telemetry Preprocessor & Exporter
            </h3>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">
              Upload historical orbits or telemetry batches to generate structured, labeled files.
            </p>
          </div>

          <div className="glass-card p-6 border border-[var(--border-subtle)] rounded-xl flex flex-col gap-6 items-center">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
              {/* SoLEXS File Selection */}
              <div className="flex flex-col items-center justify-center p-4 border border-dashed border-[var(--border-subtle)] rounded-lg text-center gap-2">
                <span className="text-xs font-semibold block text-[var(--solexs-orange)] uppercase tracking-wider">SoLEXS (Soft X-Ray) File</span>
                <div className="w-full relative">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        setFileSolexs(e.target.files[0]);
                        setUploadStatus("idle");
                      }
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[11px] font-semibold py-2 px-4 rounded-lg text-center hover:bg-[var(--bg-card-hover)] transition-all">
                    {fileSolexs ? fileSolexs.name : "Choose SoLEXS CSV"}
                  </div>
                </div>
              </div>

              {/* HEL1OS File Selection */}
              <div className="flex flex-col items-center justify-center p-4 border border-dashed border-[var(--border-subtle)] rounded-lg text-center gap-2">
                <span className="text-xs font-semibold block text-[var(--helios-cyan)] uppercase tracking-wider">HEL1OS (Hard X-Ray) File</span>
                <div className="w-full relative">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        setFileHelios(e.target.files[0]);
                        setUploadStatus("idle");
                      }
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[11px] font-semibold py-2 px-4 rounded-lg text-center hover:bg-[var(--bg-card-hover)] transition-all">
                    {fileHelios ? fileHelios.name : "Choose HEL1OS CSV"}
                  </div>
                </div>
              </div>
            </div>

            {/* Run prediction button */}
            {(fileSolexs || fileHelios) && uploadStatus !== "uploading" && (
              <button
                onClick={handleUpload}
                className="bg-[var(--solexs-orange)] hover:bg-orange-600 text-white text-xs font-bold py-2 px-8 rounded-lg uppercase tracking-wider transition-all"
              >
                Start Dataset Fusion & Prediction
              </button>
            )}

            {uploadStatus === "uploading" && (
              <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                <Loader2 className="w-4 h-4 animate-spin text-[var(--helios-cyan)]" />
                <span>Aligning timestamps, running 1D CNN Nowcaster & BiLSTM Forecaster...</span>
              </div>
            )}
            
            {uploadStatus === "error" && (
              <div className="text-red-400 text-xs font-semibold mt-2">
                {uploadError}
              </div>
            )}
          </div>

          {/* Bulk Success results */}
          {uploadStatus === "success" && uploadResult && (
            <div className="space-y-4">
              <div className="bg-emerald-950/30 border border-emerald-500/50 p-4 rounded-lg flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="text-xs font-bold text-emerald-400 block uppercase tracking-wider">Inference Completed</span>
                  <span className="text-xs text-emerald-200 block mt-1">
                    Telemetry preprocessed successfully. Download the optimized datasets below.
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Nowcast Download */}
                <div className="glass-card p-5 border border-[var(--border-subtle)] rounded-xl flex flex-col justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-bold tracking-wider uppercase text-[var(--text-primary)] flex items-center gap-2">
                      <FileDown className="w-4 h-4 text-[var(--helios-cyan)]" />
                      Nowcasting Dataset (1s Cadence)
                    </h4>
                    <span className="text-[10px] text-[var(--text-secondary)] block mt-1">
                      Rows processed: {uploadResult.total_rows_1s} | Flares: {uploadResult.detected_flares}
                    </span>
                  </div>
                  <a
                    href={uploadResult.download_nowcast_url}
                    className="inline-flex items-center justify-center gap-2 bg-[#1f2937] hover:bg-[#374151] border border-[var(--border-accent)] text-white text-[11px] font-semibold py-2 rounded-lg uppercase tracking-wider transition-all"
                  >
                    <FileDown className="w-4 h-4" />
                    Download Nowcast CSV
                  </a>
                </div>

                {/* Forecast Download */}
                <div className="glass-card p-5 border border-[var(--border-subtle)] rounded-xl flex flex-col justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-bold tracking-wider uppercase text-[var(--text-primary)] flex items-center gap-2">
                      <FileDown className="w-4 h-4 text-[var(--solexs-orange)]" />
                      Forecasting Dataset (1m Cadence)
                    </h4>
                    <span className="text-[10px] text-[var(--text-secondary)] block mt-1">
                      Resampled Rows: {uploadResult.total_rows_1m}
                    </span>
                  </div>
                  <a
                    href={uploadResult.download_forecast_url}
                    className="inline-flex items-center justify-center gap-2 bg-[#1f2937] hover:bg-[#374151] border border-[var(--border-accent)] text-white text-[11px] font-semibold py-2 rounded-lg uppercase tracking-wider transition-all"
                  >
                    <FileDown className="w-4 h-4" />
                    Download Forecast CSV
                  </a>
                </div>
              </div>
              
              {/* Dynamic Insights Charts */}
              {previewData.length > 0 && (
                <div className="glass-card p-6 border border-[var(--border-subtle)] rounded-xl flex flex-col gap-6 mt-6">
                  <h3 className="text-xs font-bold tracking-wider uppercase text-[var(--solexs-orange)] flex items-center gap-2">
                    Processed Telemetry Insights & Visualization
                  </h3>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Chart 1: SXR/HXR counts */}
                    <div className="bg-[var(--bg-primary)] p-4 rounded-lg border border-[var(--border-subtle)] h-[300px] flex flex-col">
                      <span className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2 block">
                        X-Ray Flux Insights (Cleaned SXR & HXR)
                      </span>
                      <div className="flex-1 min-h-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={previewData}>
                            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                            <XAxis dataKey="time" stroke={axisColor} fontSize={9} />
                            <YAxis stroke={axisColor} fontSize={9} />
                            <Tooltip contentStyle={tooltipStyle} formatter={(val) => [typeof val === "number" ? val.toFixed(2) : val]} />
                            <Legend wrapperStyle={{ fontSize: 9 }} />
                            <Line type="monotone" dataKey="sxr" stroke="#f97316" name="SoLEXS SXR" strokeWidth={2} dot={false} isAnimationActive={false} />
                            <Line type="monotone" dataKey="hxr" stroke="#0ea5e9" name="HEL1OS HXR" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Chart 2: Nowcast Prob */}
                    <div className="bg-[var(--bg-primary)] p-4 rounded-lg border border-[var(--border-subtle)] h-[300px] flex flex-col">
                      <span className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2 block">
                        Nowcasting Flare Alert Probability
                      </span>
                      <div className="flex-1 min-h-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={previewData}>
                            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                            <XAxis dataKey="time" stroke={axisColor} fontSize={9} />
                            <YAxis domain={[0, 1]} stroke={axisColor} fontSize={9} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                            <Tooltip contentStyle={tooltipStyle} formatter={(val) => [typeof val === "number" ? `${(val*100).toFixed(1)}%` : val, "Nowcast"]} />
                            <Legend wrapperStyle={{ fontSize: 9 }} />
                            <Line type="monotone" dataKey="nowcast_prob" stroke="#ef4444" name="Nowcast Probability" strokeWidth={2} dot={false} isAnimationActive={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
