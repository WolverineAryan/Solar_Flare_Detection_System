"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";

export interface LiveLogPoint {
  tickCount: number;
  sxr_clean: number;
  hxr_clean: number;
  nowcastProb: number;
  forecastClass: string;
  forecastTimeToPeak: string;
  alertLevel: string;
}

export interface PreviewPoint {
  time: string;
  sxr: number;
  hxr: number;
  nowcast_prob: number;
}

export interface PreprocessResult {
  status: string;
  total_rows_1s: number;
  total_rows_1m: number;
  detected_flares: number;
  download_nowcast_url: string;
  download_forecast_url: string;
  preview_data?: PreviewPoint[];
}

export interface SimPoint {
  tickCount: number;
  sxr_raw: number;
  hxr_raw: number;
  sxr_clean: number;
  hxr_clean: number;
  nowcastProb: number;
  forecastClass: string;
  forecastProb: number;
  forecastTimeToPeak: string;
  alertLevel: string;
}

export interface SolarAlert {
  id: string;
  timestamp: string;
  type: "nowcast" | "forecast";
  level: "elevated" | "critical";
  message: string;
}

const WS_URL = "ws://127.0.0.1:8000/ws/simulation";
const API_BASE = "http://127.0.0.1:8000";

interface TelemetryContextType {
  // 1-by-1 manual ingestion points
  points: LiveLogPoint[];
  setPoints: React.Dispatch<React.SetStateAction<LiveLogPoint[]>>;
  
  // Exporter/preprocessor upload states
  fileSolexs: File | null;
  setFileSolexs: (f: File | null) => void;
  fileHelios: File | null;
  setFileHelios: (f: File | null) => void;
  uploadStatus: "idle" | "uploading" | "success" | "error";
  setUploadStatus: (s: "idle" | "uploading" | "success" | "error") => void;
  uploadError: string;
  setUploadError: (s: string) => void;
  uploadResult: PreprocessResult | null;
  setUploadResult: (r: PreprocessResult | null) => void;
  previewData: PreviewPoint[];
  setPreviewData: (d: PreviewPoint[]) => void;

  // Global background simulation states
  simPoints: SimPoint[];
  setSimPoints: React.Dispatch<React.SetStateAction<SimPoint[]>>;
  isSimRunning: boolean;
  simWsStatus: "disconnected" | "connecting" | "connected";
  simStatusMsg: string;
  simTotalPackets: number;
  startSimulation: () => Promise<void>;
  stopSimulation: () => Promise<void>;
  clearSimulation: () => void;

  // Popup Alert Notifications (Floating toasts at bottom-right)
  popupAlerts: SolarAlert[];
  dismissPopupAlert: (id: string) => void;

  // Persistent Alert Center (Navbar Dropdown)
  alertsHistory: SolarAlert[];
  dismissHistoryAlert: (id: string) => void;
  clearAlertsHistory: () => void;
}

const TelemetryContext = createContext<TelemetryContextType | undefined>(undefined);

export function TelemetryProvider({ children }: { children: React.ReactNode }) {
  // Manual Ingestion
  const [points, setPoints] = useState<LiveLogPoint[]>([]);
  
  // File upload
  const [fileSolexs, setFileSolexs] = useState<File | null>(null);
  const [fileHelios, setFileHelios] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [uploadError, setUploadError] = useState("");
  const [uploadResult, setUploadResult] = useState<PreprocessResult | null>(null);
  const [previewData, setPreviewData] = useState<PreviewPoint[]>([]);

  // Simulation
  const [simPoints, setSimPoints] = useState<SimPoint[]>([]);
  const [isSimRunning, setIsSimRunning] = useState(false);
  const [simWsStatus, setSimWsStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [simStatusMsg, setSimStatusMsg] = useState("Ready. Click Start Simulation to begin.");
  const [simTotalPackets, setSimTotalPackets] = useState(0);

  // Active floating alert popups (toasts on bottom-right)
  const [popupAlerts, setPopupAlerts] = useState<SolarAlert[]>([]);
  
  // Persistent list of alerts in the navbar dropdown
  const [alertsHistory, setAlertsHistory] = useState<SolarAlert[]>([]);

  const wsRef = useRef<WebSocket | null>(null);

  // Close a popup toast from the bottom-right of the screen
  const dismissPopupAlert = useCallback((id: string) => {
    setPopupAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // Remove an alert from the persistent history dropdown
  const dismissHistoryAlert = useCallback((id: string) => {
    setAlertsHistory((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // Clear the entire persistent dropdown history
  const clearAlertsHistory = useCallback(() => {
    setAlertsHistory([]);
  }, []);

  // Helper to add new alerts without duplication of identical active conditions
  const triggerAlert = useCallback((type: "nowcast" | "forecast", level: "elevated" | "critical", message: string) => {
    setAlertsHistory((prevHistory) => {
      // Find the last alert of this exact type and level in the history log
      const lastAlert = prevHistory.find((a) => a.type === type && a.level === level);
      if (lastAlert) {
        const lastTime = parseInt(lastAlert.id.split("-")[0]);
        // 25 seconds cooldown to prevent flooding consecutive seconds of the same flare event
        if (Date.now() - lastTime < 25000) {
          return prevHistory;
        }
      }

      const newAlert: SolarAlert = {
        id: `${Date.now()}-${Math.random()}`,
        timestamp: new Date().toLocaleTimeString(),
        type,
        level,
        message,
      };

      // Add to popup toast list as well so it slides in
      setPopupAlerts((prevPopups) => [newAlert, ...prevPopups].slice(0, 5));

      return [newAlert, ...prevHistory].slice(0, 50); // Keep up to 50 logs in history
    });
  }, []);

  // WebSocket connection handler
  const connectSimWS = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    setSimWsStatus("connecting");
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setSimWsStatus("connected");
      setSimStatusMsg("WebSocket connected — receiving live CCSDS telemetry stream...");
    };

    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (data.type === "simulation_ended") {
          setIsSimRunning(false);
          setSimStatusMsg("Simulation complete — all telemetry rows transmitted.");
          return;
        }

        const pt: SimPoint = {
          tickCount: data.tickCount ?? 0,
          sxr_raw: data.sxr_raw ?? 0,
          hxr_raw: data.hxr_raw ?? 0,
          sxr_clean: data.sxr_clean ?? 0,
          hxr_clean: data.hxr_clean ?? 0,
          nowcastProb: data.nowcastProb ?? 0,
          forecastClass: data.forecastClass ?? "B",
          forecastProb: data.forecastProb ?? 0,
          forecastTimeToPeak: data.forecastTimeToPeak ?? "N/A",
          alertLevel: data.alertLevel ?? "normal",
        };

        setSimPoints((prev) => {
          const next = [...prev, pt];
          return next.length > 1000 ? next.slice(-1000) : next;
        });
        setSimTotalPackets(data.tickCount ?? 0);

        // Check for alerts
        if (pt.alertLevel === "critical" || pt.alertLevel === "elevated") {
          // Nowcasting alert
          if (pt.nowcastProb >= 0.44) {
            const severity = pt.nowcastProb >= 0.80 ? "critical" : "elevated";
            triggerAlert(
              "nowcast",
              severity,
              `IMMINENT FLARE DETECTED: Solar flare activity is currently occurring (Nowcast Prob: ${(pt.nowcastProb * 100).toFixed(1)}%)`
            );
          }
          // Forecasting alert
          if (pt.forecastProb >= 0.20 && (pt.forecastClass.startsWith("M") || pt.forecastClass.startsWith("X") || pt.forecastClass.startsWith("C"))) {
            const severity = pt.forecastClass.startsWith("X") ? "critical" : "elevated";
            triggerAlert(
              "forecast",
              severity,
              `FLARE FORECAST WARNING: Class ${pt.forecastClass} solar flare predicted to occur after/at ${pt.forecastTimeToPeak}`
            );
          }
        }
      } catch (e) {
        console.error("Failed to parse websocket message", e);
      }
    };

    ws.onerror = () => {
      setSimWsStatus("disconnected");
      setSimStatusMsg("WebSocket error. Ensure backend API is running.");
    };

    ws.onclose = () => {
      setSimWsStatus("disconnected");
    };
  }, [triggerAlert]);

  const startSimulation = useCallback(async () => {
    try {
      const resp = await fetch(`${API_BASE}/simulation/start`, { method: "POST" });
      const data = await resp.json();
      if (data.status === "started" || data.status === "already_running") {
        setIsSimRunning(true);
        setSimStatusMsg("Simulation running — streaming Aditya-L1 CCSDS telemetry packets...");
        connectSimWS();
      }
    } catch {
      setSimStatusMsg("Failed to connect to backend simulation service.");
    }
  }, [connectSimWS]);

  const stopSimulation = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/simulation/stop`, { method: "POST" });
    } catch (e) {}
    setIsSimRunning(false);
    setSimStatusMsg("Simulation stopped by operator.");
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setSimWsStatus("disconnected");
  }, []);

  const clearSimulation = useCallback(() => {
    setSimPoints([]);
    setSimTotalPackets(0);
    setSimStatusMsg("Cleared. Ready for a new simulation run.");
  }, []);

  // Cleanup on provider unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Load manual ingestion points from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("solar_live_points");
      if (saved) {
        try {
          setPoints(JSON.parse(saved));
        } catch (e) {
          console.error("Failed to parse saved live telemetry points:", e);
        }
      }
      
      const savedResult = localStorage.getItem("solar_upload_result");
      if (savedResult) {
        try {
          const parsed = JSON.parse(savedResult);
          setUploadResult(parsed);
          setUploadStatus("success");
          setPreviewData(parsed.preview_data || []);
        } catch (e) {
          console.error("Failed to parse saved upload result:", e);
        }
      }
    }
  }, []);

  // Persist live points on change
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("solar_live_points", JSON.stringify(points));
    }
  }, [points]);

  // Persist upload results on change
  useEffect(() => {
    if (typeof window !== "undefined" && uploadResult) {
      localStorage.setItem("solar_upload_result", JSON.stringify(uploadResult));
    }
  }, [uploadResult]);

  return (
    <TelemetryContext.Provider
      value={{
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
        // Simulation variables (kept alive in background)
        simPoints,
        setSimPoints,
        isSimRunning,
        simWsStatus,
        simStatusMsg,
        simTotalPackets,
        startSimulation,
        stopSimulation,
        clearSimulation,
        // Active floating popup alert states
        popupAlerts,
        dismissPopupAlert,
        // Persistent Alert Dropdown History states
        alertsHistory,
        dismissHistoryAlert,
        clearAlertsHistory,
      }}
    >
      {children}
    </TelemetryContext.Provider>
  );
}

export function useTelemetry() {
  const context = useContext(TelemetryContext);
  if (!context) {
    throw new Error("useTelemetry must be used within a TelemetryProvider");
  }
  return context;
}
