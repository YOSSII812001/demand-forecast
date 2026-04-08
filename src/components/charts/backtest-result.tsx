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
import {
  METRIC_LABELS,
  type BacktestResult,
  type MetricType,
} from "@/lib/types/database";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Target, TrendingDown, BarChart3 } from "lucide-react";

type Props = {
  result: BacktestResult;
  metricType: MetricType;
};

function getMapeGrade(mape: number): { label: string; color: string } {
  if (mape < 10) return { label: "高精度", color: "text-emerald-600" };
  if (mape < 20) return { label: "良好", color: "text-blue-600" };
  if (mape < 30) return { label: "許容範囲", color: "text-amber-600" };
  return { label: "要改善", color: "text-red-600" };
}

export function BacktestResultView({ result, metricType }: Props) {
  const grade = getMapeGrade(result.mape);

  return (
    <div className="space-y-4">
      {/* 精度指標カード */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 rounded-md bg-muted/40 border border-washi/50 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Target className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">MAPE</span>
          </div>
          <div className={`text-2xl font-bold ${grade.color}`}>
            {result.mape}%
          </div>
          <div className={`text-xs font-medium ${grade.color}`}>
            {grade.label}
          </div>
        </div>
        <div className="p-4 rounded-md bg-muted/40 border border-washi/50 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <TrendingDown className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">RMSE</span>
          </div>
          <div className="text-2xl font-bold">{result.rmse}</div>
          <div className="text-xs text-muted-foreground">二乗平均平方根誤差</div>
        </div>
        <div className="p-4 rounded-md bg-muted/40 border border-washi/50 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">MAE</span>
          </div>
          <div className="text-2xl font-bold">{result.mae}</div>
          <div className="text-xs text-muted-foreground">平均絶対誤差</div>
        </div>
      </div>

      {/* MAPE解釈ガイド */}
      <div className="text-xs text-muted-foreground p-2 rounded-md bg-muted/20">
        MAPE（平均絶対パーセント誤差）: 予測値が実測値からどれだけずれているかの平均。
        10%未満=高精度、10-20%=良好、20-30%=許容範囲、30%超=要改善。
        テスト期間: {result.test_days}日間。
      </div>

      {/* 予測vs実績チャート */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            予測値 vs 実測値（{METRIC_LABELS[metricType]}）
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="w-full h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={result.daily_results}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#eceae4" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "#5f5f5d" }}
                  tickFormatter={(d: string) => d.slice(5)}
                />
                <YAxis tick={{ fontSize: 10, fill: "#5f5f5d" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#f7f4ed",
                    border: "1px solid #eceae4",
                    borderRadius: "6px",
                    fontSize: "12px",
                  }}
                  formatter={(value, name) => {
                    const labels: Record<string, string> = {
                      actual: "実測値",
                      predicted: "予測値",
                      q10: "下限(10%)",
                      q90: "上限(90%)",
                    };
                    return [
                      typeof value === "number" ? value.toFixed(1) : String(value),
                      labels[String(name)] ?? name,
                    ];
                  }}
                />
                {/* 信頼区間 */}
                <Area
                  dataKey="q90"
                  stroke="none"
                  fill="#b87333"
                  fillOpacity={0.08}
                  name="q90"
                />
                <Area
                  dataKey="q10"
                  stroke="none"
                  fill="#f7f4ed"
                  fillOpacity={1}
                  name="q10"
                />
                {/* 実測値（灰色） */}
                <Line
                  type="monotone"
                  dataKey="actual"
                  stroke="#888888"
                  strokeWidth={2}
                  strokeDasharray="4 2"
                  dot={{ r: 2, fill: "#888888" }}
                  name="actual"
                />
                {/* 予測値（銅色） */}
                <Line
                  type="monotone"
                  dataKey="predicted"
                  stroke="#b87333"
                  strokeWidth={2}
                  dot={false}
                  name="predicted"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-6 mt-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 bg-[#888888]" style={{ borderTop: "2px dashed #888" }} />
              実測値
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 bg-copper" />
              予測値
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-2 bg-copper/10 rounded-sm" />
              信頼区間
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
