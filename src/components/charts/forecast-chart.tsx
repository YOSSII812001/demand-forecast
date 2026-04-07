"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { METRIC_LABELS, type ForecastResult, type MetricType } from "@/lib/types/database";

type Props = {
  data: ForecastResult[];
  metricType: MetricType;
};

export function ForecastChart({ data, metricType }: Props) {
  const chartData = data.map((d) => ({
    date: d.forecast_date,
    point: Number(d.point_estimate),
    q10: Number(d.quantile_10),
    q90: Number(d.quantile_90),
    // 信頼区間の塗りつぶし用（Areaチャートで上限-下限を描画）
    range: [Number(d.quantile_10), Number(d.quantile_90)],
  }));

  const formatValue = (value: number) => {
    if (metricType === "occupancy_rate") return `${value.toFixed(0)}%`;
    if (metricType === "revenue") return `¥${(value / 10000).toFixed(0)}万`;
    return value.toFixed(0);
  };

  return (
    <div className="w-full h-80">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eceae4" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "#5f5f5d" }}
            tickFormatter={(d: string) => d.slice(5)} // MM-DD
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#5f5f5d" }}
            tickFormatter={formatValue}
          />
          <Tooltip
            labelFormatter={(label) => `${label}`}
            formatter={(value, name) => {
              const labels: Record<string, string> = {
                point: "予測値",
                q10: "下限 (10%)",
                q90: "上限 (90%)",
              };
              return [formatValue(Number(value)), labels[String(name)] ?? name];
            }}
            contentStyle={{
              backgroundColor: "#f7f4ed",
              border: "1px solid #eceae4",
              borderRadius: "8px",
              fontSize: "13px",
            }}
          />
          {/* 信頼区間（塗りつぶし） */}
          <Area
            dataKey="q90"
            stroke="none"
            fill="#b87333"
            fillOpacity={0.1}
            name="q90"
          />
          <Area
            dataKey="q10"
            stroke="none"
            fill="#f7f4ed"
            fillOpacity={1}
            name="q10"
          />
          {/* 点推定（実線） */}
          <Line
            type="monotone"
            dataKey="point"
            stroke="#b87333"
            strokeWidth={2}
            dot={false}
            name="point"
          />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="text-xs text-center text-muted-foreground mt-2">
        {METRIC_LABELS[metricType]}の予測 — 実線: 中央値、薄い帯: 10%〜90%信頼区間
      </p>
    </div>
  );
}
