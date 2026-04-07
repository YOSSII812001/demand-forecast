"use client";

import { useMemo } from "react";
import {
  addDays,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
  getDay,
  isSameMonth,
} from "date-fns";
import { ja } from "date-fns/locale";
import { METRIC_LABELS, type ForecastResult, type MetricType } from "@/lib/types/database";

type Props = {
  data: ForecastResult[];
  metricType: MetricType;
};

const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"];

function getColor(value: number, metricType: MetricType): string {
  let ratio: number;
  if (metricType === "occupancy_rate") {
    ratio = value / 100;
  } else if (metricType === "guest_count") {
    ratio = Math.min(value / 60, 1);
  } else if (metricType === "revenue") {
    ratio = Math.min(value / 2000000, 1);
  } else {
    ratio = Math.min(value / 20, 1);
  }
  ratio = Math.max(0, Math.min(1, ratio));

  // 銅色グラデーション: 薄い(低)→濃い(高)
  if (ratio < 0.3) return "bg-orange-50 text-orange-900";
  if (ratio < 0.5) return "bg-orange-100 text-orange-900";
  if (ratio < 0.7) return "bg-orange-200 text-orange-900";
  if (ratio < 0.85) return "bg-orange-300 text-white";
  return "bg-orange-500 text-white";
}

function formatCellValue(value: number, metricType: MetricType): string {
  if (metricType === "occupancy_rate") return `${value.toFixed(0)}%`;
  if (metricType === "revenue") return `${(value / 10000).toFixed(0)}万`;
  return value.toFixed(0);
}

export function ForecastCalendar({ data, metricType }: Props) {
  // 日付→予測値のMap
  const dataMap = useMemo(() => {
    const map = new Map<string, ForecastResult>();
    for (const d of data) {
      map.set(d.forecast_date, d);
    }
    return map;
  }, [data]);

  // 表示する月を算出（データの最初の月〜最後の月）
  const months = useMemo(() => {
    if (data.length === 0) return [];
    const dates = data.map((d) => new Date(d.forecast_date));
    const firstDate = dates[0];
    const lastDate = dates[dates.length - 1];

    const result: Date[] = [];
    let current = startOfMonth(firstDate);
    const end = startOfMonth(lastDate);
    while (current <= end) {
      result.push(current);
      current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    }
    return result;
  }, [data]);

  if (data.length === 0) return null;

  return (
    <div className="space-y-6">
      {months.map((monthStart) => (
        <MonthGrid
          key={monthStart.toISOString()}
          monthStart={monthStart}
          dataMap={dataMap}
          metricType={metricType}
        />
      ))}
      {/* 凡例 */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center">
        <span>低</span>
        <div className="flex gap-0.5">
          {["bg-orange-50", "bg-orange-100", "bg-orange-200", "bg-orange-300", "bg-orange-500"].map(
            (cls) => (
              <div key={cls} className={`w-5 h-3 rounded-sm ${cls}`} />
            )
          )}
        </div>
        <span>高</span>
        <span className="ml-4">{METRIC_LABELS[metricType]}</span>
      </div>
    </div>
  );
}

function MonthGrid({
  monthStart,
  dataMap,
  metricType,
}: {
  monthStart: Date;
  dataMap: Map<string, ForecastResult>;
  metricType: MetricType;
}) {
  const monthEnd = endOfMonth(monthStart);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // 月曜始まりのオフセット (getDay: 0=日,1=月...6=土 → 月曜=0)
  const firstDayOffset = (getDay(monthStart) + 6) % 7;

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">
        {format(monthStart, "yyyy年 M月", { locale: ja })}
      </h3>
      {/* 曜日ヘッダー */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className={`text-center text-[10px] font-medium ${
              d === "土" ? "text-blue-500" : d === "日" ? "text-red-400" : "text-muted-foreground"
            }`}
          >
            {d}
          </div>
        ))}
      </div>
      {/* 日付グリッド */}
      <div className="grid grid-cols-7 gap-1">
        {/* 月初の空白セル */}
        {Array.from({ length: firstDayOffset }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {/* 日付セル */}
        {days.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const result = dataMap.get(dateStr);
          const value = result ? Number(result.point_estimate) : null;
          const hasData = value !== null;

          return (
            <div
              key={dateStr}
              className={`relative aspect-square rounded-md flex flex-col items-center justify-center text-[10px] leading-tight transition-colors ${
                hasData
                  ? `${getColor(value, metricType)} cursor-default`
                  : "bg-muted/30 text-muted-foreground/40"
              }`}
              title={
                hasData
                  ? `${dateStr}: ${formatCellValue(value, metricType)}`
                  : dateStr
              }
            >
              <span className="font-medium">{day.getDate()}</span>
              {hasData && (
                <span className="text-[8px] leading-none opacity-80">
                  {formatCellValue(value, metricType)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
