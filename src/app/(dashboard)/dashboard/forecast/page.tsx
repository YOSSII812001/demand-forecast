"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  METRIC_LABELS,
  type ForecastJob,
  type ForecastResult,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ForecastChart } from "@/components/charts/forecast-chart";
import { ForecastCalendar } from "@/components/charts/forecast-calendar";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { TrendingUp, Clock, CheckCircle, XCircle, Loader2, CalendarDays, BarChart3 } from "lucide-react";

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive"; icon: typeof Clock }
> = {
  queued: { label: "待機中", variant: "secondary", icon: Clock },
  running: { label: "実行中", variant: "default", icon: Loader2 },
  completed: { label: "完了", variant: "outline", icon: CheckCircle },
  failed: { label: "失敗", variant: "destructive", icon: XCircle },
};

export default function ForecastPage() {
  const [metricType, setMetricType] = useState<MetricType>("occupancy_rate");
  const [horizon, setHorizon] = useState(30);
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);
  const [viewMode, setViewMode] = useState<"chart" | "calendar">("chart");
  const [submitting, setSubmitting] = useState(false);
  const [jobs, setJobs] = useState<ForecastJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<ForecastJob | null>(null);
  const [results, setResults] = useState<ForecastResult[]>([]);
  const [ryokanId, setRyokanId] = useState<string | null>(null);

  // 旅館IDとジョブ一覧を取得
  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: ryokan } = await supabase
        .from("ryokans")
        .select("id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (ryokan) {
        setRyokanId(ryokan.id);
        const { data: jobList } = await supabase
          .from("forecast_jobs")
          .select("*")
          .eq("ryokan_id", ryokan.id)
          .order("created_at", { ascending: false })
          .limit(10);
        if (jobList) setJobs(jobList as ForecastJob[]);
      }
    }
    load();
  }, []);

  // ジョブのリアルタイム監視
  useEffect(() => {
    if (!ryokanId) return;

    const supabase = createClient();
    const channel = supabase
      .channel("forecast-jobs")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "forecast_jobs",
          filter: `ryokan_id=eq.${ryokanId}`,
        },
        (payload) => {
          const updated = payload.new as ForecastJob;
          setJobs((prev) =>
            prev.map((j) => (j.id === updated.id ? updated : j))
          );
          if (selectedJob?.id === updated.id) {
            setSelectedJob(updated);
            if (updated.status === "completed") {
              loadResults(updated.id);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ryokanId, selectedJob?.id]);

  const loadResults = useCallback(async (jobId: string) => {
    const supabase = createClient();
    const { data } = await supabase
      .from("forecast_results")
      .select("*")
      .eq("job_id", jobId)
      .order("forecast_date");
    if (data) setResults(data as ForecastResult[]);
  }, []);

  async function handleSubmit() {
    if (!ryokanId) return;
    setSubmitting(true);

    const supabase = createClient();
    const { data: job, error } = await supabase
      .from("forecast_jobs")
      .insert({
        ryokan_id: ryokanId,
        metric_type: metricType,
        horizon,
        frequency: "daily",
        start_date: format(startDate, "yyyy-MM-dd"),
      })
      .select()
      .single();

    if (error) {
      alert(`エラー: ${error.message}`);
      setSubmitting(false);
      return;
    }

    const newJob = job as ForecastJob;
    setJobs((prev) => [newJob, ...prev]);
    setSelectedJob(newJob);
    setResults([]);
    setSubmitting(false);
  }

  async function handleSelectJob(job: ForecastJob) {
    setSelectedJob(job);
    if (job.status === "completed") {
      await loadResults(job.id);
    } else {
      setResults([]);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">需要予測</h1>
        <p className="text-muted-foreground">
          TimesFMによる需要予測の実行と結果表示
        </p>
      </div>

      {!ryokanId && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            旅館情報を先に登録してください（設定ページ）
          </CardContent>
        </Card>
      )}

      {ryokanId && (
        <>
          {/* 予測実行フォーム */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-copper" />
                新しい予測を実行
              </CardTitle>
              <CardDescription>
                予測対象のメトリクスと期間を選択してください。
                ローカルPythonワーカーが稼働中であれば自動で予測が実行されます。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4 items-end">
                <div className="space-y-2">
                  <Label>メトリクス</Label>
                  <Select
                    value={metricType}
                    onValueChange={(v) => setMetricType(v as MetricType)}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="メトリクスを選択">
                        {METRIC_LABELS[metricType]}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(METRIC_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>予測起点日</Label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowCalendarPicker(!showCalendarPicker)}
                      className="flex items-center gap-2 h-8 px-3 rounded-lg border border-input bg-background text-sm hover:bg-muted transition-colors"
                    >
                      <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                      {format(startDate, "yyyy/MM/dd", { locale: ja })}
                    </button>
                    {showCalendarPicker && (
                      <div className="absolute top-10 left-0 z-50 bg-card border border-washi rounded-xl shadow-lg p-2">
                        <Calendar
                          mode="single"
                          selected={startDate}
                          onSelect={(date) => {
                            if (date) setStartDate(date);
                            setShowCalendarPicker(false);
                          }}
                          locale={ja}
                        />
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>予測日数</Label>
                  <Input
                    type="number"
                    min={7}
                    max={90}
                    value={horizon}
                    onChange={(e) => setHorizon(Number(e.target.value))}
                    className="w-24"
                  />
                </div>
                <Button onClick={handleSubmit} disabled={submitting}>
                  {submitting ? "送信中..." : "予測開始"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 予測結果チャート */}
          {selectedJob && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  予測結果: {METRIC_LABELS[selectedJob.metric_type as MetricType]}
                  <Badge
                    variant={
                      STATUS_CONFIG[selectedJob.status]?.variant ?? "secondary"
                    }
                  >
                    {STATUS_CONFIG[selectedJob.status]?.label ?? selectedJob.status}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  {selectedJob.horizon}日間の予測（点推定 + 信頼区間）
                </CardDescription>
              </CardHeader>
              <CardContent>
                {selectedJob.status === "queued" && (
                  <div className="h-64 flex items-center justify-center text-muted-foreground">
                    <Clock className="h-5 w-5 mr-2 animate-pulse" />
                    ワーカーがジョブを取得するのを待っています...
                  </div>
                )}
                {selectedJob.status === "running" && (
                  <div className="h-64 flex items-center justify-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    TimesFMで予測を実行中...
                  </div>
                )}
                {selectedJob.status === "failed" && (
                  <div className="h-64 flex items-center justify-center text-destructive">
                    <XCircle className="h-5 w-5 mr-2" />
                    {selectedJob.error_message ?? "予測に失敗しました"}
                  </div>
                )}
                {selectedJob.status === "completed" && results.length > 0 && (
                  <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "chart" | "calendar")}>
                    <TabsList className="mb-4">
                      <TabsTrigger value="chart">
                        <BarChart3 className="h-3.5 w-3.5 mr-1" />
                        チャート
                      </TabsTrigger>
                      <TabsTrigger value="calendar">
                        <CalendarDays className="h-3.5 w-3.5 mr-1" />
                        カレンダー
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="chart">
                      <ForecastChart
                        data={results}
                        metricType={selectedJob.metric_type as MetricType}
                      />
                    </TabsContent>
                    <TabsContent value="calendar">
                      <ForecastCalendar
                        data={results}
                        metricType={selectedJob.metric_type as MetricType}
                      />
                    </TabsContent>
                  </Tabs>
                )}
              </CardContent>
            </Card>
          )}

          {/* ジョブ履歴 */}
          <Card>
            <CardHeader>
              <CardTitle>予測履歴</CardTitle>
            </CardHeader>
            <CardContent>
              {jobs.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  まだ予測が実行されていません
                </p>
              ) : (
                <div className="space-y-2">
                  {jobs.map((job) => (
                    <button
                      key={job.id}
                      onClick={() => handleSelectJob(job)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        selectedJob?.id === job.id
                          ? "border-copper bg-copper/5"
                          : "border-washi hover:border-copper/30"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium">
                            {METRIC_LABELS[job.metric_type as MetricType]}
                          </span>
                          <span className="text-sm text-muted-foreground ml-2">
                            {job.horizon}日間
                          </span>
                        </div>
                        <Badge
                          variant={
                            STATUS_CONFIG[job.status]?.variant ?? "secondary"
                          }
                        >
                          {STATUS_CONFIG[job.status]?.label ?? job.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(job.created_at).toLocaleString("ja-JP")}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
