"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  METRIC_LABELS,
  type ForecastJob,
  type ForecastResult,
  type Insight,
  type MetricType,
} from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ForecastChart } from "@/components/charts/forecast-chart";
import {
  ArrowLeft,
  Download,
  TrendingUp,
  TrendingDown,
  Lightbulb,
} from "lucide-react";

type DetailData = {
  job: ForecastJob | null;
  results: ForecastResult[];
  insights: Insight[];
};

export default function ForecastDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<DetailData>({
    job: null,
    results: [],
    insights: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      const { data: job } = await supabase
        .from("forecast_jobs")
        .select("*")
        .eq("id", id)
        .single();

      if (!job) {
        setLoading(false);
        return;
      }

      const [resultsRes, insightsRes] = await Promise.all([
        supabase
          .from("forecast_results")
          .select("*")
          .eq("job_id", id)
          .order("forecast_date"),
        supabase
          .from("insights")
          .select("*")
          .eq("job_id", id)
          .order("priority"),
      ]);

      setData({
        job: job as ForecastJob,
        results: (resultsRes.data ?? []) as ForecastResult[],
        insights: (insightsRes.data ?? []) as Insight[],
      });
      setLoading(false);
    }
    load();
  }, [id]);

  function downloadCsv() {
    if (data.results.length === 0) return;

    const header = "date,point_estimate,quantile_10,quantile_90\n";
    const rows = data.results
      .map(
        (r) =>
          `${r.forecast_date},${r.point_estimate},${r.quantile_10 ?? ""},${r.quantile_90 ?? ""}`
      )
      .join("\n");

    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `forecast_${id.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        読み込み中...
      </div>
    );
  }

  if (!data.job) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">予測ジョブが見つかりません。</p>
        <Button variant="outline" render={<Link href="/dashboard/forecast" />}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          予測一覧に戻る
        </Button>
      </div>
    );
  }

  const { job, results, insights } = data;
  const metricType = job.metric_type as MetricType;
  const stats = computeStats(results, metricType);

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            render={<Link href="/dashboard/forecast" />}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {METRIC_LABELS[metricType]}の予測詳細
            </h1>
            <p className="text-muted-foreground text-sm">
              {job.horizon}日間 ·{" "}
              {new Date(job.created_at).toLocaleString("ja-JP")}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={downloadCsv}>
          <Download className="h-4 w-4 mr-1" />
          CSV出力
        </Button>
      </div>

      {/* 統計サマリー */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="平均予測値" value={stats.avg} />
        <StatCard label="最小値" value={stats.min} icon={TrendingDown} />
        <StatCard label="最大値" value={stats.max} icon={TrendingUp} />
        <StatCard label="データ件数" value={`${results.length}日分`} />
      </div>

      {/* チャート */}
      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>予測チャート</CardTitle>
            <CardDescription>
              実線: 中央値予測、薄い帯: 10%〜90%信頼区間
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ForecastChart data={results} metricType={metricType} />
          </CardContent>
        </Card>
      )}

      {/* データテーブル */}
      <Card>
        <CardHeader>
          <CardTitle>予測データ一覧</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-washi text-left">
                  <th className="py-2 pr-4 font-medium">日付</th>
                  <th className="py-2 pr-4 font-medium text-right">予測値</th>
                  <th className="py-2 pr-4 font-medium text-right">
                    下限 (10%)
                  </th>
                  <th className="py-2 font-medium text-right">上限 (90%)</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-washi/50 hover:bg-muted/30"
                  >
                    <td className="py-2 pr-4">{r.forecast_date}</td>
                    <td className="py-2 pr-4 text-right font-medium">
                      {formatMetric(Number(r.point_estimate), metricType)}
                    </td>
                    <td className="py-2 pr-4 text-right text-muted-foreground">
                      {r.quantile_10 != null
                        ? formatMetric(Number(r.quantile_10), metricType)
                        : "—"}
                    </td>
                    <td className="py-2 text-right text-muted-foreground">
                      {r.quantile_90 != null
                        ? formatMetric(Number(r.quantile_90), metricType)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 関連インサイト */}
      {insights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-copper" />
              この予測から導出されたインサイト
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {insights.map((insight) => (
              <div
                key={insight.id}
                className="p-3 rounded-lg bg-muted/50 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium text-sm">{insight.title}</p>
                  <Badge
                    variant={
                      insight.priority === "high"
                        ? "destructive"
                        : "secondary"
                    }
                  >
                    {insight.priority === "high" ? "重要" : "通常"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {insight.description}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: typeof TrendingUp;
}) {
  return (
    <div className="p-4 rounded-lg bg-muted/50 text-center">
      <div className="flex items-center justify-center gap-1">
        {Icon && <Icon className="h-3 w-3 text-muted-foreground" />}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="text-lg font-bold mt-1">{value}</div>
    </div>
  );
}

function formatMetric(value: number, metricType: MetricType): string {
  if (metricType === "occupancy_rate") return `${value.toFixed(1)}%`;
  if (metricType === "revenue") return `¥${Math.round(value).toLocaleString()}`;
  return value.toFixed(0);
}

function computeStats(
  results: ForecastResult[],
  metricType: MetricType
): { avg: string; min: string; max: string } {
  if (results.length === 0)
    return { avg: "—", min: "—", max: "—" };

  const values = results.map((r) => Number(r.point_estimate));
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);

  return {
    avg: formatMetric(avg, metricType),
    min: formatMetric(min, metricType),
    max: formatMetric(max, metricType),
  };
}
