"use client";

import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
} from "recharts";
import { Activity } from "lucide-react";
import type { TelemetryPoint } from "@/hooks/useTelemetrySimulator";

interface TelemetryChartProps {
  data: TelemetryPoint[];
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string; color: string }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="glass-card rounded-lg px-4 py-3 border border-[var(--border-accent)] shadow-xl">
      <p className="text-[10px] text-[var(--text-muted)] font-mono mb-2 tracking-wider">
        {label} UTC
      </p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2 text-xs">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-[var(--text-secondary)]">
            {entry.dataKey === "sxr"
              ? "SoLEXS (SXR)"
              : entry.dataKey === "hxr"
              ? "HEL1OS (HXR)"
              : entry.dataKey}
            :
          </span>
          <span className="font-mono font-bold text-[var(--text-primary)]">
            {entry.value.toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function TelemetryChart({ data }: TelemetryChartProps) {
  const maxHxr = Math.max(10, ...data.map((d) => d.hxr));
  const maxSxr = Math.max(15, ...data.map((d) => d.sxr));

  return (
    <div className="glass-card rounded-xl p-5 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-[var(--helios-cyan)]" />
          <h2 className="text-sm font-semibold tracking-wider uppercase text-[var(--text-primary)]">
            Live X-Ray Telemetry
          </h2>
        </div>
        <div className="flex items-center gap-4 text-[10px] text-[var(--text-muted)]">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-[2px] bg-[var(--solexs-orange)] rounded" />
            SoLEXS (Soft X-Ray)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-[2px] bg-[var(--helios-cyan)] rounded" />
            HEL1OS (Hard X-Ray)
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0" style={{ minHeight: "280px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
          >
            <defs>
              <linearGradient id="sxrGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--solexs-orange)"
                  stopOpacity={0.15}
                />
                <stop
                  offset="100%"
                  stopColor="var(--solexs-orange)"
                  stopOpacity={0}
                />
              </linearGradient>
              <linearGradient id="hxrGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--helios-cyan)"
                  stopOpacity={0.1}
                />
                <stop
                  offset="100%"
                  stopColor="var(--helios-cyan)"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="3 6"
              stroke="var(--border-subtle)"
              strokeOpacity={0.5}
              vertical={false}
            />

            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: "var(--text-muted)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--border-subtle)" }}
              interval="preserveStartEnd"
              minTickGap={50}
            />

            {/* Left Y-Axis: SXR */}
            <YAxis
              yAxisId="sxr"
              orientation="left"
              tick={{ fontSize: 10, fill: "var(--solexs-orange)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--solexs-orange)", strokeOpacity: 0.3 }}
              domain={[0, Math.ceil(maxSxr * 1.2)]}
              label={{
                value: "SXR Flux",
                angle: -90,
                position: "insideLeft",
                style: {
                  fontSize: 10,
                  fill: "var(--solexs-orange)",
                  textAnchor: "middle",
                },
                offset: 10,
              }}
            />

            {/* Right Y-Axis: HXR */}
            <YAxis
              yAxisId="hxr"
              orientation="right"
              tick={{ fontSize: 10, fill: "var(--helios-cyan)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--helios-cyan)", strokeOpacity: 0.3 }}
              domain={[0, Math.ceil(maxHxr * 1.1)]}
              label={{
                value: "HXR Counts",
                angle: 90,
                position: "insideRight",
                style: {
                  fontSize: 10,
                  fill: "var(--helios-cyan)",
                  textAnchor: "middle",
                },
                offset: 10,
              }}
            />

            <Tooltip
              content={<CustomTooltip />}
              cursor={{
                stroke: "var(--border-accent)",
                strokeWidth: 1,
                strokeDasharray: "4 4",
              }}
            />

            <Legend
              verticalAlign="bottom"
              iconSize={8}
              wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
            />

            {/* SXR Area + Line */}
            <Area
              key="sxr-area"
              yAxisId="sxr"
              type="monotone"
              dataKey="sxr"
              fill="url(#sxrGradient)"
              stroke="none"
              isAnimationActive={false}
            />
            <Line
              key="sxr-line"
              yAxisId="sxr"
              type="monotone"
              dataKey="sxr"
              name="SoLEXS (SXR)"
              stroke="var(--solexs-orange)"
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />

            {/* HXR Line */}
            <Line
              key="hxr-line"
              yAxisId="hxr"
              type="linear"
              dataKey="hxr"
              name="HEL1OS (HXR)"
              stroke="var(--helios-cyan)"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
