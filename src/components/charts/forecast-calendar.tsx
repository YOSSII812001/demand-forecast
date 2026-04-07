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

function getColor(value: number, min: number, max: number): string {
  const range = max - min;
  if (range === 0) return "bg-orange-200 text-orange-900";
  const ratio = (value - min) / range;

  // 銅色5段階グラデーション: 薄い(低)→濃い(高)
  if (ratio < 0.2) return "bg-amber-50 text-amber-900";
  if (ratio < 0.4) return "bg-orange-100 text-orange-900";
  if (ratio < 0.6) return "bg-orange-200 text-orange-900";
  if (ratio < 0.8) return "bg-orange-400 text-white";
  return "bg-orange-600 text-white";
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

  // データ全体のmin/maxを算出（色分け基準）
  const values = data.map((d) => Number(d.point_estimate));
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);

  if (data.length === 0) return null;

  return (
    <div className="space-y-6">
      {months.map((monthStart) => (
        <MonthGrid
          key={monthStart.toISOString()}
          monthStart={monthStart}
          dataMap={dataMap}
          metricType={metricType}
          dataMin={dataMin}
          dataMax={dataMax}
        />
      ))}
      {/* 凡例 */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center">
        <span>低</span>
        <div className="flex gap-0.5">
          {["bg-amber-50", "bg-orange-100", "bg-orange-200", "bg-orange-400", "bg-orange-600"].map(
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
  dataMin,
  dataMax,
}: {
  monthStart: Date;
  dataMap: Map<string, ForecastResult>;
  metricType: MetricType;
  dataMin: number;
  dataMax: number;
}) {
  const monthEnd = endOfMonth(monthStart);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // 月曜始まりのオフセット (getDay: 0=日,1=月...6=土 → 月曜=0)
  const firstDayOffset = (getDay(monthStart) + 6) % 7;

  return (
    <div className="rounded-xl border border-washi bg-card overflow-hidden">
      {/* 月ヘッダー */}
      <div className="px-4 py-2.5 bg-muted/40 border-b border-washi">
        <h3 className="text-sm font-bold">
          {format(monthStart, "yyyy年 M月", { locale: ja })}
        </h3>
      </div>
      <div className="p-3">
        {/* 曜日ヘッダー */}
        <div className="grid grid-cols-7 gap-1 mb-1.5 pb-1.5 border-b border-washi/50">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className={`text-center text-xs font-semibold py-1 ${
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
            <div key={`empty-${i}`} className="min-h-[3.5rem]" />
          ))}
          {/* 日付セル */}
          {days.map((day) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const result = dataMap.get(dateStr);
            const value = result ? Number(result.point_estimate) : null;
            const hasData = value !== null;
            const dow = (getDay(day) + 6) % 7; // 月曜=0

            return (
              <div
                key={dateStr}
                className={`relative rounded-lg flex flex-col items-center justify-center py-2 min-h-[3.5rem] transition-colors ${
                  hasData
                    ? `${getColor(value, dataMin, dataMax)} cursor-default`
                    : "bg-muted/20 text-muted-foreground/30"
                }`}
                title={
                  hasData
                    ? `${dateStr}: ${formatCellValue(value, metricType)}`
                    : dateStr
                }
              >
                <span
                  className={`text-sm font-semibold ${
                    !hasData
                      ? ""
                      : dow === 5
                        ? "text-blue-700"
                        : dow === 6
                          ? "text-red-600"
                          : ""
                  }`}
                >
                  {day.getDate()}
                </span>
                {hasData && (
                  <span className="text-xs leading-none">
                    {formatCellValue(value, metricType)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
