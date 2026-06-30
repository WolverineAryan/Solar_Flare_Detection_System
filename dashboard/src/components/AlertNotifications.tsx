"use client";

import { useTelemetry } from "@/context/TelemetryContext";
import { X, ShieldAlert, AlertOctagon, BellRing } from "lucide-react";

export default function AlertNotifications() {
  const { popupAlerts, dismissPopupAlert } = useTelemetry();

  if (popupAlerts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[60] flex flex-col-reverse gap-3 w-full max-w-sm pointer-events-none">
      {popupAlerts.map((alert) => {
        const isCritical = alert.level === "critical";
        const iconColor = isCritical ? "text-red-500" : "text-amber-500";
        
        // Dynamic border styles that match alert levels
        const borderColor = isCritical ? "var(--alert-red)" : "var(--alert-amber)";
        
        // Gradient starting with alert warning color and ending with theme-aware bg-card
        const bgStyle = isCritical
          ? "linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, var(--bg-card) 100%)"
          : "linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, var(--bg-card) 100%)";

        return (
          <div
            key={alert.id}
            className="pointer-events-auto rounded-xl border p-4 shadow-xl flex items-start gap-3 animate-slide-in transition-all"
            style={{
              background: bgStyle,
              borderColor: borderColor,
            }}
          >
            <div className={`mt-0.5 flex-shrink-0 ${iconColor}`}>
              {isCritical ? (
                <AlertOctagon className="w-5 h-5 animate-pulse" />
              ) : (
                <ShieldAlert className="w-5 h-5" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5"
                  style={{ color: "var(--text-primary)" }}>
                  <BellRing className="w-3.5 h-3.5 text-[var(--solexs-orange)]" />
                  {alert.type === "nowcast" ? "Nowcast Alert" : "Forecast Warning"}
                </span>
                <span className="text-[9px] text-[var(--text-muted)] font-mono">{alert.timestamp}</span>
              </div>
              <p className="text-[11px] font-semibold text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                {alert.message}
              </p>
            </div>
            <button
              onClick={() => dismissPopupAlert(alert.id)}
              className="flex-shrink-0 p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              <X className="w-3.5 h-3.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
