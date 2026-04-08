"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  METRIC_LABELS,
  type BacktestResult,
  type ForecastJob,
  type ForecastJobType,
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
import { AnalysisFactors } from "@/components/methodology/analysis-factors";
import { ProgressBar } from "@/components/ui/progress";
import { BacktestResultView } from "@/components/charts/backtest-result";
import { TrendingUp, Clock, CheckCircle, XCircle, Loader2, CalendarDays, BarChart3, ShieldCheck, Target } from "lucide-react";

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive"; icon: typeof Clock }
> = {
  queued: { label: "待機中", variant: "secondary", icon: Clock },
  running: { label: "実行中", variant: "default", icon: Loader2 },
  completed: { label: "完了", variant: "outline", icon: CheckCircle },
  failed: { label: "失敗", variant: "destructive", icon: XCircle },
};

function getReliability(days: number): {
  label: string;
  color: string;
  description: string;
} {
  if (days <= 14)
    return {
      label: "高信頼",
      color: "bg-emerald-100 text-emerald-800",
      description: "シフト計画・食材発注に最適",
    };
  if (days <= 30)
    return {
      label: "実用的",
      color: "bg-blue-100 text-blue-800",
      description: "月間計画・価格調整に適用可能",
    };
  if (days <= 60)
    return {
      label: "傾向把握",
      color: "bg-amber-100 text-amber-800",
      description: "四半期計画の参考値として",
    };
  return {
    label: "参考程度",
    color: "bg-red-100 text-red-700",
    description: "方向性のみ。信頼区間が広い",
  };
}

export default function ForecastPage() {
  const [metricType, setMetricType] = useState<MetricType>("occupancy_rate");
  const [horizon, setHorizon] = useState(30);
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);
  const [viewMode, setViewMode] = useState<"chart" | "calendar">("chart");
  const [jobMode, setJobMode] = useState<ForecastJobType>("forecast");
  const [testDays, setTestDays] = useState(30);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [jobs, setJobs] = useState<ForecastJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<ForecastJob | null>(null);
  const [results, setResults] = useState<ForecastResult[]>([]);
  const [ryokanId, setRyokanId] = useState<string | null>(null);
  const [ryokanLocation, setRyokanLocation] = useState<string | null>(null);

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
        .select("id, location")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (ryokan) {
        setRyokanId(ryokan.id);
        setRyokanLocation(ryokan.location ?? null);
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
              if (updated.job_type === "backtest") {
                loadBacktestResult(updated.id);
              } else {
                loadResults(updated.id);
              }
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

  const loadBacktestResult = useCallback(async (jobId: string) => {
    const supabase = createClient();
    const { data } = await supabase
      .from("backtest_results")
      .select("*")
      .eq("job_id", jobId)
      .maybeSingle();
    if (data) setBacktestResult(data as BacktestResult);
  }, []);

  async function handleSubmit() {
    if (!ryokanId) return;
    setSubmitting(true);

    const supabase = createClient();
    const insertPayload = jobMode === "backtest"
      ? {
          ryokan_id: ryokanId,
          metric_type: metricType,
          horizon: testDays,
          frequency: "daily",
          job_type: "backtest",
          test_days: testDays,
        }
      : {
          ryokan_id: ryokanId,
          metric_type: metricType,
          horizon,
          frequency: "daily",
          start_date: format(startDate, "yyyy-MM-dd"),
          job_type: "forecast",
        };
    const { data: job, error } = await supabase
      .from("forecast_jobs")
      .insert(insertPayload)
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
    setBacktestResult(null);
    setSubmitting(false);
  }

  async function handleSelectJob(job: ForecastJob) {
    setSelectedJob(job);
    setResults([]);
    setBacktestResult(null);
    if (job.status === "completed") {
      if (job.job_type === "backtest") {
        await loadBacktestResult(job.id);
      } else {
        await loadResults(job.id);
      }
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
                {jobMode === "forecast" ? "需要予測を実行" : "予測精度を検証（バックテスト）"}
              </CardTitle>
              <CardDescription>
                {jobMode === "forecast"
                  ? "予測対象のメトリクスと期間を選択してください。"
                  : "過去データの末尾を隠して予測し、実測値と比較して精度を検証します。"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* モード切替 */}
              <Tabs
                value={jobMode}
                onValueChange={(v) => setJobMode(v as ForecastJobType)}
                className="mb-4"
              >
                <TabsList>
                  <TabsTrigger value="forecast">
                    <TrendingUp className="h-3.5 w-3.5 mr-1" />
                    需要予測
                  </TabsTrigger>
                  <TabsTrigger value="backtest">
                    <Target className="h-3.5 w-3.5 mr-1" />
                    精度検証
                  </TabsTrigger>
                </TabsList>
              </Tabs>
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
                {/* モード別パラメータ */}
                {jobMode === "forecast" ? (
                  <>
                    <div className="space-y-2">
                      <Label>予測起点日</Label>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setShowCalendarPicker(!showCalendarPicker)}
                          className="flex items-center gap-2 h-8 px-3 rounded-md border border-input bg-background text-sm hover:bg-muted transition-colors"
                        >
                          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                          {format(startDate, "yyyy/MM/dd", { locale: ja })}
                        </button>
                        {showCalendarPicker && (
                          <div className="absolute top-10 left-0 z-50 bg-card border border-washi rounded-md shadow-lg p-2">
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
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={7}
                          max={90}
                          value={horizon}
                          onChange={(e) => setHorizon(Number(e.target.value))}
                          className="w-24"
                        />
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getReliability(horizon).color}`}
                        >
                          <ShieldCheck className="h-3 w-3" />
                          {getReliability(horizon).label}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {getReliability(horizon).description}
                      </p>
                    </div>
                    <Button onClick={handleSubmit} disabled={submitting}>
                      {submitting ? "送信中..." : "予測開始"}
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label>テスト期間（日数）</Label>
                      <div className="flex items-center gap-3">
                        <Input
                          type="number"
                          min={7}
                          max={90}
                          value={testDays}
                          onChange={(e) => setTestDays(Number(e.target.value))}
                          className="w-24"
                        />
                        <span className="text-xs text-muted-foreground">
                          過去データの末尾 {testDays} 日分を隠して精度検証
                        </span>
                      </div>
                    </div>
                    <Button onClick={handleSubmit} disabled={submitting}>
                      <Target className="h-4 w-4 mr-1" />
                      {submitting ? "送信中..." : "精度を検証"}
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 予測結果チャート */}
          {selectedJob && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {selectedJob.job_type === "backtest" ? "精度検証" : "予測結果"}:
                  {" "}{METRIC_LABELS[selectedJob.metric_type as MetricType]}
                  <Badge
                    variant={
                      STATUS_CONFIG[selectedJob.status]?.variant ?? "secondary"
                    }
                  >
                    {STATUS_CONFIG[selectedJob.status]?.label ?? selectedJob.status}
                  </Badge>
                </CardTitle>
                <CardDescription className="flex items-center gap-2">
                  {selectedJob.job_type === "backtest"
                    ? `テスト期間: ${selectedJob.test_days ?? selectedJob.horizon}日間`
                    : `${selectedJob.horizon}日間の予測（点推定 + 信頼区間）`}
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getReliability(selectedJob.horizon).color}`}
                  >
                    <ShieldCheck className="h-3 w-3" />
                    {getReliability(selectedJob.horizon).label}
                  </span>
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
                  <div className="space-y-6 py-8 px-4">
                    <div className="flex items-center justify-center text-muted-foreground">
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      {selectedJob.job_type === "backtest" ? "精度検証中..." : "TimesFMで予測を実行中..."}
                    </div>
                    <ProgressBar
                      value={selectedJob.progress}
                      message={selectedJob.progress_message}
                    />
                  </div>
                )}
                {selectedJob.status === "failed" && (
                  <div className="h-64 flex items-center justify-center text-destructive">
                    <XCircle className="h-5 w-5 mr-2" />
                    {selectedJob.error_message ?? "予測に失敗しました"}
                  </div>
                )}
                {/* バックテスト完了 */}
                {selectedJob.status === "completed" && selectedJob.job_type === "backtest" && backtestResult && (
                  <BacktestResultView
                    result={backtestResult}
                    metricType={selectedJob.metric_type as MetricType}
                  />
                )}
                {/* 通常予測完了 */}
                {selectedJob.status === "completed" && selectedJob.job_type !== "backtest" && results.length > 0 && (
                  <>
                  {/* 考慮データサマリー */}
                  <div className="mb-4 p-3 rounded-md bg-muted/40 border border-washi/50">
                    <p className="text-xs font-semibold text-foreground mb-2">この予測に考慮されたデータ</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { label: "過去の実績データ", color: "bg-blue-100 text-blue-800" },
                        { label: "祝日・振替休日", color: "bg-emerald-100 text-emerald-800" },
                        { label: "GW・お盆・年末年始", color: "bg-emerald-100 text-emerald-800" },
                        { label: "桜・紅葉シーズン", color: "bg-emerald-100 text-emerald-800" },
                        { label: "曜日パターン", color: "bg-purple-100 text-purple-800" },
                        { label: "季節周期", color: "bg-purple-100 text-purple-800" },
                        ...(ryokanLocation
                          ? [
                              { label: `${ryokanLocation}の気温`, color: "bg-sky-100 text-sky-800" },
                              { label: `${ryokanLocation}の降水量`, color: "bg-sky-100 text-sky-800" },
                              { label: `${ryokanLocation}の日照時間`, color: "bg-sky-100 text-sky-800" },
                            ]
                          : [
                              { label: "最高/最低気温", color: "bg-sky-100 text-sky-800" },
                              { label: "降水量", color: "bg-sky-100 text-sky-800" },
                              { label: "日照時間", color: "bg-sky-100 text-sky-800" },
                            ]),
                      ].map((tag) => (
                        <span
                          key={tag.label}
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${tag.color}`}
                        >
                          {tag.label}
                        </span>
                      ))}
                    </div>
                  </div>
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
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* 分析手法・入力データ */}
          <AnalysisFactors />

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
                            {job.job_type === "backtest" && (
                              <Badge variant="outline" className="ml-1.5 text-[10px]">検証</Badge>
                            )}
                          </span>
                          <span className="text-sm text-muted-foreground ml-2">
                            {job.job_type === "backtest" ? `${job.test_days ?? job.horizon}日テスト` : `${job.horizon}日間`}
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
