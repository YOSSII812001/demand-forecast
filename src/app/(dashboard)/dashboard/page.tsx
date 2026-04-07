"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  METRIC_LABELS,
  type ForecastJob,
  type ForecastResult,
  type Insight,
  type MetricType,
  type Ryokan,
} from "@/lib/types/database";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ForecastChart } from "@/components/charts/forecast-chart";
import {
  TrendingUp,
  Users,
  Hotel,
  Lightbulb,
  Upload,
  ArrowRight,
} from "lucide-react";

type DashboardData = {
  ryokan: Ryokan | null;
  latestJob: ForecastJob | null;
  latestResults: ForecastResult[];
  recentInsights: Insight[];
  dataPointCount: number;
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>({
    ryokan: null,
    latestJob: null,
    latestResults: [],
    recentInsights: [],
    dataPointCount: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // 旅館情報
      const { data: ryokan } = await supabase
        .from("ryokans")
        .select("*")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (!ryokan) {
        setData((prev) => ({ ...prev, ryokan: null }));
        setLoading(false);
        return;
      }

      // 最新の完了済み予測ジョブ
      const { data: latestJob } = await supabase
        .from("forecast_jobs")
        .select("*")
        .eq("ryokan_id", ryokan.id)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // 最新ジョブの予測結果
      let latestResults: ForecastResult[] = [];
      if (latestJob) {
        const { data: results } = await supabase
          .from("forecast_results")
          .select("*")
          .eq("job_id", latestJob.id)
          .order("forecast_date");
        if (results) latestResults = results as ForecastResult[];
      }

      // 最新インサイト
      const { data: insights } = await supabase
        .from("insights")
        .select("*")
        .eq("ryokan_id", ryokan.id)
        .order("created_at", { ascending: false })
        .limit(3);

      // データポイント数
      const { count } = await supabase
        .from("time_series_data")
        .select("*", { count: "exact", head: true })
        .eq("ryokan_id", ryokan.id);

      setData({
        ryokan: ryokan as Ryokan,
        latestJob: latestJob as ForecastJob | null,
        latestResults,
        recentInsights: (insights ?? []) as Insight[],
        dataPointCount: count ?? 0,
      });
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        読み込み中...
      </div>
    );
  }

  // 旅館未登録
  if (!data.ryokan) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">ダッシュボード</h1>
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <Hotel className="h-12 w-12 text-muted-foreground mx-auto" />
            <p className="text-lg font-medium">旅館情報を登録しましょう</p>
            <p className="text-muted-foreground">
              まず旅館の基本情報を登録し、次に過去データをアップロードして予測を始めます。
            </p>
            <Button render={<Link href="/dashboard/settings" />}>
              旅館情報を登録
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 予測サマリーの計算
  const summary = computeSummary(data.latestResults, data.latestJob);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{data.ryokan.name}</h1>
          <p className="text-muted-foreground">需要予測ダッシュボード</p>
        </div>
        {data.dataPointCount === 0 && (
          <Button
            render={<Link href="/dashboard/upload" />}
            variant="outline"
          >
            <Upload className="h-4 w-4 mr-1" />
            データをアップロード
          </Button>
        )}
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="予測稼働率（平均）"
          value={summary.avgOccupancy}
          icon={Hotel}
          desc={summary.period}
        />
        <SummaryCard
          title="予測宿泊客数（平均）"
          value={summary.avgGuests}
          icon={Users}
          desc={summary.period}
        />
        <SummaryCard
          title="データポイント数"
          value={data.dataPointCount > 0 ? `${data.dataPointCount}件` : "—"}
          icon={TrendingUp}
          desc="アップロード済みデータ"
        />
        <SummaryCard
          title="インサイト"
          value={
            data.recentInsights.length > 0
              ? `${data.recentInsights.length}件`
              : "—"
          }
          icon={Lightbulb}
          desc="最新のアクション提案"
        />
      </div>

      {/* 予測チャート */}
      {data.latestResults.length > 0 && data.latestJob && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>
                  {METRIC_LABELS[data.latestJob.metric_type as MetricType]}の予測
                </CardTitle>
                <CardDescription>
                  最新の予測結果（{data.latestJob.horizon}日間）
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                render={
                  <Link
                    href={`/dashboard/forecast/${data.latestJob.id}`}
                  />
                }
              >
                詳細
                <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ForecastChart
              data={data.latestResults}
              metricType={data.latestJob.metric_type as MetricType}
            />
          </CardContent>
        </Card>
      )}

      {data.latestResults.length === 0 && data.dataPointCount > 0 && (
        <Card>
          <CardContent className="py-8 text-center space-y-3">
            <TrendingUp className="h-10 w-10 text-muted-foreground mx-auto" />
            <p className="font-medium">データがアップロードされています</p>
            <p className="text-sm text-muted-foreground">
              需要予測ページで予測を実行してみましょう。
            </p>
            <Button
              variant="outline"
              render={<Link href="/dashboard/forecast" />}
            >
              予測を実行
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 最新インサイト */}
      {data.recentInsights.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>最新のインサイト</CardTitle>
              <Button
                variant="outline"
                size="sm"
                render={<Link href="/dashboard/insights" />}
              >
                すべて見る
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.recentInsights.map((insight) => (
              <div
                key={insight.id}
                className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
              >
                <Lightbulb className="h-4 w-4 text-copper mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">{insight.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {insight.description}
                  </p>
                </div>
                <Badge
                  variant={
                    insight.priority === "high" ? "destructive" : "secondary"
                  }
                  className="shrink-0"
                >
                  {insight.priority === "high" ? "重要" : "通常"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  icon: Icon,
  desc,
}: {
  title: string;
  value: string;
  icon: typeof Hotel;
  desc: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </CardContent>
    </Card>
  );
}

function computeSummary(
  results: ForecastResult[],
  job: ForecastJob | null
): { avgOccupancy: string; avgGuests: string; period: string } {
  if (!job || results.length === 0) {
    return { avgOccupancy: "—", avgGuests: "—", period: "予測未実行" };
  }

  const metricType = job.metric_type as MetricType;
  const avg =
    results.reduce((sum, r) => sum + Number(r.point_estimate), 0) /
    results.length;

  const period = `次の${job.horizon}日間`;

  if (metricType === "occupancy_rate") {
    return {
      avgOccupancy: `${avg.toFixed(0)}%`,
      avgGuests: "—",
      period,
    };
  }
  if (metricType === "guest_count") {
    return {
      avgOccupancy: "—",
      avgGuests: `${avg.toFixed(0)}人/日`,
      period,
    };
  }

  return { avgOccupancy: "—", avgGuests: "—", period };
}
