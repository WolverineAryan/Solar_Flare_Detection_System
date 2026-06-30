"use client";

import { useState, useEffect, useRef } from "react";
import { Satellite, Wifi, WifiOff, LayoutDashboard, Download, Radio, Sun, Moon, Bell, BellRing, Trash2, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "../context/ThemeContext";
import { useTelemetry } from "../context/TelemetryContext";

interface HeaderBarProps {
  isRunning: boolean;
  isBackendConnected: boolean;
}

export default function HeaderBar({ isRunning, isBackendConnected }: HeaderBarProps) {
  const [utcTime, setUtcTime] = useState("--:--:-- UTC");
  const [utcDate, setUtcDate] = useState("----/--/--");
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  
  // Consume alerts state
  const { alertsHistory, dismissHistoryAlert, clearAlertsHistory } = useTelemetry();
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const iso = now.toISOString();
      setUtcDate(iso.substring(0, 10));
      setUtcTime(iso.substring(11, 19) + " UTC");
    };
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsAlertOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const navItems = [
    { label: "Dashboard",       href: "/",           icon: LayoutDashboard },
    { label: "Live Simulation", href: "/simulation", icon: Radio },
    { label: "Data Exporter",   href: "/exporter",   icon: Download },
  ];

  const handleClearAllAlerts = () => {
    clearAlertsHistory();
    setIsAlertOpen(false);
  };

  return (
    <header
      className="sticky top-0 z-40 w-full border-b"
      style={{
        background: "var(--bg-navbar)",
        borderColor: "var(--border-subtle)",
        boxShadow: "var(--shadow-navbar)",
      }}
    >
      <div className="max-w-7xl mx-auto px-6 py-0 flex items-center justify-between gap-4 h-16">

        {/* ── LEFT: Brand ─────────────────────────────────── */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="relative">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}>
              <Satellite className="w-5 h-5 text-white" />
            </div>
            {isRunning && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-[var(--bg-navbar)] animate-pulse" />
            )}
          </div>
          <div className="leading-tight">
            <div className="text-sm font-extrabold tracking-wider uppercase" style={{ color: "var(--text-primary)" }}>
              Aditya-L1
            </div>
            <div className="text-[9px] font-semibold tracking-widest uppercase" style={{ color: "var(--solexs-orange)" }}>
              Solar Flare Early Warning System
            </div>
            <div className="text-[8px] tracking-wider" style={{ color: "var(--text-muted)" }}>
              ISRO · Indian Space Research Organisation
            </div>
          </div>
        </div>

        {/* ── CENTER: Nav ──────────────────────────────────── */}
        <nav className="flex items-center gap-1 p-1 rounded-lg" style={{ background: "var(--bg-primary)" }}>
          {navItems.map(({ label, href, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-[11px] font-semibold uppercase tracking-wider transition-all duration-200"
                style={
                  active
                    ? { background: "var(--nav-active-bg)", color: "var(--nav-active-text)" }
                    : { color: "var(--nav-text)" }
                }
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* ── RIGHT: Clock + Alerts + API status + dark toggle ──────── */}
        <div className="flex items-center gap-3 flex-shrink-0">

          {/* Mission clock */}
          <div className="text-right hidden md:block mr-2">
            <div className="text-xs font-mono font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
              {utcDate} {utcTime.split(" ")[0]}
            </div>
            <div className="text-[9px] uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              Mission Clock
            </div>
          </div>

          {/* Live API indicator */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider"
            style={{
              borderColor: isBackendConnected ? "var(--alert-green)" : "var(--border-subtle)",
              color: isBackendConnected ? "var(--alert-green)" : "var(--text-muted)",
              background: isBackendConnected ? "var(--alert-green-bg)" : "transparent",
            }}>
            {isBackendConnected
              ? <Wifi className="w-3 h-3" />
              : <WifiOff className="w-3 h-3" />}
            Live API
          </div>

          {/* ── ALERT BELL BUTTON & DROPDOWN ──────────────── */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsAlertOpen(!isAlertOpen)}
              title="Alert Notifications Center"
              className="w-8 h-8 flex items-center justify-center rounded-lg border transition-all duration-200 hover:scale-105 relative"
              style={{
                borderColor: "var(--border-accent)",
                background: "var(--bg-primary)",
                color: alertsHistory.length > 0 ? "var(--solexs-orange)" : "var(--text-secondary)",
              }}
            >
              {alertsHistory.length > 0 ? (
                <>
                  <BellRing className="w-4 h-4 animate-bounce" />
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-extrabold rounded-full w-4 h-4 flex items-center justify-center border border-[var(--bg-navbar)]">
                    {alertsHistory.length}
                  </span>
                </>
              ) : (
                <Bell className="w-4 h-4" />
              )}
            </button>

            {isAlertOpen && (
              <div
                className="absolute right-0 mt-2 w-80 glass-card rounded-xl border p-4 shadow-2xl z-50 flex flex-col gap-3"
                style={{
                  background: "var(--bg-secondary)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: "var(--border-subtle)" }}>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    Active Solar Alerts ({alertsHistory.length})
                  </span>
                  {alertsHistory.length > 0 && (
                    <button
                      onClick={handleClearAllAlerts}
                      className="text-[9px] uppercase tracking-wider text-red-500 hover:underline flex items-center gap-1 font-semibold"
                    >
                      <Trash2 className="w-3 h-3" />
                      Clear All
                    </button>
                  )}
                </div>

                <div className="max-h-60 overflow-y-auto flex flex-col gap-2 pr-1">
                  {alertsHistory.length === 0 ? (
                    <div className="py-6 text-center text-[10px] text-[var(--text-muted)] flex flex-col items-center gap-1">
                      <span>No active critical or elevated alerts.</span>
                      <span className="text-[8px]">System running normal.</span>
                    </div>
                  ) : (
                    alertsHistory.map((alert) => {
                      const isCritical = alert.level === "critical";
                      const levelColor = isCritical ? "text-red-500" : "text-amber-500";
                      const levelBg = isCritical ? "bg-red-500/10" : "bg-amber-500/10";
                      
                      return (
                        <div
                          key={alert.id}
                          className="p-2 rounded-lg border flex items-start gap-2 relative bg-[var(--bg-primary)]"
                          style={{ borderColor: "var(--border-subtle)" }}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded ${levelColor} ${levelBg}`}>
                                {alert.type}
                              </span>
                              <span className="text-[8px] text-[var(--text-muted)] font-mono">{alert.timestamp}</span>
                            </div>
                            <p className="text-[10px] text-[var(--text-secondary)] mt-1 leading-normal font-medium">
                              {alert.message}
                            </p>
                          </div>
                          <button
                            onClick={() => dismissHistoryAlert(alert.id)}
                            className="p-0.5 hover:bg-white/10 rounded transition-colors self-start"
                          >
                            <X className="w-3 h-3 text-[var(--text-muted)]" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Dark mode toggle */}
          <button
            onClick={toggleTheme}
            title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            className="w-8 h-8 flex items-center justify-center rounded-lg border transition-all duration-200 hover:scale-105"
            style={{
              borderColor: "var(--border-accent)",
              background: "var(--bg-primary)",
              color: "var(--text-secondary)",
            }}
          >
            {theme === "light"
              ? <Moon className="w-4 h-4" />
              : <Sun className="w-4 h-4 text-amber-400" />}
          </button>
        </div>
      </div>
    </header>
  );
}
